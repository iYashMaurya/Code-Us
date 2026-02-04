import React, { createContext, useContext, useReducer, useEffect } from 'react';

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
  
  // Game state
  phase: 'LOBBY',
  role: null,
  isEliminated: false,
  mode: null,
  task: null,
  
  // Test Execution State (NEW)
  isTerminalBusy: false,      // Global lock for test execution
  currentRunner: null,         // Username of player running tests
  currentRunnerID: null,       // ID of player running tests
  terminalLogs: [],            // Terminal output lines
  testProgress: {              // Individual test status
    task1: false,
    task2: false,
    task3: false,
  },
  
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
      return { ...state, votes: action.payload };
    
    case 'SET_LANGUAGE':
      localStorage.setItem('language', action.payload);
      return { ...state, language: action.payload };
    
    case 'SET_ROOM_ID':
      return { ...state, roomId: action.payload };
    
    case 'SET_PLAYERS':
      return { ...state, players: action.payload };
    
    case 'SET_PHASE':
      if (action.payload === 'DISCUSSION') {
        return { ...state, phase: action.payload, votes: {} };
      }
      return { ...state, phase: action.payload };
    
    case 'SET_ROLE':
      return { ...state, role: action.payload };
    
    case 'SET_ELIMINATED':
      return { ...state, isEliminated: action.payload };
    
    case 'SET_GAME_STATE':
      const { phase, players, mode, task, testRunning, testRunner } = action.payload;
      const currentPlayer = players?.[state.playerId];
      return {
        ...state,
        phase: phase || state.phase,
        players: players || state.players,
        mode: mode || state.mode,
        task: task || state.task,
        role: currentPlayer?.role || state.role,
        isEliminated: currentPlayer?.isEliminated || state.isEliminated,
        isTerminalBusy: testRunning || false,
        currentRunner: testRunner || null,
      };
    
    // NEW: Test execution actions
    case 'TEST_LOCKED':
      return {
        ...state,
        isTerminalBusy: true,
        currentRunner: action.payload.runner,
        currentRunnerID: action.payload.runnerID,
        terminalLogs: [
          ...state.terminalLogs,
          `🔒 ${action.payload.runner} is running system diagnostics...`,
        ],
      };
    
    case 'TEST_COMPLETE':
      const results = action.payload.results || [false, false, false];
      return {
        ...state,
        isTerminalBusy: false,
        currentRunner: null,
        currentRunnerID: null,
        testProgress: {
          task1: results[0],
          task2: results[1],
          task3: results[2],
        },
        terminalLogs: [
          ...state.terminalLogs,
          ...(action.payload.logs || []),
        ],
      };
    
    case 'TEST_CANCELLED':
      return {
        ...state,
        isTerminalBusy: false,
        currentRunner: null,
        currentRunnerID: null,
        terminalLogs: [
          ...state.terminalLogs,
          `⚠️ Test cancelled: ${action.payload.reason}`,
        ],
      };
    
    case 'ERROR_BUSY':
      return {
        ...state,
        terminalLogs: [
          ...state.terminalLogs,
          `❌ ${action.payload.message}`,
          `⏳ ${action.payload.runner} is currently running tests...`,
        ],
      };
    
    case 'CLEAR_TERMINAL':
      return { ...state, terminalLogs: [] };
    
    case 'ADD_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, action.payload],
      };
    
    case 'CLEAR_MESSAGES':
      return { ...state, messages: [] };
    
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