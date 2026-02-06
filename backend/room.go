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
	PhaseTask1      GamePhase = "TASK_1"
	PhaseTask2      GamePhase = "TASK_2"
	PhaseTask3      GamePhase = "TASK_3"
	PhaseDiscussion GamePhase = "DISCUSSION"
	PhaseEnd        GamePhase = "GAME_OVER"
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
	Stage       int    `json:"stage"`
	Description string `json:"description"`
	Template    string `json:"template"`
	Title       string `json:"title"`
}

type GameState struct {
	Phase         GamePhase          `json:"phase"`
	CurrentStage  int                `json:"currentStage"`  // 0=lobby, 1=task1, 2=task2, 3=task3
	TimerSeconds  int                `json:"timerSeconds"`  // Global countdown
	ImpostorID    string             `json:"impostorID"`
	TasksComplete map[int]bool       `json:"tasksComplete"` // Track which stages are done
	TimerPaused   bool               `json:"timerPaused"`   // For discussion phase
}

type Room struct {
	ID          string
	clients     map[*Client]bool
	players     map[string]*Player
	broadcast   chan []byte
	mu          sync.RWMutex
	yjsClients  map[*websocket.Conn]bool
	
	// Game State Machine
	gameState   GameState
	tasks       []*Task // Array of tasks for each stage
	
	// Test Execution State
	testRunning    bool
	testRunner     string
	testRunnerName string
	codeSnapshot   string
	
	// Voting System (FIX #2)
	votes          map[string]string // voterID -> targetID
	votingActive   bool
	votingTimer    *time.Timer
	
	// Timer Control
	timerCancel chan bool
}

func newRoom(id string) *Room {
	return &Room{
		ID:          id,
		clients:     make(map[*Client]bool),
		players:     make(map[string]*Player),
		broadcast:   make(chan []byte, 256),
		yjsClients:  make(map[*websocket.Conn]bool),
		gameState: GameState{
			Phase:         PhaseLobby,
			CurrentStage:  0,
			TimerSeconds:  60,
			TasksComplete: make(map[int]bool),
			TimerPaused:   false,
		},
		testRunning:  false,
		votes:        make(map[string]string),
		votingActive: false,
		timerCancel:  make(chan bool),
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

// Replace your startGame() function in room.go with this version

func (r *Room) startGame() {
	log.Printf("🎬 [1/10] startGame() CALLED for room %s", r.ID)
	
	r.mu.Lock()
	log.Printf("🎬 [2/10] Mutex LOCKED")

	playerCount := len(r.players)
	log.Printf("🎬 [3/10] Player count: %d", playerCount)

	if playerCount < 3 {
		r.mu.Unlock()
		log.Printf("❌ [ABORT] Not enough players to start (need 3, have %d)", playerCount)
		return
	}

	log.Printf("🎬 [4/10] Selecting random impostor...")
	
	// Select random impostor
	playerIDs := make([]string, 0, len(r.players))
	for id := range r.players {
		playerIDs = append(playerIDs, id)
	}

	rand.Seed(time.Now().UnixNano())
	impostorIdx := rand.Intn(len(playerIDs))
	r.gameState.ImpostorID = playerIDs[impostorIdx]

	log.Printf("🎬 [5/10] Impostor selected: %s", r.gameState.ImpostorID)

	// Assign roles
	for id, player := range r.players {
		if id == r.gameState.ImpostorID {
			player.Role = "IMPOSTOR"
			log.Printf("   👹 %s is IMPOSTOR", player.Username)
		} else {
			player.Role = "CIVILIAN"
			log.Printf("   👤 %s is CIVILIAN", player.Username)
		}
	}

	log.Printf("🎬 [6/10] Loading tasks...")
	
	// Load all tasks
	r.tasks = r.loadAllTasks()
	
	log.Printf("🎬 [7/10] Tasks loaded: %d tasks", len(r.tasks))
	
	// Initialize game state
	r.gameState.Phase = PhaseRoleReveal
	r.gameState.CurrentStage = 0
	r.gameState.TimerSeconds = 60
	r.gameState.TasksComplete = make(map[int]bool)

	log.Printf("🎬 [8/10] Game state initialized - Phase: %s", r.gameState.Phase)

	r.mu.Unlock()
	log.Printf("🎬 [9/10] Mutex UNLOCKED")

	log.Printf("🎬 [10/10] Broadcasting ROLE_REVEAL state to all clients...")
	r.broadcastGameState()

	log.Printf("✅ startGame() COMPLETED - Starting 5-second role reveal timer")

	// Role reveal for 5 seconds, then start Task 1
	go func() {
		log.Printf("⏱️  [Goroutine] Waiting 5 seconds for role reveal...")
		time.Sleep(5 * time.Second)
		
		log.Printf("⏱️  [Goroutine] Role reveal complete - Transitioning to TASK_1")
		
		r.mu.Lock()
		r.gameState.Phase = PhaseTask1
		r.gameState.CurrentStage = 1
		r.mu.Unlock()
		
		log.Printf("⏱️  [Goroutine] Broadcasting TASK_1 state...")
		r.broadcastGameState()
		
		log.Printf("⏱️  [Goroutine] Starting global timer...")
		r.startGlobalTimer()
		
		log.Printf("⏱️  [Goroutine] Timer started successfully")
	}()
}

// Global Timer - The "Ticking Bomb"
func (r *Room) startGlobalTimer() {
	log.Printf("🕐 Starting global timer for room %s", r.ID)
	
	go func() {
		ticker := time.NewTicker(1 * time.Second)
		defer ticker.Stop()
		
		for {
			select {
			case <-ticker.C:
				r.mu.Lock()
				
				// Skip tick if timer is paused (during discussion)
				if r.gameState.TimerPaused {
					r.mu.Unlock()
					continue
				}
				
				r.gameState.TimerSeconds--
				currentTime := r.gameState.TimerSeconds
				r.mu.Unlock()
				
				// Broadcast time sync to all clients
				msg := Message{
					Type: "SYNC_TIMER",
					Data: map[string]interface{}{
						"timerSeconds": currentTime,
					},
				}
				data, _ := json.Marshal(msg)
				r.broadcast <- data
				
				// Check if time is up
				if currentTime <= 0 {
					log.Printf("⏰ Timer expired for room %s - Impostor wins!", r.ID)
					r.endGame("IMPOSTOR_WIN_TIMEOUT")
					return
				}
				
			case <-r.timerCancel:
				log.Printf("⏹️ Timer cancelled for room %s", r.ID)
				return
			}
		}
	}()
}

func (r *Room) pauseTimer() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.gameState.TimerPaused = true
	log.Printf("⏸️ Timer paused for room %s", r.ID)
}

func (r *Room) resumeTimer() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.gameState.TimerPaused = false
	log.Printf("▶️ Timer resumed for room %s", r.ID)
}

