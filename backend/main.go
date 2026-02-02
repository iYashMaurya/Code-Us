package main

import (
	"log"
	"net/http"

	"github.com/gorilla/mux"
)

// var upgrader = websocket.Upgrader{
// 	ReadBufferSize:  1024,
// 	WriteBufferSize: 1024,
// 	CheckOrigin: func(r *http.Request) bool {
// 		return true
// 	},
// }

// func serveYjs(hub *Hub, w http.ResponseWriter, r *http.Request) {
// 	conn, err := upgrader.Upgrade(w, r, nil)
// 	if err != nil {
// 		log.Println(err)
// 		return
// 	}
// 	// Simplified binary relay for Yjs
// 	// In a real app, you'd use a dedicated Yjs structure, 
//     // but for this MVP, we broadcast raw binary to the specific room's Yjs group
// 	roomID := r.URL.Path // extracting room ID from path handled in router
//     // Note: For simplicity in this snippets, we assume the Yjs client connects and we just relay 
//     // binary messages to everyone else connected to the same room/socket. 
//     // See the 'Room' struct update below for the implementation.
    
//     // NOTE: To properly fix Issue 3 (Cursors), we are routing Yjs traffic 
//     // through a dedicated relay in the Room struct (see room.go changes).
//     hub.handleYjsConnection(w, r, conn)
// }

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

	r.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		serveWs(hub, w, r)
	})

	r.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	log.Println("🚀 Server starting on :8080")
	log.Fatal(http.ListenAndServe(":8080", r))
}