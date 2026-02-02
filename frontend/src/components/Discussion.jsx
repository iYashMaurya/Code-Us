import React, { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { useTranslation } from '../utils/translations';
import { motion } from 'framer-motion';
import Starfield from './Starfield';
import Ship, { getShipType } from './Ship';

export default function Discussion({ onVote }) {
  const { state } = useGame();
  const { t } = useTranslation(state.language);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [timeLeft, setTimeLeft] = useState(10); // Issue #4: 10s Timer
  const [hasVoted, setHasVoted] = useState(false);

  const playerList = Object.values(state.players || {}).filter(p => !p.isEliminated);
  
  // Countdown Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Handle Vote
  const handleVoteSubmit = (targetID) => {
    if (hasVoted) return;
    setHasVoted(true);
    onVote(targetID); // Call parent handler with ID or "SKIP"
  };

  // Helper to count votes for a specific player ID
  const getVoteCount = (pid) => {
      // Assuming state.votes is a map of { voterId: targetId } sent via VOTE_UPDATE
      if (!state.votes) return 0;
      return Object.values(state.votes).filter(target => target === pid).length;
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
            <div className="text-center mb-8">
                <h1 className="font-pixel text-4xl text-white mb-2">VOTING ENDS IN</h1>
                <div className={`text-6xl font-pixel ${timeLeft < 5 ? 'text-red-500 animate-bounce' : 'text-orange'}`}>
                    {timeLeft}
                </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
                <div className="col-span-2">
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      {playerList.map((player, index) => (
                        <motion.button
                          key={player.id}
                          onClick={() => !hasVoted && setSelectedTarget(player.id)}
                          disabled={hasVoted}
                          className={`player-card-space cursor-pointer transition-all w-full flex items-center ${
                            selectedTarget === player.id ? 'ring-4 ring-red-500 scale-105' : ''
                          } ${hasVoted ? 'opacity-60 cursor-default' : 'hover:scale-102'}`}
                        >
                          <Ship type={getShipType(index)} size="lg" />
                          <div className="flex-1 text-left ml-4">
                            <span className="font-game text-2xl text-gray-900">
                              {player.username}
                              {player.id === state.playerId && ` (${t('common.you')})`}
                            </span>
                          </div>
                          
                          {/* Vote Indicators (Red Dots) */}
                          <div className="flex gap-1 ml-2">
                              {[...Array(getVoteCount(player.id))].map((_, i) => (
                                  <div key={i} className="w-4 h-4 bg-red-600 rounded-full border border-black shadow-sm"></div>
                              ))}
                          </div>
                        </motion.button>
                      ))}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-4 justify-center">
                        <motion.button
                          onClick={() => handleVoteSubmit(selectedTarget)}
                          disabled={!selectedTarget || hasVoted}
                          className={`btn-space red w-1/3 text-lg ${hasVoted ? 'opacity-50' : ''}`}
                          whileHover={!hasVoted ? { scale: 1.05 } : {}}
                        >
                          {hasVoted ? 'VOTE CAST' : 'VOTE'}
                        </motion.button>
                        
                        <motion.button
                          onClick={() => handleVoteSubmit("SKIP")}
                          disabled={hasVoted}
                          className={`btn-space blue w-1/3 text-lg ${hasVoted ? 'opacity-50' : ''}`}
                          whileHover={!hasVoted ? { scale: 1.05 } : {}}
                        >
                          SKIP ({getVoteCount("SKIP")})
                        </motion.button>
                    </div>
                </div>

                {/* Right - Chat Panel (Compact) */}
                <div className="col-span-1 panel-space h-[500px] flex flex-col">
                    <h3 className="font-pixel text-lg mb-2">Discussion</h3>
                    <div className="flex-1 overflow-y-auto mb-2 space-y-2 bg-white/10 p-2 rounded">
                        {state.messages.map((msg, i) => (
                            <div key={i} className="text-sm">
                                <span className="font-bold text-orange">{msg.username}: </span>
                                <span className="text-gray-900">{msg.text}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}