func (r *Room) loadAllTasks() []*Task {
	return []*Task{
		// Task 1: Engine Room - SportBrakes Bug
		{
			ID:    "task1-sportbrakes",
			Stage: 1,
			Title: "🔧 ENGINE ROOM - Brake System Failure",
			Description: "The racing car's brake system is malfunctioning! Fix the constructor to properly initialize SportBrakes.",
			Template: `public class RacingCar {
    private String model;
    private Brakes brakes;

    // [BUG] Constructor should initialize brakes with SportBrakes
    public RacingCar(String model) {
        this.model = model;
        // Missing: this.brakes = new SportBrakes();
    }

    public void applyBrakes() {
        if (brakes == null) {
            System.out.println("ERROR: No brakes installed!");
        } else {
            brakes.apply();
        }
    }
}

class Brakes {
    public void apply() {
        System.out.println("Standard brakes applied");
    }
}

class SportBrakes extends Brakes {
    @Override
    public void apply() {
        System.out.println("Sport brakes applied - HIGH PERFORMANCE!");
    }
}`,
		},
		
		// Task 2: Navigation - Satellite Orbit Bug
		{
			ID:    "task2-satellite",
			Stage: 2,
			Title: "🛰️ NAVIGATION - Satellite Orbit Calculation",
			Description: "The satellite's orbit calculation is broken! Fix the integer division and variable shadowing bugs.",
			Template: `public class SatelliteSystem {
    static int altitude = 2000;

    public static void main(String[] args) {
        int targetAltitude = 2050;
        
        // [BUG 1] Integer division - should be 0.5, not 0.0
        double efficiency = 1 / 2;
        System.out.println("Efficiency: " + efficiency);

        // [BUG 2] Loop condition - should be <, not !=
        while (altitude != targetAltitude) {
            climb(20);
            System.out.println("Altitude: " + altitude);
            if (altitude > 3000) break;
        }
    }

    // [BUG 3] Variable shadowing - parameter hides class variable
    public static void climb(int altitude) {
        altitude = altitude + 20;
    }
}`,
		},
		
		// Task 3: Oxygen System - Two-Part Puzzle
		{
			ID:    "task3-oxygen",
			Stage: 3,
			Title: "💨 OXYGEN SYSTEM - Life Support Critical",
			Description: "CRITICAL! Fix both the oxygen flow calculation AND the filtration loop logic before the system fails!",
			Template: `public class OxygenSystem {
    private int oxygenLevel = 100;
    private int crew = 5;

    public void distributeOxygen() {
        // [BUG 1] Integer division - each crew member gets 0 oxygen!
        int perPerson = oxygenLevel / crew;
        System.out.println("Oxygen per person: " + perPerson);
        
        // [BUG 2] Off-by-one error - should start at 1, not 0
        for (int i = 0; i <= crew; i++) {
            System.out.println("Crew " + i + " receiving oxygen...");
        }
    }

    public void filterAir(int minutes) {
        int cyclesNeeded = minutes;
        int cyclesComplete = 0;
        
        // [BUG 3] Infinite loop - cyclesComplete never increments!
        while (cyclesComplete < cyclesNeeded) {
            System.out.println("Filtering... Cycle " + cyclesComplete);
            // Missing: cyclesComplete++;
        }
    }
}`,
		},
	}
}

