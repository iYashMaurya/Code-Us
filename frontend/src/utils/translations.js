// Simple translation system (lingo.dev replacement for MVP)
const translations = {
  en: {
    // Home screen
    'home.title': 'CODE MAFIA',
    'home.subtitle': 'Sabotage or Survive',
    'home.username': 'Enter your name...',
    'home.createRoom': 'CREATE GAME',
    'home.joinRoom': 'LOBBY ID',
    'home.join': 'JOIN',
    'home.playerCount': '3-5 Players • Find the Impostor',
    
    // Lobby
    'lobby.title': 'LOBBY',
    'lobby.code': 'Lobby Code:',
    'lobby.players': 'Players',
    'lobby.waiting': 'Waiting for host to start...',
    'lobby.ready': 'READY!',
    'lobby.minPlayers': 'Need at least 3 players to start',
    
    // Roles
    'role.civilian': 'CIVILIAN',
    'role.impostor': 'IMPOSTOR',
    'role.civilianDesc': 'Fix the bugs and complete the code before round 4 ends!',
    'role.impostorDesc': 'Sabotage the code without getting caught! Make the code fail by round 4.',
    'role.starting': 'Game starting soon...',
    
    // Game
    'game.task': 'Task',
    'game.timer': 'Time',
    'game.mode': 'Mode',
    'game.players': 'Players',
    'game.chat': 'Chat',
    'game.emergency': 'EMERGENCY',
    'game.alive': 'Alive',
    'game.eliminated': 'Eliminated',
    'game.spectator': 'You are spectating',
    
    // Discussion
    'discussion.title': 'WHO IS THE IMPOSTOR?',
    'discussion.vote': 'Vote to eliminate a player or skip',
    'discussion.eliminate': 'ELIMINATE',
    'discussion.skip': 'SKIP VOTE',
    
    // End
    'end.civilianWin': 'Impostor caught!',
    'end.impostorWin': 'Time\'s up. Impostor wins.',
    'end.impostor': 'The impostor was',
    'end.playAgain': 'PLAY AGAIN',
    'end.home': 'HOME',
    
    // Common
    'common.host': 'Host',
    'common.you': 'You',
    'common.send': 'Send',
    'common.loading': 'Loading...',
  },
  
  hi: {
    // Home screen
    'home.title': 'कोड माफिया',
    'home.subtitle': 'तोड़फोड़ या जीवित रहें',
    'home.username': 'अपना नाम दर्ज करें...',
    'home.createRoom': 'खेल बनाएं',
    'home.joinRoom': 'लॉबी आईडी',
    'home.join': 'शामिल हों',
    'home.playerCount': '३-५ खिलाड़ी • धोखेबाज़ ढूंढें',
    
    // Lobby
    'lobby.title': 'लॉबी',
    'lobby.code': 'लॉबी कोड:',
    'lobby.players': 'खिलाड़ी',
    'lobby.waiting': 'मेज़बान के शुरू करने की प्रतीक्षा...',
    'lobby.ready': 'तैयार!',
    'lobby.minPlayers': 'शुरू करने के लिए कम से कम ३ खिलाड़ी चाहिए',
    
    // Roles
    'role.civilian': 'नागरिक',
    'role.impostor': 'धोखेबाज़',
    'role.civilianDesc': 'राउंड ४ समाप्त होने से पहले बग्स ठीक करें और कोड पूरा करें!',
    'role.impostorDesc': 'पकड़े बिना कोड को नुकसान पहुंचाएं! राउंड ४ तक कोड को विफल बनाएं।',
    'role.starting': 'खेल जल्द शुरू हो रहा है...',
    
    // Game
    'game.task': 'कार्य',
    'game.timer': 'समय',
    'game.mode': 'मोड',
    'game.players': 'खिलाड़ी',
    'game.chat': 'चैट',
    'game.emergency': 'आपातकाल',
    'game.alive': 'जीवित',
    'game.eliminated': 'बाहर',
    'game.spectator': 'आप दर्शक हैं',
    
    // Discussion
    'discussion.title': 'धोखेबाज़ कौन है?',
    'discussion.vote': 'किसी खिलाड़ी को हटाने के लिए वोट करें या छोड़ें',
    'discussion.eliminate': 'हटाएं',
    'discussion.skip': 'वोट छोड़ें',
    
    // End
    'end.civilianWin': 'धोखेबाज़ पकड़ा गया!',
    'end.impostorWin': 'समय समाप्त। धोखेबाज़ जीता।',
    'end.impostor': 'धोखेबाज़ था',
    'end.playAgain': 'फिर से खेलें',
    'end.home': 'होम',
    
    // Common
    'common.host': 'मेज़बान',
    'common.you': 'आप',
    'common.send': 'भेजें',
    'common.loading': 'लोड हो रहा है...',
  },
  
  de: {
    // Home screen
    'home.title': 'CODE MAFIA',
    'home.subtitle': 'Sabotieren oder Überleben',
    'home.username': 'Name eingeben...',
    'home.createRoom': 'SPIEL ERSTELLEN',
    'home.joinRoom': 'LOBBY ID',
    'home.join': 'BEITRETEN',
    'home.playerCount': '3-5 Spieler • Finde den Betrüger',
    
    // Lobby
    'lobby.title': 'LOBBY',
    'lobby.code': 'Lobby Code:',
    'lobby.players': 'Spieler',
    'lobby.waiting': 'Warte auf Spielstart...',
    'lobby.ready': 'BEREIT!',
    'lobby.minPlayers': 'Mindestens 3 Spieler zum Starten benötigt',
    
    // Roles
    'role.civilian': 'ZIVILIST',
    'role.impostor': 'BETRÜGER',
    'role.civilianDesc': 'Behebe die Fehler und vervollständige den Code vor Runde 4!',
    'role.impostorDesc': 'Sabotiere den Code, ohne erwischt zu werden! Lass den Code bis Runde 4 fehlschlagen.',
    'role.starting': 'Spiel startet bald...',
    
    // Game
    'game.task': 'Aufgabe',
    'game.timer': 'Zeit',
    'game.mode': 'Modus',
    'game.players': 'Spieler',
    'game.chat': 'Chat',
    'game.emergency': 'NOTFALL',
    'game.alive': 'Lebendig',
    'game.eliminated': 'Eliminiert',
    'game.spectator': 'Du bist Zuschauer',
    
    // Discussion
    'discussion.title': 'WER IST DER BETRÜGER?',
    'discussion.vote': 'Stimme ab, um einen Spieler zu eliminieren oder überspringe',
    'discussion.eliminate': 'ELIMINIEREN',
    'discussion.skip': 'ÜBERSPRINGEN',
    
    // End
    'end.civilianWin': 'Betrüger gefangen!',
    'end.impostorWin': 'Zeit ist um. Betrüger gewinnt.',
    'end.impostor': 'Der Betrüger war',
    'end.playAgain': 'NOCHMAL SPIELEN',
    'end.home': 'STARTSEITE',
    
    // Common
    'common.host': 'Gastgeber',
    'common.you': 'Du',
    'common.send': 'Senden',
    'common.loading': 'Laden...',
  },
};

export function useTranslation(language = 'en') {
  const t = (key) => {
    return translations[language]?.[key] || translations.en[key] || key;
  };

  return { t };
}

export function translate(key, language = 'en') {
  return translations[language]?.[key] || translations.en[key] || key;
}