package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 512 * 1024
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Client struct {
	hub      *Hub
	conn     *websocket.Conn
	send     chan []byte
	RoomID   string
	PlayerID string
	Username string
}

type Message struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

func serveWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}

	playerID := uuid.New().String()
	roomID := r.URL.Query().Get("room")

	client := &Client{
		hub:      hub,
		conn:     conn,
		send:     make(chan []byte, 256),
		RoomID:   roomID,
		PlayerID: playerID,
	}

	client.hub.register <- client

	// CRITICAL: Send INIT message to client immediately after registration
	initMsg := Message{
		Type: "INIT",
		Data: map[string]interface{}{
			"playerID": playerID,
			"roomID":   roomID,
		},
	}
	initData, _ := json.Marshal(initMsg)
	client.send <- initData

	log.Printf("Client %s initialized for room %s", playerID, roomID)

	go client.writePump()
	go client.readPump()
}

func serveYjs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Yjs WebSocket upgrade error: %v", err)
		return
	}

	hub.handleYjsConnection(w, r, conn)
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}

		c.handleMessage(message)
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) handleMessage(message []byte) {
	var msg Message
	if err := json.Unmarshal(message, &msg); err != nil {
		log.Printf("Error unmarshaling message: %v", err)
		return
	}

	// CRITICAL: Get room reference at the start
	room := c.hub.getRoom(c.RoomID)
	if room == nil {
		log.Printf("Room %s not found", c.RoomID)
		return
	}

	switch msg.Type {
	case "JOIN":
		data, ok := msg.Data.(map[string]interface{})
		if !ok {
			return
		}

		username, _ := data["username"].(string)
		c.Username = username

		room.addPlayer(c.PlayerID, username)

		// Broadcast player list FIRST to all clients
		room.broadcastPlayerList()

		// Then send SELF message to joining client
		room.mu.RLock()
		player := room.players[c.PlayerID]
		room.mu.RUnlock()

		if player != nil {
			selfMsg := Message{
				Type: "SELF",
				Data: player,
			}
			payload, _ := json.Marshal(selfMsg)
			c.send <- payload
		}
	case "SABOTAGE":
		data, ok := msg.Data.(map[string]interface{})
		if !ok {
			return
		}

		sabotageType, _ := data["type"].(string)
		log.Printf("💀 SABOTAGE request: %s from %s", sabotageType, c.Username)

		room.handleSabotage(c.PlayerID, sabotageType)
	case "START_GAME":
		// FIXED: Add comprehensive logging and explicit checks
		log.Printf("🎮 START_GAME received from %s (PlayerID: %s, RoomID: %s)",
			c.Username, c.PlayerID, c.RoomID)

		room.mu.RLock()
		player := room.players[c.PlayerID]
		room.mu.RUnlock()

		if player == nil {
			log.Printf("❌ START_GAME rejected: Player %s not found in room %s", c.PlayerID, c.RoomID)

			// Send error to client
			errorMsg := Message{
				Type: "ERROR",
				Data: map[string]interface{}{
					"message": "Player not found in room",
				},
			}
			errData, _ := json.Marshal(errorMsg)
			c.send <- errData
			return
		}

		if !player.IsHost {
			log.Printf("❌ START_GAME rejected: Player %s (%s) is not host", player.Username, c.PlayerID)

			// Send error to client
			errorMsg := Message{
				Type: "ERROR",
				Data: map[string]interface{}{
					"message": "Only the host can start the game",
				},
			}
			errData, _ := json.Marshal(errorMsg)
			c.send <- errData
			return
		}

		log.Printf("✅ START_GAME authorized - Starting game in room %s", c.RoomID)
		room.startGame()

	case "RUN_TESTS":
		data, ok := msg.Data.(map[string]interface{})
		if !ok {
			return
		}

		code, _ := data["code"].(string)
		room.handleRunTests(c.PlayerID, code)

	case "CHAT":
		room.mu.RLock()
		player := room.players[c.PlayerID]
		room.mu.RUnlock()

		if player != nil && !player.IsEliminated {
			room.broadcast <- message
		}

	case "EMERGENCY":
		log.Printf("🚨 EMERGENCY button pressed by %s", c.Username)
		room.startDiscussion()

	case "VOTE":
		data, ok := msg.Data.(map[string]interface{})
		if !ok {
			return
		}

		targetID, _ := data["targetID"].(string)
		log.Printf("🗳️ Vote received: %s voted for %s", c.PlayerID, targetID)
		room.handleVote(c.PlayerID, targetID)

	default:
		log.Printf("⚠️ Unknown message type: %s", msg.Type)
	}
}
