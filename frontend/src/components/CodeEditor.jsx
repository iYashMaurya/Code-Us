import React, { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useGame } from '../context/GameContext';
import { motion, AnimatePresence } from 'framer-motion';
import Starfield from './Starfield';
import { Clock, Loader2, AlertTriangle, Snowflake } from 'lucide-react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';

import TaskPanel from './game/TaskPanel';
import ControlPanel from './game/ControlPanel';
import SabotagePanel from './game/SabotagePanel';
import ChatPanel from './game/ChatPanel';
import PlayersList from './game/PlayerList';

export default function CodeEditor({ onEmergency }) {
  const { state } = useGame();
  const editorRef = useRef(null);
  const [chatMessage, setChatMessage] = useState('');
  const chatEndRef = useRef(null);
  const terminalEndRef = useRef(null);
  
  const [editorReady, setEditorReady] = useState(false);
  
  const yjsProviderRef = useRef(null);
  const yjsBindingRef = useRef(null);
  const yjsDocRef = useRef(null);
  const awarenessTimerRef = useRef(null);

  const [isFrozen, setIsFrozen] = useState(false);
  const [sabotageType, setSabotageType] = useState(null);
  const [freezeTimeLeft, setFreezeTimeLeft] = useState(0);

  const playerList = Object.values(state.players || {});
  const isImpostor = state.role === 'IMPOSTER';
  const isTerminalBusy = state.isTerminalBusy;
  const currentRunner = state.currentRunner;
  const terminalLogs = state.terminalLogs;
  const isMyTest = state.currentRunnerID === state.playerId;
  const currentStage = state.currentStage;
  const timerSeconds = state.timerSeconds;
  const tasksComplete = state.tasksComplete;
  const userLang = state.language || 'en'; // 🔥 NEW: Get user language


  const WS_BASE =
  import.meta.env.VITE_WS_URL || 'ws://localhost:8080';


  // Auto-scroll chat
  useEffect(() => {
    requestAnimationFrame(() => {
      chatEndRef.current?.scrollIntoView({ 
        behavior: 'smooth',
        block: 'nearest',
      });
    });
  }, [state.messages]);

  // Sabotage listeners
  useEffect(() => {
    if (!state.ws) return;

    const handleSabotage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === 'SABOTAGE_STARTED' && message.data.type === 'FREEZE') {
          console.log('❄️ FREEZE sabotage activated!');
          setIsFrozen(true);
          setSabotageType('FREEZE');
          
          const duration = message.data.duration || 5000;
          setFreezeTimeLeft(Math.floor(duration / 1000));
          
          const countdownInterval = setInterval(() => {
            setFreezeTimeLeft(prev => {
              if (prev <= 1) {
                clearInterval(countdownInterval);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
          
          setTimeout(() => {
            setIsFrozen(false);
            setSabotageType(null);
            setFreezeTimeLeft(0);
          }, duration);
        }

        if (message.type === 'SABOTAGE_ENDED' && message.data.type === 'FREEZE') {
          console.log('✅ FREEZE sabotage ended');
          setIsFrozen(false);
          setSabotageType(null);
          setFreezeTimeLeft(0);
        }

        if (message.type === 'SABOTAGE_CORRUPT') {
          console.log('🦠 CORRUPT sabotage - injecting malware');
          
          const malware = message.data.malware;
          
          if (editorRef.current) {
            const currentCode = editorRef.current.getValue();
            const newCode = malware + currentCode;
            editorRef.current.setValue(newCode);
          }
          
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

  // Yjs initialization with stage handling
  useEffect(() => {
    if (!state.roomId || !editorReady || !editorRef.current || !state.task) {
      console.log('⏳ Waiting for editor readiness...');
      return;
    }

    const model = editorRef.current.getModel();
    if (!model) {
      console.error('❌ Monaco model not found!');
      return;
    }

    console.log('🔄 Setting up Yjs for Stage', currentStage);

    // Clean up previous binding
    if (yjsBindingRef.current) {
      console.log('🧹 Destroying old binding');
      yjsBindingRef.current.destroy();
      yjsBindingRef.current = null;
    }

    // Create NEW doc for new stage
    if (yjsDocRef.current) {
      yjsDocRef.current.destroy();
    }
    const doc = new Y.Doc();
    yjsDocRef.current = doc;
    
    const yjsRoomId = `${state.roomId}-stage${currentStage}`;
    const wsUrl = `${WS_BASE}/yjs`;
    
    // Create provider for this stage
    if (yjsProviderRef.current) {
      console.log('🧹 Disconnecting old provider');
      yjsProviderRef.current.disconnect();
      yjsProviderRef.current.destroy();
    }
    
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
    
    // Set initial template when doc is empty
    let templateLoaded = false;
    
    provider.on('sync', (isSynced) => {
      if (isSynced) {
        console.log('✅ Yjs synced for Stage', currentStage);
        
        if (!templateLoaded && yText.toString().trim() === '') {
          console.log('📝 Loading template (document empty)');
          yText.insert(0, state.task.template);
          templateLoaded = true;
        }
      }
    });
    
    // Fallback: load template after brief delay
    setTimeout(() => {
      if (!templateLoaded && yText.toString().trim() === '') {
        console.log('📝 Loading template (fallback)');
        yText.insert(0, state.task.template);
        templateLoaded = true;
      }
    }, 500);

    // Create Monaco binding
    console.log('🔗 Creating Monaco binding for Stage', currentStage);
    const binding = new MonacoBinding(
      yText,
      model,
      new Set([editorRef.current]),
      provider.awareness
    );
    yjsBindingRef.current = binding;

    // Set awareness (cursor colors)
    const playerIndex = playerList.findIndex(p => p.id === state.playerId);
    const userColor = getPlayerColor(playerIndex);
    
    provider.awareness.setLocalStateField('user', {
      name: state.username || 'Anonymous',
      color: userColor,
      colorLight: userColor + '80',
    });

    // Keep awareness alive (heartbeat)
    if (awarenessTimerRef.current) {
      clearInterval(awarenessTimerRef.current);
    }
    awarenessTimerRef.current = setInterval(() => {
      if (provider && provider.awareness && !state.isEliminated) {
        provider.awareness.setLocalStateField('user', {
          name: state.username || 'Anonymous',
          color: userColor,
          colorLight: userColor + '80',
        });
      }
    }, 5000);

    // Cleanup
    return () => {
      console.log('🧹 Cleaning up Yjs for Stage', currentStage);
      
      if (awarenessTimerRef.current) {
        clearInterval(awarenessTimerRef.current);
      }
      
      if (yjsBindingRef.current) {
        yjsBindingRef.current.destroy();
        yjsBindingRef.current = null;
      }
      
      if (yjsProviderRef.current) {
        setTimeout(() => {
          if (yjsProviderRef.current) {
            yjsProviderRef.current.disconnect();
            yjsProviderRef.current.destroy();
            yjsProviderRef.current = null;
          }
        }, 100);
      }
      
      if (yjsDocRef.current) {
        yjsDocRef.current.destroy();
        yjsDocRef.current = null;
      }
    };
  }, [state.roomId, editorReady, state.task?.id, currentStage, state.playerId, state.username]);

  // Update editor read-only state
  useEffect(() => {
    if (!editorRef.current) return;

    const shouldBeReadOnly = state.isEliminated || isFrozen;
    editorRef.current.updateOptions({ readOnly: shouldBeReadOnly });
    
    // Remove awareness when eliminated
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
      
      {/* FREEZE OVERLAY */}
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

      {/* CORRUPT FLASH */}
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
      
      {/* Top Banner - Compilation in Progress */}
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
        {/* Header */}
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

            {/* Timer */}
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

        {/* Main Grid */}
        <div className="grid grid-cols-4 gap-4 h-[calc(100vh-120px)]">
          {/* Left Sidebar */}
          <div className="col-span-1 flex flex-col gap-4">
            {isImpostor ? (
              <SabotagePanel 
                onSabotage={handleSabotage} 
                isFrozen={isFrozen} 
                ws={state.ws} 
              />
            ) : (
              <ControlPanel
                stageTitle={getStageTitle(currentStage)}
                onRunTests={handleRunTests}
                isBusy={isTerminalBusy}
                isFrozen={isFrozen}
                isEliminated={state.isEliminated}
                runnerName={currentRunner}
                isMyTest={isMyTest}
                terminalLogs={terminalLogs}
                terminalEndRef={terminalEndRef}
                currentStage={currentStage}
              />
            )}

            <PlayersList 
              players={state.players} 
              currentPlayerId={state.playerId} 
            />
          </div>

          {/* Main Content */}
          <div className="col-span-3 flex flex-col gap-4">
            <TaskPanel task={state.task} />

            {/* Code Editor */}
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

            {/* 🔥 UPDATED: Pass userLang to ChatPanel */}
            <ChatPanel
              messages={state.messages}
              chatMessage={chatMessage}
              onMessageChange={(e) => setChatMessage(e.target.value)}
              onSendMessage={handleSendMessage}
              isEliminated={state.isEliminated}
              isFrozen={isFrozen}
              chatEndRef={chatEndRef}
              userLang={userLang}
            />
          </div>
        </div>
      </div>
    </div>
  );
}