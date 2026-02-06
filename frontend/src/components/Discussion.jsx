'use i18n';
import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../context/GameContext';
// import { useTranslation } from '../utils/translations';
import { motion } from 'framer-motion';
import Starfield from './Starfield';
import Ship, { getShipType } from './Ship';

export default function Discussion({ onVote }) {
  const { state, dispatch } = useGame();
  // const { t } = useTranslation(state.language);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [timeLeft, setTimeLeft] = useState(30); // FIX #7: Default 30 seconds
  const [hasVoted, setHasVoted] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const chatEndRef = useRef(null);

  const playerList = Object.values(state.players || {}).filter(p => !p.isEliminated);
  const currentPlayer = state.players?.[state.playerId];
  const canVote = !hasVoted && currentPlayer && !currentPlayer.isEliminated;

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  // FIX #7: Listen to server-controlled voting timer
  useEffect(() => {
    if (!state.ws) return;

    const handleMessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'VOTING_TIMER') {
          setTimeLeft(message.data.seconds);
          
          // Auto-submit skip if time runs out and haven't voted
          if (message.data.seconds === 0 && !hasVoted) {
            handleVoteSubmit('SKIP');
          }
        }
      } catch (error) {
        console.error('Error parsing voting timer message:', error);
      }
    };

    state.ws.addEventListener('message', handleMessage);
    return () => {
      state.ws?.removeEventListener('message', handleMessage);
    };
  }, [state.ws, hasVoted]);

  // Reset state when entering discussion phase
  useEffect(() => {
    if (state.phase === 'DISCUSSION') {
      setHasVoted(false);
      setSelectedTarget(null);
      setTimeLeft(30);
    }
  }, [state.phase]);

  // Handle Vote
  const handleVoteSubmit = (targetID) => {
    if (hasVoted) return;
    setHasVoted(true);
    onVote(targetID);
  };

  // Helper to check if a player has voted (from vote updates)
  const hasPlayerVoted = (playerId) => {
    return state.votesStatus?.[playerId] || false;
  };

  const handleSendMessage = () => {
    if (!chatMessage.trim()) return;

    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({
        type: 'CHAT',
        data: {
          username: state.username,
          text: chatMessage,
          playerId: state.playerId,
        }
      }));
      setChatMessage('');
    }
  };

  return (
    <div className="min-h-screen relative">
      <Starfield frozen={true} />
      
      <motion.div
        className="absolute inset-0 bg-red-900 z-0"
        animate={{ opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 2, repeat: Infinity }}
      />

      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-6xl">
          {/* Timer Header */}
          <div className="text-center mb-6">
            <h1 className="font-pixel text-4xl text-white mb-2">VOTING ENDS IN</h1>
            <div className={`text-6xl font-pixel ${timeLeft < 5 ? 'text-red-500 animate-bounce' : 'text-orange'}`}>
              {timeLeft}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {/* Left - Player Voting Grid */}
            <div className="col-span-2">
              <div className="panel-space">
                <h2 className="font-pixel text-2xl text-center mb-4 text-gray-900">
                  WHO IS THE IMPOSTOR?
                </h2>

                {/* Player Grid - Stacked Vertically */}
                <div className="space-y-3 mb-6">
                  {playerList.map((player, index) => (
                    <motion.button
                      key={player.id}
                      onClick={() => canVote && setSelectedTarget(player.id)}
                      disabled={!canVote}
                      className={`w-full player-card-space cursor-pointer transition-all flex items-center justify-between ${
                        selectedTarget === player.id ? 'ring-4 ring-red-500 scale-102' : ''
                      } ${!canVote ? 'opacity-60 cursor-default' : 'hover:scale-102'}`}
                      whileHover={canVote ? { scale: 1.02 } : {}}
                      whileTap={canVote ? { scale: 0.98 } : {}}
                    >
                      <div className="flex items-center gap-3">
                        <Ship type={getShipType(Object.values(state.players).indexOf(player))} size="md" />
                        <span className="font-game text-2xl text-gray-900">
                          {player.username}
                          {player.id === state.playerId && ` (${t('common.you')})`}
                        </span>
                      </div>
                      
                      {/* Vote Indicator (Shows if this player has voted, not who they voted for) */}
                      {hasPlayerVoted(player.id) && (
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-green-600 rounded-full border-2 border-brown-dark"></div>
                          <span className="font-pixel text-xs text-gray-600">VOTED</span>
                        </div>
                      )}
                    </motion.button>
                  ))}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-4">
                  <motion.button
                    onClick={() => handleVoteSubmit(selectedTarget)}
                    disabled={!selectedTarget || !canVote}
                    className={`btn-space red flex-1 ${(!selectedTarget || !canVote) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    whileHover={selectedTarget && canVote ? { scale: 1.02 } : {}}
                  >
                    {hasVoted ? 'VOTED' : 'VOTE'}
                  </motion.button>
                  
                  <motion.button
                    onClick={() => handleVoteSubmit('SKIP')}
                    disabled={!canVote}
                    className={`btn-space blue flex-1 ${!canVote ? 'opacity-50 cursor-not-allowed' : ''}`}
                    whileHover={canVote ? { scale: 1.02 } : {}}
                  >
                    SKIP
                  </motion.button>
                </div>

                {hasVoted && (
                  <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mt-4 font-game text-xl text-gray-700"
                  >
                    ✅ Your vote has been recorded. Waiting for other players...
                  </motion.p>
                )}
              </div>
            </div>

            {/* Right - Chat Panel */}
            <div className="col-span-1">
              <div className="panel-space h-[600px] flex flex-col">
                <h3 className="font-pixel text-lg mb-3 text-gray-900">DISCUSSION</h3>
                
                {/* Messages */}
                <div className="flex-1 overflow-y-auto mb-3 space-y-2 min-h-0 bg-white/30 p-3 rounded border-2 border-brown-dark">
                  {state.messages.map((msg, index) => (
                    <div key={index} className="chat-message-space">
                      {msg.system ? (
                        <span className="font-game text-lg italic text-gray-600">{msg.text}</span>
                      ) : (
                        <>
                          <span className="font-game text-lg font-bold text-orange">
                            {msg.username}:
                          </span>
                          <span className="font-game text-lg ml-2 text-gray-900">{msg.text}</span>
                        </>
                      )}
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                {/* Chat Input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Discuss..."
                    className="input-space flex-1 text-lg py-2"
                  />
                  <button
                    onClick={handleSendMessage}
                    className="btn-space green text-xs px-4"
                  >
                    SEND
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}