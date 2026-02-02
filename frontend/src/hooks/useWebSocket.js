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
            
            if (state.username) {
              ws.send(JSON.stringify({
                type: 'JOIN',
                data: { username: state.username }
              }));
            }
            break;

          case 'SELF':
            // Update current player info (including role)
            console.log('SELF message received:', message.data);
            dispatch({ 
              type: 'SET_PLAYERS', 
              payload: { 
                ...state.players, 
                [message.data.id]: message.data 
              } 
            });
            break;

          case 'PLAYER_LIST':
            console.log('PLAYER_LIST received:', message.data);
            dispatch({ type: 'SET_PLAYERS', payload: message.data });
            break;

          case 'GAME_STATE':
            console.log('GAME_STATE received:', message.data);
            dispatch({ type: 'SET_GAME_STATE', payload: message.data });
            break;

          case 'VOTE_UPDATE':
            console.log('VOTE_UPDATE received:', message.data);
            dispatch({ type: 'UPDATE_VOTES', payload: message.data });
            break;

          case 'VOTE_RESULT':
            console.log('VOTE_RESULT received:', message.data);
            // Show vote result
            dispatch({ 
              type: 'ADD_MESSAGE', 
              payload: { 
                text: message.data.eliminated 
                  ? `${state.players[message.data.eliminated]?.username} was eliminated!`
                  : 'No one was eliminated.',
                system: true 
              } 
            });
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