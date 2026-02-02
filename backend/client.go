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
	maxMessageSize = 512000 // 500KB for CRDT messages
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins in development
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
	From string      `json:"from,omitempty"`
}

func serveWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}

	roomID := r.URL.Query().Get("room")
	if roomID == "" {
		log.Println("No room ID provided")
		conn.Close()
		return
	}

	playerID := uuid.New().String()

	client := &Client{
		hub:      hub,
		conn:     conn,
		send:     make(chan []byte, 256),
		RoomID:   roomID,
		PlayerID: playerID,
	}

	client.hub.register <- client

	// Send player ID to client
	initMsg := Message{
		Type: "INIT",
		Data: map[string]string{
			"playerID": playerID,
			"roomID":   roomID,
		},
	}
	initData, _ := json.Marshal(initMsg)
	client.send <- initData

	go client.writePump()
	go client.readPump()
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

	msg.From = c.PlayerID

	room := c.hub.getRoom(c.RoomID)
	if room == nil {
		log.Printf("Room %s not found", c.RoomID)
		return
	}

	switch msg.Type {
	case "JOIN":
		if data, ok := msg.Data.(map[string]interface{}); ok {
			if username, ok := data["username"].(string); ok {
				c.Username = username
				room.addPlayer(c.PlayerID, username)
				room.mu.RLock()
				player := room.players[c.PlayerID]
				room.mu.RUnlock()

				selfMsg := Message{
					Type: "SELF",
					Data: player,
				}

				payload, _ := json.Marshal(selfMsg)
				c.send <- payload
				room.broadcastPlayerList()
			}
		}

	case "START_GAME":
		room.mu.RLock()
		player := room.players[c.PlayerID]
		room.mu.RUnlock()

		if player != nil && player.IsHost {
			room.startGame()
		}

	case "CRDT_UPDATE":
		// Relay CRDT updates to all clients
		room.broadcast <- message

	case "CHAT":
		// Check if player is eliminated
		room.mu.RLock()
		player := room.players[c.PlayerID]
		room.mu.RUnlock()

		if player != nil && !player.IsEliminated {
			room.broadcast <- message
		}

	case "EMERGENCY":
		room.startDiscussion()

	case "ELIMINATE":
		if data, ok := msg.Data.(map[string]interface{}); ok {
			if targetID, ok := data["playerID"].(string); ok {
				room.eliminatePlayer(targetID)
			}
		}

	case "YTEXT_UPDATE":
		// Binary Yjs updates - relay to all other clients
		room.mu.RLock()
		for client := range room.clients {
			if client != c {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(room.clients, client)
				}
			}
		}
		room.mu.RUnlock()

	default:
		log.Printf("Unknown message type: %s", msg.Type)
	}
}
