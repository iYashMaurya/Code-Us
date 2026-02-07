package main

import (
	"code-mafia-backend/database"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
)

type Hub struct {
	rooms      map[string]*Room
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

func newHub() *Hub {
	return &Hub{
		rooms:      make(map[string]*Room),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.register:
			h.handleRegister(client)
		case client := <-h.unregister:
			h.handleDisconnect(client)
		}
	}
}

func (h *Hub) handleRegister(client *Client) {
	h.mu.Lock()
	room, exists := h.rooms[client.RoomID]

	if !exists {
		room = newRoom(client.RoomID)
		h.rooms[client.RoomID] = room
		go room.run()
		log.Printf("✅ Created new room %s", client.RoomID)
	}
	h.mu.Unlock()

	room.mu.RLock()
	currentPhase := room.gameState.Phase
	room.mu.RUnlock()

	if currentPhase != "LOBBY" {
		log.Printf("🚫 REJECTED join attempt - room %s in phase %s", client.RoomID, currentPhase)

		errorMsg := Message{
			Type: "ERROR_ACCESS_DENIED",
			Data: map[string]interface{}{
				"reason":  "GAME_IN_PROGRESS",
				"message": "Cannot join - game already started",
				"phase":   string(currentPhase),
			},
		}
		errData, _ := json.Marshal(errorMsg)

		go func() {
			select {
			case client.send <- errData:
				log.Printf("📤 Sent rejection message to client")
			case <-time.After(1 * time.Second):
				log.Printf("⚠️ Timeout sending rejection message")
			}

			time.Sleep(500 * time.Millisecond)

			client.conn.Close()
			log.Printf("🔌 Closed rejected client connection")
		}()

		return
	}

	room.mu.Lock()
	room.clients[client] = true
	clientCount := len(room.clients)
	room.mu.Unlock()

	log.Printf("📥 Client joined room %s (total: %d clients)", client.RoomID, clientCount)
}

