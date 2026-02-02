import { useEffect, useCallback } from 'react';
import { useGame } from '../context/GameContext';

export function useWebSocket(roomId) {
  const { state, dispatch } = useGame();

  useEffect(() => {
    if (!roomId) return;

    const ws = new WebSocket(`ws://localhost:8080/ws?room=${roomId}`);

    ws.onopen = () => {
      console.log('WebSocket connected');
      dispatch({ type: 'SET_CONNECTED', payload: true });
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('Received:', message);

        switch (message.type) {
          case 'INIT':
            dispatch({ type: 'SET_PLAYER_ID', payload: message.data.playerID });
            dispatch({ type: 'SET_ROOM_ID', payload: message.data.roomID });
            
            // Send JOIN message
            if (state.username) {
              ws.send(JSON.stringify({
                type: 'JOIN',
                data: { username: state.username }
              }));
            }
            break;

          case 'PLAYER_LIST':
            dispatch({ type: 'SET_PLAYERS', payload: message.data });
            break;

          case 'GAME_STATE':
            dispatch({ type: 'SET_GAME_STATE', payload: message.data });
            break;

          case 'CHAT':
            dispatch({ type: 'ADD_MESSAGE', payload: message.data });
            break;

          case 'GAME_ENDED':
            dispatch({ type: 'SET_PHASE', payload: 'END' });
            dispatch({ 
              type: 'ADD_MESSAGE', 
              payload: { 
                text: `Game ended: ${message.data.reason}`,
                system: true 
              } 
            });
            break;

          default:
            console.log('Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      dispatch({ type: 'SET_CONNECTED', payload: false });
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      dispatch({ type: 'SET_CONNECTED', payload: false });
    };

    dispatch({ type: 'SET_WS', payload: ws });

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [roomId]);

  const sendMessage = useCallback((type, data) => {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({ type, data }));
    }
  }, [state.ws]);

  return { sendMessage, connected: state.connected };
}