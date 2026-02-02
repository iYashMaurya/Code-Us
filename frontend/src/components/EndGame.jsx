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
  const [phase, setPhase] = useState('ejection'); // ejection, result

  const civilianWin = reason?.includes('CIVILIAN');
  const impostor = state.players?.[impostorId];
  const allPlayers = Object.values(state.players || {});
  const impostorIndex = allPlayers.findIndex(p => p.id === impostorId);

  useEffect(() => {
    // Show ejection for 3.5 seconds, then show results
    const timer = setTimeout(() => {
      setPhase('result');
    }, 3500);

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
        {/* Ejection Phase */}
        <AnimatePresence mode="wait">
          {phase === 'ejection' && (
            <motion.div
              key="ejection"
              className="absolute inset-0 flex items-center justify-center"
              exit={{ opacity: 0 }}
            >
              {/* Flying Ship */}
              <motion.div
                className="absolute"
                initial={{ x: -200, y: '40%', rotate: 0, opacity: 0 }}
                animate={{
                  x: [null, window.innerWidth / 2 - 100, window.innerWidth + 200],
                  rotate: civilianWin ? [0, 360, 720] : [0, 180, 360],
                  opacity: [0, 1, 1, 0.5],
                }}
                transition={{ duration: 3.5, ease: 'easeInOut' }}
              >
                <div className="relative">
                  <Ship 
                    type={getShipType(impostorIndex >= 0 ? impostorIndex : 0)} 
                    size="xl" 
                  />
                  
                  {/* Explosion Effect for Impostor */}
                  {civilianWin && (
                    <motion.div
                      className="absolute inset-0 flex items-center justify-center"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: [0, 3, 5], opacity: [0, 1, 0] }}
                      transition={{ delay: 1.5, duration: 1 }}
                    >
                      <div className="relative w-48 h-48">
                        {[...Array(12)].map((_, i) => (
                          <motion.div
                            key={i}
                            className="absolute w-6 h-6 bg-orange rounded-full"
                            style={{
                              top: '50%',
                              left: '50%',
                              marginTop: '-12px',
                              marginLeft: '-12px',
                            }}
                            animate={{
                              x: Math.cos((i * Math.PI) / 6) * 80,
                              y: Math.sin((i * Math.PI) / 6) * 80,
                              opacity: [1, 0],
                              scale: [1, 0.5],
                            }}
                            transition={{ duration: 0.8 }}
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>
              </motion.div>

              {/* Ejection Text */}
              <motion.div
                className="text-center"
                initial={{ opacity: 0, y: -50 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                <h1 className="font-pixel text-5xl text-white mb-4">
                  {impostor?.username || 'Unknown'} WAS EJECTED
                </h1>
              </motion.div>
            </motion.div>
          )}

          {/* Result Phase */}
          {phase === 'result' && (
            <motion.div
              key="result"
              className="w-full max-w-4xl"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              {/* Result Title */}
              <motion.h1
                className={`font-pixel text-6xl mb-8 text-center ${civilianWin ? 'text-green-400' : 'text-red-500'}`}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', duration: 0.6 }}
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
                transition={{ delay: 0.3 }}
              >
                <p className="font-game text-3xl mb-6 text-gray-900 text-center">
                  {t('end.impostor')}:
                </p>
                
                <div className="flex items-center justify-center gap-4 bg-red-500 border-4 border-brown-dark px-8 py-6 shadow-pixel">
                  <Ship 
                    type={getShipType(impostorIndex >= 0 ? impostorIndex : 0)} 
                    size="xl" 
                  />
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
                transition={{ delay: 0.6 }}
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}