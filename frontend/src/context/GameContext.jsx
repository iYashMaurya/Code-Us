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
  
  // Game state
  phase: 'LOBBY',
  role: null,
  isEliminated: false,
  mode: null,
  task: null,
  
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
    
    case 'SET_LANGUAGE':
      localStorage.setItem('language', action.payload);
      return { ...state, language: action.payload };
    
    case 'SET_ROOM_ID':
      return { ...state, roomId: action.payload };
    
    case 'SET_PLAYERS':
      return { ...state, players: action.payload };
    
    case 'SET_PHASE':
      return { ...state, phase: action.payload };
    
    case 'SET_ROLE':
      return { ...state, role: action.payload };
    
    case 'SET_ELIMINATED':
      return { ...state, isEliminated: action.payload };
    
    case 'SET_GAME_STATE':
      const { phase, players, mode, task } = action.payload;
      const currentPlayer = players?.[state.playerId];
      return {
        ...state,
        phase: phase || state.phase,
        players: players || state.players,
        mode: mode || state.mode,
        task: task || state.task,
        role: currentPlayer?.role || state.role,
        isEliminated: currentPlayer?.isEliminated || state.isEliminated,
      };
    
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