func (h *Hub) handleDisconnect(client *Client) {
	h.mu.Lock()
	room, roomExists := h.rooms[client.RoomID]
	h.mu.Unlock()

	if !roomExists {
		log.Printf("⚠️ Client disconnected from non-existent room %s", client.RoomID)
		select {
		case <-client.send:
		default:
			close(client.send)
		}
		return
	}

	room.mu.Lock()

	player, playerExists := room.players[client.PlayerID]
	if !playerExists {
		delete(room.clients, client)
		room.mu.Unlock()

		select {
		case <-client.send:
		default:
			close(client.send)
		}

		log.Printf("⚠️ Disconnected client had no player record")
		return
	}

	playerName := player.Username
	playerID := client.PlayerID
	wasHost := player.IsHost
	currentPhase := room.gameState.Phase
	wasTestRunner := room.testRunning && room.testRunner == playerID

	log.Printf("💀 Player disconnecting: %s (ID: %s, Phase: %s, Host: %v, TestRunner: %v)",
		playerName, playerID, currentPhase, wasHost, wasTestRunner)

	delete(room.clients, client)
	delete(room.players, playerID)

	select {
	case <-client.send:
	default:
		close(client.send)
	}

	if wasTestRunner {
		room.testRunning = false
		room.testRunner = ""
		room.testRunnerName = ""
		room.codeSnapshot = ""

		cancelMsg := Message{
			Type: "TEST_CANCELLED",
			Data: map[string]interface{}{
				"reason": playerName + " disconnected during test execution",
			},
		}
		msgData, _ := json.Marshal(cancelMsg)
		room.broadcast <- msgData

		log.Printf("⚠️ Test runner %s disconnected, unlocking room", playerName)
	}

	switch currentPhase {
	case "LOBBY":
		log.Printf("📋 [LOBBY] Player %s left lobby", playerName)

		disconnectMsg := Message{
			Type: "CHAT",
			Data: map[string]interface{}{
				"username": "System",
				"text":     playerName + " left the lobby",
				"system":   true,
			},
		}
		msgData, _ := json.Marshal(disconnectMsg)
		room.broadcast <- msgData

	case "ROLE_REVEAL", "TASK_1", "TASK_2", "TASK_3", "DISCUSSION":
		log.Printf("☠️ [IN-GAME] Player %s SELF-KILLED (disconnected)", playerName)

		player.IsEliminated = true
		player.IsAlive = false

		gameLogMsg := Message{
			Type: "CHAT",
			Data: map[string]interface{}{
				"username": "System",
				"text":     "⚠️ COMMUNICATION LOST: " + playerName + " has disconnected",
				"system":   true,
			},
		}
		msgData, _ := json.Marshal(gameLogMsg)
		room.broadcast <- msgData

		elimMsg := Message{
			Type: "PLAYER_ELIMINATED",
			Data: map[string]interface{}{
				"playerID": playerID,
				"username": playerName,
				"reason":   "DISCONNECTED",
			},
		}
		elimData, _ := json.Marshal(elimMsg)
		room.broadcast <- elimData

		if playerID == room.gameState.ImposterID {
			log.Printf("🎉 Impostor disconnected - Civilians win by default!")
			room.mu.Unlock()
			room.endGame("CIVILIAN_WIN_DISCONNECT")
			return
		}

		civilianCount := 0
		for _, p := range room.players {
			if p.Role == "CIVILIAN" && !p.IsEliminated {
				civilianCount++
			}
		}

		if civilianCount == 0 {
			log.Printf("💀 All civilians eliminated - Impostor wins!")
			room.mu.Unlock()
			room.endGame("IMPOSTER_WIN")
			return
		}
	}

	if wasHost && len(room.players) > 0 {
		log.Printf("Host migration required - old host %s disconnected", playerName)

		var newHost *Player
		var newHostID string

		for id, p := range room.players {
			newHost = p
			newHostID = id
			break
		}

		if newHost != nil {
			newHost.IsHost = true
			log.Printf("New host assigned: %s (ID: %s)", newHost.Username, newHostID)

			room.mu.Unlock()
			room.broadcastPlayerList()
			room.mu.Lock()

			hostMsg := Message{
				Type: "NEW_HOST_ASSIGNED",
				Data: map[string]interface{}{
					"newHostID":   newHostID,
					"newHostName": newHost.Username,
					"canStart":    len(room.players) >= 3,
				},
			}
			hostData, _ := json.Marshal(hostMsg)
			room.broadcast <- hostData

			chatMsg := Message{
				Type: "CHAT",
				Data: map[string]interface{}{
					"username": "System",
					"text":     "👑 " + newHost.Username + " is now the host",
					"system":   true,
				},
			}
			chatData, _ := json.Marshal(chatMsg)
			room.broadcast <- chatData
		}
	}

	room.mu.Unlock()

	room.broadcastPlayerList()

	h.mu.Lock()
	if len(room.clients) == 0 {
		delete(h.rooms, client.RoomID)
		log.Printf("🧹 Room %s cleaned up (empty)", client.RoomID)
	}
	h.mu.Unlock()
}

func (h *Hub) getRoom(roomID string) *Room {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.rooms[roomID]
}

func (h *Hub) handleChatMessage(roomID, playerID, username, text string) {
	room := h.getRoom(roomID)
	if room == nil {
		return
	}

	messageID := uuid.New().String()

	database.AddToChatHistory(roomID, text)

	context, err := database.GetRoomChatHistory(roomID, 3)
	if err != nil {
		log.Printf("Failed to get chat history: %v", err)
		context = []string{}
	}

	go func() {
		err := database.PublishChatMessage(messageID, text, username, roomID, playerID, context)
		if err != nil {
			log.Printf("Failed to publish chat message for translation: %v", err)
		}
	}()

	log.Printf("📤 Chat [%s]: %s: %s (sent for translation)", roomID, username, text)
}
