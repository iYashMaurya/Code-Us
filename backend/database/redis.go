package database

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

var (
	ctx = context.Background()
	RDB *redis.Client
)

func InitRedis(addr, password string, db int) error {
	options := &redis.Options{
		Addr:         addr,
		Password:     password,
		DB:           db,
		DialTimeout:  5 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
		PoolSize:     10,
	}

	isDev := os.Getenv("ENVIRONMENT") == "development"
	isDockerInternal := strings.Contains(addr, "redis")
	isLocalhost := strings.Contains(addr, "localhost") || strings.Contains(addr, "127.0.0.1")

	if !isDev && !isDockerInternal && !isLocalhost {
		options.TLSConfig = &tls.Config{
			MinVersion: tls.VersionTLS12,
		}
		log.Println("TLS enabled for remote Redis connection")
	} else {
		log.Println("TLS disabled (Local/Dev environment detected)")
	}

	RDB = redis.NewClient(options)

	if err := RDB.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("redis connection failed: %w", err)
	}

	log.Println("Redis connected successfully")
	return nil
}

func RoomStateKey(roomID string) string {
	return fmt.Sprintf("room:%s:state", roomID)
}

func RoomPlayersKey(roomID string) string {
	return fmt.Sprintf("room:%s:players", roomID)
}

func PlayerSessionKey(playerID string) string {
	return fmt.Sprintf("player:%s:session", playerID)
}

func RoomTimerKey(roomID string) string {
	return fmt.Sprintf("room:%s:timer_start", roomID)
}

func SaveGameState(roomID string, state interface{}) error {
	jsonData, err := json.Marshal(state)
	if err != nil {
		return fmt.Errorf("failed to marshal game state: %w", err)
	}

	err = RDB.Set(ctx, RoomStateKey(roomID), jsonData, time.Hour).Err()
	if err != nil {
		return fmt.Errorf("failed to save game state: %w", err)
	}

	return nil
}

func LoadGameState(roomID string, target interface{}) error {
	jsonData, err := RDB.Get(ctx, RoomStateKey(roomID)).Result()
	if err == redis.Nil {
		return fmt.Errorf("game state not found")
	}
	if err != nil {
		return fmt.Errorf("failed to load game state: %w", err)
	}

	if err := json.Unmarshal([]byte(jsonData), target); err != nil {
		return fmt.Errorf("failed to unmarshal game state: %w", err)
	}

	return nil
}

func SavePlayer(roomID string, player interface{}) error {
	jsonData, err := json.Marshal(player)
	if err != nil {
		return fmt.Errorf("failed to marshal player: %w", err)
	}

	playerMap := make(map[string]interface{})
	json.Unmarshal(jsonData, &playerMap)
	playerID := playerMap["id"].(string)

	err = RDB.HSet(ctx, RoomPlayersKey(roomID), playerID, jsonData).Err()
	if err != nil {
		return fmt.Errorf("failed to save player: %w", err)
	}

	RDB.Expire(ctx, RoomPlayersKey(roomID), time.Hour)

	return nil
}

func LoadPlayer(roomID, playerID string, target interface{}) error {
	jsonData, err := RDB.HGet(ctx, RoomPlayersKey(roomID), playerID).Result()
	if err == redis.Nil {
		return fmt.Errorf("player not found")
	}
	if err != nil {
		return fmt.Errorf("failed to load player: %w", err)
	}

	if err := json.Unmarshal([]byte(jsonData), target); err != nil {
		return fmt.Errorf("failed to unmarshal player: %w", err)
	}

	return nil
}

func LoadAllPlayers(roomID string) (map[string]string, error) {
	return RDB.HGetAll(ctx, RoomPlayersKey(roomID)).Result()
}

func DeletePlayer(roomID, playerID string) error {
	return RDB.HDel(ctx, RoomPlayersKey(roomID), playerID).Err()
}

func SaveTimerStart(roomID string, startTime time.Time) error {
	return RDB.Set(ctx, RoomTimerKey(roomID), startTime.Unix(), time.Hour).Err()
}

func LoadTimerStart(roomID string) (time.Time, error) {
	unixTime, err := RDB.Get(ctx, RoomTimerKey(roomID)).Int64()
	if err != nil {
		return time.Time{}, err
	}
	return time.Unix(unixTime, 0), nil
}

func RoomExists(roomID string) bool {
	exists, err := RDB.Exists(ctx, RoomStateKey(roomID)).Result()
	return err == nil && exists > 0
}

func DeleteRoom(roomID string) error {
	keys := []string{
		RoomStateKey(roomID),
		RoomPlayersKey(roomID),
		RoomTimerKey(roomID),
		fmt.Sprintf("room:%s:chat_history", roomID),
	}

	return RDB.Del(ctx, keys...).Err()
}

func GetActiveRooms() ([]string, error) {
	keys, err := RDB.Keys(ctx, "room:*:state").Result()
	if err != nil {
		return nil, err
	}

	rooms := make([]string, 0, len(keys))
	for _, key := range keys {

		parts := splitKey(key)
		if len(parts) >= 2 {
			rooms = append(rooms, parts[1])
		}
	}

	return rooms, nil
}

func splitKey(key string) []string {
	result := []string{}
	current := ""
	for _, char := range key {
		if char == ':' {
			result = append(result, current)
			current = ""
		} else {
			current += string(char)
		}
	}
	result = append(result, current)
	return result
}

func PublishChatMessage(messageID, text, username, roomID, playerID string, context []string) error {
	payload := map[string]interface{}{
		"messageId": messageID,
		"text":      text,
		"username":  username,
		"roomId":    roomID,
		"playerId":  playerID,
		"context":   context,
		"timestamp": time.Now().Unix(),
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal chat message: %w", err)
	}

	err = RDB.Publish(ctx, "chat:processing", jsonData).Err()
	if err != nil {
		return fmt.Errorf("failed to publish chat message: %w", err)
	}

	log.Printf("📤 Published message to translation: %s", messageID)
	return nil
}

func GetRoomChatHistory(roomID string, limit int) ([]string, error) {
	key := fmt.Sprintf("room:%s:chat_history", roomID)
	
	messages, err := RDB.LRange(ctx, key, 0, int64(limit-1)).Result()
	if err != nil && err != redis.Nil {
		return nil, fmt.Errorf("failed to get chat history: %w", err)
	}
	
	return messages, nil
}

func AddToChatHistory(roomID, message string) error {
	key := fmt.Sprintf("room:%s:chat_history", roomID)
	
	// Add to list
	err := RDB.LPush(ctx, key, message).Err()
	if err != nil {
		return fmt.Errorf("failed to add to chat history: %w", err)
	}
	
	// Trim to last 10 messages
	err = RDB.LTrim(ctx, key, 0, 9).Err()
	if err != nil {
		return fmt.Errorf("failed to trim chat history: %w", err)
	}
	
	// Set expiration
	RDB.Expire(ctx, key, time.Hour)
	
	return nil
}