'use i18n';
import React from 'react';
import { motion } from 'framer-motion';

export default function TaskPanel({ task }) {
    return (
    <motion.div
      className="panel-space"
      initial={{ y: -50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      key={task?.id}
    >
      <h3 
        className="font-pixel text-xl mb-2 text-gray-900"
        data-lingo-key={task?.titleKey}
      >
        {task?.title || 'Loading Mission Data...'}
      </h3>
      <p 
        className="font-game text-lg text-gray-700"
        data-lingo-key={task?.descriptionKey}
      >
        {task?.description || 'Waiting for mission details...'}
      </p>
    </motion.div>
  );
}