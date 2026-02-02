import React, { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useGame } from '../context/GameContext';
import { useTranslation } from '../utils/translations';
import { motion, AnimatePresence } from 'framer-motion';
import Starfield from './Starfield';
import Ship, { getShipType } from './Ship';
import { CheckCircle2, XCircle, Zap, Radio } from 'lucide-react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';

export default function CodeEditor({ onEmergency }) {
  const { state } = useGame();
  const { t } = useTranslation(state.language);
  const editorRef = useRef(null);
  const [chatMessage, setChatMessage] = useState('');
  const [yDoc, setYDoc] = useState(null);
  const [provider, setProvider] = useState(null);
  const [testResults, setTestResults] = useState([false, false, false]);
  const [sabotages, setSabotages] = useState({ oxygen: false, sensors: false });
  const chatEndRef = useRef(null);

  const playerList = Object.values(state.players || {});
  const alivePlayers = playerList.filter(p => p.isAlive);
  const eliminatedPlayers = playerList.filter(p => p.isEliminated);
  const isImpostor = state.role === 'IMPOSTOR';

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  useEffect(() => {
    if (!state.roomId || !editorRef.current) return;

    const doc = new Y.Doc();
    const wsProvider = new WebsocketProvider(
      'ws://localhost:8080/yjs',
      state.roomId,
      doc
    );

    setYDoc(doc);
    setProvider(wsProvider);

    const yText = doc.getText('monaco');
    
    if (state.task?.template && yText.toString() === '') {
      yText.insert(0, state.task.template);
    }

    const binding = new MonacoBinding(
      yText,
      editorRef.current.getModel(),
      new Set([editorRef.current]),
      wsProvider.awareness
    );

    if (state.isEliminated) {
      wsProvider.disconnect();
      editorRef.current.updateOptions({ readOnly: true });
      wsProvider.awareness.setLocalState(null);
    }

    return () => {
      binding.destroy();
      wsProvider.disconnect();
      doc.destroy();
    };
  }, [state.roomId, state.task, editorRef.current]);

  useEffect(() => {
    if (state.isEliminated && editorRef.current) {
      editorRef.current.updateOptions({ readOnly: true });
      if (provider) {
        provider.disconnect();
        provider.awareness.setLocalState(null);
      }
    }
  }, [state.isEliminated]);

  const handleEditorDidMount = (editor) => {
    editorRef.current = editor;
  };

  const handleSendMessage = () => {
    if (!chatMessage.trim() || state.isEliminated) return;

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

  const handleSabotage = (type) => {
    if (!isImpostor) return;
    setSabotages(prev => ({ ...prev, [type]: !prev[type] }));
    // In real implementation, would send sabotage event to backend
  };

  const mockTestValidation = () => {
    // Simple mock validation - in real game would use regex/actual test runner
    setTestResults([true, Math.random() > 0.5, false]);
  };

  return (
    <div className="min-h-screen relative">
      <Starfield />
      
      <div className="relative z-10 p-4">
        {/* Top Bar */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-4 items-center">
            <div className="panel-space-sm px-4 py-2">
              <span className="font-pixel text-sm text-gray-900">
                {t('game.mode')}: {state.mode}
              </span>
            </div>
            
            {state.isEliminated && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="panel-space-sm px-4 py-2 bg-red-500"
              >
                <span className="font-pixel text-sm text-white">
                  {t('game.spectator')}
                </span>
              </motion.div>
            )}
          </div>

          <motion.button
            onClick={onEmergency}
            disabled={state.isEliminated}
            className={`btn-space red ${state.isEliminated ? 'opacity-50 cursor-not-allowed' : ''}`}
            whileHover={{ scale: state.isEliminated ? 1 : 1.05 }}
            whileTap={{ scale: state.isEliminated ? 1 : 0.95 }}
          >
            {t('game.emergency')}
          </motion.button>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-4 gap-4 h-[calc(100vh-120px)]">
          {/* Left Panel - System Diagnostics / Sabotage */}
          <div className="col-span-1 flex flex-col gap-4">
            {isImpostor ? (
              /* Impostor Sabotage Panel */
              <motion.div
                className="panel-space flex-1"
                initial={{ x: -50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
              >
                <h3 className="font-pixel text-lg mb-4 text-red-600">SABOTAGE</h3>
                <div className="space-y-3">
                  <button
                    onClick={() => handleSabotage('oxygen')}
                    className={`w-full btn-space red text-sm ${sabotages.oxygen ? 'bg-red-700' : ''}`}
                  >
                    <Zap className="inline w-4 h-4 mr-2" />
                    Cut Oxygen
                  </button>
                  <button
                    onClick={() => handleSabotage('sensors')}
                    className={`w-full btn-space red text-sm ${sabotages.sensors ? 'bg-red-700' : ''}`}
                  >
                    <Radio className="inline w-4 h-4 mr-2" />
                    Jam Sensors
                  </button>
                </div>
                
                {/* Fake Tests */}
                <div className="mt-6">
                  <h4 className="font-game text-xl mb-2 text-gray-700">Fake Tests</h4>
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-2 p-2 bg-white/50 border-2 border-brown-dark">
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                        <span className="font-game text-lg">Test {i}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : (
              /* Civilian Test Cases */
              <motion.div
                className="panel-space flex-1"
                initial={{ x: -50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
              >
                <h3 className="font-pixel text-lg mb-4 text-green-600">SYSTEM DIAGNOSTICS</h3>
                <div className="space-y-3">
                  {['Input validation', 'Edge case handling', 'Output format'].map((test, i) => (
                    <motion.div
                      key={i}
                      className={`p-3 border-3 ${testResults[i] ? 'border-green-500 bg-green-50' : 'border-gray-400 bg-white/50'}`}
                      animate={testResults[i] ? { scale: [1, 1.05, 1] } : {}}
                    >
                      <div className="flex items-center gap-2">
                        {testResults[i] ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                        ) : (
                          <XCircle className="w-5 h-5 text-gray-400" />
                        )}
                        <span className="font-game text-lg text-gray-900">{test}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
                
                <button
                  onClick={mockTestValidation}
                  className="btn-space green w-full mt-4 text-sm"
                >
                  Run Tests
                </button>
              </motion.div>
            )}

            {/* Players List */}
            <div className="panel-space flex-shrink-0">
              <h3 className="font-pixel text-sm mb-3 text-gray-900">{t('game.players')}</h3>
              
              <div className="space-y-2">
                <p className="font-game text-lg text-green-600">{t('game.alive')}</p>
                {alivePlayers.map((player, index) => (
                  <div key={player.id} className="flex items-center gap-2">
                    <Ship type={getShipType(playerList.indexOf(player))} size="sm" />
                    <span className="font-game text-lg text-gray-900">
                      {player.username}
                      {player.id === state.playerId && ' (You)'}
                    </span>
                  </div>
                ))}
              </div>

              {eliminatedPlayers.length > 0 && (
                <div className="space-y-2 mt-4">
                  <p className="font-game text-lg text-red-600">{t('game.eliminated')}</p>
                  {eliminatedPlayers.map((player, index) => (
                    <div key={player.id} className="flex items-center gap-2 opacity-50">
                      <Ship type={getShipType(playerList.indexOf(player))} size="sm" />
                      <span className="font-game text-lg line-through text-gray-600">
                        {player.username}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Center - Editor */}
          <div className="col-span-3 flex flex-col gap-4">
            {/* Task Description */}
            <motion.div
              className="panel-space"
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
            >
              <h3 className="font-pixel text-lg mb-2 text-gray-900">{t('game.task')}</h3>
              <p className="font-game text-xl text-gray-700">
                {state.task?.description || 'Loading task...'}
              </p>
            </motion.div>

            {/* Monaco Editor */}
            <div className="flex-1 border-4 border-brown-dark overflow-hidden shadow-pixel">
              <Editor
                height="100%"
                defaultLanguage="javascript"
                theme="vs-dark"
                onMount={handleEditorDidMount}
                options={{
                  minimap: { enabled: false },
                  fontSize: 16,
                  readOnly: state.isEliminated,
                  fontFamily: 'Consolas, monospace',
                }}
              />
            </div>

            {/* Chat */}
            <div className="panel-space h-64 flex flex-col">
              <h3 className="font-pixel text-sm mb-3 text-gray-900">{t('game.chat')}</h3>
              
              <div className="flex-1 overflow-y-auto mb-3 space-y-2 min-h-0">
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
                <div ref={chatEndRef} />
              </div>

              {!state.isEliminated && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Type..."
                    className="input-space flex-1 text-lg py-2"
                  />
                  <button
                    onClick={handleSendMessage}
                    className="btn-space green text-xs px-4"
                  >
                    {t('common.send')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}