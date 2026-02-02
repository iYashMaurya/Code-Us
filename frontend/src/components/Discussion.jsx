import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import { useTranslation } from '../utils/translations';
import { motion, AnimatePresence } from 'framer-motion';
import Starfield from './Starfield';
import Ship, { getShipType } from './Ship';

export default function Discussion({ onEliminate }) {
  const { state } = useGame();
  const { t } = useTranslation(state.language);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [chatMessage, setChatMessage] = useState('');

  const playerList = Object.values(state.players || {}).filter(p => p.isAlive);
  const currentPlayer = state.players?.[state.playerId];
  const canVote = currentPlayer?.isAlive && !currentPlayer?.isEliminated;

  const handleEliminate = () => {
    if (!selectedPlayer) return;
    onEliminate(selectedPlayer);
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
      
      {/* Red Pulsing Overlay */}
      <motion.div
        className="absolute inset-0 bg-red-900 z-0"
        animate={{ opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 2, repeat: Infinity }}
      />

      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-6xl">
          <div className="grid grid-cols-3 gap-6">
            {/* Left - Player Voting Grid */}
            <div className="col-span-2">
              <motion.div
                className="panel-space"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
              >
                {/* Title */}
                <motion.h1
                  className="font-pixel text-4xl text-center mb-6 text-red-600"
                  animate={{ 
                    textShadow: ['0 0 10px #ef4444', '0 0 20px #dc2626', '0 0 10px #ef4444'] 
                  }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  {t('discussion.title')}
                </motion.h1>

                <p className="font-game text-2xl text-center mb-6 text-gray-700">
                  {t('discussion.vote')}
                </p>

                {/* Player Grid */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  {playerList.map((player, index) => (
                    <motion.button
                      key={player.id}
                      onClick={() => canVote && setSelectedPlayer(player.id)}
                      disabled={!canVote}
                      className={`player-card-space cursor-pointer transition-all ${
                        selectedPlayer === player.id
                          ? 'ring-4 ring-red-500 scale-105'
                          : ''
                      } ${!canVote ? 'opacity-50 cursor-not-allowed' : 'hover:scale-102'}`}
                      whileHover={canVote ? { scale: 1.02 } : {}}
                      whileTap={canVote ? { scale: 0.98 } : {}}
                    >
                      <Ship type={getShipType(Object.values(state.players).indexOf(player))} size="lg" />
                      <div className="flex-1 text-left">
                        <span className="font-game text-2xl text-gray-900">
                          {player.username}
                          {player.id === state.playerId && ` (${t('common.you')})`}
                        </span>
                      </div>
                      {selectedPlayer === player.id && (
                        <motion.div
                          className="w-6 h-6 border-3 border-brown-dark bg-red-500"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                        />
                      )}
                    </motion.button>
                  ))}
                </div>

                {/* Action Buttons */}
                {canVote && (
                  <div className="flex gap-4">
                    <motion.button
                      onClick={handleEliminate}
                      disabled={!selectedPlayer}
                      className={`btn-space red flex-1 ${
                        !selectedPlayer ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      whileHover={selectedPlayer ? { scale: 1.02 } : {}}
                      whileTap={selectedPlayer ? { scale: 0.98 } : {}}
                    >
                      {t('discussion.eliminate')}
                    </motion.button>
                    <motion.button
                      onClick={() => onEliminate(null)}
                      className="btn-space blue flex-1"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {t('discussion.skip')}
                    </motion.button>
                  </div>
                )}

                {!canVote && (
                  <div className="text-center">
                    <p className="font-game text-2xl text-gray-600">
                      {t('game.spectator')}
                    </p>
                  </div>
                )}
              </motion.div>
            </div>

            {/* Right - Chat Panel */}
            <div className="col-span-1">
              <motion.div
                className="panel-space h-[600px] flex flex-col"
                initial={{ x: 50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <h3 className="font-pixel text-lg mb-4 text-gray-900">{t('game.chat')}</h3>
                
                {/* Messages */}
                <div className="flex-1 overflow-y-auto mb-4 space-y-2 min-h-0">
                  {state.messages.map((msg, index) => (
                    <div key={index} className="chat-message-space">
                      {msg.system ? (
                        <span className="font-game text-lg italic text-gray-600">{msg.text}</span>
                      ) : (
                        <>
                          <span className="font-game text-lg font-bold text-orange">
                            {msg.username}:
                          </span>
                          <span className="font-game text-lg ml-2 text-gray-900">{msg.text}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                {/* Input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Discuss..."
                    className="input-space flex-1 text-lg py-2"
                  />
                  <button
                    onClick={handleSendMessage}
                    className="btn-space green text-xs px-4"
                  >
                    {t('common.send')}
                  </button>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}