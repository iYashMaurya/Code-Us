import { useEffect, useCallback } from 'react';
import { useGame } from '../context/GameContext';

export function useWebSocket(roomId) {
  const { state, dispatch } = useGame();

  useEffect(() => {
    if (!roomId) {
      console.log('⚠️ No roomId provided');
      return;
    }

    console.log('🔌 Attempting WebSocket connection to room:', roomId);
    const ws = new WebSocket(`ws://localhost:8080/ws?room=${roomId}`);

    ws.onopen = () => {
      console.log('✅ WebSocket connected successfully');
      dispatch({ type: 'SET_CONNECTED', payload: true });
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('📨 Received message:', message.type, message);

        switch (message.type) {
          case 'INIT':
            console.log('🎯 INIT received - PlayerID:', message.data.playerID);
            dispatch({ type: 'SET_PLAYER_ID', payload: message.data.playerID });
            dispatch({ type: 'SET_ROOM_ID', payload: message.data.roomID });
            
            // CRITICAL: Send JOIN message immediately after INIT
            const username = state.username || localStorage.getItem('username');
            console.log('📤 Sending JOIN with username:', username);
            
            if (username && username.trim()) {
              ws.send(JSON.stringify({
                type: 'JOIN',
                data: { username: username }
              }));
            } else {
              console.error('❌ No username available to send JOIN!');
            }
            break;

          case 'SELF':
            console.log('👤 SELF message received:', message.data);
            dispatch({ 
              type: 'SET_PLAYERS', 
              payload: { 
                ...state.players, 
                [message.data.id]: message.data 
              } 
            });
            break;

          case 'PLAYER_LIST':
            console.log('👥 PLAYER_LIST received:', Object.keys(message.data).length, 'players');
            dispatch({ type: 'SET_PLAYERS', payload: message.data });
            break;

          case 'GAME_STATE':
            console.log('🎮 GAME_STATE received - Phase:', message.data.phase);
            dispatch({ type: 'SET_GAME_STATE', payload: message.data });
            break;

          case 'VOTE_UPDATE':
            console.log('🗳️ VOTE_UPDATE received:', message.data);
            dispatch({ type: 'UPDATE_VOTES', payload: message.data });
            break;

          case 'VOTE_RESULT':
            console.log('📊 VOTE_RESULT received:', message.data);
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

          // Test execution events
          case 'TEST_LOCKED':
            console.log('🔒 TEST_LOCKED received:', message.data);
            dispatch({ 
              type: 'TEST_LOCKED', 
              payload: message.data 
            });
            break;

          case 'TEST_COMPLETE':
            console.log('✅ TEST_COMPLETE received:', message.data);
            dispatch({ 
              type: 'TEST_COMPLETE', 
              payload: message.data 
            });
            break;

          case 'TEST_CANCELLED':
            console.log('⚠️ TEST_CANCELLED received:', message.data);
            dispatch({ 
              type: 'TEST_CANCELLED', 
              payload: message.data 
            });
            break;

          case 'ERROR_BUSY':
            console.log('❌ ERROR_BUSY received:', message.data);
            dispatch({ 
              type: 'ERROR_BUSY', 
              payload: message.data 
            });
            break;

          case 'CHAT':
            dispatch({ type: 'ADD_MESSAGE', payload: message.data });
            break;

          case 'GAME_ENDED':
            console.log('🏁 GAME_ENDED:', message.data.reason);
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
            console.warn('⚠️ Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('❌ Error parsing message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
      dispatch({ type: 'SET_CONNECTED', payload: false });
    };

    ws.onclose = () => {
      console.log('🔌 WebSocket disconnected');
      dispatch({ type: 'SET_CONNECTED', payload: false });
    };

    dispatch({ type: 'SET_WS', payload: ws });

    return () => {
      console.log('🧹 Cleaning up WebSocket connection');
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [roomId]); // Only roomId as dependency

  const sendMessage = useCallback((type, data) => {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      console.log('📤 Sending message:', type, data);
      state.ws.send(JSON.stringify({ type, data }));
    } else {
      console.error('❌ Cannot send message - WebSocket not ready');
    }
  }, [state.ws]);

  return { sendMessage, connected: state.connected };
}