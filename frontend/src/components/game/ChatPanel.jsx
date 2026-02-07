'use i18n';
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// 🔥 Separate ChatBubble component with translation animation
const ChatBubble = ({ message, userLang }) => {
  return (
    <div className="chat-message-space relative">
      <span className="font-game text-base font-bold text-orange">
        {message.username}:
      </span>
      
      {/* AnimatePresence for smooth translation morphing */}
      <div className="inline-block ml-2 relative">
        <AnimatePresence mode='wait'>
          <motion.span
            key={message.translationId || 'original'} // Key change triggers animation
            initial={{ opacity: 0, filter: 'blur(3px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, position: 'absolute' }}
            transition={{ duration: 0.4 }}
            className="font-game text-base text-gray-900"
          >
            {/* Show translation if available and matches user lang, else show original */}
            {message.translations && message.translations[userLang] 
              ? message.translations[userLang] 
              : message.text}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default function ChatPanel({ 
  messages, 
  chatMessage, 
  onMessageChange, 
  onSendMessage, 
  isEliminated, 
  isFrozen,
  chatEndRef,
  userLang = 'en' // 🔥 NEW: Pass user language from parent
}) {
  return (
    <div className="panel-space h-64 flex flex-col"> {/* 🔥 CHANGED: Increased height from h-48 to h-64 */}
      <h3 className="font-pixel text-sm mb-3 text-gray-900">CHAT</h3>
      
      <div className="flex-1 overflow-y-auto mb-3 space-y-2 min-h-0 bg-white/30 p-2 rounded border-2 border-brown-dark">
        {messages.map((msg, index) => (
          <div key={msg.messageId || index}> {/* 🔥 Use messageId to prevent duplicates */}
            {msg.system ? (
              <div className="chat-message-space">
                <span className="font-game text-sm italic text-gray-600">{msg.text}</span>
              </div>
            ) : (
              <ChatBubble message={msg} userLang={userLang} />
            )}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {!isEliminated && (
        <div className="flex gap-2">
          <input
            type="text"
            value={chatMessage}
            onChange={onMessageChange}
            onKeyPress={(e) => e.key === 'Enter' && onSendMessage()}
            placeholder="Type message..."
            className="input-space flex-1 text-base py-2" 
            disabled={isFrozen}
          />
          <button
            onClick={onSendMessage}
            disabled={isFrozen}
            className={`btn-space green text-xs px-4 ${isFrozen ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            SEND
          </button>
        </div>
      )}
    </div>
  );
}