// Handle test run for current stage
func (r *Room) handleRunTests(playerID, code string) {
	r.mu.Lock()

	// Check if tests are already running
	if r.testRunning {
		// player := r.players[playerID]
		r.mu.Unlock()
		
		errorMsg := Message{
			Type: "ERROR_BUSY",
			Data: map[string]interface{}{
				"message": "System is currently processing. Please wait.",
				"runner":  r.testRunnerName,
			},
		}
		data, _ := json.Marshal(errorMsg)
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
		return
	}

	// Get current stage
	currentStage := r.gameState.CurrentStage
	if currentStage < 1 || currentStage > 3 {
		r.mu.Unlock()
		log.Printf("Invalid stage: %d", currentStage)
		return
	}

	// Acquire lock
	r.testRunning = true
	r.testRunner = playerID
	r.testRunnerName = player.Username
	r.codeSnapshot = code
	
	r.mu.Unlock()

	// Broadcast test locked
	testLockedMsg := Message{
		Type: "TEST_LOCKED",
		Data: map[string]interface{}{
			"runner":   player.Username,
			"runnerID": playerID,
			"stage":    currentStage,
		},
	}
	data, _ := json.Marshal(testLockedMsg)
	r.broadcast <- data

	log.Printf("🔒 Stage %d test locked by %s", currentStage, player.Username)

	// Spawn goroutine for test execution
	go func() {
		time.Sleep(5 * time.Second)

		// Validate code for current stage
		passed := r.validateStageCode(currentStage, r.codeSnapshot)

		r.mu.Lock()
		r.testRunning = false
		r.testRunner = ""
		r.testRunnerName = ""
		r.codeSnapshot = ""
		r.mu.Unlock()

		// Broadcast results
		testCompleteMsg := Message{
			Type: "TEST_COMPLETE",
			Data: map[string]interface{}{
				"passed": passed,
				"stage":  currentStage,
				"runner": player.Username,
			},
		}
		data, _ := json.Marshal(testCompleteMsg)
		r.broadcast <- data

		// If test passed, advance to next stage
		if passed {
			r.advanceStage(currentStage)
		}
	}()
}

