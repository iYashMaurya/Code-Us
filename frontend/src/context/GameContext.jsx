import React, { createContext, useContext, useReducer } from 'react';

const GameContext = createContext();

const initialState = {
  // Connection
  ws: null,
  connected: false,
  
  // Player info
  playerId: null,
  username: localStorage.getItem('username') || '',
  language: localStorage.getItem('language') || 'en',
  
  // Room info
  roomId: null,
  players: {},
  votes: {},
  votesStatus: {},
  
  // Multi-Stage Game State
  phase: 'LOBBY',
  currentStage: 0,
  timerSeconds: 60,
  tasksComplete: {},
  role: null,
  isEliminated: false,
  
  // Current task data
  task: null,
  
  // Test Execution State
  isTerminalBusy: false,
  currentRunner: null,
  currentRunnerID: null,
  terminalLogs: [],
  
  // Stage Transition State
  isTransitioning: false,
  transitionFrom: null,
  transitionTo: null,
  
  // UI state
  messages: [],
};

function gameReducer(state, action) {
  switch (action.type) {
    case 'SET_WS':
      return { ...state, ws: action.payload, connected: true };
    
    case 'SET_CONNECTED':
      return { ...state, connected: action.payload };
    
    case 'SET_PLAYER_ID':
      return { ...state, playerId: action.payload };
    
    case 'SET_USERNAME':
      localStorage.setItem('username', action.payload);
      return { ...state, username: action.payload };

    case 'UPDATE_VOTES':
      return { ...state, votesStatus: action.payload.hasVoted || {} };
    
    case 'SET_LANGUAGE':
      localStorage.setItem('language', action.payload);
      return { ...state, language: action.payload };
    
    case 'SET_ROOM_ID':
      return { ...state, roomId: action.payload };
    
    case 'SET_PLAYERS':
      return { ...state, players: action.payload };
    
    case 'SET_PHASE':
      if (action.payload === 'DISCUSSION') {
        return { ...state, phase: action.payload, votes: {}, votesStatus: {} };
      }
      return { ...state, phase: action.payload };
    
    case 'SET_ROLE':
      return { ...state, role: action.payload };
    
    case 'SET_ELIMINATED':
      return { ...state, isEliminated: action.payload };
    
    // Multi-Stage Actions
    case 'SET_GAME_STATE':
      console.log('🔧 [Reducer] SET_GAME_STATE action received');
      console.log('   Payload:', action.payload);
      
      const { 
        phase, 
        players, 
        task, 
        currentStage, 
        timerSeconds, 
        tasksComplete,
        testRunning,
        testRunner 
      } = action.payload;
      
      const currentPlayer = players?.[state.playerId];
      
      console.log('   New phase:', phase);
      console.log('   Current player role:', currentPlayer?.role);
      console.log('   Current stage:', currentStage);
      
      const newState = {
        ...state,
        phase: phase || state.phase,
        players: players || state.players,
        task: task || state.task,
        currentStage: currentStage !== undefined ? currentStage : state.currentStage,
        timerSeconds: timerSeconds !== undefined ? timerSeconds : state.timerSeconds,
        tasksComplete: tasksComplete || state.tasksComplete,
        role: currentPlayer?.role || state.role,
        isEliminated: currentPlayer?.isEliminated || state.isEliminated,
        isTerminalBusy: testRunning || false,
        currentRunner: testRunner || null,
      };
      
      console.log('   New state phase:', newState.phase);
      console.log('   New state role:', newState.role);
      console.log('✅ [Reducer] State updated');
      
      return newState;
    
    case 'SYNC_TIMER':
      return {
        ...state,
        timerSeconds: action.payload.timerSeconds,
      };
    
    case 'CHANGE_SCENE':
      return {
        ...state,
        isTransitioning: true,
        transitionFrom: action.payload.fromStage,
        transitionTo: action.payload.toStage,
        terminalLogs: [],
      };
    
    case 'TRANSITION_COMPLETE':
      return {
        ...state,
        isTransitioning: false,
        transitionFrom: null,
        transitionTo: null,
      };
    
    case 'TEST_LOCKED':
      return {
        ...state,
        isTerminalBusy: true,
        currentRunner: action.payload.runner,
        currentRunnerID: action.payload.runnerID,
        terminalLogs: [
          ...state.terminalLogs.slice(-50),
          `🔒 ${action.payload.runner} is running Stage ${action.payload.stage} diagnostics...`,
        ],
      };
    
    case 'TEST_COMPLETE':
      const passed = action.payload.passed;
      const stage = action.payload.stage;
      
      return {
        ...state,
        isTerminalBusy: false,
        currentRunner: null,
        currentRunnerID: null,
        terminalLogs: [
          ...state.terminalLogs.slice(-50),
          `${passed ? '✅' : '❌'} Stage ${stage} test ${passed ? 'PASSED' : 'FAILED'}`,
          passed ? `🚀 Advancing to Stage ${stage + 1}...` : '🔄 Try again!',
        ],
      };
    
    case 'TEST_CANCELLED':
      return {
        ...state,
        isTerminalBusy: false,
        currentRunner: null,
        currentRunnerID: null,
        terminalLogs: [
          ...state.terminalLogs.slice(-50),
          `⚠️ Test cancelled: ${action.payload.reason}`,
        ],
      };
    
    case 'ERROR_BUSY':
      return {
        ...state,
        terminalLogs: [
          ...state.terminalLogs.slice(-50),
          `❌ ${action.payload.message}`,
          `⏳ Another player is currently running tests...`,
        ],
      };
    
    case 'CLEAR_TERMINAL':
      return { ...state, terminalLogs: [] };
    
    // 🔥 FIXED: Handle chat messages properly with deduplication
    case 'ADD_MESSAGE':
      const newMessage = action.payload;
      
      // Check if message already exists (prevent duplicates)
      const messageExists = state.messages.some(
        m => m.messageId === newMessage.messageId
      );
      
      if (messageExists) {
        console.log('⚠️ Duplicate message detected, skipping:', newMessage.messageId);
        return state;
      }
      
      console.log('✅ Adding new message:', newMessage.messageId);
      return {
        ...state,
        messages: [...state.messages.slice(-100), newMessage],
      };
    
    case 'CLEAR_MESSAGES':
      return { ...state, messages: [] };
    
    // 🔥 Handle translation updates (when translations arrive later)
    case 'UPDATE_MESSAGE_TRANSLATION':
      console.log('🌐 Updating translation for:', action.payload.messageId);
      return {
        ...state,
        messages: state.messages.map(m => 
          m.messageId === action.payload.messageId 
            ? { 
                ...m, 
                translations: { ...m.translations, ...action.payload.translations }, 
                translationId: Date.now() // Force re-render
              } 
            : m
        )
      };
    
    case 'RESET':
      return {
        ...initialState,
        username: state.username,
        language: state.language,
      };
    
    default:
      return state;
  }
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within GameProvider');
  }
  return context;
}