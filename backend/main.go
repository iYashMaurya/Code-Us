package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"code-mafia-backend/config"
	"code-mafia-backend/database"

	"github.com/gorilla/mux"
)

func main() {

	config.Load()

	err := database.InitRedis(
		config.AppConfig.RedisURL,
		config.AppConfig.RedisPassword,
		config.AppConfig.RedisDB,
	)
	if err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}

	database.InitSupabase(
		config.AppConfig.SupabaseURL,
		config.AppConfig.SupabaseKey,
	)

	hub := newHub()
	go hub.run()

	go hub.listenForTranslations()

	r := mux.NewRouter()

	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin == "" {
				origin = "*"
			}

			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Upgrade, Connection, Sec-WebSocket-Key, Sec-WebSocket-Version, Sec-WebSocket-Extensions")
			w.Header().Set("Access-Control-Allow-Credentials", "true")

			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}

			next.ServeHTTP(w, r)
		})
	})

	r.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("Game WebSocket connection attempt from %s", r.RemoteAddr)
		serveWs(hub, w, r)
	})

	r.PathPrefix("/yjs").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("Yjs WebSocket connection attempt from %s for room: %s",
			r.RemoteAddr, r.URL.Query().Get("room"))
		serveYjs(hub, w, r)
	}).Methods("GET")

	r.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	r.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
		rooms, _ := database.GetActiveRooms()
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"active_rooms": ` + string(rune(len(rooms))) + `}`))
	})

	port := config.AppConfig.Port

	log.Println("╔═══════════════════════════════════════════════╗")
	log.Println("║      🚀 CODE MAFIA SERVER STARTED            ║")
	log.Println("╚═══════════════════════════════════════════════╝")
	log.Printf("  Game WebSocket: ws://localhost:%s/ws", port)
	log.Printf("  Yjs WebSocket:  ws://localhost:%s/yjs", port)
	log.Printf("  Health Check:   http://localhost:%s/health", port)
	log.Printf("  Translation:  Enabled (sidecar mode)")
	log.Println("═══════════════════════════════════════════════")

	go func() {
		sigint := make(chan os.Signal, 1)
		signal.Notify(sigint, os.Interrupt, syscall.SIGTERM)
		<-sigint

		log.Println("Shutting down gracefully...")

		os.Exit(0)
	}()

	log.Fatal(http.ListenAndServe(":"+port, r))
}

func (h *Hub) listenForTranslations() {
	ctx := context.Background()

	pubsub := database.RDB.Subscribe(ctx, "chat:translations")
	defer pubsub.Close()

	log.Println("🎧 Translation listener started - waiting for translations...")

	_, err := pubsub.Receive(ctx)
	if err != nil {
		log.Printf("Failed to subscribe to translations: %v", err)
		return
	}

	ch := pubsub.Channel()

	for msg := range ch {
		var translation struct {
			MessageID    string            `json:"messageId"`
			Username     string            `json:"username"`
			Text         string            `json:"text"`
			Translations map[string]string `json:"translations"`
			RoomID       string            `json:"roomId"`
			PlayerID     string            `json:"playerId"`
			Timestamp    int64             `json:"timestamp"`
			Error        string            `json:"error,omitempty"`
		}

		err := json.Unmarshal([]byte(msg.Payload), &translation)
		if err != nil {
			log.Printf("Failed to parse translation: %v", err)
			continue
		}

		if translation.Error != "" {
			log.Printf("⚠️ Translation error for message %s: %s", translation.MessageID, translation.Error)

		} else {
			log.Printf("✅ Received translations for message %s", translation.MessageID)
		}

		h.mu.RLock()
		room := h.rooms[translation.RoomID]
		h.mu.RUnlock()

		if room == nil {
			log.Printf("❌ Room %s not found for translation update", translation.RoomID)
			continue
		}

		chatMsg := Message{
			Type: "CHAT",
			Data: map[string]interface{}{
				"messageId":    translation.MessageID,
				"username":     translation.Username,
				"text":         translation.Text,
				"playerId":     translation.PlayerID,
				"translations": translation.Translations,
				"timestamp":    translation.Timestamp,
				"system":       false,
			},
		}

		msgData, err := json.Marshal(chatMsg)
		if err != nil {
			log.Printf("Failed to marshal chat message: %v", err)
			continue
		}

		room.broadcast <- msgData
		log.Printf("📤 Broadcasted chat message %s to room %s", translation.MessageID, translation.RoomID)
	}
}