// Validate code for specific stage
func (r *Room) validateStageCode(stage int, code string) bool {
	switch stage {
	case 1: // Task 1: SportBrakes
		return strings.Contains(code, "new SportBrakes()")
	
	case 2: // Task 2: Satellite
		hasEfficiency := strings.Contains(code, "1.0 / 2") || strings.Contains(code, "1 / 2.0") || strings.Contains(code, "= 0.5")
		hasLoop := strings.Contains(code, "while (altitude < targetAltitude)") || strings.Contains(code, "while(altitude<targetAltitude)")
		hasClimb := strings.Contains(code, "climb(int amount)") || strings.Contains(code, "climb(int step)") || strings.Contains(code, "SatelliteSystem.altitude")
		return hasEfficiency && hasLoop && hasClimb
	
	case 3: // Task 3: Oxygen (two bugs minimum)
		hasDistribution := strings.Contains(code, "double perPerson") || strings.Contains(code, "(double)oxygenLevel")
		hasLoopFix := strings.Contains(code, "i = 1") || strings.Contains(code, "i < crew")
		hasIncrement := strings.Contains(code, "cyclesComplete++") || strings.Contains(code, "cyclesComplete = cyclesComplete + 1")
		bugsFixed := 0
		if hasDistribution { bugsFixed++ }
		if hasLoopFix { bugsFixed++ }
		if hasIncrement { bugsFixed++ }
		return bugsFixed >= 2 // Need at least 2 of 3 bugs fixed
	
	default:
		return false
	}
}

// Advance to next stage - THE SYNCHRONIZED CONVEYOR BELT
func (r *Room) advanceStage(completedStage int) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Mark stage as complete
	r.gameState.TasksComplete[completedStage] = true
	
	log.Printf("✅ Stage %d completed!", completedStage)

	// Determine next phase
	if completedStage == 3 {
		// All tasks complete - Crewmates win!
		r.gameState.Phase = PhaseEnd
		r.mu.Unlock()
		r.endGame("CIVILIAN_WIN_TASKS")
		return
	}

	// Broadcast stage transition
	nextStage := completedStage + 1
	msg := Message{
		Type: "CHANGE_SCENE",
		Data: map[string]interface{}{
			"fromStage": completedStage,
			"toStage":   nextStage,
			"delay":     3000, // 3 second transition
		},
	}
	data, _ := json.Marshal(msg)
	r.broadcast <- data

	log.Printf("🚀 Transitioning from Stage %d to Stage %d", completedStage, nextStage)

	// Schedule actual phase change after transition
	go func() {
		time.Sleep(3 * time.Second)
		
		r.mu.Lock()
		r.gameState.CurrentStage = nextStage
		
		switch nextStage {
		case 2:
			r.gameState.Phase = PhaseTask2
		case 3:
			r.gameState.Phase = PhaseTask3
		}
		r.mu.Unlock()
		
		r.broadcastGameState()
		log.Printf("📍 Now on Stage %d", nextStage)
	}()
}

// FIX #6: Start discussion with auto-resume
func (r *Room) startDiscussion() {
	r.mu.Lock()
	r.gameState.TimerPaused = true
	r.gameState.Phase = PhaseDiscussion
	r.votes = make(map[string]string) // Reset votes
	r.votingActive = true
	r.mu.Unlock()
	
	r.broadcastGameState()
	
	log.Printf("🗣️ Discussion started in room %s - Timer paused", r.ID)
	
	// FIX #7: Server-controlled voting timer (30 seconds)
	votingDuration := 30
	
	// Broadcast countdown to all clients
	go func() {
		for i := votingDuration; i > 0; i-- {
			time.Sleep(1 * time.Second)
			
			r.mu.RLock()
			stillVoting := r.gameState.Phase == PhaseDiscussion
			r.mu.RUnlock()
			
			if !stillVoting {
				return // Voting ended early
			}
			
			msg := Message{
				Type: "VOTING_TIMER",
				Data: map[string]interface{}{
					"seconds": i,
				},
			}
			data, _ := json.Marshal(msg)
			r.broadcast <- data
		}
		
		// Time's up - auto-resolve voting
		r.mu.Lock()
		if r.gameState.Phase == PhaseDiscussion {
			log.Printf("⏰ Voting timeout - tallying votes")
			r.mu.Unlock()
			r.tallyVotes()
		} else {
			r.mu.Unlock()
		}
	}()
}

