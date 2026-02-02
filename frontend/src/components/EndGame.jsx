import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { useTranslation } from '../utils/translations';
import { motion, AnimatePresence } from 'framer-motion';
import Starfield from './Starfield';
import Ship, { getShipType } from './Ship';

export default function EndGame({ reason, impostorId }) {
  const navigate = useNavigate();
  const { state, dispatch } = useGame();
  const { t } = useTranslation(state.language);
  const [showEjection, setShowEjection] = useState(true);

  const civilianWin = reason?.includes('CIVILIAN');
  const impostor = state.players?.[impostorId];
  const impostorIndex = Object.values(state.players).indexOf(impostor);

  useEffect(() => {
    // Hide ejection animation after 3 seconds
    const timer = setTimeout(() => {
      setShowEjection(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const handlePlayAgain = () => {
    dispatch({ type: 'RESET' });
    navigate('/');
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <Starfield />

      {/* Colored Overlay */}
      <motion.div
        className={`absolute inset-0 z-0 ${civilianWin ? 'bg-green-900' : 'bg-red-900'}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.3 }}
        transition={{ duration: 1 }}
      />

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4">
        {/* Ejection Animation */}
        <AnimatePresence>
          {showEjection && (
            <motion.div
              className="absolute top-1/4"
              initial={{ x: -200, rotate: 0, opacity: 0 }}
              animate={{
                x: window.innerWidth + 200,
                rotate: civilianWin ? 720 : 360,
                opacity: [0, 1, 1, 0],
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 3, ease: 'easeInOut' }}
            >
              <div className="relative">
                <Ship type={getShipType(impostorIndex)} size="xl" />
                
                {/* Explosion Effect for Impostor */}
                {civilianWin && (
                  <motion.div
                    className="absolute inset-0"
                    initial={{ scale: 0, opacity: 1 }}
                    animate={{ scale: 3, opacity: 0 }}
                    transition={{ delay: 1.5, duration: 0.5 }}
                  >
                    <div className="w-full h-full">
                      {[...Array(8)].map((_, i) => (
                        <motion.div
                          key={i}
                          className="absolute w-4 h-4 bg-orange"
                          style={{
                            top: '50%',
                            left: '50%',
                          }}
                          animate={{
                            x: Math.cos((i * Math.PI) / 4) * 50,
                            y: Math.sin((i * Math.PI) / 4) * 50,
                            opacity: 0,
                          }}
                          transition={{ duration: 0.5 }}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Result - Show after ejection */}
        <motion.h1
          className={`font-pixel text-6xl mb-8 ${civilianWin ? 'text-green-400' : 'text-red-500'}`}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 3, duration: 0.5 }}
          style={{
            textShadow: civilianWin 
              ? '0 0 30px #4ade80, 0 0 60px #22c55e' 
              : '0 0 30px #ef4444, 0 0 60px #dc2626'
          }}
        >
          {civilianWin ? t('end.civilianWin') : t('end.impostorWin')}
        </motion.h1>

        {/* Impostor Reveal */}
        <motion.div
          className="panel-space max-w-2xl mx-auto mb-12"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 3.5, duration: 0.5 }}
        >
          <p className="font-game text-3xl mb-6 text-gray-900">
            {t('end.impostor')}:
          </p>
          
          <div className="flex items-center justify-center gap-4 bg-red-500 border-4 border-brown-dark px-8 py-6 shadow-pixel">
            <Ship type={getShipType(impostorIndex)} size="xl" />
            <span className="font-pixel text-4xl text-white">
              {impostor?.username || 'Unknown'}
            </span>
          </div>
        </motion.div>

        {/* Actions */}
        <motion.div
          className="flex gap-4 justify-center"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 4, duration: 0.5 }}
        >
          <motion.button
            onClick={handlePlayAgain}
            className="btn-space green"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {t('end.playAgain')}
          </motion.button>
          <motion.button
            onClick={() => navigate('/')}
            className="btn-space blue"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {t('end.home')}
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}