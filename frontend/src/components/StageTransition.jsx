import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useGame } from '../context/GameContext';

const stageNames = {
  1: "ENGINE ROOM",
  2: "NAVIGATION",
  3: "OXYGEN SYSTEM"
};

const stageColors = {
  1: { from: '#ff6b6b', to: '#ff9933' },
  2: { from: '#6ba3ff', to: '#3b82f6' },
  3: { from: '#6ee06e', to: '#22c55e' }
};

export default function StageTransition({ fromStage, toStage, onComplete }) {
  const { dispatch } = useGame();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Progress bar animation
    const duration = 3000; // 3 seconds
    const interval = 30; // Update every 30ms
    const steps = duration / interval;
    let currentStep = 0;

    const progressTimer = setInterval(() => {
      currentStep++;
      setProgress((currentStep / steps) * 100);
      
      if (currentStep >= steps) {
        clearInterval(progressTimer);
        setTimeout(() => {
          dispatch({ type: 'TRANSITION_COMPLETE' });
          if (onComplete) onComplete();
        }, 200);
      }
    }, interval);

    return () => clearInterval(progressTimer);
  }, [dispatch, onComplete]);

  const toColor = stageColors[toStage] || stageColors[1];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Starfield moving fast */}
      <div className="absolute inset-0 bg-space">
        {[...Array(100)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-white rounded-full"
            initial={{
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
              opacity: Math.random() * 0.5 + 0.5,
            }}
            animate={{
              y: window.innerHeight + 100,
              opacity: 0,
            }}
            transition={{
              duration: 1 + Math.random(),
              repeat: Infinity,
              ease: "linear",
            }}
          />
        ))}
      </div>

      {/* Warp speed lines */}
      <svg className="absolute inset-0 w-full h-full">
        {[...Array(20)].map((_, i) => {
          const x = Math.random() * 100;
          const y = Math.random() * 100;
          return (
            <motion.line
              key={i}
              x1={`${x}%`}
              y1={`${y}%`}
              x2={`${x}%`}
              y2={`${y + 5}%`}
              stroke="white"
              strokeWidth="2"
              initial={{ opacity: 0, pathLength: 0 }}
              animate={{ 
                opacity: [0, 1, 0],
                pathLength: [0, 1],
                y2: [`${y}%`, `${y + 50}%`]
              }}
              transition={{
                duration: 0.5,
                repeat: Infinity,
                delay: i * 0.1,
                ease: "linear",
              }}
            />
          );
        })}
      </svg>

      {/* Center content */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full">
        {/* Stage Complete */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="panel-space bg-green-500 border-green-700">
            <h2 className="font-pixel text-3xl text-white">
              ✅ STAGE {fromStage} COMPLETE!
            </h2>
          </div>
        </motion.div>

        {/* Hyperdrive effect */}
        <motion.div
          className="relative w-64 h-64 mb-8"
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute top-1/2 left-1/2 w-2 h-32 origin-top"
              style={{
                background: `linear-gradient(to bottom, ${toColor.from}, ${toColor.to})`,
                transform: `translate(-50%, -50%) rotate(${i * 45}deg)`,
              }}
              animate={{
                scaleY: [1, 1.5, 1],
                opacity: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 0.5,
                repeat: Infinity,
                delay: i * 0.1,
              }}
            />
          ))}
        </motion.div>

        {/* Entering next stage */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.5 }}
          className="panel-space"
          style={{
            background: `linear-gradient(135deg, ${toColor.from}, ${toColor.to})`,
          }}
        >
          <h1 className="font-pixel text-4xl text-white mb-2">
            ENTERING
          </h1>
          <h2 className="font-pixel text-5xl text-white">
            {stageNames[toStage] || "UNKNOWN"}
          </h2>
        </motion.div>

        {/* Progress bar */}
        <div className="mt-8 w-96">
          <div className="bg-gray-800 h-6 border-4 border-brown-dark overflow-hidden">
            <motion.div
              className="h-full"
              style={{
                background: `linear-gradient(to right, ${toColor.from}, ${toColor.to})`,
                width: `${progress}%`,
              }}
            />
          </div>
          <p className="font-game text-2xl text-white text-center mt-2">
            {Math.round(progress)}%
          </p>
        </div>

        {/* Warning message */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0, 1, 0, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="mt-8 font-pixel text-xl text-yellow-400"
        >
          ⚠️ SYNCHRONIZING ALL PLAYERS ⚠️
        </motion.div>
      </div>
    </div>
  );
}