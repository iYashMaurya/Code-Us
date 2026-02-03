package main

import (
	"log"
	"net/http"

	"github.com/gorilla/mux"
)

func main() {
	hub := newHub()
	go hub.run()

	r := mux.NewRouter()
	
	// CORS middleware
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}
			next.ServeHTTP(w, r)
		})
	})

	// Game logic WebSocket (JSON messages)
	r.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("📞 Game WebSocket connection attempt from %s", r.RemoteAddr)
		serveWs(hub, w, r)
	})

	// Yjs collaborative editing WebSocket (Binary messages) - THIS WAS MISSING!
	r.HandleFunc("/yjs", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("🔗 Yjs WebSocket connection attempt from %s", r.RemoteAddr)
		serveYjs(hub, w, r)
	})

	r.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	log.Println("🚀 Server starting on :8080")
	log.Println("📡 Game WebSocket endpoint: ws://localhost:8080/ws")
	log.Println("🔗 Yjs WebSocket endpoint: ws://localhost:8080/yjs")
	log.Fatal(http.ListenAndServe(":8080", r))
}