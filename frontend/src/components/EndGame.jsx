import React from 'react';
import { useGame } from '../context/GameContext';
import { motion } from 'framer-motion';
import Starfield from './Starfield';
import Ship, { getShipType } from './Ship';

export default function EndGame({ reason, IMPOSTERId }) {
  const { state } = useGame();
  
  const getWinMessage = (reason) => {
  switch (reason) {
    case 'CIVILIAN_WIN_TESTS':
      return {
        title: '🛰️ MISSION SUCCESS',
        subtitle: 'All satellite bugs have been fixed!',
        message: 'The crewmates saved the mission by completing all tasks!',
        color: 'green'
      };
    
    case 'CIVILIAN_WIN':
      return {
        title: '🎉 CREWMATES WIN',
        subtitle: 'IMPOSTER has been eliminated!',
        message: 'The crew successfully identified and voted out the IMPOSTER!',
        color: 'green'
      };
    
    case 'IMPOSTER_WIN':
      return {
        title: '💀 IMPOSTER WINS',
        subtitle: 'All crewmates eliminated!',
        message: 'The IMPOSTER has sabotaged the mission!',
        color: 'red'
      };
    
    case 'IMPOSTER_WIN_TIME':
      return {
        title: '⏰ TIME\'S UP',
        subtitle: 'IMPOSTER wins!',
        message: 'The crew ran out of time to fix the satellite!',
        color: 'red'
      };
    
    default:
      return {
        title: 'GAME OVER',
        subtitle: '',
        message: 'The game has ended.',
        color: 'gray'
      };
  }
};

  const winInfo = getWinMessage(reason);
  const playerList = Object.values(state.players || {});
  const IMPOSTER = playerList.find(p => p.id === IMPOSTERId);

  const getColorClasses = (color) => {
    const classes = {
      green: 'text-green-400 bg-green-900',
      red: 'text-red-400 bg-red-900',
      gray: 'text-gray-400 bg-gray-900'
    };
    return classes[color] || classes.gray;
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4">
      <Starfield />
      
      {/* Colored Overlay */}
      <div className={`absolute inset-0 ${getColorClasses(winInfo.color).split(' ')[1]} opacity-30 z-0`}></div>
      
      <div className="text-center relative z-10 max-w-4xl">
        {/* Title */}
        <motion.h1
          className={`font-pixel text-6xl mb-4 ${getColorClasses(winInfo.color).split(' ')[0]}`}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ 
            scale: [0.5, 1.1, 1],
            opacity: 1,
          }}
          transition={{ duration: 1 }}
          style={{
            textShadow: winInfo.color === 'green' 
              ? '0 0 20px #4ade80, 0 0 40px #22c55e' 
              : '0 0 20px #ef4444, 0 0 40px #dc2626'
          }}
        >
          {winInfo.title}
        </motion.h1>

        {/* Subtitle */}
        {winInfo.subtitle && (
          <motion.h2
            className="font-game text-3xl mb-8 text-white"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            {winInfo.subtitle}
          </motion.h2>
        )}

        {/* Message Panel */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="panel-space max-w-2xl mx-auto mb-8"
        >
          <p className="font-game text-2xl text-gray-900 mb-6">
            {winInfo.message}
          </p>

          {/* Reveal IMPOSTER */}
          {IMPOSTER && (
            <div className="mt-6 p-4 bg-red-100 border-3 border-red-500">
              <p className="font-pixel text-sm mb-2 text-red-600">THE IMPOSTER WAS:</p>
              <div className="flex items-center justify-center gap-3">
                <Ship type={getShipType(playerList.indexOf(IMPOSTER))} size="lg" />
                <span className="font-game text-3xl text-gray-900">
                  {IMPOSTER.username}
                </span>
              </div>
            </div>
          )}
        </motion.div>

        {/* Players Summary */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="panel-space max-w-xl mx-auto"
        >
          <h3 className="font-pixel text-lg mb-4 text-gray-900">FINAL ROSTER</h3>
          <div className="grid grid-cols-2 gap-3">
            {playerList.map((player, index) => (
              <div 
                key={player.id}
                className={`flex items-center gap-2 p-2 border-2 ${
                  player.isEliminated ? 'border-gray-400 opacity-50' : 'border-brown-dark'
                } bg-white/50`}
              >
                <Ship type={getShipType(index)} size="sm" />
                <div className="text-left flex-1">
                  <p className={`font-game text-lg ${player.isEliminated ? 'line-through' : ''}`}>
                    {player.username}
                  </p>
                  <p className={`font-pixel text-xs ${
                    player.role === 'IMPOSTER' ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {player.role}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Return Home Button */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          onClick={() => window.location.href = '/'}
          className="btn-space green mt-8"
        >
          Return to Lobby
        </motion.button>
      </div>
    </div>
  );
}