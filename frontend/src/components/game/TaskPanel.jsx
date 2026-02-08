'use i18n';
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function TaskPanel({ task, userLang = 'en' }) {
  const [displayTitle, setDisplayTitle] = useState('');
  const [displayDescription, setDisplayDescription] = useState('');
  const [translationKey, setTranslationKey] = useState(0);
  
  useEffect(() => {
    if (!task) return;
    
    console.log('📋 [TaskPanel] Task updated:', task.id);
    console.log('   User lang:', userLang);
    console.log('   Title translations:', task.titleTranslations);
    console.log('   Description translations:', task.descriptionTranslations);
    
    // Get title text
    if (task.titleTranslations && task.titleTranslations[userLang]) {
      setDisplayTitle(task.titleTranslations[userLang]);
      console.log('   ✅ Using translated title:', task.titleTranslations[userLang]);
    } else {
      setDisplayTitle(task.title);
      console.log('   ℹ️ Using original title:', task.title);
    }
    
    // Get description text
    if (task.descriptionTranslations && task.descriptionTranslations[userLang]) {
      setDisplayDescription(task.descriptionTranslations[userLang]);
      console.log('   ✅ Using translated description');
    } else {
      setDisplayDescription(task.description);
      console.log('   ℹ️ Using original description');
    }
    
    // Trigger animation when translations change
    setTranslationKey(prev => prev + 1);
  }, [task, task?.titleTranslations, task?.descriptionTranslations, userLang]);
  
  if (!task) {
    return (
      <div className="panel-space">
        <h3 className="font-pixel text-xl mb-2 text-gray-900">
          Loading Mission Data...
        </h3>
        <p className="font-game text-lg text-gray-700">
          Waiting for mission details...
        </p>
      </div>
    );
  }

  const hasTranslations = task.titleTranslations && 
                         Object.keys(task.titleTranslations).length > 0;

  return (
    <motion.div
      className="panel-space"
      initial={{ y: -50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      key={task?.id}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={translationKey}
          initial={{ opacity: 0, filter: 'blur(2px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h3 className="font-pixel text-xl mb-2 text-gray-900">
            {displayTitle}
          </h3>
          <p className="font-game text-lg text-gray-700">
            {displayDescription}
          </p>
        </motion.div>
      </AnimatePresence>
      
      {/* Show loading indicator while translations are being fetched */}
      {!hasTranslations && (
        <div className="flex items-center gap-2 mt-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
          <p className="font-game text-xs text-gray-500 italic">
            🌐 Loading translations...
          </p>
        </div>
      )}
    </motion.div>
  );
}