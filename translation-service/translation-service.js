const Redis = require('ioredis');
const { LingoDotDevEngine } = require('lingo.dev/sdk');

// Configuration from environment variables
const REDIS_URL = process.env.REDIS_URL || 'localhost:6379';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || '';
const LINGODOTDEV_API_KEY = process.env.LINGODOTDEV_API_KEY;
const ENVIRONMENT = process.env.ENVIRONMENT || 'development';

// Supported languages
const SUPPORTED_LANGUAGES = ['en', 'hi', 'de', 'fr'];

// Validate API key
if (!LINGODOTDEV_API_KEY) {
  console.error('❌ LINGODOTDEV_API_KEY is required');
  console.error('Get your API key from: https://lingo.dev');
  process.exit(1);
}

// Initialize Lingo.dev engine
const lingoDotDev = new LingoDotDevEngine({
  apiKey: LINGODOTDEV_API_KEY,
  batchSize: 50, // Max items per API request
  idealBatchItemSize: 500, // Target word count per batch
});

// Initialize Redis clients (one for pub, one for sub)
const redisUrl = REDIS_URL.includes('://') ? REDIS_URL : `redis://${REDIS_URL}`;
const redisOptions = {
  password: REDIS_PASSWORD || undefined,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
};

// TLS for production
if (ENVIRONMENT !== 'development' && !REDIS_URL.includes('localhost') && !REDIS_URL.includes('127.0.0.1')) {
  redisOptions.tls = {
    rejectUnauthorized: false,
  };
}

const subscriber = new Redis(redisUrl, redisOptions);
const publisher = new Redis(redisUrl, redisOptions);

// Channels
const PROCESSING_CHANNEL = 'chat:processing';
const TRANSLATIONS_CHANNEL = 'chat:translations';

// Translation cache (in-memory, simple)
const translationCache = new Map();
const CACHE_TTL = 3600000; // 1 hour in milliseconds

/**
 * Generate cache key
 */
function getCacheKey(text, targetLang, context) {
  const contextHash = context ? context.join('|') : '';
  return `${text}:${targetLang}:${contextHash}`;
}

/**
 * Translate text using Lingo.dev SDK with context awareness
 */
async function translateWithContext(text, sourceLang, targetLang, context = []) {
  // Check cache first
  const cacheKey = getCacheKey(text, targetLang, context);
  const cached = translationCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`📦 Cache hit for "${text}" -> ${targetLang}`);
    return cached.translation;
  }

  try {
    // For gaming chat, we want fast translations
    const options = {
      sourceLocale: sourceLang,
      targetLocale: targetLang,
      fast: true, // Prioritize speed for real-time chat
    };

    // If we have context, include it as a hint in the text
    // Note: Lingo.dev processes this intelligently for slang and context
    let textToTranslate = text;
    if (context.length > 0) {
      // Add context prefix that Lingo.dev can use
      // This helps with understanding "he", "it", "that" references
      const contextHint = `[Context: ${context.slice(-2).join('; ')}]\n${text}`;
      textToTranslate = contextHint;
    }

    const translation = await lingoDotDev.localizeText(textToTranslate, options);
    
    // If we added context prefix, extract just the translation
    const cleanTranslation = context.length > 0 
      ? translation.split('\n').pop().trim() 
      : translation;

    // Cache the result
    translationCache.set(cacheKey, {
      translation: cleanTranslation,
      timestamp: Date.now(),
    });

    // Clean old cache entries periodically
    if (translationCache.size > 1000) {
      const now = Date.now();
      for (const [key, value] of translationCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
          translationCache.delete(key);
        }
      }
    }

    return cleanTranslation;
  } catch (error) {
    console.error(`❌ Translation error (${sourceLang} -> ${targetLang}):`, error.message);
    // Fallback: try without context if context caused issues
    if (context.length > 0) {
      try {
        console.log(`⚠️ Retrying without context...`);
        const simpleTranslation = await lingoDotDev.localizeText(text, {
          sourceLocale: sourceLang,
          targetLocale: targetLang,
          fast: true,
        });
        return simpleTranslation;
      } catch (retryError) {
        console.error(`❌ Retry failed:`, retryError.message);
      }
    }
    return text; // Fallback to original text
  }
}

