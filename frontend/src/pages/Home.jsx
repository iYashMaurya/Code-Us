import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { useTranslation } from '../utils/translations';
import { motion } from 'framer-motion';
import Starfield from '../components/Starfield';

export default function Home() {
  const navigate = useNavigate();
  const { state, dispatch } = useGame();
  const { t } = useTranslation(state.language);
  const [roomInput, setRoomInput] = useState('');

  const handleCreateRoom = () => {
    if (!state.username.trim()) {
      alert('Please enter your name!');
      return;
    }
    
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    navigate(`/room/${roomId}`);
  };

  const handleJoinRoom = () => {
    if (!state.username.trim()) {
      alert('Please enter your name!');
      return;
    }
    
    if (!roomInput.trim()) {
      alert('Please enter a room code!');
      return;
    }
    
    navigate(`/room/${roomInput.toUpperCase()}`);
  };

  const handleLanguageChange = (e) => {
    dispatch({ type: 'SET_LANGUAGE', payload: e.target.value });
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <Starfield />
      
      {/* Language Selector */}
      <div className="absolute top-6 right-6 z-20">
        <select
          value={state.language}
          onChange={handleLanguageChange}
          className="input-space text-lg cursor-pointer"
        >
          <option value="en">🇬🇧 EN</option>
          <option value="hi">🇮🇳 HI</option>
          <option value="de">🇩🇪 DE</option>
        </select>
      </div>

      {/* Main Content */}
      <div className="flex flex-col items-center justify-center min-h-screen py-12 px-4 relative z-10">
        {/* Title with Gradient and Glow */}
        <motion.div
          className="mb-12 text-center"
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, type: 'spring' }}
        >
          <motion.h1
            className="font-pixel text-6xl mb-4"
            animate={{
              textShadow: [
                '0 0 20px #ff9933, 0 0 40px #ffb366',
                '0 0 30px #ff66b2, 0 0 50px #ff9933',
                '0 0 20px #ff9933, 0 0 40px #ffb366',
              ],
            }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            <span 
              className="text-pink-500"
              style={{
                background: 'linear-gradient(45deg, #ec4899, #f97316)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {t('home.title').split(' ')[0]}
            </span>
            <br />
            <span 
              className="text-orange"
              style={{
                background: 'linear-gradient(45deg, #f97316, #fb923c)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {t('home.title').split(' ')[1]}
            </span>
          </motion.h1>
          <motion.p
            className="font-game text-3xl text-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}
          >
            {t('home.subtitle')}
          </motion.p>
        </motion.div>

        {/* Input Panel */}
        <motion.div
          className="panel-space w-full max-w-md space-y-6"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          {/* Username */}
          <input
            type="text"
            placeholder={t('home.username')}
            value={state.username}
            onChange={(e) => dispatch({ type: 'SET_USERNAME', payload: e.target.value })}
            className="input-space w-full"
            maxLength={20}
          />

          {/* Create Room */}
          <motion.button
            onClick={handleCreateRoom}
            className="btn-space w-full"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {t('home.createRoom')}
          </motion.button>

          {/* Join Room */}
          <div className="flex gap-3">
            <input
              type="text"
              placeholder={t('home.joinRoom')}
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
              className="input-space flex-1"
              maxLength={8}
            />
            <motion.button
              onClick={handleJoinRoom}
              className="btn-space green"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {t('home.join')}
            </motion.button>
          </div>
        </motion.div>

        {/* Info */}
        <motion.div
          className="mt-8 font-game text-2xl text-white text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}
        >
          {t('home.playerCount')}
        </motion.div>
      </div>
    </div>
  );
}