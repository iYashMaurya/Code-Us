package main

import (
	"encoding/json"
	"log"
	"math/rand"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"code-mafia-backend/database"

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
	ID             string `json:"id"`
	Stage          int    `json:"stage"`
	Description    string `json:"description"`
	Template       string `json:"template"`
	Title          string `json:"title"`
	TitleKey       string `json:"titleKey"`
	DescriptionKey string `json:"descriptionKey"`
}

type GameState struct {
	Phase         GamePhase    `json:"phase"`
	CurrentStage  int          `json:"currentStage"`
	TimerSeconds  int          `json:"timerSeconds"`
	ImposterID    string       `json:"imposterID"`
	TasksComplete map[int]bool `json:"tasksComplete"`
	TimerPaused   bool         `json:"timerPaused"`
	GameStartTime time.Time    `json:"gameStartTime"`
}

type Room struct {
	ID         string
	clients    map[*Client]bool
	players    map[string]*Player
	broadcast  chan []byte
	mu         sync.RWMutex
	yjsClients map[*websocket.Conn]*sync.Mutex

	gameState GameState
	tasks     []*Task

	testRunning    bool
	testRunner     string
	testRunnerName string
	codeSnapshot   string

	votes        map[string]string
	votingActive bool
	votingTimer  *time.Timer

	timerCancel     chan struct{}
	timerDone       chan struct{}
	timerCancelOnce sync.Once

	sabotageActive      bool
	sabotageType        string
	sabotageEndTime     time.Time
	corruptedCode       string
	freezeTimer         *time.Timer
	lastSabotageTime    time.Time
	sabotageCooldownSec int
}

func newRoom(id string) *Room {
	room := &Room{
		ID:         id,
		clients:    make(map[*Client]bool),
		players:    make(map[string]*Player),
		broadcast:  make(chan []byte, 256),
		yjsClients: make(map[*websocket.Conn]*sync.Mutex),
		gameState: GameState{
			Phase:         PhaseLobby,
			CurrentStage:  0,
			TimerSeconds:  60,
			TasksComplete: make(map[int]bool),
			TimerPaused:   false,
		},
		testRunning:         false,
		votes:               make(map[string]string),
		votingActive:        false,
		timerCancel:         make(chan struct{}),
		timerDone:           make(chan struct{}),
		sabotageActive:      false,
		sabotageCooldownSec: 10,
	}

	room.loadFromRedis()

	return room
}

func (r *Room) loadFromRedis() {
	err := database.LoadGameState(r.ID, &r.gameState)
	if err == nil {
		log.Printf("Loaded game state from Redis for room %s (Phase: %s)", r.ID, r.gameState.Phase)
	}

	playersData, err := database.LoadAllPlayers(r.ID)
	if err == nil && len(playersData) > 0 {
		for playerID, playerJSON := range playersData {
			var player Player
			if err := json.Unmarshal([]byte(playerJSON), &player); err == nil {
				r.players[playerID] = &player
				log.Printf("Loaded player %s from Redis", player.Username)
			}
		}
	}

	if r.gameState.Phase != PhaseLobby {
		r.tasks = r.loadAllTasks()
	}

	if r.gameState.Phase >= PhaseTask1 && r.gameState.Phase <= PhaseTask3 {
		r.resumeTimerFromRedis()
	}
}

func (r *Room) saveToRedis() {
	err := database.SaveGameState(r.ID, r.gameState)
	if err != nil {
		log.Printf("Failed to save game state to Redis: %v", err)
	}

	for _, player := range r.players {
		err := database.SavePlayer(r.ID, player)
		if err != nil {
			log.Printf("Failed to save player %s: %v", player.Username, err)
		}
	}
}

