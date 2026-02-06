import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
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
  const { state, dispatch } = useGame();
  const { sendMessage, connected } = useWebSocket(roomId);
  const [endReason, setEndReason] = useState(null);
  const [endImpostorId, setEndImpostorId] = useState(null);

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

        // ENHANCED: Handle GAME_ENDED with better logging
        if (message.type === 'GAME_ENDED') {
          console.log('🏁 [Game.jsx] GAME_ENDED received:', message.data);
          setEndReason(message.data.reason);
          setEndImpostorId(message.data.impostorID);
          
          // Force phase to GAME_OVER
          dispatch({ type: 'SET_PHASE', payload: 'GAME_OVER' });
          
          console.log('🏁 [Game.jsx] End state set - Reason:', message.data.reason);
        }

        // Handle vote updates
        if (message.type === 'VOTE_UPDATE') {
          dispatch({ type: 'UPDATE_VOTES', payload: message.data });
        }

        // Handle timer sync
        if (message.type === 'SYNC_TIMER') {
          dispatch({ type: 'SYNC_TIMER', payload: message.data });
        }

        // Handle stage transition
        if (message.type === 'CHANGE_SCENE') {
          dispatch({ type: 'CHANGE_SCENE', payload: message.data });
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

  if (!connected) {
    return (
      <div className="min-h-screen bg-space flex items-center justify-center">
        <div className="text-center">
          <div className="spinner-space mb-4"></div>
          <p className="font-game text-2xl text-white">Connecting...</p>
        </div>
      </div>
    );
  }

  // Show stage transition overlay if transitioning
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
    
    // ENHANCED: Use exact string matching
    switch (state.phase) {
      case 'LOBBY':
        console.log('   → Rendering Lobby');
        return <Lobby onStartGame={handleStartGame} />;
      
      case 'ROLE_REVEAL':
        console.log('   → Rendering Role Reveal');
        return <RoleReveal />;
      
      case 'TASK_1':
        console.log('   → Rendering Task 1');
        return <CodeEditor onEmergency={handleEmergency} />;
      
      case 'TASK_2':
        console.log('   → Rendering Task 2');
        return <CodeEditor onEmergency={handleEmergency} />;
      
      case 'TASK_3':
        console.log('   → Rendering Task 3');
        return <CodeEditor onEmergency={handleEmergency} />;
      
      case 'DISCUSSION':
        console.log('   → Rendering Discussion');
        return <Discussion onVote={handleVote} />;
      
      case 'GAME_OVER':
        console.log('   → Rendering End Game');
        console.log('   → Reason:', endReason);
        console.log('   → Impostor:', endImpostorId);
        return <EndGame reason={endReason} impostorId={endImpostorId} />;
      
      default:
        console.warn('⚠️ [Game.jsx] Unknown phase:', state.phase);
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