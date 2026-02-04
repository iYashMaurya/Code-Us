import React, { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useGame } from '../context/GameContext';
import { useTranslation } from '../utils/translations';
import { motion, AnimatePresence } from 'framer-motion';
import Starfield from './Starfield';
import Ship, { getShipType } from './Ship';
import { CheckCircle2, XCircle, Zap, Radio, Clock, Loader2, Terminal } from 'lucide-react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';

export default function CodeEditor({ onEmergency }) {
  const { state } = useGame();
  const { t } = useTranslation(state.language);
  const editorRef = useRef(null);
  const [chatMessage, setChatMessage] = useState('');
  const [sabotages, setSabotages] = useState({ oxygen: false, sensors: false });
  const [timeLeft, setTimeLeft] = useState(600);
  const chatEndRef = useRef(null);
  const terminalEndRef = useRef(null);
  
  const [editorReady, setEditorReady] = useState(false);
  const yjsProviderRef = useRef(null);
  const yjsBindingRef = useRef(null);
  const yjsDocRef = useRef(null);

  const playerList = Object.values(state.players || {});
  const alivePlayers = playerList.filter(p => p.isAlive);
  const eliminatedPlayers = playerList.filter(p => p.isEliminated);
  const isImpostor = state.role === 'IMPOSTOR';

  // Derived state from context
  const isTerminalBusy = state.isTerminalBusy;
  const currentRunner = state.currentRunner;
  const testProgress = state.testProgress;
  const terminalLogs = state.terminalLogs;

  // Check if current player is the one running tests
  const isMyTest = state.currentRunnerID === state.playerId;

  // Timer countdown
  useEffect(() => {
    if (state.phase === 'CODING') {
      const timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    } else {
      setTimeLeft(600);
    }
  }, [state.phase]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalLogs]);

  // Yjs initialization
  useEffect(() => {
    if (!state.roomId || !editorReady || !editorRef.current) {
      console.log('⏳ Waiting for editor...', { 
        roomId: state.roomId, 
        editorReady, 
        hasEditor: !!editorRef.current 
      });
      return;
    }

    if (yjsProviderRef.current) {
      console.log('✅ Yjs already initialized, skipping');
      return;
    }

    console.log('🔄 Initializing Yjs for room:', state.roomId);

    const doc = new Y.Doc();
    yjsDocRef.current = doc;
    
    const wsUrl = 'ws://localhost:8080/yjs';
    console.log('🔌 Connecting to:', wsUrl);
    
    const provider = new WebsocketProvider(
      wsUrl,
      state.roomId,
      doc,
      {
        connect: true,
        params: { room: state.roomId }
      }
    );
    yjsProviderRef.current = provider;

    provider.on('status', event => {
      console.log('📡 Yjs connection status:', event.status);
    });

    provider.on('sync', isSynced => {
      console.log('🔄 Yjs synced:', isSynced);
    });

    const yText = doc.getText('monaco');
    
    if (state.task?.template && yText.toString() === '') {
      console.log('📝 Setting initial template');
      yText.insert(0, state.task.template);
    }

    const model = editorRef.current.getModel();
    if (!model) {
      console.error('❌ Monaco model not found!');
      return;
    }

    console.log('🔗 Creating Monaco binding');
    const binding = new MonacoBinding(
      yText,
      model,
      new Set([editorRef.current]),
      provider.awareness
    );
    yjsBindingRef.current = binding;

    const playerIndex = playerList.findIndex(p => p.id === state.playerId);
    const userColor = getPlayerColor(playerIndex);
    
    provider.awareness.setLocalStateField('user', {
      name: state.username || 'Anonymous',
      color: userColor,
      colorLight: userColor + '80',
    });

    console.log('✅ Yjs initialization complete!');

    return () => {
      console.log('🧹 Cleaning up Yjs connection');
      
      if (yjsBindingRef.current) {
        yjsBindingRef.current.destroy();
        yjsBindingRef.current = null;
      }
      
      if (yjsProviderRef.current) {
        yjsProviderRef.current.disconnect();
        yjsProviderRef.current.destroy();
        yjsProviderRef.current = null;
      }
      
      if (yjsDocRef.current) {
        yjsDocRef.current.destroy();
        yjsDocRef.current = null;
      }
    };
  }, [state.roomId, editorReady, state.task?.template, state.playerId, state.username]);

  useEffect(() => {
    if (!editorRef.current) return;

    if (state.isEliminated) {
      console.log('👻 Player eliminated, setting read-only');
      editorRef.current.updateOptions({ readOnly: true });
      
      if (yjsProviderRef.current) {
        yjsProviderRef.current.awareness.setLocalState(null);
      }
    } else {
      editorRef.current.updateOptions({ readOnly: false });
    }
  }, [state.isEliminated]);

  const handleEditorDidMount = (editor) => {
    console.log('🎯 Monaco editor mounted');
    editorRef.current = editor;
    setEditorReady(true);
    
    setTimeout(() => {
      if (editor && !state.isEliminated) {
        editor.focus();
      }
    }, 100);
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
  };

  // Send RUN_TESTS message to server
  const handleRunTests = () => {
    if (isTerminalBusy || state.isEliminated) return;

    const code = editorRef.current?.getValue() || '';
    
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      console.log('📤 Sending RUN_TESTS request');
      state.ws.send(JSON.stringify({
        type: 'RUN_TESTS',
        data: { code }
      }));
    }
  };

  const getPlayerColor = (index) => {
    const colors = ['#ff6b6b', '#6ba3ff', '#6ee06e', '#ffb366', '#a78bfa'];
    return colors[index % colors.length];
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const taskDescriptions = [
    'Fix Efficiency Math (0.0 → 0.5)',
    'Fix Altitude Update (Shadowing)',
    'Prevent Loop Overshoot (< not !=)'
  ];

  return (
    <div className="min-h-screen relative">
      <Starfield />
      
      {/* Top Banner - Shows when someone else is running tests */}
      <AnimatePresence>
        {isTerminalBusy && !isMyTest && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-50 bg-blue-500 border-b-4 border-brown-dark px-6 py-4 shadow-pixel"
          >
            <div className="flex items-center justify-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-white" />
              <span className="font-pixel text-sm text-white">
                {currentRunner} is compiling code...
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <div className="relative z-10 p-4">
        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-4 items-center">
            <div className="panel-space-sm px-4 py-2">
              <span className="font-pixel text-sm text-gray-900">
                {t('game.mode')}: {state.mode}
              </span>
            </div>

            <motion.div
              className={`panel-space-sm px-4 py-2 flex items-center gap-2 ${
                timeLeft < 60 ? 'bg-red-500' : 'bg-orange'
              }`}
              animate={timeLeft < 60 ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 0.5, repeat: timeLeft < 60 ? Infinity : 0 }}
            >
              <Clock className="w-5 h-5" />
              <span className="font-pixel text-sm text-white">
                {formatTime(timeLeft)}
              </span>
            </motion.div>
            
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

        <div className="grid grid-cols-4 gap-4 h-[calc(100vh-120px)]">
          <div className="col-span-1 flex flex-col gap-4">
            {isImpostor ? (
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
              <motion.div
                className="panel-space flex-1"
                initial={{ x: -50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
              >
                <h3 className="font-pixel text-lg mb-4 text-green-600">🛰️ MISSION TASKS</h3>
                <div className="space-y-3">
                  {taskDescriptions.map((task, i) => {
                    const isPassed = testProgress[`task${i + 1}`];
                    return (
                      <motion.div
                        key={i}
                        className={`p-3 border-3 ${isPassed ? 'border-green-500 bg-green-50' : 'border-gray-400 bg-white/50'}`}
                        animate={isPassed ? { scale: [1, 1.05, 1] } : {}}
                      >
                        <div className="flex items-center gap-2">
                          {isPassed ? (
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                          ) : (
                            <XCircle className="w-5 h-5 text-gray-400" />
                          )}
                          <span className="font-game text-sm text-gray-900">{task}</span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
                
                <button
                  onClick={handleRunTests}
                  disabled={isTerminalBusy || state.isEliminated}
                  className={`btn-space green w-full mt-4 text-sm flex items-center justify-center gap-2 ${
                    isTerminalBusy || state.isEliminated ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isTerminalBusy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {isMyTest ? 'Testing...' : `${currentRunner} testing...`}
                    </>
                  ) : (
                    <>
                      <Terminal className="w-4 h-4" />
                      Run Tests
                    </>
                  )}
                </button>

                {/* Terminal Output */}
                <div className="mt-4 bg-black border-4 border-brown-dark p-3 h-48 overflow-y-auto font-mono text-xs">
                  {terminalLogs.length === 0 ? (
                    <div className="text-green-400">$ Ready for test execution...</div>
                  ) : (
                    terminalLogs.map((log, i) => (
                      <div key={i} className="text-green-400 mb-1">
                        {log}
                      </div>
                    ))
                  )}
                  <div ref={terminalEndRef} />
                </div>
              </motion.div>
            )}

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

          <div className="col-span-3 flex flex-col gap-4">
            <motion.div
              className="panel-space"
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
            >
              <h3 className="font-pixel text-lg mb-2 text-gray-900">{t('game.task')}</h3>
              <p className="font-game text-xl text-gray-700">
                {state.task?.description || 'Loading mission...'}
              </p>
            </motion.div>

            <div className="flex-1 border-4 border-brown-dark overflow-hidden shadow-pixel">
              <Editor
                height="100%"
                defaultLanguage="java"
                theme="vs-dark"
                defaultValue={state.task?.template || ''}
                onMount={handleEditorDidMount}
                options={{
                  minimap: { enabled: false },
                  fontSize: 16,
                  readOnly: state.isEliminated,
                  fontFamily: 'Consolas, monospace',
                  automaticLayout: true,
                }}
              />
            </div>

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