func (r *Room) resumeTimerFromRedis() {
	startTime, err := database.LoadTimerStart(r.ID)
	if err != nil {
		log.Printf("No timer start time found, starting fresh")
		r.startGlobalTimer()
		return
	}

	elapsed := time.Since(startTime).Seconds()
	remaining := 60 - int(elapsed)

	if remaining > 0 {
		r.gameState.TimerSeconds = remaining
		log.Printf("Resuming timer with %d seconds remaining", remaining)
		r.startGlobalTimer()
	} else {
		log.Printf("Timer expired during downtime - ending game")
		r.endGame("IMPOSTER_WIN_TIMEOUT")
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

			time.Sleep(5 * time.Millisecond)
		}
	}
}

func (r *Room) addPlayer(playerID, username string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if existingPlayer, exists := r.players[playerID]; exists {
		log.Printf("Player %s reconnected to room %s", username, r.ID)
		existingPlayer.IsAlive = true
		existingPlayer.IsEliminated = false
		r.saveToRedis()
		return
	}

	isHost := len(r.players) == 0

	r.players[playerID] = &Player{
		ID:           playerID,
		Username:     username,
		IsHost:       isHost,
		IsEliminated: false,
		IsAlive:      true,
	}

	log.Printf("Player %s (%s) added to room %s (host: %v)", username, playerID, r.ID, isHost)

	r.saveToRedis()
}

func (r *Room) startGame() {
	log.Printf("[1/10] startGame() CALLED for room %s", r.ID)

	r.mu.Lock()

	if r.gameState.Phase != PhaseLobby {
		r.mu.Unlock()
		log.Printf("[ABORT] Game already started in phase %s", r.gameState.Phase)
		return
	}

	playerCount := len(r.players)
	log.Printf("[2/10] Player count: %d", playerCount)

	if playerCount < 3 {
		r.mu.Unlock()
		log.Printf("[ABORT] Not enough players to start (need 3, have %d)", playerCount)
		return
	}

	r.sabotageActive = false
	r.sabotageType = ""
	if r.freezeTimer != nil {
		r.freezeTimer.Stop()
		r.freezeTimer = nil
	}

	r.timerCancel = make(chan struct{})
	r.timerDone = make(chan struct{})
	r.timerCancelOnce = sync.Once{}

	log.Printf("[3/10] Selecting random imposter...")

	playerIDs := make([]string, 0, len(r.players))
	for id := range r.players {
		playerIDs = append(playerIDs, id)
	}

	rand.Seed(time.Now().UnixNano())
	imposterIdx := rand.Intn(len(playerIDs))
	r.gameState.ImposterID = playerIDs[imposterIdx]

	log.Printf("[4/10] Imposter selected: %s", r.gameState.ImposterID)

	for id, player := range r.players {
		if id == r.gameState.ImposterID {
			player.Role = "IMPOSTER"
			log.Printf("%s is IMPOSTER", player.Username)
		} else {
			player.Role = "CIVILIAN"
			log.Printf("%s is CIVILIAN", player.Username)
		}
	}

	log.Printf("[5/10] Loading tasks...")

	r.tasks = r.loadAllTasks()

	log.Printf("[6/10] Tasks loaded: %d tasks", len(r.tasks))

	r.gameState.Phase = PhaseRoleReveal
	r.gameState.CurrentStage = 0
	r.gameState.TimerSeconds = 60
	r.gameState.TasksComplete = make(map[int]bool)
	r.gameState.GameStartTime = time.Now()

	log.Printf("[7/10] Game state initialized - Phase: %s", r.gameState.Phase)

	r.saveToRedis()

	r.mu.Unlock()
	log.Printf("[8/10] Broadcasting ROLE_REVEAL state to all clients...")

	r.broadcastGameState()

	log.Printf("startGame() COMPLETED - Starting 5-second role reveal timer")

	go func() {
		log.Printf("[Goroutine] Waiting 5 seconds for role reveal...")
		time.Sleep(5 * time.Second)

		log.Printf("[Goroutine] Role reveal complete - Transitioning to TASK_1")

		r.mu.Lock()
		r.gameState.Phase = PhaseTask1
		r.gameState.CurrentStage = 1
		r.saveToRedis()
		r.mu.Unlock()

		log.Printf("[Goroutine] Broadcasting TASK_1 state...")
		r.broadcastGameState()

		log.Printf("[Goroutine] Starting global timer...")
		r.startGlobalTimer()

		log.Printf("[Goroutine] Timer started successfully")
	}()
}

