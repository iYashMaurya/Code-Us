import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ScreenTransition({ phase, children }) {
  const [displayPhase, setDisplayPhase] = useState(phase);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    if (phase !== displayPhase) {
      setIsTransitioning(true);
      
      // Play hydraulic sound (optional - would need audio file)
      // const audio = new Audio('/sounds/airlock.mp3');
      // audio.play();

      // Wait for doors to close before changing phase
      setTimeout(() => {
        setDisplayPhase(phase);
      }, 800);

      // Reset transition state after doors open
      setTimeout(() => {
        setIsTransitioning(false);
      }, 1600);
    }
  }, [phase]);

  const doorVariants = {
    closed: {
      x: 0,
      transition: {
        duration: 0.6,
        ease: [0.76, 0, 0.24, 1],
      },
    },
    open: {
      transition: {
        duration: 0.6,
        ease: [0.76, 0, 0.24, 1],
      },
    },
  };

  return (
    <div className="relative w-full h-full">
      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={displayPhase}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {children}
        </motion.div>
      </AnimatePresence>

      {/* Blast Door Overlay */}
      <AnimatePresence>
        {isTransitioning && (
          <>
            {/* Left Door */}
            <motion.div
              className="fixed inset-y-0 left-0 w-1/2 z-50 pointer-events-none"
              initial={{ x: '-100%' }}
              animate="closed"
              exit={{ x: '-100%' }}
              variants={doorVariants}
            >
              {/* Door Panel */}
              <div className="w-full h-full bg-gradient-to-r from-gray-700 via-gray-600 to-gray-500 relative overflow-hidden">
                {/* Rivets */}
                <div className="absolute inset-0">
                  {[...Array(20)].map((_, i) => (
                    <div
                      key={i}
                      className="absolute w-3 h-3 bg-gray-800 rounded-full border-2 border-gray-900"
                      style={{
                        top: `${(i % 10) * 10 + 5}%`,
                        left: `${Math.floor(i / 10) * 50 + 5}%`,
                      }}
                    />
                  ))}
                </div>

                {/* Warning Stripes */}
                <div className="absolute right-0 inset-y-0 w-12 bg-gradient-to-r from-yellow-500 to-orange-500 opacity-80">
                  {[...Array(40)].map((_, i) => (
                    <div
                      key={i}
                      className="h-4 bg-black"
                      style={{
                        marginTop: i % 2 === 0 ? '0' : '4px',
                      }}
                    />
                  ))}
                </div>

                {/* Hydraulic Lines */}
                <div className="absolute top-1/2 right-4 w-2 h-32 bg-gray-800 -translate-y-1/2">
                  <div className="w-full h-8 bg-yellow-400 animate-pulse" />
                </div>

                {/* CAUTION Text */}
                <div className="absolute top-1/2 left-1/4 -translate-y-1/2 -rotate-90">
                  <div className="font-pixel text-yellow-400 text-2xl tracking-wider">
                    ⚠ CAUTION ⚠
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Right Door */}
            <motion.div
              className="fixed inset-y-0 right-0 w-1/2 z-50 pointer-events-none"
              initial={{ x: '100%' }}
              animate="closed"
              exit={{ x: '100%' }}
              variants={doorVariants}
            >
              {/* Door Panel */}
              <div className="w-full h-full bg-gradient-to-l from-gray-700 via-gray-600 to-gray-500 relative overflow-hidden">
                {/* Rivets */}
                <div className="absolute inset-0">
                  {[...Array(20)].map((_, i) => (
                    <div
                      key={i}
                      className="absolute w-3 h-3 bg-gray-800 rounded-full border-2 border-gray-900"
                      style={{
                        top: `${(i % 10) * 10 + 5}%`,
                        right: `${Math.floor(i / 10) * 50 + 5}%`,
                      }}
                    />
                  ))}
                </div>

                {/* Warning Stripes */}
                <div className="absolute left-0 inset-y-0 w-12 bg-gradient-to-l from-yellow-500 to-orange-500 opacity-80">
                  {[...Array(40)].map((_, i) => (
                    <div
                      key={i}
                      className="h-4 bg-black"
                      style={{
                        marginTop: i % 2 === 0 ? '0' : '4px',
                      }}
                    />
                  ))}
                </div>

                {/* Hydraulic Lines */}
                <div className="absolute top-1/2 left-4 w-2 h-32 bg-gray-800 -translate-y-1/2">
                  <div className="w-full h-8 bg-yellow-400 animate-pulse" />
                </div>

                {/* CAUTION Text */}
                <div className="absolute top-1/2 right-1/4 -translate-y-1/2 rotate-90">
                  <div className="font-pixel text-yellow-400 text-2xl tracking-wider">
                    ⚠ CAUTION ⚠
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Center Seal */}
            <motion.div
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[51] pointer-events-none"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ delay: 0.3, duration: 0.3 }}
            >
              <div className="w-32 h-32 rounded-full bg-yellow-500 border-8 border-gray-800 flex items-center justify-center">
                <div className="font-pixel text-gray-900 text-center text-xs">
                  AIRLOCK
                  <br />
                  SEALED
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}