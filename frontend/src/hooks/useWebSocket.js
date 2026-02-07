import { useEffect } from 'react';
import { useGame } from '../context/GameContext';

export function useWebSocket(roomId) {
  const { state, dispatch } = useGame();

  useEffect(() => {
    if (!roomId) return;

    const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8080';
    const wsUrl = `${WS_BASE}/ws?room=${roomId}&userId=${state.playerId || ''}`;

    console.log('🔌 Connecting to WebSocket:', wsUrl);

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('✅ WebSocket connected');
      dispatch({ type: 'SET_CONNECTED', payload: true });
      dispatch({ type: 'SET_WS', payload: ws });
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('📨 Received:', message.type, message.data);

        switch (message.type) {
          case 'INIT':
            console.log('🎯 Player initialized:', message.data.playerID);
            dispatch({ type: 'SET_PLAYER_ID', payload: message.data.playerID });
            
            // Send JOIN message
            ws.send(JSON.stringify({
              type: 'JOIN',
              data: { username: state.username }
            }));
            break;

          case 'SELF':
            console.log('👤 Self data received:', message.data);
            dispatch({ type: 'SET_ROLE', payload: message.data.role });
            dispatch({ type: 'SET_ELIMINATED', payload: message.data.isEliminated });
            break;

          case 'PLAYER_LIST':
            console.log('👥 Player list updated');
            dispatch({ type: 'SET_PLAYERS', payload: message.data });
            break;

          case 'GAME_STATE':
            console.log('🎮 Game state received');
            dispatch({ type: 'SET_GAME_STATE', payload: message.data });
            break;

          // 🔥 FIXED: Handle CHAT messages properly
          case 'CHAT':
            console.log('💬 Chat message received:', message.data);
            
            // Message already has all translations from server
            const chatData = message.data;
            
            dispatch({ 
              type: 'ADD_MESSAGE', 
              payload: {
                messageId: chatData.messageId,
                username: chatData.username,
                text: chatData.text,
                playerId: chatData.playerId,
                translations: chatData.translations || {},
                timestamp: chatData.timestamp || Date.now(),
                system: chatData.system || false,
                translationId: Date.now(), // For animation trigger
              }
            });
            break;

          // 🔥 REMOVED: TRANSLATION_UPDATE is no longer needed
          // Messages come with translations already included
          
          case 'PLAYER_ELIMINATED':
            console.log('☠️ Player eliminated:', message.data.username);
            dispatch({ 
              type: 'ADD_MESSAGE', 
              payload: { 
                messageId: `elim-${Date.now()}`,
                text: `${message.data.username} was eliminated`,
                system: true,
                timestamp: Date.now(),
              } 
            });
            break;

          case 'TEST_LOCKED':
            console.log('🔒 Tests locked by:', message.data.runner);
            dispatch({ type: 'TEST_LOCKED', payload: message.data });
            break;

          case 'TEST_COMPLETE':
            console.log('✅ Tests complete:', message.data.passed);
            dispatch({ type: 'TEST_COMPLETE', payload: message.data });
            break;

          case 'TEST_CANCELLED':
            console.log('❌ Tests cancelled');
            dispatch({ type: 'TEST_CANCELLED', payload: message.data });
            break;

          case 'ERROR_BUSY':
            console.log('⚠️ System busy');
            dispatch({ type: 'ERROR_BUSY', payload: message.data });
            break;

          case 'CHANGE_SCENE':
            console.log('🎬 Scene transition:', message.data);
            dispatch({ type: 'CHANGE_SCENE', payload: message.data });
            
            setTimeout(() => {
              dispatch({ type: 'TRANSITION_COMPLETE' });
            }, message.data.delay || 3000);
            break;

          case 'SYNC_TIMER':
            dispatch({ type: 'SYNC_TIMER', payload: message.data });
            break;

          case 'VOTE_UPDATE':
            dispatch({ type: 'UPDATE_VOTES', payload: message.data });
            break;

          case 'GAME_ENDED':
            console.log('🏁 Game ended:', message.data.reason);
            dispatch({ type: 'SET_PHASE', payload: 'GAME_OVER' });
            break;

          case 'ERROR_ACCESS_DENIED':
            console.log('🚫 Access denied:', message.data.reason);
            alert(message.data.message);
            window.location.href = '/';
            break;

          default:
            console.log('❓ Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('❌ Error handling message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
      dispatch({ type: 'SET_CONNECTED', payload: false });
    };

    ws.onclose = () => {
      console.log('🔌 WebSocket closed');
      dispatch({ type: 'SET_CONNECTED', payload: false });
    };

    return () => {
      console.log('🧹 Cleaning up WebSocket');
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [roomId]);

  const sendMessage = (type, data) => {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      console.log('📤 Sending:', type, data);
      state.ws.send(JSON.stringify({ type, data }));
    } else {
      console.error('❌ Cannot send - WebSocket not ready');
    }
  };

  return { sendMessage, connected: state.connected };
}