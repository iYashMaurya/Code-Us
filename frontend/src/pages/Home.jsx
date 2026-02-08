'use i18n';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';
// import { useTranslation } from '../utils/translations';
import { motion } from 'framer-motion';
import Starfield from '../components/Starfield';
import { useLingoContext } from '@lingo.dev/compiler/react';
import { APP_LANGUAGES } from '../config/languages';

export default function Home() {
  const navigate = useNavigate();
  const { state, dispatch } = useGame();
  // const { t } = useTranslation(state.language);
  const [roomInput, setRoomInput] = useState('');
  const { setLocale } = useLingoContext();

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
    const newLang = e.target.value;
    
    // Update your game state (for the dropdown UI)
    dispatch({ type: 'SET_LANGUAGE', payload: newLang });
    
    // Update Lingo (to swap the text)
    setLocale(newLang); // <--- 3. ADD THIS LINE
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
          {/* 👇 DYNAMIC MAPPING */}
          {APP_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>

      {/* Main Content */}
      <div className="flex flex-col items-center justify-center min-h-screen py-12 px-4 relative z-10">
        <motion.div className="mb-12 text-center">
          <motion.h1 className="font-pixel text-6xl mb-4">
            {/* LINGO MAGIC: Just write the text. Lingo will translate the whole block */}
            <span className="text-pink-500" style={{ background: 'linear-gradient(45deg, #ec4899, #f97316)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              CODE
            </span>
            <br />
            <span className="text-orange" style={{ background: 'linear-gradient(45deg, #f97316, #fb923c)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              MAFIA
            </span>
          </motion.h1>
          <motion.p className="font-game text-3xl text-white">
            A Collaborative Coding Game
          </motion.p>
        </motion.div>

        <motion.div className="panel-space w-full max-w-md space-y-6">
          <input
            type="text"
            placeholder="Enter Username"
            value={state.username}
            onChange={(e) => dispatch({ type: 'SET_USERNAME', payload: e.target.value })}
            className="input-space w-full"
          />

          <motion.button onClick={handleCreateRoom} className="btn-space w-full">
            Create Room
          </motion.button>

          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Room Code"
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
              className="input-space flex-1"
            />
            <motion.button onClick={handleJoinRoom} className="btn-space green">
              Join
            </motion.button>
          </div>
        </motion.div>

        <motion.div className="mt-8 font-game text-2xl text-white text-center">
          3-5 Players Recommended
        </motion.div>
      </div>
    </div>
  );
}