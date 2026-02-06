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
  votesStatus: {}, // FIX #2: Track who has voted (not who they voted for)
  
  // Multi-Stage Game State
  phase: 'LOBBY',
  currentStage: 0,        // 0=lobby, 1=task1, 2=task2, 3=task3
  timerSeconds: 60,       // Global countdown
  tasksComplete: {},      // {1: true, 2: false, 3: false}
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
      // FIX #2: Store vote status (who has voted)
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
      };
    
    case 'TRANSITION_COMPLETE':
      return {
        ...state,
        isTransitioning: false,
        transitionFrom: null,
        transitionTo: null,
      };
    
    // Test Execution Actions
    case 'TEST_LOCKED':
      return {
        ...state,
        isTerminalBusy: true,
        currentRunner: action.payload.runner,
        currentRunnerID: action.payload.runnerID,
        terminalLogs: [
          ...state.terminalLogs,
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
          ...state.terminalLogs,
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