func (r *Room) startGlobalTimer() {
	log.Printf("Starting global timer for room %s", r.ID)

	database.SaveTimerStart(r.ID, time.Now())

	go func() {
		ticker := time.NewTicker(1 * time.Second)
		defer ticker.Stop()
		defer close(r.timerDone)

		for {
			select {
			case <-ticker.C:
				r.mu.Lock()

				if r.gameState.TimerPaused {
					r.mu.Unlock()
					continue
				}

				r.gameState.TimerSeconds--
				currentTime := r.gameState.TimerSeconds

				if currentTime%5 == 0 {
					r.saveToRedis()
				}

				r.mu.Unlock()

				msg := Message{
					Type: "SYNC_TIMER",
					Data: map[string]interface{}{
						"timerSeconds": currentTime,
					},
				}
				data, _ := json.Marshal(msg)
				r.broadcast <- data

				if currentTime <= 0 {
					log.Printf("Timer expired for room %s - Imposter wins!", r.ID)
					r.endGame("IMPOSTER_WIN_TIMEOUT")
					return
				}

			case <-r.timerCancel:
				log.Printf("Timer cancelled for room %s", r.ID)
				return
			}
		}
	}()
}

func (r *Room) pauseTimer() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.gameState.TimerPaused = true
	r.saveToRedis()
	log.Printf("Timer paused for room %s", r.ID)
}

func (r *Room) resumeTimer() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.gameState.TimerPaused = false
	r.saveToRedis()
	log.Printf("Timer resumed for room %s", r.ID)
}

