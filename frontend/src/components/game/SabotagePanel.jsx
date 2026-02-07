'use i18n';
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Snowflake, Bug, Clock } from 'lucide-react';

export default function SabotagePanel({ onSabotage, isFrozen, ws }) {
  const [freezeCooldown, setFreezeCooldown] = useState(0);
  const [corruptCooldown, setCorruptCooldown] = useState(0);
  const [activeSabotage, setActiveSabotage] = useState(null);

  // 🔥 NEW: Listen for cooldown messages from server
  useEffect(() => {
    if (!ws) return;

    const handleCooldown = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'SABOTAGE_COOLDOWN') {
          const remaining = message.data.remainingSeconds;
          // Set cooldown for whichever ability was just used
          if (activeSabotage === 'FREEZE') {
            setFreezeCooldown(remaining);
          } else if (activeSabotage === 'CORRUPT') {
            setCorruptCooldown(remaining);
          }
        }
      } catch (error) {
        // Ignore parse errors
      }
    };

    ws.addEventListener('message', handleCooldown);
    return () => ws.removeEventListener('message', handleCooldown);
  }, [ws, activeSabotage]);

  // 🔥 NEW: Countdown timers
  useEffect(() => {
    if (freezeCooldown > 0) {
      const timer = setInterval(() => {
        setFreezeCooldown(prev => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [freezeCooldown]);

  useEffect(() => {
    if (corruptCooldown > 0) {
      const timer = setInterval(() => {
        setCorruptCooldown(prev => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [corruptCooldown]);

  const handleFreeze = () => {
    if (freezeCooldown > 0 || isFrozen) return;
    setActiveSabotage('FREEZE');
    setFreezeCooldown(15); // 10s cooldown + 5s active = 15s total
    onSabotage('FREEZE');
  };

  const handleCorrupt = () => {
    if (corruptCooldown > 0) return;
    setActiveSabotage('CORRUPT');
    setCorruptCooldown(10); // 10s cooldown
    onSabotage('CORRUPT');
  };

  return (
    <motion.div
      className="panel-space flex-1"
      initial={{ x: -50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
    >
      <h3 className="font-pixel text-lg mb-4 text-red-600">SABOTAGE</h3>
      <div className="space-y-3">
        {/* FREEZE Button with Cooldown */}
        <div className="relative">
          <button
            onClick={handleFreeze}
            disabled={freezeCooldown > 0 || isFrozen}
            className={`w-full btn-space red text-sm flex items-center justify-center gap-2 ${
              freezeCooldown > 0 || isFrozen ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <Snowflake className="w-4 h-4" />
            {freezeCooldown > 0 ? (
              <>
                <Clock className="w-4 h-4 animate-spin" />
                {freezeCooldown}s
              </>
            ) : (
              'Jam Comms (5s)'
            )}
          </button>
          
          {/* Cooldown Progress Bar */}
          {freezeCooldown > 0 && (
            <motion.div
              className="absolute bottom-0 left-0 h-1 bg-blue-500 rounded-b"
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: freezeCooldown, ease: 'linear' }}
            />
          )}
        </div>

        {/* CORRUPT Button with Cooldown */}
        <div className="relative">
          <button
            onClick={handleCorrupt}
            disabled={corruptCooldown > 0}
            className={`w-full btn-space red text-sm flex items-center justify-center gap-2 ${
              corruptCooldown > 0 ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <Bug className="w-4 h-4" />
            {corruptCooldown > 0 ? (
              <>
                <Clock className="w-4 h-4 animate-spin" />
                {corruptCooldown}s
              </>
            ) : (
              'Inject Malware'
            )}
          </button>
          
          {/* Cooldown Progress Bar */}
          {corruptCooldown > 0 && (
            <motion.div
              className="absolute bottom-0 left-0 h-1 bg-blue-500 rounded-b"
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: corruptCooldown, ease: 'linear' }}
            />
          )}
        </div>
      </div>
      
      <div className="mt-4 p-3 bg-red-100 border-2 border-red-500 rounded">
        <p className="font-pixel text-xs text-red-800 mb-2">IMPOSTER TIPS:</p>
        <p className="font-game text-sm text-gray-800">
          • Jam: Freezes typing for 5s
          <br />
          • Corrupt: Adds code errors
          <br />
          • 10s cooldown between uses
        </p>
      </div>
    </motion.div>
  );
}