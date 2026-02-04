package main

import (
	"encoding/json"
	"log"
	"math/rand"
	"net/http"
	"strings"
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
	Role         string `json:"role"`
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
	ID          string
	clients     map[*Client]bool
	players     map[string]*Player
	broadcast   chan []byte
	phase       GamePhase
	impostorID  string
	mode        string
	task        *Task
	gameTimer   *time.Timer
	mu          sync.RWMutex
	yjsClients  map[*websocket.Conn]bool
	
	// Test Execution State Machine
	testRunning    bool     // Lock flag: is a test currently running?
	testRunner     string   // ID of player who started the test
	testRunnerName string   // Username for display
	testResults    []bool   // Current test results [task1, task2, task3]
	codeSnapshot   string   // Captured code at test start
}

func newRoom(id string) *Room {
	return &Room{
		ID:          id,
		clients:     make(map[*Client]bool),
		players:     make(map[string]*Player),
		broadcast:   make(chan []byte, 256),
		phase:       PhaseLobby,
		yjsClients:  make(map[*websocket.Conn]bool),
		testRunning: false,
		testResults: []bool{false, false, false},
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

	r.mode = "OOPS"
	r.task = r.loadTask()
	r.phase = PhaseRoleReveal

	r.broadcastGameState()

	go func() {
		time.Sleep(5 * time.Second)
		r.mu.Lock()
		r.phase = PhaseCoding
		r.mu.Unlock()
		r.broadcastGameState()

		r.gameTimer = time.NewTimer(10 * time.Minute)
		go func() {
			<-r.gameTimer.C
			r.endGame("IMPOSTOR_WIN_TIME")
		}()
	}()
}

func (r *Room) loadTask() *Task {
	return &Task{
		ID:          "satellite-rescue",
		Description: "🛰️ SATELLITE RESCUE MISSION: Fix 3 critical bugs before the satellite crashes! (1) Fix efficiency showing 0.0, (2) Fix altitude not updating, (3) Prevent infinite loop overshoot.",
		Template: `public class SatelliteSystem {
    
    // Class Level Variable
    static int altitude = 2000; 

    public static void main(String[] args) {
        int targetAltitude = 2050;
        
        // [TASK 1] The Math Trap: Why is this result 0.0?
        // We need 50% efficiency (0.5), but integer math is ruining it.
        double efficiency = 1 / 2; 

        System.out.println("Engine Efficiency: " + efficiency);

        // [TASK 3] The Infinite Loop Trap:
        // We want to climb while we are BELOW the target.
        // Currently, '!=' is dangerous because if we step by 20, 
        // 2000 -> 2020 -> 2040 -> 2060... it never exactly equals 2050!
        while (altitude != targetAltitude) { 
            
            climb(20); // Try to climb by 20 meters
            
            System.out.println("Current Altitude: " + altitude);
            
            // Failsafe to prevent infinite loop crash in your game
            if (altitude > 3000) break; 
        }
    }

    // [TASK 2] The Scope Trap (Shadowing):
    // We are trying to update the class variable 'altitude'.
    // Look closely at the parameter name vs the class variable name.
    public static void climb(int altitude) {
        // We are adding 20 to the 'altitude' variable... 
        // BUT which 'altitude' is being updated?
        altitude = altitude + 20; 
    }
}`,
	}
}

// Handle test run request with proper locking and state machine
func (r *Room) handleRunTests(playerID, code string) {
	r.mu.Lock()

	// CRITICAL: Check if tests are already running (the LOCK)
	if r.testRunning {
		player := r.players[playerID]
		r.mu.Unlock()
		
		// Send ERROR_BUSY message to the requester
		log.Printf("Tests already running by %s, rejecting request from %s", r.testRunnerName, player.Username)
		
		errorMsg := Message{
			Type: "ERROR_BUSY",
			Data: map[string]interface{}{
				"message": "System is currently processing. Please wait.",
				"runner":  r.testRunnerName,
			},
		}
		data, _ := json.Marshal(errorMsg)
		
		// Send only to the requester
		for client := range r.clients {
			if client.PlayerID == playerID {
				client.send <- data
				break
			}
		}
		return
	}

	// Check if player is eliminated
	player := r.players[playerID]
	if player == nil || player.IsEliminated {
		r.mu.Unlock()
		log.Printf("Eliminated player %s tried to run tests", playerID)
		return
	}

	// ACQUIRE THE LOCK: Mark tests as running
	r.testRunning = true
	r.testRunner = playerID
	r.testRunnerName = player.Username
	r.codeSnapshot = code // Capture code snapshot to prevent cheating
	
	r.mu.Unlock()

	// Broadcast TEST_LOCKED to ALL clients
	testLockedMsg := Message{
		Type: "TEST_LOCKED",
		Data: map[string]interface{}{
			"runner":   player.Username,
			"runnerID": playerID,
		},
	}
	data, _ := json.Marshal(testLockedMsg)
	r.broadcast <- data

	log.Printf("🔒 TEST LOCKED: %s is running tests", player.Username)

	// Spawn Goroutine for 5-second delay (non-blocking)
	go func() {
		// Wait 5 seconds using time.After (proper Go idiom)
		<-time.After(5 * time.Second)

		// Validate the CODE SNAPSHOT (not live code)
		results := validateSatelliteCode(r.codeSnapshot)

		r.mu.Lock()
		r.testResults = results
		r.testRunning = false // RELEASE THE LOCK
		r.testRunner = ""
		r.testRunnerName = ""
		r.codeSnapshot = ""
		r.mu.Unlock()

		// Broadcast TEST_COMPLETE with results to ALL clients
		testCompleteMsg := Message{
			Type: "TEST_COMPLETE",
			Data: map[string]interface{}{
				"results": results,
				"runner":  player.Username,
				"logs": []string{
					"=== SATELLITE SYSTEM TEST ===",
					formatTestResult(1, "Engine Efficiency Calculation", results[0]),
					formatTestResult(2, "Altitude Update Mechanism", results[1]),
					formatTestResult(3, "Loop Condition Safety", results[2]),
					"========================",
				},
			},
		}
		data, _ := json.Marshal(testCompleteMsg)
		r.broadcast <- data

		log.Printf("✅ TEST COMPLETE: Results %v", results)

		// Check win condition: all tests passed
		allPassed := true
		for _, result := range results {
			if !result {
				allPassed = false
				break
			}
		}

		if allPassed {
			log.Printf("🎉 All tests passed! Civilians win!")
			r.endGame("CIVILIAN_WIN_TESTS")
		}
	}()
}

// Format test result for terminal display
func formatTestResult(num int, name string, passed bool) string {
	status := "❌ FAILED"
	if passed {
		status = "✅ PASSED"
	}
	return "Task " + string(rune('0'+num)) + ": " + name + " ... " + status
}

// Validate satellite code using static analysis
func validateSatelliteCode(code string) []bool {
	results := []bool{false, false, false}

	// TASK 1: Fix integer division (efficiency should be 0.5, not 0.0)
	// Look for: 1.0 / 2, 1 / 2.0, or direct assignment = 0.5
	if strings.Contains(code, "1.0 / 2") || 
	   strings.Contains(code, "1 / 2.0") || 
	   strings.Contains(code, "1.0/2") || 
	   strings.Contains(code, "1/2.0") || 
	   strings.Contains(code, "= 0.5") {
		results[0] = true
	}

	// TASK 2: Fix variable shadowing
	// Check if climb method parameter is NOT named 'altitude'
	// OR if code uses SatelliteSystem.altitude
	if strings.Contains(code, "climb(int amount)") ||
	   strings.Contains(code, "climb(int step)") ||
	   strings.Contains(code, "climb(int increment)") ||
	   strings.Contains(code, "climb(int meters)") ||
	   strings.Contains(code, "SatelliteSystem.altitude") {
		results[1] = true
	}

	// TASK 3: Fix infinite loop (while condition should be < not !=)
	if strings.Contains(code, "while (altitude < targetAltitude)") ||
	   strings.Contains(code, "while(altitude<targetAltitude)") ||
	   strings.Contains(code, "while ( altitude < targetAltitude )") {
		results[2] = true
	}

	return results
}

func (r *Room) eliminatePlayer(playerID string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if player, exists := r.players[playerID]; exists {
		player.IsEliminated = true
		player.IsAlive = false

		if playerID == r.impostorID {
			r.phase = PhaseEnd
			r.broadcastGameState()
			go r.endGame("CIVILIAN_WIN")
			return
		}

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
		"phase":       r.phase,
		"players":     r.players,
		"mode":        r.mode,
		"testResults": r.testResults,
		"testRunning": r.testRunning,
		"testRunner":  r.testRunnerName,
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

func (r *Room) handleVote(voterID, targetID string) {
	log.Printf("Player %s voted for %s", voterID, targetID)
	r.eliminatePlayer(targetID)
}

func (h *Hub) handleYjsConnection(w http.ResponseWriter, r *http.Request, conn *websocket.Conn) {
	roomID := r.URL.Query().Get("room")
	if roomID == "" {
		log.Println("No room ID provided for Yjs connection")
		conn.Close()
		return
	}

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

		room.mu.RLock()
		for client := range room.yjsClients {
			if client != conn {
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