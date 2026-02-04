package main

import (
	"encoding/json"
	"log"
	"sync"
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
			h.mu.Lock()
			if room, exists := h.rooms[client.RoomID]; exists {
				room.clients[client] = true
				log.Printf("Client joined room %s", client.RoomID)
			} else {
				room := newRoom(client.RoomID)
				h.rooms[client.RoomID] = room
				room.clients[client] = true
				go room.run()
				log.Printf("Created new room %s", client.RoomID)
			}
			h.mu.Unlock()

		case client := <-h.unregister:
			h.mu.Lock()
			if room, exists := h.rooms[client.RoomID]; exists {
				if _, ok := room.clients[client]; ok {
					delete(room.clients, client)
					close(client.send)
					
					// Get player info before removing
					room.mu.RLock()
					player := room.players[client.PlayerID]
					wasTestRunner := room.testRunning && room.testRunner == client.PlayerID
					room.mu.RUnlock()
					
					// CRITICAL: If disconnected player was running tests, unlock immediately
					if wasTestRunner {
						room.mu.Lock()
						room.testRunning = false
						room.testRunner = ""
						room.testRunnerName = ""
						room.codeSnapshot = ""
						room.mu.Unlock()
						
						// Broadcast that tests were cancelled
						cancelMsg := Message{
							Type: "TEST_CANCELLED",
							Data: map[string]interface{}{
								"reason": player.Username + " disconnected during test execution",
							},
						}
						msgData, _ := json.Marshal(cancelMsg)
						room.broadcast <- msgData
						
						log.Printf("⚠️ Test runner %s disconnected, unlocking room", player.Username)
					}
					
					// Remove player
					delete(room.players, client.PlayerID)
					
					// Broadcast disconnection message
					if player != nil && player.Username != "" {
						disconnectMsg := Message{
							Type: "CHAT",
							Data: map[string]interface{}{
								"username": "System",
								"text":     player.Username + " has disconnected",
								"system":   true,
							},
						}
						msgData, _ := json.Marshal(disconnectMsg)
						room.broadcast <- msgData
					}
					
					// Broadcast updated player list
					room.broadcastPlayerList()
					
					// If room is empty, clean it up
					if len(room.clients) == 0 {
						delete(h.rooms, client.RoomID)
						log.Printf("Room %s cleaned up", client.RoomID)
					}
				}
			}
			h.mu.Unlock()
		}
	}
}

func (h *Hub) getRoom(roomID string) *Room {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.rooms[roomID]
}