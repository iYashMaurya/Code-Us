import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { useWebSocket } from '../hooks/useWebSocket';
import ScreenTransition from '../components/ScreenTransition';
import StageTransition from '../components/StageTransition';
import Lobby from '../components/Lobby';
import RoleReveal from '../components/RoleReveal';
import CodeEditor from '../components/CodeEditor';
import Discussion from '../components/Discussion';
import EndGame from '../components/EndGame';

export default function Game() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { state, dispatch } = useGame();
  const { sendMessage, connected } = useWebSocket(roomId);
  const [endReason, setEndReason] = useState(null);
  const [endImpostorId, setEndImpostorId] = useState(null);

  // REFRESH PROTECTION - Kick disconnected players back to home
  useEffect(() => {
    console.log('🔒 [Refresh Check] Connected:', connected, 'WS:', state.ws?.readyState);
    
    // If we're in a game phase and not connected, kick to home
    if (state.phase && state.phase !== 'LOBBY') {
      const timer = setTimeout(() => {
        if (!connected || !state.ws || state.ws.readyState !== WebSocket.OPEN) {
          console.log('❌ [Refresh Protection] No valid connection - redirecting to home');
          alert('Connection lost. Returning to lobby.');
          navigate('/');
        }
      }, 2000); // Give 2 seconds to reconnect

      return () => clearTimeout(timer);
    }
  }, [connected, state.ws, state.phase, navigate]);

  useEffect(() => {
    dispatch({ type: 'SET_ROOM_ID', payload: roomId });
  }, [roomId, dispatch]);

  useEffect(() => {
    console.log('🎬 [Game.jsx] Phase changed to:', state.phase);
    
    if (state.phase === 'GAME_OVER') {
      console.log('🏁 [Game.jsx] Game over detected');
      console.log('   Reason:', endReason);
      console.log('   Impostor:', endImpostorId);
    }
  }, [state.phase, endReason, endImpostorId]);

  useEffect(() => {
    if (!state.ws) return;

    const handleMessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === 'GAME_ENDED') {
          console.log('🏁 [Game.jsx] GAME_ENDED received:', message.data);
          setEndReason(message.data.reason);
          setEndImpostorId(message.data.impostorID);
          dispatch({ type: 'SET_PHASE', payload: 'GAME_OVER' });
        }

        if (message.type === 'VOTE_UPDATE') {
          dispatch({ type: 'UPDATE_VOTES', payload: message.data });
        }

        if (message.type === 'SYNC_TIMER') {
          dispatch({ type: 'SYNC_TIMER', payload: message.data });
        }

        if (message.type === 'CHANGE_SCENE') {
          dispatch({ type: 'CHANGE_SCENE', payload: message.data });
        }

        // NEW: Handle host migration
        if (message.type === 'NEW_HOST_ASSIGNED') {
          console.log('👑 [Game.jsx] New host assigned:', message.data.newHostName);
          dispatch({ 
            type: 'ADD_MESSAGE', 
            payload: { 
              text: `👑 ${message.data.newHostName} is now the host`,
              system: true 
            } 
          });
        }
      } catch (error) {
        console.error('❌ [Game.jsx] Error parsing message:', error);
      }
    };

    state.ws.addEventListener('message', handleMessage);
    return () => {
      state.ws?.removeEventListener('message', handleMessage);
    };
  }, [state.ws, dispatch]);

  const handleStartGame = () => {
    console.log('🎮 [Game.jsx] Starting game...');
    sendMessage('START_GAME', {});
  };

  const handleEmergency = () => {
    console.log('🚨 [Game.jsx] Emergency meeting called');
    sendMessage('EMERGENCY', {});
  };

  const handleVote = (targetId) => {
    console.log('🗳️ [Game.jsx] Voting for:', targetId);
    sendMessage('VOTE', { targetID: targetId });
  };

  // ENHANCED: Show reconnecting state
  if (!connected) {
    return (
      <div className="min-h-screen bg-space flex items-center justify-center">
        <div className="text-center">
          <div className="spinner-space mb-4"></div>
          <p className="font-game text-2xl text-white">Connecting...</p>
          <p className="font-game text-sm text-gray-400 mt-2">
            If this takes too long, you may have been disconnected.
          </p>
        </div>
      </div>
    );
  }

  if (state.isTransitioning) {
    return (
      <StageTransition
        fromStage={state.transitionFrom}
        toStage={state.transitionTo}
      />
    );
  }

  const renderPhase = () => {
    console.log('🎬 [Game.jsx] Rendering phase:', state.phase);
    
    switch (state.phase) {
      case 'LOBBY':
        return <Lobby onStartGame={handleStartGame} />;
      
      case 'ROLE_REVEAL':
        return <RoleReveal />;
      
      case 'TASK_1':
      case 'TASK_2':
      case 'TASK_3':
        return <CodeEditor onEmergency={handleEmergency} />;
      
      case 'DISCUSSION':
        return <Discussion onVote={handleVote} />;
      
      case 'GAME_OVER':
        return <EndGame reason={endReason} impostorId={endImpostorId} />;
      
      default:
        return (
          <div className="min-h-screen bg-space flex items-center justify-center">
            <div className="text-center">
              <div className="spinner-space mb-4"></div>
              <p className="font-game text-2xl text-white">Loading game...</p>
              <p className="font-game text-sm text-gray-400 mt-2">Phase: {state.phase}</p>
            </div>
          </div>
        );
    }
  };

  return (
    <ScreenTransition phase={state.phase}>
      {renderPhase()}
    </ScreenTransition>
  );
}