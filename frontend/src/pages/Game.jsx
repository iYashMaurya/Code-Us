import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { useWebSocket } from '../hooks/useWebSocket';
import ScreenTransition from '../components/ScreenTransition';
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
  }, [roomId]);

  useEffect(() => {
    if (!state.ws) return;

    const handleMessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        // --- NEW: Handle Vote Updates ---
        if (message.type === 'VOTE_UPDATE') {
           dispatch({ type: 'UPDATE_VOTES', payload: message.data });
        }

        if (message.type === 'GAME_ENDED') {
          setEndReason(message.data.reason);
          setEndImpostorId(message.data.impostorID);
        }
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    };

    state.ws.addEventListener('message', handleMessage);
    return () => {
      state.ws?.removeEventListener('message', handleMessage);
    };
  }, [state.ws, dispatch]);

  const handleStartGame = () => {
    sendMessage('START_GAME', {});
  };

  const handleEmergency = () => {
    sendMessage('EMERGENCY', {});
  };

  // --- CHANGED: Voting Logic ---
  const handleVote = (targetId) => {
      // Sends "VOTE" message with targetID (player ID) or "SKIP"
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

  const renderPhase = () => {
    switch (state.phase) {
      case 'LOBBY':
        return <Lobby onStartGame={handleStartGame} />;
      
      case 'ROLE_REVEAL':
        return <RoleReveal />;
      
      case 'CODING':
        return <CodeEditor onEmergency={handleEmergency} />;
      
      case 'DISCUSSION':
        // --- CHANGED: Passing handleVote instead of handleEliminate ---
        return <Discussion onVote={handleVote} />;
      
      case 'END':
        return <EndGame reason={endReason} impostorId={endImpostorId} />;
      
      default:
        return (
          <div className="min-h-screen bg-space flex items-center justify-center">
            <div className="spinner-space"></div>
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