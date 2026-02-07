package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"code-mafia-backend/database"

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

	roomID := r.URL.Query().Get("room")
	userID := r.URL.Query().Get("userId")

	var playerID string
	var isReconnect bool

	if userID != "" {
		var existingPlayer Player
		err := database.LoadPlayer(roomID, userID, &existingPlayer)

		if err == nil {
			playerID = userID
			isReconnect = true
			log.Printf("♻️  User %s RECONNECTED to room %s", existingPlayer.Username, roomID)

			existingPlayer.IsAlive = true
			existingPlayer.IsEliminated = false
			database.SavePlayer(roomID, existingPlayer)
		} else {
			playerID = userID
		}
	} else {
		playerID = uuid.New().String()
	}

	client := &Client{
		hub:      hub,
		conn:     conn,
		send:     make(chan []byte, 256),
		RoomID:   roomID,
		PlayerID: playerID,
	}

	client.hub.register <- client

	initMsg := Message{
		Type: "INIT",
		Data: map[string]interface{}{
			"playerID":    playerID,
			"roomID":      roomID,
			"isReconnect": isReconnect,
		},
	}
	initData, _ := json.Marshal(initMsg)
	client.send <- initData

	log.Printf("Client %s initialized for room %s (reconnect: %v)", playerID, roomID, isReconnect)

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
		room.broadcastPlayerList()

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
		room.mu.RLock()
		player := room.players[c.PlayerID]
		room.mu.RUnlock()

		if player == nil || player.IsEliminated || player.Role != "IMPOSTER" {
			c.sendError("Cannot sabotage")
			return
		}

		data, ok := msg.Data.(map[string]interface{})
		if !ok {
			return
		}

		sabotageType, _ := data["type"].(string)
		room.handleSabotage(c.PlayerID, sabotageType)

	case "START_GAME":
		room.mu.RLock()
		player := room.players[c.PlayerID]
		room.mu.RUnlock()

		if player == nil || !player.IsHost {
			c.sendError("Only host can start game")
			return
		}

		room.startGame()

	case "RUN_TESTS":
		room.mu.RLock()
		player := room.players[c.PlayerID]
		room.mu.RUnlock()

		if player == nil || player.IsEliminated {
			c.sendError("Cannot run tests")
			return
		}

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
			data, ok := msg.Data.(map[string]interface{})
			if !ok {
				return
			}

			text, ok := data["text"].(string)
			if !ok || text == "" {
				return
			}

			// 🔥 REMOVED: Don't broadcast immediately
			// room.broadcast <- message

			// 🔥 NEW: Only trigger translation pipeline
			// Translation service will broadcast when ready
			go c.hub.handleChatMessage(
				c.RoomID,
				c.PlayerID,
				c.Username,
				text,
			)
		}

	case "EMERGENCY":
		room.mu.RLock()
		player := room.players[c.PlayerID]
		room.mu.RUnlock()

		if player == nil || player.IsEliminated {
			c.sendError("Cannot call meeting")
			return
		}

		room.startDiscussion()

	case "VOTE":
		room.mu.RLock()
		player := room.players[c.PlayerID]
		room.mu.RUnlock()

		if player == nil || player.IsEliminated {
			c.sendError("Cannot vote")
			return
		}

		data, ok := msg.Data.(map[string]interface{})
		if !ok {
			return
		}

		targetID, _ := data["targetID"].(string)
		room.handleVote(c.PlayerID, targetID)

	default:
		log.Printf("Unknown message type: %s", msg.Type)
	}
}

func (c *Client) sendError(message string) {
	errorMsg := Message{
		Type: "ERROR",
		Data: map[string]interface{}{
			"message": message,
		},
	}
	errData, _ := json.Marshal(errorMsg)

	select {
	case c.send <- errData:
	default:
		log.Printf("Could not send error to %s", c.Username)
	}
}
