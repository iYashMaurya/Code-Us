package main
import (
	"encoding/json"
	"log"
	"math/rand"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type GamePhase string

const (
	PhaseLobby      GamePhase = "LOBBY"
	PhaseRoleReveal GamePhase = "ROLE_REVEAL"
	PhaseCoding     GamePhase = "CODING"
	PhaseDiscussion GamePhase = "DISCUSSION"
	PhaseEnd        GamePhase = "END"
)

type Player struct {
	ID           string `json:"id"`
	Username     string `json:"username"`
	Role         string `json:"role"` // CIVILIAN or IMPOSTOR
	IsHost       bool   `json:"isHost"`
	IsEliminated bool   `json:"isEliminated"`
	IsAlive      bool   `json:"isAlive"`
}

type Task struct {
	ID          string `json:"id"`
	Description string `json:"description"`
	Template    string `json:"template"`
}

type Room struct {
	ID         string
	clients    map[*Client]bool
	yjsClients map[*websocket.Conn]bool // Store Yjs connections
	players    map[string]*Player
	broadcast  chan []byte
	phase      GamePhase
	impostorID string
	mode       string // DSA or OOPS
	task       *Task
	gameTimer  *time.Timer
	voteTimer  *time.Timer
	votes      map[string]string // VoterID -> TargetID
	mu         sync.RWMutex
}

func newRoom(id string) *Room {
	return &Room{
		ID:         id,
		clients:    make(map[*Client]bool),
		yjsClients: make(map[*websocket.Conn]bool),
		players:    make(map[string]*Player),
		broadcast:  make(chan []byte, 256),
		phase:      PhaseLobby,
		votes:      make(map[string]string),
	}
}

func (r *Room) run() {
	for {
		select {
		case message := <-r.broadcast:
			r.mu.RLock()
			for client := range r.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(r.clients, client)
				}
			}
			r.mu.RUnlock()
		}
	}
}

func (r *Room) addPlayer(playerID, username string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	isHost := len(r.players) == 0

	r.players[playerID] = &Player{
		ID:           playerID,
		Username:     username,
		IsHost:       isHost,
		IsEliminated: false,
		IsAlive:      true,
	}

	log.Printf("Player %s (%s) added to room %s", username, playerID, r.ID)
}

func (r *Room) startGame() {
	r.mu.Lock()
	defer r.mu.Unlock()

	if len(r.players) < 3 {
		log.Println("Not enough players to start")
		return
	}

	// Select random impostor
	playerIDs := make([]string, 0, len(r.players))
	for id := range r.players {
		playerIDs = append(playerIDs, id)
	}

	rand.Seed(time.Now().UnixNano())
	impostorIdx := rand.Intn(len(playerIDs))
	r.impostorID = playerIDs[impostorIdx]

	// Assign roles
	for id, player := range r.players {
		if id == r.impostorID {
			player.Role = "IMPOSTOR"
		} else {
			player.Role = "CIVILIAN"
		}
	}

	// Select random mode
	modes := []string{"DSA", "OOPS"}
	r.mode = modes[rand.Intn(len(modes))]

	// Load task
	r.task = r.loadTask()

	r.phase = PhaseRoleReveal
	r.broadcastGameState()

	// Schedule role reveal end
	go func() {
		time.Sleep(5 * time.Second)
		r.mu.Lock()
		r.phase = PhaseCoding
		r.mu.Unlock()
		r.broadcastGameState()

		// Start game timer (45 Seconds)
		if r.gameTimer != nil {
			r.gameTimer.Stop()
		}
		r.gameTimer = time.NewTimer(45 * time.Second)
		go func() {
			<-r.gameTimer.C
			r.endGame("IMPOSTOR_WIN_TIME")
		}()
	}()
}

func (r *Room) startDiscussion() {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Stop the coding timer
	if r.gameTimer != nil {
		r.gameTimer.Stop()
	}

	r.phase = PhaseDiscussion
	r.votes = make(map[string]string) // Reset votes
	r.broadcastGameState()

	// Start 10 Second Voting Timer
	if r.voteTimer != nil {
		r.voteTimer.Stop()
	}
	r.voteTimer = time.NewTimer(10 * time.Second)
	go func() {
		<-r.voteTimer.C
		r.finalizeVoting()
	}()
}

func (r *Room) handleVote(voterID, targetID string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.phase != PhaseDiscussion {
		return
	}

	// Check if voter is valid and alive
	if p, ok := r.players[voterID]; !ok || p.IsEliminated {
		return
	}

	r.votes[voterID] = targetID

	// Broadcast that a vote happened (send full vote map so frontend knows counts)
	voteMsg := Message{
		Type: "VOTE_UPDATE",
		Data: r.votes,
	}
	data, _ := json.Marshal(voteMsg)
	r.broadcast <- data

	// Check if everyone alive has voted
	aliveCount := 0
	for _, p := range r.players {
		if !p.IsEliminated {
			aliveCount++
		}
	}

	if len(r.votes) >= aliveCount {
		if r.voteTimer != nil {
			r.voteTimer.Stop()
		}
		go r.finalizeVoting()
	}
}

