// Add these to CodeEditor.jsx - Enhanced with Sabotage Support

import React, { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useGame } from '../context/GameContext';
import { useTranslation } from '../utils/translations';
import { motion, AnimatePresence } from 'framer-motion';
import Starfield from './Starfield';
import Ship, { getShipType } from './Ship';
import { CheckCircle2, XCircle, Zap, Radio, Clock, Loader2, Terminal, AlertTriangle, Snowflake, Bug } from 'lucide-react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';

export default function CodeEditor({ onEmergency }) {
  const { state } = useGame();
  const { t } = useTranslation(state.language);
  const editorRef = useRef(null);
  const [chatMessage, setChatMessage] = useState('');
  const chatEndRef = useRef(null);
  const terminalEndRef = useRef(null);
  
  const [editorReady, setEditorReady] = useState(false);
  const yjsProviderRef = useRef(null);
  const yjsBindingRef = useRef(null);
  const yjsDocRef = useRef(null);

  // SABOTAGE STATE (NEW)
  const [isFrozen, setIsFrozen] = useState(false);
  const [sabotageType, setSabotageType] = useState(null);
  const [freezeTimeLeft, setFreezeTimeLeft] = useState(0);

  const playerList = Object.values(state.players || {});
  const alivePlayers = playerList.filter(p => p.isAlive);
  const eliminatedPlayers = playerList.filter(p => p.isEliminated);
  const isImpostor = state.role === 'IMPOSTOR';

  const isTerminalBusy = state.isTerminalBusy;
  const currentRunner = state.currentRunner;
  const terminalLogs = state.terminalLogs;
  const isMyTest = state.currentRunnerID === state.playerId;
  
  const currentStage = state.currentStage;
  const timerSeconds = state.timerSeconds;
  const tasksComplete = state.tasksComplete;

  // Scroll effects
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalLogs]);

  // SABOTAGE LISTENER (NEW)
  useEffect(() => {
    if (!state.ws) return;

    const handleSabotage = (event) => {
      try {
        const message = JSON.parse(event.data);

        // FREEZE SABOTAGE
        if (message.type === 'SABOTAGE_STARTED' && message.data.type === 'FREEZE') {
          console.log('❄️ FREEZE sabotage activated!');
          setIsFrozen(true);
          setSabotageType('FREEZE');
          
          const duration = message.data.duration || 5000;
          setFreezeTimeLeft(Math.floor(duration / 1000));
          
          // Countdown timer for visual feedback
          const countdownInterval = setInterval(() => {
            setFreezeTimeLeft(prev => {
              if (prev <= 1) {
                clearInterval(countdownInterval);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
          
          // Auto-unfreeze after duration
          setTimeout(() => {
            setIsFrozen(false);
            setSabotageType(null);
            setFreezeTimeLeft(0);
          }, duration);
        }

        // FREEZE END (backup in case of early end)
        if (message.type === 'SABOTAGE_ENDED' && message.data.type === 'FREEZE') {
          console.log('✅ FREEZE sabotage ended');
          setIsFrozen(false);
          setSabotageType(null);
          setFreezeTimeLeft(0);
        }

        // CORRUPT SABOTAGE
        if (message.type === 'SABOTAGE_CORRUPT') {
          console.log('🦠 CORRUPT sabotage - injecting malware');
          
          const malware = message.data.malware;
          
          // Inject malware at top of code
          if (editorRef.current) {
            const currentCode = editorRef.current.getValue();
            const newCode = malware + currentCode;
            editorRef.current.setValue(newCode);
          }
          
          // Flash red effect
          setSabotageType('CORRUPT');
          setTimeout(() => setSabotageType(null), 2000);
        }
      } catch (error) {
        console.error('Error handling sabotage:', error);
      }
    };

    state.ws.addEventListener('message', handleSabotage);
    return () => state.ws?.removeEventListener('message', handleSabotage);
  }, [state.ws]);

  // Yjs initialization (same as before)
  useEffect(() => {
    if (!state.roomId || !editorReady || !editorRef.current || !state.task) {
      return;
    }

    if (yjsProviderRef.current) {
      console.log('🧹 Cleaning up previous Yjs connection');
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
    }

    console.log('🔄 Initializing Yjs for Stage', currentStage);

    const doc = new Y.Doc();
    yjsDocRef.current = doc;
    
    const yjsRoomId = `${state.roomId}-stage${currentStage}`;
    const wsUrl = 'ws://localhost:8080/yjs';
    
    const provider = new WebsocketProvider(
      wsUrl,
      yjsRoomId,
      doc,
      {
        connect: true,
        params: { room: yjsRoomId }
      }
    );
    yjsProviderRef.current = provider;

    const yText = doc.getText('monaco');
    
    let templateLoaded = false;
    
    provider.on('sync', (isSynced) => {
      if (isSynced && !templateLoaded && yText.toString() === '') {
        console.log('📝 Setting initial template for Stage', currentStage);
        yText.insert(0, state.task.template);
        templateLoaded = true;
      }
    });
    
    setTimeout(() => {
      if (!templateLoaded && yText.toString() === '') {
        console.log('📝 Setting initial template (first connection) for Stage', currentStage);
        yText.insert(0, state.task.template);
        templateLoaded = true;
      }
    }, 500);

    const model = editorRef.current.getModel();
    if (!model) {
      console.error('❌ Monaco model not found!');
      return;
    }

    console.log('🔗 Creating Monaco binding for Stage', currentStage);
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

    return () => {
      console.log('🧹 Cleaning up Yjs connection for Stage', currentStage);
      
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
  }, [state.roomId, editorReady, state.task?.id, currentStage, state.playerId, state.username]);

  // Update editor read-only state based on elimination AND freeze
  useEffect(() => {
    if (!editorRef.current) return;

    const shouldBeReadOnly = state.isEliminated || isFrozen;
    editorRef.current.updateOptions({ readOnly: shouldBeReadOnly });
    
    if (state.isEliminated && yjsProviderRef.current) {
      yjsProviderRef.current.awareness.setLocalState(null);
    }
  }, [state.isEliminated, isFrozen]);

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

  // SABOTAGE HANDLERS (NEW)
  const handleSabotage = (type) => {
    if (!isImpostor) return;
    
    console.log('💀 Activating sabotage:', type);
    
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({
        type: 'SABOTAGE',
        data: { type }
      }));
    }
  };

  const handleRunTests = () => {
    if (isTerminalBusy || state.isEliminated || isFrozen) return;

    const code = editorRef.current?.getValue() || '';
    
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      console.log('📤 Sending RUN_TESTS request for Stage', currentStage);
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

  const getStageTitle = (stage) => {
    const titles = {
      1: '🔧 Engine Room',
      2: '🛰️ Navigation',
      3: '💨 Oxygen System'
    };
    return titles[stage] || 'Unknown';
  };

  return (
    <div className="min-h-screen relative">
      <Starfield />
      
      {/* FREEZE SABOTAGE OVERLAY (NEW) */}
      <AnimatePresence>
        {isFrozen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, rgba(29, 78, 216, 0.5) 100%)',
            }}
          >
            <div className="flex items-center justify-center h-full">
              <motion.div
                animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
                transition={{ duration: 0.5, repeat: Infinity }}
                className="text-center"
              >
                <Snowflake className="w-32 h-32 text-blue-200 mx-auto mb-4" />
                <h1 className="font-pixel text-6xl text-white mb-4" style={{ textShadow: '0 0 20px #60a5fa' }}>
                  SYSTEM JAMMED
                </h1>
                <p className="font-game text-3xl text-blue-200">
                  Unfreezing in {freezeTimeLeft}s...
                </p>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CORRUPT FLASH (NEW) */}
      <AnimatePresence>
        {sabotageType === 'CORRUPT' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.7, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="fixed inset-0 z-40 pointer-events-none bg-red-600"
          />
        )}
      </AnimatePresence>
      
      {/* Top Banner */}
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
        {/* Header with Timer and Controls - same as before */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-4 items-center">
            <div className="panel-space-sm px-6 py-3">
              <div className="flex items-center gap-3">
                <span className="font-pixel text-xl text-gray-900">
                  STAGE {currentStage}/3
                </span>
                <div className="flex gap-1">
                  {[1, 2, 3].map(stage => (
                    <div
                      key={stage}
                      className={`w-3 h-3 rounded-full border-2 border-brown-dark ${
                        tasksComplete[stage] 
                          ? 'bg-green-500' 
                          : stage === currentStage 
                            ? 'bg-orange animate-pulse' 
                            : 'bg-gray-400'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Timer with better visibility */}
            <motion.div
              className="panel-space-sm px-6 py-3 flex items-center gap-3"
              style={{
                backgroundColor: timerSeconds < 20 
                  ? '#dc2626' 
                  : timerSeconds < 40 
                    ? '#ea580c' 
                    : '#16a34a',
                borderColor: '#3E2723',
                borderWidth: '4px',
                boxShadow: timerSeconds < 20 
                  ? '0 0 20px rgba(220, 38, 38, 0.6), 0 4px 0 rgba(0,0,0,0.8)'
                  : '0 4px 0 rgba(0,0,0,0.8)',
              }}
              animate={timerSeconds < 20 ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 0.5, repeat: timerSeconds < 20 ? Infinity : 0 }}
            >
              <Clock className="w-6 h-6 text-white drop-shadow-lg" />
              <span 
                className="font-pixel text-2xl font-bold"
                style={{ 
                  color: '#FFFFFF',
                  textShadow: '3px 3px 6px rgba(0,0,0,0.9)',
                }}
              >
                {formatTime(timerSeconds)}
              </span>
              {timerSeconds < 20 && (
                <AlertTriangle className="w-6 h-6 text-yellow-300 animate-pulse" />
              )}
            </motion.div>
            
            {state.isEliminated && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="panel-space-sm px-4 py-2 bg-red-500"
              >
                <span className="font-pixel text-sm text-white">
                  SPECTATOR
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
            EMERGENCY MEETING
          </motion.button>
        </div>

        <div className="grid grid-cols-4 gap-4 h-[calc(100vh-120px)]">
          <div className="col-span-1 flex flex-col gap-4">
            {/* IMPOSTOR SABOTAGE PANEL (ENHANCED) */}
            {isImpostor ? (
              <motion.div
                className="panel-space flex-1"
                initial={{ x: -50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
              >
                <h3 className="font-pixel text-lg mb-4 text-red-600">SABOTAGE</h3>
                <div className="space-y-3">
                  <button
                    onClick={() => handleSabotage('FREEZE')}
                    disabled={isFrozen}
                    className={`w-full btn-space red text-sm flex items-center justify-center gap-2 ${
                      isFrozen ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <Snowflake className="w-4 h-4" />
                    Jam Comms (5s)
                  </button>
                  <button
                    onClick={() => handleSabotage('CORRUPT')}
                    className="w-full btn-space red text-sm flex items-center justify-center gap-2"
                  >
                    <Bug className="w-4 h-4" />
                    Inject Malware
                  </button>
                </div>
                
                <div className="mt-4 p-3 bg-red-100 border-2 border-red-500 rounded">
                  <p className="font-pixel text-xs text-red-800 mb-2">IMPOSTOR TIPS:</p>
                  <p className="font-game text-sm text-gray-800">
                    • Jam: Freezes typing for 5s
                    <br />
                    • Corrupt: Adds code errors
                  </p>
                </div>
              </motion.div>
            ) : (
              /* CIVILIAN PANEL - same as before */
              <motion.div
                className="panel-space flex-1"
                initial={{ x: -50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
              >
                <h3 className="font-pixel text-sm mb-4 text-green-600">
                  {getStageTitle(currentStage)}
                </h3>
                
                <button
                  onClick={handleRunTests}
                  disabled={isTerminalBusy || state.isEliminated || isFrozen}
                  className={`btn-space green w-full text-sm flex items-center justify-center gap-2 ${
                    isTerminalBusy || state.isEliminated || isFrozen ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isTerminalBusy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {isMyTest ? 'Testing...' : `${currentRunner} testing...`}
                    </>
                  ) : isFrozen ? (
                    <>
                      <Snowflake className="w-4 h-4" />
                      Systems Frozen
                    </>
                  ) : (
                    <>
                      <Terminal className="w-4 h-4" />
                      Run Tests
                    </>
                  )}
                </button>

                {/* Terminal Output */}
                <div className="mt-4 bg-black border-4 border-brown-dark p-3 h-64 overflow-y-auto font-mono text-xs">
                  {terminalLogs.length === 0 ? (
                    <div className="text-green-400">$ Stage {currentStage} ready...</div>
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

            {/* Players List - same as before */}
            <div className="panel-space flex-shrink-0">
              <h3 className="font-pixel text-sm mb-3 text-gray-900">PLAYERS</h3>
              
              <div className="space-y-2">
                <p className="font-game text-lg text-green-600">ALIVE</p>
                {alivePlayers.map((player) => (
                  <div key={player.id} className="flex items-center gap-2">
                    <Ship type={getShipType(playerList.indexOf(player))} size="sm" />
                    <span className="font-game text-sm text-gray-900">
                      {player.username}
                      {player.id === state.playerId && ' (You)'}
                    </span>
                  </div>
                ))}
              </div>

              {eliminatedPlayers.length > 0 && (
                <div className="space-y-2 mt-4">
                  <p className="font-game text-lg text-red-600">ELIMINATED</p>
                  {eliminatedPlayers.map((player) => (
                    <div key={player.id} className="flex items-center gap-2 opacity-50">
                      <Ship type={getShipType(playerList.indexOf(player))} size="sm" />
                      <span className="font-game text-sm line-through text-gray-600">
                        {player.username}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="col-span-3 flex flex-col gap-4">
            {/* Task Description */}
            <motion.div
              className="panel-space"
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              key={state.task?.id}
            >
              <h3 className="font-pixel text-xl mb-2 text-gray-900">
                {state.task?.title || 'Loading...'}
              </h3>
              <p className="font-game text-lg text-gray-700">
                {state.task?.description || 'Waiting for task data...'}
              </p>
            </motion.div>

            {/* Code Editor with freeze overlay */}
            <div className="flex-1 border-4 border-brown-dark overflow-hidden shadow-pixel relative">
              {isFrozen && (
                <div className="absolute inset-0 z-10 bg-blue-900 bg-opacity-50 flex items-center justify-center">
                  <div className="text-center">
                    <Snowflake className="w-16 h-16 text-blue-200 mx-auto animate-spin" />
                    <p className="font-pixel text-white mt-4">FROZEN</p>
                  </div>
                </div>
              )}
              
              <Editor
                key={state.task?.id}
                height="100%"
                defaultLanguage="java"
                theme="vs-dark"
                defaultValue={state.task?.template || ''}
                onMount={handleEditorDidMount}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  readOnly: state.isEliminated || isFrozen,
                  fontFamily: 'Consolas, monospace',
                  automaticLayout: true,
                }}
              />
            </div>

            {/* Chat - same as before */}
            <div className="panel-space h-48 flex flex-col">
              <h3 className="font-pixel text-sm mb-3 text-gray-900">CHAT</h3>
              
              <div className="flex-1 overflow-y-auto mb-3 space-y-2 min-h-0">
                {state.messages.map((msg, index) => (
                  <div key={index} className="chat-message-space">
                    {msg.system ? (
                      <span className="font-game text-sm italic text-gray-600">{msg.text}</span>
                    ) : (
                      <>
                        <span className="font-game text-sm font-bold text-orange">
                          {msg.username}:
                        </span>
                        <span className="font-game text-sm ml-2 text-gray-900">{msg.text}</span>
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
                    className="input-space flex-1 text-sm py-1"
                    disabled={isFrozen}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={isFrozen}
                    className={`btn-space green text-xs px-4 ${isFrozen ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    SEND
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