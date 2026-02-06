'use i18n';
import React from 'react';
import { useGame } from '../context/GameContext';
// import { useTranslation } from '../utils/translations';
import { motion } from 'framer-motion';
import Starfield from './Starfield';

export default function RoleReveal() {
  const { state } = useGame();
  // const { t } = useTranslation(state.language);
  
  const isCivilian = state.role === 'CIVILIAN';

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4">
      <Starfield />
      
      {/* Colored Overlay */}
      <div className={`absolute inset-0 ${isCivilian ? 'bg-green-900' : 'bg-red-900'} opacity-30 z-0`}></div>
      
      <div className="text-center relative z-10">
        {/* Role Title with Pulse */}
        <motion.h1
          className={`font-pixel text-7xl mb-8 ${isCivilian ? 'text-green-400' : 'text-red-500'}`}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ 
            scale: [0.5, 1.1, 1],
            opacity: 1,
          }}
          transition={{ duration: 1 }}
          style={{
            textShadow: isCivilian 
              ? '0 0 20px #4ade80, 0 0 40px #22c55e' 
              : '0 0 20px #ef4444, 0 0 40px #dc2626'
          }}
        >
          {isCivilian ? "CREWMATE" : "IMPOSTOR"}
        </motion.h1>

        {/* Description Panel */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="panel-space max-w-2xl mx-auto"
        >
          <p className="font-game text-3xl leading-relaxed text-gray-900">
            {isCivilian ? "CREWMATE" : "IMPOSTOR" }
          </p>
        </motion.div>

        {/* Starting Soon with Spinner */}
        <motion.div
          className="mt-12"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
        >
          <p className="font-game text-2xl text-white mb-4">
            Starting soon...
          </p>
          <div className="spinner-space mx-auto border-white border-t-orange"></div>
        </motion.div>
      </div>
    </div>
  );
}