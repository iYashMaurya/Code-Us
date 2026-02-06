package main

import (
	"encoding/json"
	"log"
	"sync"
	"time"
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

// ✅ FIX #1 & #3: Race condition protection + Join validation
func (h *Hub) handleRegister(client *Client) {
	h.mu.Lock()
	room, exists := h.rooms[client.RoomID]
	
	// Create room if it doesn't exist
	if !exists {
		room = newRoom(client.RoomID)
		h.rooms[client.RoomID] = room
		go room.run()
		log.Printf("✅ Created new room %s", client.RoomID)
	}
	h.mu.Unlock()
	
	// ✅ FIX #3: Check game phase before allowing join
	room.mu.RLock()
	currentPhase := room.gameState.Phase
	room.mu.RUnlock()
	
	if currentPhase != "LOBBY" {
		log.Printf("🚫 REJECTED join attempt - room %s in phase %s", client.RoomID, currentPhase)
		
		// Send rejection message
		errorMsg := Message{
			Type: "ERROR_ACCESS_DENIED",
			Data: map[string]interface{}{
				"reason":  "GAME_IN_PROGRESS",
				"message": "Cannot join - game already started",
				"phase":   string(currentPhase),
			},
		}
		errData, _ := json.Marshal(errorMsg)
		
		// Send error to client
		select {
		case client.send <- errData:
			log.Printf("📤 Sent rejection message to client")
		default:
			log.Printf("⚠️ Could not send rejection message")
		}
		
		// Close connection after brief delay
		time.AfterFunc(500*time.Millisecond, func() {
			close(client.send)
			client.conn.Close()
			log.Printf("🔌 Closed rejected client connection")
		})
		
		return
	}
	
	// Add client to room
	room.mu.Lock()
	room.clients[client] = true
	clientCount := len(room.clients)
	room.mu.Unlock()
	
	log.Printf("📥 Client joined room %s (total: %d clients)", client.RoomID, clientCount)
}

// ✅ ENHANCED: Disconnect handling with comprehensive cleanup
func (h *Hub) handleDisconnect(client *Client) {
	h.mu.Lock()
	room, roomExists := h.rooms[client.RoomID]
	h.mu.Unlock()
	
	if !roomExists {
		log.Printf("⚠️ Client disconnected from non-existent room %s", client.RoomID)
		return
	}

	room.mu.Lock()
	
	// Get player info before removing
	player, playerExists := room.players[client.PlayerID]
	if !playerExists {
		// Remove client even if no player record
		delete(room.clients, client)
		room.mu.Unlock()
		
		// Safe close
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

	// Remove from clients and players
	delete(room.clients, client)
	delete(room.players, playerID)
	
	// Safe close of send channel
	select {
	case <-client.send:
		// Already closed
	default:
		close(client.send)
	}
	
	// ✅ FIX: Cancel test if this player was running it
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
	
	// Phase-specific handling
	switch currentPhase {
	case "LOBBY":
		// Just remove and update list
		log.Printf("📋 [LOBBY] Player %s left lobby", playerName)
		
		// Send simple disconnect message
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
		// IN-GAME disconnect - this is a "self-kill"
		log.Printf("☠️ [IN-GAME] Player %s SELF-KILLED (disconnected)", playerName)
		
		// Mark as eliminated
		player.IsEliminated = true
		player.IsAlive = false
		
		// Broadcast dramatic disconnect message
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
		
		// Broadcast elimination
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
		
		// Check if this was the impostor
		if playerID == room.gameState.ImpostorID {
			log.Printf("🎉 Impostor disconnected - Civilians win by default!")
			room.mu.Unlock()
			room.endGame("CIVILIAN_WIN_DISCONNECT")
			return
		}
		
		// Check if all civilians are dead
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
	
	// ✅ FIX #9: Enhanced host migration
	if wasHost && len(room.players) > 0 {
		log.Printf("👑 Host migration required - old host %s disconnected", playerName)
		
		// Find new host (first remaining player)
		var newHost *Player
		var newHostID string
		
		for id, p := range room.players {
			newHost = p
			newHostID = id
			break
		}
		
		if newHost != nil {
			newHost.IsHost = true
			log.Printf("👑 New host assigned: %s (ID: %s)", newHost.Username, newHostID)
			
			// Unlock to broadcast
			room.mu.Unlock()
			
			// Broadcast updated player list immediately
			room.broadcastPlayerList()
			
			// Re-lock for remaining operations
			room.mu.Lock()
			
			// Broadcast host change with additional info
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
			
			// Also send chat message
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
	
	// Broadcast updated player list
	room.broadcastPlayerList()
	
	// If room is empty, clean it up
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