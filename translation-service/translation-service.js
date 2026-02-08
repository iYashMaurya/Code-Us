const Redis = require('ioredis');
const http = require('http');
const { LingoDotDevEngine } = require('lingo.dev/sdk');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || '';
const LINGODOTDEV_API_KEY = process.env.LINGODOTDEV_API_KEY;
const ENVIRONMENT = process.env.ENVIRONMENT || 'development';
const PORT = process.env.PORT || 3001;

const TARGET_LANGUAGES = ['hi', 'de', 'fr', 'es'];
const SOURCE_LANGUAGE = 'en';

if (!LINGODOTDEV_API_KEY) {
  console.error('❌ LINGODOTDEV_API_KEY is required');
  process.exit(1);
}

const lingoDotDev = new LingoDotDevEngine({
  apiKey: LINGODOTDEV_API_KEY,
  batchSize: 50,
  idealBatchItemSize: 500,
});

const redisUrl = REDIS_URL.includes('://') ? REDIS_URL : `redis://${REDIS_URL}`;
const redisOptions = {
  password: REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times) => Math.min(times * 50, 2000),
};

if (ENVIRONMENT !== 'development' && !REDIS_URL.includes('localhost') && !REDIS_URL.includes('127.0.0.1')) {
  redisOptions.tls = {
    rejectUnauthorized: false,
  };
}

const subscriber = new Redis(redisUrl, redisOptions);
const publisher = new Redis(redisUrl, redisOptions);

const CHAT_PROCESSING_CHANNEL = 'chat:processing';
const CHAT_TRANSLATIONS_CHANNEL = 'chat:translations';
const TASK_TRANSLATE_CHANNEL = 'task:translate';
const TASK_TRANSLATIONS_CHANNEL = 'task:translations';

const translationCache = new Map();
const CACHE_TTL = 3600000;

function getCacheKey(text, targetLang, context) {
  const contextHash = context ? context.join('|') : '';
  return `${text}:${targetLang}:${contextHash}`;
}

function cleanCache() {
  if (translationCache.size > 1000) {
    const now = Date.now();
    for (const [key, value] of translationCache.entries()) {
      if (now - value.timestamp > CACHE_TTL) {
        translationCache.delete(key);
      }
    }
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy', 
      service: 'translation-sidecar',
      timestamp: new Date().toISOString(),
      redis: subscriber.status === 'ready' ? 'connected' : 'disconnected',
      languages: TARGET_LANGUAGES,
      cacheSize: translationCache.size,
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`\n🌐 HTTP health server listening on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health\n`);
});

// 🔥 FIXED: Proper chat message translation with error handling
async function processChatMessage(messageData) {
  const { messageId, text, username, context = [], roomId, playerId, timestamp } = messageData;

  console.log(`\n💬 [CHAT] Processing message: "${text.substring(0, 50)}..."`);
  console.log(`   ID: ${messageId}`);
  console.log(`   Room: ${roomId}`);
  console.log(`   Player: ${username}`);
  
  const translations = {};

  try {
    // Always include original English
    translations[SOURCE_LANGUAGE] = text;

    // Prepare text for translation
    let textToTranslate = text;
    if (context.length > 0) {
      const contextHint = `[Context: ${context.slice(-2).join('; ')}]\n${text}`;
      textToTranslate = contextHint;
    }

    console.log(`   Translating to: ${TARGET_LANGUAGES.join(', ')}`);
    
    // Call Lingo.dev API
    const batchResults = await lingoDotDev.batchLocalizeText(textToTranslate, {
      sourceLocale: SOURCE_LANGUAGE,
      targetLocales: TARGET_LANGUAGES,
      fast: true,
    });

    // Process translations
    if (!batchResults || batchResults.length === 0) {
      throw new Error('No translations returned from API');
    }

    TARGET_LANGUAGES.forEach((lang, index) => {
      if (batchResults[index]) {
        const translation = batchResults[index];
        // Extract just the translation if we added context
        const cleanTranslation = context.length > 0 
          ? translation.split('\n').pop().trim() 
          : translation.trim();
        
        translations[lang] = cleanTranslation;
        console.log(`   ✅ ${lang}: "${cleanTranslation.substring(0, 40)}..."`);
      } else {
        // Fallback to original if translation missing
        translations[lang] = text;
        console.log(`   ⚠️  ${lang}: Using fallback (no translation)`);
      }
    });

    // 🔥 CRITICAL: Publish to backend immediately
    const result = {
      messageId,
      username,
      text,
      translations,
      roomId,
      playerId,
      timestamp: timestamp || Date.now(),
    };

    const publishedBytes = await publisher.publish(
      CHAT_TRANSLATIONS_CHANNEL, 
      JSON.stringify(result)
    );
    
    console.log(`✅ [PUBLISH] Sent to ${publishedBytes} subscriber(s) on ${CHAT_TRANSLATIONS_CHANNEL}`);
    console.log(`   Message ID: ${messageId}`);

    cleanCache();

  } catch (error) {
    console.error(`\n❌ [ERROR] Failed to translate message ${messageId}:`);
    console.error(`   ${error.message}`);
    console.error(`   Stack: ${error.stack}`);

    // 🔥 CRITICAL: Still publish error response so message appears!
    const errorResult = {
      messageId,
      username,
      text,
      translations: { [SOURCE_LANGUAGE]: text }, // Fallback to original
      roomId,
      playerId,
      timestamp: timestamp || Date.now(),
      error: error.message,
    };

    try {
      const publishedBytes = await publisher.publish(
        CHAT_TRANSLATIONS_CHANNEL, 
        JSON.stringify(errorResult)
      );
      console.log(`⚠️  [FALLBACK] Published error response to ${publishedBytes} subscriber(s)`);
      console.log(`   Message ID: ${messageId} - Using original text as fallback`);
    } catch (pubError) {
      console.error(`❌ [CRITICAL] Failed to even publish fallback:`, pubError.message);
    }
  }
}