// FIX #2: Implement vote aggregation system
func (r *Room) handleVote(voterID, targetID string) {
	r.mu.Lock()
	
	// Store vote
	r.votes[voterID] = targetID
	
	log.Printf("🗳️ Player %s voted for %s", voterID, targetID)
	
	// Broadcast vote update to show who has voted (but not who they voted for)
	voteStatus := make(map[string]bool)
	for vid := range r.votes {
		voteStatus[vid] = true
	}
	
	r.mu.Unlock()
	
	msg := Message{
		Type: "VOTE_UPDATE",
		Data: map[string]interface{}{
			"hasVoted": voteStatus,
		},
	}
	data, _ := json.Marshal(msg)
	r.broadcast <- data
	
	// Check if all alive players have voted
	r.mu.RLock()
	aliveCount := 0
	for _, p := range r.players {
		if !p.IsEliminated {
			aliveCount++
		}
	}
	voteCount := len(r.votes)
	r.mu.RUnlock()
	
	if voteCount >= aliveCount {
		log.Printf("✅ All players voted (%d/%d) - tallying now", voteCount, aliveCount)
		r.tallyVotes()
	}
}

// FIX #2: Tally votes and determine outcome
func (r *Room) tallyVotes() {
	r.mu.Lock()
	
	if !r.votingActive {
		r.mu.Unlock()
		return // Already processed
	}
	
	r.votingActive = false
	
	// Count votes for each target
	voteCounts := make(map[string]int)
	for _, targetID := range r.votes {
		voteCounts[targetID]++
	}
	
	// Find player with most votes
	maxVotes := 0
	var eliminated string
	
	for targetID, count := range voteCounts {
		if count > maxVotes {
			maxVotes = count
			eliminated = targetID
		} else if count == maxVotes && targetID != eliminated {
			// Tie - no one eliminated
			eliminated = ""
		}
	}
	
	isImpostor := eliminated == r.gameState.ImpostorID
	
	// Get eliminated player name BEFORE unlocking
	var eliminatedName string
	if eliminated != "" && eliminated != "SKIP" {
		if player, exists := r.players[eliminated]; exists {
			eliminatedName = player.Username
		}
	}
	
	r.mu.Unlock()
	
	// Broadcast vote results
	resultMsg := Message{
		Type: "VOTE_RESULT",
		Data: map[string]interface{}{
			"eliminated":  eliminated,
			"voteCounts":  voteCounts,
			"wasImpostor": isImpostor,
		},
	}
	data, _ := json.Marshal(resultMsg)
	r.broadcast <- data
	
	// Wait 2 seconds to show results
	time.Sleep(2 * time.Second)
	
	// Handle outcome
	if eliminated == "" || eliminated == "SKIP" {
		// No elimination or skip vote won
		log.Printf("⏭️ No one eliminated - resuming game")
		
		// Send chat message
		chatMsg := Message{
			Type: "CHAT",
			Data: map[string]interface{}{
				"username": "System",
				"text":     "No one was eliminated. The crew continues...",
				"system":   true,
			},
		}
		chatData, _ := json.Marshal(chatMsg)
		r.broadcast <- chatData
		
		r.resumeGameAfterVoting()
		
		// Reset votes
		r.mu.Lock()
		r.votes = make(map[string]string)
		r.mu.Unlock()
		return
	}
	
	// Eliminate player
	r.eliminatePlayer(eliminated)
	
	// Send elimination chat message with correct name
	chatMsg := Message{
		Type: "CHAT",
		Data: map[string]interface{}{
			"username": "System",
			"text":     eliminatedName + " was eliminated!",
			"system":   true,
		},
	}
	chatData, _ := json.Marshal(chatMsg)
	r.broadcast <- chatData
	
	// Wait another second for elimination message to be seen
	time.Sleep(1 * time.Second)
	
	if isImpostor {
		// Voted out the impostor - Crewmates win!
		log.Printf("🎉 Impostor eliminated - Crewmates win!")
		r.endGame("CIVILIAN_WIN_VOTE")
	} else {
		// Wrong vote - Resume game
		log.Printf("😢 Wrong vote - game continues")
		r.resumeGameAfterVoting()
	}
	
	// Reset votes
	r.mu.Lock()
	r.votes = make(map[string]string)
	r.mu.Unlock()
}

func (r *Room) resumeGameAfterVoting() {
	r.resumeTimer()
	
	r.mu.Lock()
	currentStage := r.gameState.CurrentStage
	switch currentStage {
	case 1:
		r.gameState.Phase = PhaseTask1
	case 2:
		r.gameState.Phase = PhaseTask2
	case 3:
		r.gameState.Phase = PhaseTask3
	default:
		r.gameState.Phase = PhaseTask1
	}
	r.mu.Unlock()
	
	r.broadcastGameState()
}