/**
 * Process a chat message for translation
 */
async function processMessage(messageData) {
  const { messageId, text, username, context = [], roomId, playerId } = messageData;

  console.log(`📨 Processing message: "${text}" (ID: ${messageId})`);
  console.log(`   Context: ${context.length} previous messages`);

  const translations = {};
  const sourceLang = 'en';

  try {
    // Get target languages (all except source)
    const targetLanguages = SUPPORTED_LANGUAGES.filter(lang => lang !== sourceLang);

    // Prepare text with context hint if available
    let textToTranslate = text;
    if (context.length > 0) {
      const contextHint = `[Context: ${context.slice(-2).join('; ')}]\n${text}`;
      textToTranslate = contextHint;
    }

    // Use Lingo.dev's batch translation for efficiency
    console.log(`   Translating to: ${targetLanguages.join(', ')}`);
    
    const batchResults = await lingoDotDev.batchLocalizeText(textToTranslate, {
      sourceLocale: sourceLang,
      targetLocales: targetLanguages,
      fast: true, // Prioritize speed for real-time chat
    });

    // Map results to language codes
    targetLanguages.forEach((lang, index) => {
      const translation = batchResults[index];
      // If we added context, extract just the translation
      const cleanTranslation = context.length > 0 
        ? translation.split('\n').pop().trim() 
        : translation;
      
      translations[lang] = cleanTranslation;
      console.log(`   ✅ ${lang}: "${cleanTranslation}"`);
    });

    // Add original text as 'en' translation
    translations['en'] = text;

    // Publish results back to Redis
    const result = {
      messageId,
      username,
      text,
      translations,
      roomId,
      playerId,
      timestamp: Date.now(),
    };

    await publisher.publish(TRANSLATIONS_CHANNEL, JSON.stringify(result));
    console.log(`✅ Published translations for message ${messageId}`);
  } catch (error) {
    console.error(`❌ Error processing message ${messageId}:`, error);

    // Publish error/fallback
    await publisher.publish(TRANSLATIONS_CHANNEL, JSON.stringify({
      messageId,
      username,
      text,
      translations: { en: text }, // Fallback to original
      error: error.message,
      roomId,
      playerId,
    }));
  }
}

/**
 * Main service loop
 */
async function startService() {
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║   🌐 TRANSLATION SIDECAR SERVICE STARTED     ║');
  console.log('╚═══════════════════════════════════════════════╝');
  console.log(`  Engine: Lingo.dev (Gemini Flash 1.5)`);
  console.log(`  Redis: ${REDIS_URL}`);
  console.log(`  Supported: ${SUPPORTED_LANGUAGES.join(', ')}`);
  console.log(`  Listening: ${PROCESSING_CHANNEL}`);
  console.log(`  Fast mode: Enabled (real-time chat optimized)`);
  console.log('═══════════════════════════════════════════════');

  // Subscribe to processing channel
  await subscriber.subscribe(PROCESSING_CHANNEL, (err, count) => {
    if (err) {
      console.error('❌ Failed to subscribe:', err);
      process.exit(1);
    }
    console.log(`✅ Subscribed to ${count} channel(s)`);
  });

  // Handle incoming messages
  subscriber.on('message', async (channel, message) => {
    if (channel === PROCESSING_CHANNEL) {
      try {
        const messageData = JSON.parse(message);
        await processMessage(messageData);
      } catch (error) {
        console.error('❌ Error parsing message:', error);
      }
    }
  });

  // Error handling
  subscriber.on('error', (err) => {
    console.error('❌ Redis subscriber error:', err);
  });

  publisher.on('error', (err) => {
    console.error('❌ Redis publisher error:', err);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('🛑 Shutting down gracefully...');
    await subscriber.quit();
    await publisher.quit();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('🛑 Shutting down gracefully...');
    await subscriber.quit();
    await publisher.quit();
    process.exit(0);
  });
}

// Start the service
startService().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});