func (r *Room) loadAllTasks() []*Task {
	return []*Task{
		{
			ID:             "task1-sportbrakes",
			Stage:          1,
			TitleKey:       "task1.title",
			DescriptionKey: "task1.description",
			Title:          "ENGINE ROOM - Brake System Failure",
			Description:    "The racing car's brake system is malfunctioning! Fix the constructor to properly initialize SportBrakes.",
			Template: `public class RacingCar {
    private String model;
    private Brakes brakes;

    public RacingCar(String model) {
        this.model = model;
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

		{
			ID:             "task2-satellite",
			Stage:          2,
			TitleKey:       "task2.title",
			DescriptionKey: "task2.description",
			Title:          "🛰️ NAVIGATION - Satellite Orbit Calculation",
			Description:    "The satellite's orbit calculation is broken! Fix the integer division and variable shadowing bugs.",
			Template: `public class SatelliteSystem {
    static int altitude = 2000;

    public static void main(String[] args) {
        int targetAltitude = 2050;
        
        double efficiency = 1 / 2;
        System.out.println("Efficiency: " + efficiency);


        while (altitude != targetAltitude) {
            climb(20);
            System.out.println("Altitude: " + altitude);
            if (altitude > 3000) break;
        }
    }


    public static void climb(int altitude) {
        altitude = altitude + 20;
    }
}`,
		},

		{
			ID:             "task3-oxygen",
			Stage:          3,
			TitleKey:       "task3.title",
			DescriptionKey: "task3.description",
			Title:          "💨 OXYGEN SYSTEM - Life Support Critical",
			Description:    "CRITICAL! Fix both the oxygen flow calculation AND the filtration loop logic before the system fails!",
			Template: `public class OxygenSystem {
    private int oxygenLevel = 100;
    private int crew = 5;

    public void distributeOxygen() {

        int perPerson = oxygenLevel / crew;
        System.out.println("Oxygen per person: " + perPerson);
        

        for (int i = 0; i <= crew; i++) {
            System.out.println("Crew " + i + " receiving oxygen...");
        }
    }

    public void filterAir(int minutes) {
        int cyclesNeeded = minutes;
        int cyclesComplete = 0;
        
        while (cyclesComplete < cyclesNeeded) {
            System.out.println("Filtering... Cycle " + cyclesComplete);
        }
    }
}`,
		},
	}
}

func (r *Room) handleRunTests(playerID, code string) {
	r.mu.Lock()

	if r.testRunning {
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

	player := r.players[playerID]
	if player == nil || player.IsEliminated {
		r.mu.Unlock()
		return
	}

	currentStage := r.gameState.CurrentStage
	if currentStage < 1 || currentStage > 3 {
		r.mu.Unlock()
		log.Printf("Invalid stage: %d", currentStage)
		return
	}

	r.testRunning = true
	r.testRunner = playerID
	r.testRunnerName = player.Username
	r.codeSnapshot = code

	r.mu.Unlock()

	testLockedMsg := Message{
		Type: "TEST_LOCKED",
		Data: map[string]interface{}{
			"runner":   "A crewmate",
			"runnerID": playerID,
			"stage":    currentStage,
		},
	}
	data, _ := json.Marshal(testLockedMsg)
	r.broadcast <- data

	log.Printf("Stage %d test locked by %s", currentStage, player.Username)

	go func() {
		time.Sleep(5 * time.Second)

		passed := r.validateStageCode(currentStage, r.codeSnapshot)

		r.mu.Lock()
		r.testRunning = false
		r.testRunner = ""
		r.testRunnerName = ""
		r.codeSnapshot = ""
		r.mu.Unlock()

		testCompleteMsg := Message{
			Type: "TEST_COMPLETE",
			Data: map[string]interface{}{
				"passed": passed,
				"stage":  currentStage,
				"runner": "A crewmate",
			},
		}
		data, _ := json.Marshal(testCompleteMsg)
		r.broadcast <- data

		if passed {
			r.advanceStage(currentStage)
		}
	}()
}

func (r *Room) validateStageCode(stage int, code string) bool {

	normalized := normalizeCode(code)

	switch stage {
	case 1:
		return strings.Contains(normalized, "newsportbrakes()")

	case 2:
		hasEfficiency := containsAny(normalized, []string{
			"1.0/2", "1/2.0", "1.0/2.0", "=0.5", "efficiency=0.5",
		})
		hasLoop := containsAny(normalized, []string{
			"altitude<targetaltitude",
			"altitude<=targetaltitude",
		})
		hasClimb := containsAny(normalized, []string{
			"satellitesystem.altitude+=",
			"satellitesystem.altitude=satellitesystem.altitude+",
		})
		return hasEfficiency && hasLoop && hasClimb

	case 3:
		hasDistribution := containsAny(normalized, []string{
			"doubleperperson", "(double)oxygenlevel",
		})
		hasLoopFix := containsAny(normalized, []string{
			"i=1;i<=crew", "i<crew",
		})
		hasIncrement := containsAny(normalized, []string{
			"cyclescomplete++", "cyclescomplete+=1",
		})

		bugsFixed := 0
		if hasDistribution {
			bugsFixed++
		}
		if hasLoopFix {
			bugsFixed++
		}
		if hasIncrement {
			bugsFixed++
		}

		return bugsFixed >= 2

	default:
		return false
	}
}

func normalizeCode(code string) string {

	lines := strings.Split(code, "\n")
	var cleaned []string
	for _, line := range lines {
		if idx := strings.Index(line, "//"); idx != -1 {
			line = line[:idx]
		}
		cleaned = append(cleaned, line)
	}
	result := strings.Join(cleaned, "\n")

	re := regexp.MustCompile(`(?s)/\*.*?\*/`)
	result = re.ReplaceAllString(result, "")

	result = strings.ReplaceAll(result, " ", "")
	result = strings.ReplaceAll(result, "\t", "")
	result = strings.ReplaceAll(result, "\n", "")
	result = strings.ReplaceAll(result, "\r", "")

	return strings.ToLower(result)
}

func containsAny(text string, patterns []string) bool {
	for _, pattern := range patterns {
		if strings.Contains(text, pattern) {
			return true
		}
	}
	return false
}

func (r *Room) advanceStage(completedStage int) {
	r.mu.Lock()

	r.gameState.TasksComplete[completedStage] = true

	log.Printf("Stage %d completed!", completedStage)

	r.saveToRedis()

	if completedStage == 3 {
		r.gameState.Phase = PhaseEnd
		r.mu.Unlock()
		r.endGame("CIVILIAN_WIN_TASKS")
		return
	}

	r.mu.Unlock()

	nextStage := completedStage + 1
	msg := Message{
		Type: "CHANGE_SCENE",
		Data: map[string]interface{}{
			"fromStage": completedStage,
			"toStage":   nextStage,
			"delay":     3000,
		},
	}
	data, _ := json.Marshal(msg)
	r.broadcast <- data

	log.Printf("Transitioning from Stage %d to Stage %d", completedStage, nextStage)

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

		r.saveToRedis()
		r.mu.Unlock()

		r.broadcastGameState()
		log.Printf("Now on Stage %d", nextStage)
	}()
}

func (r *Room) startDiscussion() {
	r.mu.Lock()
	r.gameState.TimerPaused = true
	r.gameState.Phase = PhaseDiscussion
	r.votes = make(map[string]string)
	r.votingActive = true
	r.saveToRedis()
	r.mu.Unlock()

	r.broadcastGameState()

	log.Printf("Discussion started in room %s - Timer paused", r.ID)

	votingDuration := 30

	go func() {
		for i := votingDuration; i > 0; i-- {
			time.Sleep(1 * time.Second)

			r.mu.RLock()
			stillVoting := r.gameState.Phase == PhaseDiscussion
			r.mu.RUnlock()

			if !stillVoting {
				return
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

		r.mu.Lock()
		if r.gameState.Phase == PhaseDiscussion {
			log.Printf("Voting timeout - tallying votes")
			r.mu.Unlock()
			r.tallyVotes()
		} else {
			r.mu.Unlock()
		}
	}()
}

func (r *Room) handleVote(voterID, targetID string) {
	r.mu.Lock()

	r.votes[voterID] = targetID

	log.Printf("Player %s voted for %s", voterID, targetID)

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
		log.Printf("All players voted (%d/%d) - tallying in 1 second", voteCount, aliveCount)

		allInMsg := Message{
			Type: "ALL_VOTES_IN",
			Data: map[string]interface{}{
				"message": "All votes received - tallying results...",
			},
		}
		allInData, _ := json.Marshal(allInMsg)
		r.broadcast <- allInData

		time.Sleep(1 * time.Second)
		r.tallyVotes()
	}
}

func (r *Room) tallyVotes() {
	r.mu.Lock()

	if !r.votingActive {
		r.mu.Unlock()
		return
	}

	r.votingActive = false

	voteCounts := make(map[string]int)
	for _, targetID := range r.votes {
		voteCounts[targetID]++
	}

	maxVotes := 0
	var eliminated string

	for targetID, count := range voteCounts {
		if count > maxVotes {
			maxVotes = count
			eliminated = targetID
		} else if count == maxVotes && targetID != eliminated {
			eliminated = ""
		}
	}

	isImpostor := eliminated == r.gameState.ImposterID

	var eliminatedName string
	if eliminated != "" && eliminated != "SKIP" {
		if player, exists := r.players[eliminated]; exists {
			eliminatedName = player.Username
		}
	}

	r.mu.Unlock()

	if eliminated == "" || eliminated == "SKIP" {
		log.Printf("⏭ No one eliminated - resuming game")

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

		r.mu.Lock()
		r.votes = make(map[string]string)
		r.mu.Unlock()
		return
	}

	chatMsg := Message{
		Type: "CHAT",
		Data: map[string]interface{}{
			"username": "System",
			"text":     "🗳️ " + eliminatedName + " was voted out!",
			"system":   true,
		},
	}
	chatData, _ := json.Marshal(chatMsg)
	r.broadcast <- chatData

	time.Sleep(1 * time.Second)

	r.eliminatePlayer(eliminated)

	time.Sleep(1 * time.Second)

	if isImpostor {
		log.Printf("Impostor eliminated - Crewmates win!")
		r.endGame("CIVILIAN_WIN_VOTE")
	} else {
		log.Printf("Wrong vote - game continues")

		wrongVoteMsg := Message{
			Type: "CHAT",
			Data: map[string]interface{}{
				"username": "System",
				"text":     eliminatedName + " was not the impostor...",
				"system":   true,
			},
		}
		wrongVoteData, _ := json.Marshal(wrongVoteMsg)
		r.broadcast <- wrongVoteData

		time.Sleep(1 * time.Second)
		r.resumeGameAfterVoting()
	}

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
	r.saveToRedis()
	r.mu.Unlock()

	r.broadcastGameState()
}

func (r *Room) eliminatePlayer(playerID string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if player, exists := r.players[playerID]; exists {
		player.IsEliminated = true
		player.IsAlive = false

		r.saveToRedis()

		elimMsg := Message{
			Type: "PLAYER_ELIMINATED",
			Data: map[string]interface{}{
				"playerID": playerID,
				"username": player.Username,
			},
		}
		data, _ := json.Marshal(elimMsg)
		r.broadcast <- data

		log.Printf("Player %s eliminated", player.Username)
	}
}

func (r *Room) endGame(reason string) {
	log.Printf("🏁 [endGame] Starting game end sequence - Reason: %s", reason)

	r.timerCancelOnce.Do(func() {
		close(r.timerCancel)
		log.Printf("[endGame] Timer cancel channel closed")
	})

	select {
	case <-r.timerDone:
		log.Printf("Timer goroutine stopped cleanly")
	case <-time.After(2 * time.Second):
		log.Printf("Timer stop timeout")
	}

	r.mu.Lock()
	r.gameState.Phase = "GAME_OVER"
	imposterID := r.gameState.ImposterID

	finalState := r.buildGameStatePayload()

	duration := int(time.Since(r.gameState.GameStartTime).Seconds())

	r.saveToRedis()

	r.mu.Unlock()

	go r.saveMatchHistory(reason, duration)

	msg := Message{
		Type: "GAME_ENDED",
		Data: map[string]interface{}{
			"reason":     reason,
			"imposterID": imposterID,
			"finalState": finalState,
		},
	}

	data, _ := json.Marshal(msg)
	log.Printf("[endGame] Broadcasting GAME_ENDED message")
	r.broadcast <- data

	log.Printf("[endGame] Game ended: %s", reason)

	go func() {
		time.Sleep(5 * time.Minute)
		database.DeleteRoom(r.ID)
		log.Printf("🧹 Room %s cleaned up from Redis", r.ID)
	}()
}

func (r *Room) saveMatchHistory(reason string, duration int) {
	var winnerRole string
	if strings.Contains(reason, "CIVILIAN") {
		winnerRole = "CIVILIAN"
	} else if strings.Contains(reason, "IMPOSTER") || strings.Contains(reason, "IMPOSTER") {
		winnerRole = "IMPOSTER"
	} else {
		winnerRole = "UNKNOWN"
	}

	stagesCompleted := 0
	for _, completed := range r.gameState.TasksComplete {
		if completed {
			stagesCompleted++
		}
	}

	match := database.GameMatch{
		RoomCode:        r.ID,
		WinnerRole:      winnerRole,
		ImpostorID:      r.gameState.ImposterID,
		DurationSeconds: duration,
		StagesCompleted: stagesCompleted,
		EndedAt:         time.Now(),
	}

	var matchPlayers []database.MatchPlayer
	for _, player := range r.players {
		matchPlayers = append(matchPlayers, database.MatchPlayer{
			UserID:        player.ID,
			Role:          player.Role,
			WasEliminated: player.IsEliminated,
		})
	}

	err := database.SaveGameMatch(match, matchPlayers)
	if err != nil {
		log.Printf("Failed to save match history: %v", err)
	} else {
		log.Printf("Match history saved to Supabase")
	}
}

func (r *Room) buildGameStatePayload() map[string]interface{} {
	var currentTask *Task
	if r.gameState.CurrentStage >= 1 && r.gameState.CurrentStage <= 3 {
		currentTask = r.tasks[r.gameState.CurrentStage-1]
	}

	return map[string]interface{}{
		"phase":         r.gameState.Phase,
		"currentStage":  r.gameState.CurrentStage,
		"timerSeconds":  r.gameState.TimerSeconds,
		"tasksComplete": r.gameState.TasksComplete,
		"players":       r.players,
		"testRunning":   r.testRunning,
		"testRunner":    r.testRunnerName,
		"task":          currentTask,
	}
}

func (r *Room) handleSabotage(playerID, sabotageType string) {
	r.mu.Lock()

	player := r.players[playerID]
	if player == nil || player.Role != "IMPOSTER" {
		r.mu.Unlock()
		log.Printf("Invalid sabotage attempt: %s", playerID)
		return
	}

	if r.sabotageActive {
		r.mu.Unlock()
		log.Printf("Sabotage already active")
		return
	}

	timeSinceLastSabotage := time.Since(r.lastSabotageTime).Seconds()
	if timeSinceLastSabotage < float64(r.sabotageCooldownSec) && !r.lastSabotageTime.IsZero() {
		r.mu.Unlock()

		remainingCooldown := r.sabotageCooldownSec - int(timeSinceLastSabotage)
		log.Printf("Sabotage on cooldown: %d seconds remaining", remainingCooldown)

		// Send cooldown message to impostor
		cooldownMsg := Message{
			Type: "SABOTAGE_COOLDOWN",
			Data: map[string]interface{}{
				"remainingSeconds": remainingCooldown,
			},
		}
		data, _ := json.Marshal(cooldownMsg)
		for client := range r.clients {
			if client.PlayerID == playerID {
				client.send <- data
				break
			}
		}
		return
	}

	r.sabotageActive = true
	r.sabotageType = sabotageType
	r.lastSabotageTime = time.Now()

	log.Printf("SABOTAGE: %s activated %s", player.Username, sabotageType)

	r.mu.Unlock()

	switch sabotageType {
	case "FREEZE":
		r.handleFreezeSabotage()

	case "CORRUPT":
		r.handleCorruptSabotage()

	default:
		log.Printf("Unknown sabotage type: %s", sabotageType)
		r.mu.Lock()
		r.sabotageActive = false
		r.mu.Unlock()
	}
}

func (r *Room) handleFreezeSabotage() {
	log.Printf("FREEZE sabotage activated - 5 second lockout")

	freezeMsg := Message{
		Type: "SABOTAGE_STARTED",
		Data: map[string]interface{}{
			"type":     "FREEZE",
			"duration": 5000,
		},
	}
	data, _ := json.Marshal(freezeMsg)
	r.broadcast <- data

	chatMsg := Message{
		Type: "CHAT",
		Data: map[string]interface{}{
			"username": "System",
			"text":     "⚠️ SYSTEM JAMMED - Communications frozen!",
			"system":   true,
		},
	}
	chatData, _ := json.Marshal(chatMsg)
	r.broadcast <- chatData

	go func() {
		time.Sleep(5 * time.Second)

		r.mu.Lock()
		r.sabotageActive = false
		r.sabotageType = ""
		r.lastSabotageTime = time.Time{}
		r.mu.Unlock()

		endMsg := Message{
			Type: "SABOTAGE_ENDED",
			Data: map[string]interface{}{
				"type": "FREEZE",
			},
		}
		endData, _ := json.Marshal(endMsg)
		r.broadcast <- endData

		chatMsg := Message{
			Type: "CHAT",
			Data: map[string]interface{}{
				"username": "System",
				"text":     "✅ Systems restored - Communications online",
				"system":   true,
			},
		}
		chatData, _ := json.Marshal(chatMsg)
		r.broadcast <- chatData

		log.Printf("FREEZE sabotage ended")
	}()
}

func (r *Room) handleCorruptSabotage() {
	log.Printf("CORRUPT sabotage activated - injecting malware")

	malwareText := "\n// ⚠️ MALWARE DETECTED - REMOVE THIS LINE TO COMPILE\n// SYSTEM_FAILURE_CODE_0x00FF\n"

	corruptMsg := Message{
		Type: "SABOTAGE_CORRUPT",
		Data: map[string]interface{}{
			"malware": malwareText,
			"action":  "INJECT_AT_TOP",
		},
	}
	data, _ := json.Marshal(corruptMsg)
	r.broadcast <- data

	chatMsg := Message{
		Type: "CHAT",
		Data: map[string]interface{}{
			"username": "System",
			"text":     "🦠 MALWARE DETECTED - Code corrupted!",
			"system":   true,
		},
	}
	chatData, _ := json.Marshal(chatMsg)
	r.broadcast <- chatData

	r.mu.Lock()
	r.sabotageActive = false
	r.sabotageType = ""
	r.mu.Unlock()

	log.Printf("CORRUPT sabotage injected - players must remove malware manually")
}

func (r *Room) broadcastGameState() {
	r.mu.RLock()

	log.Printf("[broadcastGameState] Starting broadcast for room %s", r.ID)
	log.Printf("[broadcastGameState] Current phase: %s", r.gameState.Phase)
	log.Printf("[broadcastGameState] Current stage: %d", r.gameState.CurrentStage)

	var currentTask *Task
	if r.gameState.CurrentStage >= 1 && r.gameState.CurrentStage <= 3 {
		currentTask = r.tasks[r.gameState.CurrentStage-1]
		log.Printf("[broadcastGameState] Current task: %s", currentTask.Title)
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
		log.Printf("[broadcastGameState] Error marshaling: %v", err)
		r.mu.RUnlock()
		return
	}

	r.mu.RUnlock()

	r.broadcast <- data
	log.Printf("[broadcastGameState] Broadcast complete!")
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

	log.Printf("Yjs connection attempt for room: %s", roomID)

	baseRoomID := strings.Split(roomID, "-stage")[0]

	room := h.getRoom(baseRoomID)
	if room == nil {
		log.Printf("Room %s not found for Yjs connection", roomID)
		conn.Close()
		return
	}
	clientMutex := &sync.Mutex{}

	room.mu.Lock()
	room.yjsClients[conn] = clientMutex
	clientCount := len(room.yjsClients)
	room.mu.Unlock()

	log.Printf("Yjs client connected to room %s (total: %d)", roomID, clientCount)

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
		for client, clientMu := range room.yjsClients {
			if client != conn {
				targetClient := client
				targetMu := clientMu

				go func() {
					targetMu.Lock()
					defer targetMu.Unlock()

					targetClient.SetWriteDeadline(time.Now().Add(writeWait))
					if err := targetClient.WriteMessage(messageType, message); err != nil {
						log.Printf("Error broadcasting Yjs message: %v", err)
					}
				}()
			}
		}
		room.mu.RUnlock()
	}
}