async function processTaskTranslation(taskData) {
  const { taskId, roomId, field, text, requestId } = taskData;

  console.log(`\n📋 [TASK] Processing translation: ${taskId}.${field}`);
  console.log(`   Text: "${text.substring(0, 50)}..."`);
  
  const translations = {};

  try {
    translations[SOURCE_LANGUAGE] = text;

    console.log(`   Translating to: ${TARGET_LANGUAGES.join(', ')}`);
    
    const batchResults = await lingoDotDev.batchLocalizeText(text, {
      sourceLocale: SOURCE_LANGUAGE,
      targetLocales: TARGET_LANGUAGES,
      fast: false,
    });

    if (!batchResults || batchResults.length === 0) {
      throw new Error('No translations returned from API');
    }

    TARGET_LANGUAGES.forEach((lang, index) => {
      if (batchResults[index]) {
        const translation = batchResults[index];
        translations[lang] = translation.trim();
        console.log(`   ✅ ${lang}: "${translation.substring(0, 50)}..."`);
      } else {
        translations[lang] = text;
        console.log(`   ⚠️  ${lang}: Using fallback`);
      }
    });

    const result = {
      taskId,
      roomId,
      field,
      translations,
      requestId,
    };

    const publishedBytes = await publisher.publish(
      TASK_TRANSLATIONS_CHANNEL, 
      JSON.stringify(result)
    );
    
    console.log(`✅ [PUBLISH] Sent to ${publishedBytes} subscriber(s) on ${TASK_TRANSLATIONS_CHANNEL}`);

  } catch (error) {
    console.error(`\n❌ [ERROR] Failed to translate task ${taskId}.${field}:`, error.message);

    const errorResult = {
      taskId,
      roomId,
      field,
      translations: { [SOURCE_LANGUAGE]: text },
      requestId,
      error: error.message,
    };

    try {
      const publishedBytes = await publisher.publish(
        TASK_TRANSLATIONS_CHANNEL, 
        JSON.stringify(errorResult)
      );
      console.log(`⚠️  [FALLBACK] Published error response to ${publishedBytes} subscriber(s)`);
    } catch (pubError) {
      console.error(`❌ [CRITICAL] Failed to publish fallback:`, pubError.message);
    }
  }
}

subscriber.on('message', async (channel, message) => {
  try {
    const data = JSON.parse(message);

    if (channel === CHAT_PROCESSING_CHANNEL) {
      await processChatMessage(data);
    } else if (channel === TASK_TRANSLATE_CHANNEL) {
      await processTaskTranslation(data);
    }
  } catch (error) {
    console.error('❌ [PARSER] Error processing message:', error);
  }
});

subscriber.subscribe(CHAT_PROCESSING_CHANNEL, TASK_TRANSLATE_CHANNEL, (err, count) => {
  if (err) {
    console.error('❌ Failed to subscribe:', err);
    process.exit(1);
  }

  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║   🌐 TRANSLATION SIDECAR SERVICE STARTED     ║');
  console.log('╚═══════════════════════════════════════════════╝');
  console.log(`  Engine: Lingo.dev SDK`);
  console.log(`  Redis: ${redisUrl}`);
  console.log(`  Languages: ${TARGET_LANGUAGES.join(', ')}`);
  console.log(`  Channels: ${CHAT_PROCESSING_CHANNEL}, ${TASK_TRANSLATE_CHANNEL}`);
  console.log(`  HTTP Port: ${PORT}`);
  console.log('═══════════════════════════════════════════════');
  console.log(`✅ Subscribed to ${count} channel(s)\n`);
});

subscriber.on('error', (err) => {
  console.error('❌ Redis subscriber error:', err);
});

publisher.on('error', (err) => {
  console.error('❌ Redis publisher error:', err);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await subscriber.quit();
  await publisher.quit();
  server.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await subscriber.quit();
  await publisher.quit();
  server.close();
  process.exit(0);
});