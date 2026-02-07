'use i18n';
import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../context/GameContext';
import { motion, AnimatePresence } from 'framer-motion';
import Starfield from './Starfield';
import Ship, { getShipType } from './Ship';

// 🔥 ChatBubble component with translation animation
const ChatBubble = ({ message, userLang }) => {
  return (
    <div className="mb-2 p-2 bg-white/50 rounded border-2 border-brown-dark">
      <span className="font-game text-base font-bold text-orange block mb-1">
        {message.username}:
      </span>
      
      <AnimatePresence mode='wait'>
        <motion.span
          key={message.translationId || 'original'}
          initial={{ opacity: 0, filter: 'blur(3px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, position: 'absolute' }}
          transition={{ duration: 0.4 }}
          className="font-game text-base text-gray-900 block"
        >
          {message.translations && message.translations[userLang] 
            ? message.translations[userLang] 
            : message.text}
        </motion.span>
      </AnimatePresence>
    </div>
  );
};

export default function Discussion({ onVote }) {
  const { state, dispatch } = useGame();
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const [hasVoted, setHasVoted] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const chatEndRef = useRef(null);

  const playerList = Object.values(state.players || {}).filter(p => !p.isEliminated);
  const currentPlayer = state.players?.[state.playerId];
  const canVote = !hasVoted && currentPlayer && !currentPlayer.isEliminated;
  const userLang = state.language || 'en';

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  // Listen to server-controlled voting timer
  useEffect(() => {
    if (!state.ws) return;

    const handleMessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'VOTING_TIMER') {
          setTimeLeft(message.data.seconds);
          
          if (message.data.seconds === 0 && !hasVoted) {
            handleVoteSubmit('SKIP');
          }
        }

        // Handle translation updates
        if (message.type === 'TRANSLATION_UPDATE') {
          dispatch({
            type: 'UPDATE_MESSAGE_TRANSLATION',
            payload: {
              messageId: message.data.messageId,
              translations: message.data.translations,
            }
          });
        }
      } catch (error) {
        console.error('Error parsing voting timer message:', error);
      }
    };

    state.ws.addEventListener('message', handleMessage);
    return () => {
      state.ws?.removeEventListener('message', handleMessage);
    };
  }, [state.ws, hasVoted, dispatch]);

  // Reset state when entering discussion phase
  useEffect(() => {
    if (state.phase === 'DISCUSSION') {
      setHasVoted(false);
      setSelectedTarget(null);
      setTimeLeft(30);
    }
  }, [state.phase]);

  const handleVoteSubmit = (targetID) => {
    if (hasVoted) return;
    setHasVoted(true);
    onVote(targetID);
  };

  const hasPlayerVoted = (playerId) => {
    return state.votesStatus?.[playerId] || false;
  };

  const handleSendMessage = () => {
    if (!chatMessage.trim()) return;

    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({
        type: 'CHAT',
        data: {
          username: state.username,
          text: chatMessage,
          playerId: state.playerId,
        }
      }));
      setChatMessage('');
    }
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
          <div className="text-center mb-6">
            <h1 className="font-pixel text-4xl text-white mb-2">VOTING ENDS IN</h1>
            <div className={`text-6xl font-pixel ${timeLeft < 5 ? 'text-red-500 animate-bounce' : 'text-orange'}`}>
              {timeLeft}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {/* Left - Player Voting Grid */}
            <div className="col-span-2">
              <div className="panel-space">
                <h2 className="font-pixel text-2xl text-center mb-4 text-gray-900">
                  WHO IS THE IMPOSTER?
                </h2>

                {/* Player Grid - Stacked Vertically */}
                <div className="space-y-3 mb-6">
                  {playerList.map((player, index) => (
                    <motion.button
                      key={player.id}
                      onClick={() => canVote && setSelectedTarget(player.id)}
                      disabled={!canVote}
                      className={`w-full player-card-space cursor-pointer transition-all flex items-center justify-between ${
                        selectedTarget === player.id ? 'ring-4 ring-red-500 scale-102' : ''
                      } ${!canVote ? 'opacity-60 cursor-default' : 'hover:scale-102'}`}
                      whileHover={canVote ? { scale: 1.02 } : {}}
                      whileTap={canVote ? { scale: 0.98 } : {}}
                    >
                      <div className="flex items-center gap-3">
                        <Ship type={getShipType(Object.values(state.players).indexOf(player))} size="md" />
                        <span className="font-game text-2xl text-gray-900">
                          {player.username}
                          {player.id === state.playerId && ' (You)'}
                        </span>
                      </div>
                      
                      {hasPlayerVoted(player.id) && (
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-green-600 rounded-full border-2 border-brown-dark"></div>
                          <span className="font-pixel text-xs text-gray-600">VOTED</span>
                        </div>
                      )}
                    </motion.button>
                  ))}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-4">
                  <motion.button
                    onClick={() => handleVoteSubmit(selectedTarget)}
                    disabled={!selectedTarget || !canVote}
                    className={`btn-space red flex-1 ${(!selectedTarget || !canVote) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    whileHover={selectedTarget && canVote ? { scale: 1.02 } : {}}
                  >
                    {hasVoted ? 'VOTED' : 'VOTE'}
                  </motion.button>
                  
                  <motion.button
                    onClick={() => handleVoteSubmit('SKIP')}
                    disabled={!canVote}
                    className={`btn-space blue flex-1 ${!canVote ? 'opacity-50 cursor-not-allowed' : ''}`}
                    whileHover={canVote ? { scale: 1.02 } : {}}
                  >
                    SKIP
                  </motion.button>
                </div>

                {hasVoted && (
                  <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mt-4 font-game text-xl text-gray-700"
                  >
                    ✅ Your vote has been recorded. Waiting for other players...
                  </motion.p>
                )}
              </div>
            </div>

            {/* Right - Chat Panel with Translations - 🔥 IMPROVED SIZE */}
            <div className="col-span-1">
              <div className="panel-space h-[700px] flex flex-col"> {/* 🔥 Increased from h-[600px] */}
                <h3 className="font-pixel text-lg mb-3 text-gray-900">DISCUSSION</h3>
                
                {/* Messages with Translation Animation - 🔥 NO DUPLICATES */}
                <div className="flex-1 overflow-y-auto mb-3 space-y-1 min-h-0 bg-white/30 p-3 rounded border-2 border-brown-dark">
                  {state.messages.map((msg) => ( // 🔥 Use messageId as key
                    <div key={msg.messageId || msg.timestamp || Math.random()}>
                      {msg.system ? (
                        <div className="mb-2 p-2 bg-gray-100 rounded border-2 border-gray-400">
                          <span className="font-game text-sm italic text-gray-700">{msg.text}</span>
                        </div>
                      ) : (
                        <ChatBubble message={msg} userLang={userLang} />
                      )}
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                {/* Chat Input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Discuss..."
                    className="input-space flex-1 text-base py-2" 
                  />
                  <button
                    onClick={handleSendMessage}
                    className="btn-space green text-xs px-4"
                  >
                    SEND
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}