func (r *Room) finalizeVoting() {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.phase != PhaseDiscussion {
		return
	}

	// Tally votes
	tally := make(map[string]int)
	for _, target := range r.votes {
		tally[target]++
	}

	var maxVotes int
	var candidate string
	var tie bool

	// Find the candidate with max votes
	for target, count := range tally {
		if count > maxVotes {
			maxVotes = count
			candidate = target
			tie = false
		} else if count == maxVotes {
			tie = true
		}
	}

	// Decision Logic
	var eliminatedID string
	if !tie && candidate != "SKIP" && maxVotes > 0 {
		if player, exists := r.players[candidate]; exists {
			player.IsEliminated = true
			player.IsAlive = false
			eliminatedID = candidate

			// Check if Impostor was ejected
			if candidate == r.impostorID {
				r.phase = PhaseEnd
				r.broadcastGameState()
				go r.endGame("CIVILIAN_WIN")
				return
			}
		}
	}

	// Check if impostor wins by numbers (Impostors >= Crewmates)
	impostorAlive := false
	crewAlive := 0
	for _, p := range r.players {
		if !p.IsEliminated {
			if p.Role == "IMPOSTOR" {
				impostorAlive = true
			} else {
				crewAlive++
			}
		}
	}

	if !impostorAlive {
		go r.endGame("CIVILIAN_WIN")
		return
	}
	if impostorAlive && crewAlive == 0 {
		go r.endGame("IMPOSTOR_WIN")
		return
	}

	// Send Result and Resume Game
	resultMsg := Message{
		Type: "VOTE_RESULT",
		Data: map[string]interface{}{
			"tally":      tally,
			"eliminated": eliminatedID,
		},
	}
	data, _ := json.Marshal(resultMsg)
	r.broadcast <- data

	// Wait 3 seconds then resume coding
	go func() {
		time.Sleep(3 * time.Second)
		r.mu.Lock()
		if r.phase != PhaseEnd {
			r.phase = PhaseCoding
			// Restart 45s timer for next round
			if r.gameTimer != nil {
				r.gameTimer.Stop()
			}
			r.gameTimer = time.NewTimer(45 * time.Second)
			go func() {
				<-r.gameTimer.C
				r.endGame("IMPOSTOR_WIN_TIME")
			}()
			r.broadcastGameState()
		}
		r.mu.Unlock()
	}()
}

func (r *Room) endGame(reason string) {
	r.phase = PhaseEnd
	msg := Message{
		Type: "GAME_ENDED",
		Data: map[string]interface{}{
			"reason":     reason,
			"impostorID": r.impostorID,
		},
	}
	data, _ := json.Marshal(msg)
	r.broadcast <- data
}

func (r *Room) loadTask() *Task {
	// Simplified task loading
	tasks := map[string]map[string]*Task{
		"DSA": {
			"counter": {
				ID:          "counter",
				Description: "Implement a Counter class with increment, decrement, and reset methods. The counter should start at 0.",
				Template: `class Counter {
  constructor() {
    // Initialize counter
  }
  increment() {
    // Increment counter
  }
  decrement() {
    // Decrement counter
  }
  reset() {
    // Reset counter to 0
  }
  getValue() {
    // Return current value
  }
}`,
			},
		},
		"OOPS": {
			"stack": {
				ID:          "stack",
				Description: "Implement a Stack class with push, pop, peek, and isEmpty methods using object-oriented principles.",
				Template: `class Stack {
  constructor() {
    // Initialize stack
  }
  push(element) {
    // Add element to top
  }
  pop() {
    // Remove and return top element
  }
  peek() {
    // Return top element without removing
  }
  isEmpty() {
    // Check if stack is empty
  }
}`,
			},
		},
	}

	if modeTasks, ok := tasks[r.mode]; ok {
		for _, task := range modeTasks {
			return task
		}
	}

	return &Task{
		ID:          "default",
		Description: "Complete the coding challenge",
		Template:    "// Start coding here\n",
	}
}

func (r *Room) broadcastGameState() {
	state := map[string]interface{}{
		"phase":   r.phase,
		"players": r.players,
		"mode":    r.mode,
	}
	if r.task != nil {
		state["task"] = r.task
	}
	msg := Message{Type: "GAME_STATE", Data: state}
	data, _ := json.Marshal(msg)
	r.broadcast <- data
}

func (r *Room) broadcastPlayerList() {
	msg := Message{Type: "PLAYER_LIST", Data: r.players}
	data, _ := json.Marshal(msg)
	r.broadcast <- data
}

// Yjs Binary Relay (Fix for Issue #3)
func (h *Hub) handleYjsConnection(w http.ResponseWriter, r *http.Request, conn *websocket.Conn) {
	roomID := r.URL.Query().Get("room")
	room := h.getRoom(roomID)

	if room == nil {
		log.Printf("Room %s not found for Yjs connection", roomID)
		conn.Close()
		return
	}
	
	room.mu.Lock()
	room.yjsClients[conn] = true
	room.mu.Unlock()
	
	log.Printf("Yjs client connected to room %s", roomID)

	defer func() {
		room.mu.Lock()
		delete(room.yjsClients, conn)
		room.mu.Unlock()
		conn.Close()
		log.Printf("Yjs client disconnected from room %s", roomID)
	}()

	for {
		messageType, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("Yjs websocket error: %v", err)
			}
			break
		}
		
		// Broadcast raw binary to other Yjs clients in this room
		room.mu.RLock()
		for client := range room.yjsClients {
			if client != conn {
				// Use goroutine to avoid blocking on slow clients
				go func(c *websocket.Conn) {
					c.SetWriteDeadline(time.Now().Add(writeWait))
					if err := c.WriteMessage(messageType, message); err != nil {
						log.Printf("Error broadcasting Yjs message: %v", err)
					}
				}(client)
			}
		}
		room.mu.RUnlock()
	}
}