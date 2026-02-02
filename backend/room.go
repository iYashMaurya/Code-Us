package main

import (
	"encoding/json"
	"log"
	"math/rand"
	"sync"
	"time"
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
	ID          string `json:"id"`
	Username    string `json:"username"`
	Role        string `json:"role"` // CIVILIAN or IMPOSTOR
	IsHost      bool   `json:"isHost"`
	IsEliminated bool  `json:"isEliminated"`
	IsAlive     bool   `json:"isAlive"`
}

type Task struct {
	ID          string `json:"id"`
	Description string `json:"description"`
	Template    string `json:"template"`
}

type Room struct {
	ID         string
	clients    map[*Client]bool
	players    map[string]*Player
	broadcast  chan []byte
	phase      GamePhase
	impostorID string
	mode       string // DSA or OOPS
	task       *Task
	gameTimer  *time.Timer
	mu         sync.RWMutex
}

func newRoom(id string) *Room {
	return &Room{
		ID:        id,
		clients:   make(map[*Client]bool),
		players:   make(map[string]*Player),
		broadcast: make(chan []byte, 256),
		phase:     PhaseLobby,
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
		ID:          playerID,
		Username:    username,
		IsHost:      isHost,
		IsEliminated: false,
		IsAlive:     true,
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

	// Load task (simplified - in production would load from MongoDB)
	r.task = r.loadTask()

	r.phase = PhaseRoleReveal

	// Broadcast game started
	r.broadcastGameState()

	// Schedule role reveal end
	go func() {
		time.Sleep(5 * time.Second)
		r.mu.Lock()
		r.phase = PhaseCoding
		r.mu.Unlock()
		r.broadcastGameState()

		// Start game timer (10 minutes)
		r.gameTimer = time.NewTimer(10 * time.Minute)
		go func() {
			<-r.gameTimer.C
			r.endGame("IMPOSTOR_WIN_TIME")
		}()
	}()
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

func (r *Room) eliminatePlayer(playerID string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if player, exists := r.players[playerID]; exists {
		player.IsEliminated = true
		player.IsAlive = false

		// Check if impostor was eliminated
		if playerID == r.impostorID {
			r.phase = PhaseEnd
			r.broadcastGameState()
			go r.endGame("CIVILIAN_WIN")
			return
		}

		// Check if all civilians eliminated
		aliveCivilians := 0
		for _, p := range r.players {
			if p.IsAlive && p.Role == "CIVILIAN" {
				aliveCivilians++
			}
		}

		if aliveCivilians == 0 {
			r.phase = PhaseEnd
			go r.endGame("IMPOSTOR_WIN")
			return
		}

		// Continue game
		r.phase = PhaseCoding
		r.broadcastGameState()
	}
}

func (r *Room) endGame(reason string) {
	r.mu.Lock()
	defer r.mu.Unlock()

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

func (r *Room) broadcastGameState() {
	state := map[string]interface{}{
		"phase":   r.phase,
		"players": r.players,
		"mode":    r.mode,
	}

	if r.task != nil {
		state["task"] = r.task
	}

	msg := Message{
		Type: "GAME_STATE",
		Data: state,
	}

	data, _ := json.Marshal(msg)
	r.broadcast <- data
}

func (r *Room) broadcastPlayerList() {
	msg := Message{
		Type: "PLAYER_LIST",
		Data: r.players,
	}

	data, _ := json.Marshal(msg)
	r.broadcast <- data
}

func (r *Room) startDiscussion() {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.phase = PhaseDiscussion
	r.broadcastGameState()
}