func (r *Room) eliminatePlayer(playerID string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if player, exists := r.players[playerID]; exists {
		player.IsEliminated = true
		player.IsAlive = false
		
		// Broadcast elimination
		elimMsg := Message{
			Type: "PLAYER_ELIMINATED",
			Data: map[string]interface{}{
				"playerID": playerID,
				"username": player.Username,
			},
		}
		data, _ := json.Marshal(elimMsg)
		r.broadcast <- data
	}
}

func (r *Room) endGame(reason string) {
	log.Printf("🏁 [endGame] Starting game end sequence - Reason: %s", reason)
	
	// Cancel timer
	select {
	case r.timerCancel <- true:
		log.Printf("🏁 [endGame] Timer cancelled")
	default:
		log.Printf("🏁 [endGame] Timer already stopped")
	}
	
	r.mu.Lock()
	r.gameState.Phase = "GAME_OVER"  // Use string literal instead of const
	impostorID := r.gameState.ImpostorID
	log.Printf("🏁 [endGame] Phase set to GAME_OVER, Impostor was: %s", impostorID)
	r.mu.Unlock()

	// First, broadcast GAME_ENDED message with reason and impostor
	msg := Message{
		Type: "GAME_ENDED",
		Data: map[string]interface{}{
			"reason":     reason,
			"impostorID": impostorID,
		},
	}

	data, _ := json.Marshal(msg)
	log.Printf("🏁 [endGame] Broadcasting GAME_ENDED message")
	r.broadcast <- data
	
	// Small delay to ensure message is received
	time.Sleep(500 * time.Millisecond)
	
	// Then broadcast final game state
	log.Printf("🏁 [endGame] Broadcasting final GAME_STATE")
	r.broadcastGameState()
	
	log.Printf("✅ [endGame] Game ended: %s", reason)
}
// Replace your broadcastGameState() function in room.go with this version

func (r *Room) broadcastGameState() {
	r.mu.RLock()
	
	log.Printf("📡 [broadcastGameState] Starting broadcast for room %s", r.ID)
	log.Printf("📡 [broadcastGameState] Current phase: %s", r.gameState.Phase)
	log.Printf("📡 [broadcastGameState] Current stage: %d", r.gameState.CurrentStage)
	log.Printf("📡 [broadcastGameState] Connected clients: %d", len(r.clients))
	
	// Get current task
	var currentTask *Task
	if r.gameState.CurrentStage >= 1 && r.gameState.CurrentStage <= 3 {
		currentTask = r.tasks[r.gameState.CurrentStage-1]
		log.Printf("📡 [broadcastGameState] Current task: %s", currentTask.Title)
	} else {
		log.Printf("📡 [broadcastGameState] No current task (stage %d)", r.gameState.CurrentStage)
	}
	
	state := map[string]interface{}{
		"phase":         r.gameState.Phase,
		"currentStage":  r.gameState.CurrentStage,
		"timerSeconds":  r.gameState.TimerSeconds,
		"tasksComplete": r.gameState.TasksComplete,
		"players":       r.players,
		"testRunning":   r.testRunning,
		"testRunner":    r.testRunnerName,
	}

	if currentTask != nil {
		state["task"] = currentTask
	}

	msg := Message{
		Type: "GAME_STATE",
		Data: state,
	}

	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("❌ [broadcastGameState] Error marshaling: %v", err)
		r.mu.RUnlock()
		return
	}

	log.Printf("📡 [broadcastGameState] Message marshaled successfully (%d bytes)", len(data))
	log.Printf("📡 [broadcastGameState] Message type: GAME_STATE")
	
	r.mu.RUnlock()

	// Send to broadcast channel
	log.Printf("📡 [broadcastGameState] Sending to broadcast channel...")
	r.broadcast <- data
	log.Printf("✅ [broadcastGameState] Broadcast complete!")
}

func (r *Room) broadcastPlayerList() {
	msg := Message{
		Type: "PLAYER_LIST",
		Data: r.players,
	}

	data, _ := json.Marshal(msg)
	r.broadcast <- data
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