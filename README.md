# 🕵️‍♂️ CODE MAFIA

```text
   __________  ____  ______     __  _____    ______________    
  / ____/ __ \/ __ \/ ____/    /  |/  /   |  / ____/  _/   |   
 / /   / / / / / / / __/______/ /|_/ / /| | / /_   / // /| |   
/ /___/ /_/ / /_/ / /__/_____/ /  / / ___ |/ __/ _/ // ___ |   
\____/\____/_____/_____/    /_/  /_/_/  |_/_/   /___/_/  |_|   

< "Trust no one. Not even `git blame`." >
```

⚠️ **SYSTEM ALERT: RELEASE 1.0**

**Status:** Active Development  
**Current State:** Release 1 (Alpha)

This is an early preview. Features are being shipped faster than your average npm install.  
Expect bugs, chaos, and rapid improvements.

---

## 🕵️‍♂️ `whoami` (The Project)

**Code Mafia** is not just a game; it's a social deduction experiment for developers.

> Think **Among Us** meets **LeetCode**, but with more race conditions.

Players are dropped into a codebase (spaceship).

### Roles

**Developers (Crewmates)**  
Complete coding tasks, fix bugs, and optimize the system to win.

**The Mafia (Impostors)**  
Blend in, sabotage the code (delete semicolons, inject infinite loops), and eliminate the devs.

**The catch?**  
You have to code your way out of it.

---

## 🎮 Game Specs

```yaml
game_specs:
  genre: "Social Deduction / Coding Simulation"
  stack: [Go, React, WebSocket, Redis, Supabase]
  vibe: "Dark Mode Everything"
  difficulty: "O(n!)"
```

---

## 🏆 THE COMPETITIVE EDGE (Why this repo wins)

We didn't just build a game — we built a **global platform**.

Most hackathon projects are stuck in `en-US`.  
**Code Mafia is ready for the world.**

```yaml
global_domination_protocol:
  engine: "Lingo.dev"
  automation: "100%"
  ci_cd_integration: "Active"
  supported_locales: [English, Hindi, German, French, Spanish]
  manual_effort: 0
```

### How it works

1. We push code
2. **Lingo.dev CI/CD pipeline** triggers automatically
3. AI extracts, translates, and validates keys in **< 5 minutes**
4. The game updates instantly for users in Mumbai, Berlin, and Paris

---

## 🛠 TECH STACK

We like our backend fast and our frontend reactive.

```
Backend (Go)     ██████████ (Gorilla Mux, Goroutines)
Realtime         ██████████ (WebSockets, Redis Pub/Sub)
Frontend         █████████░ (React, Vite, Tailwind)
Code Engine      █████████░ (Monaco Editor, Yjs)
Database         ████████░░ (Supabase, PostgreSQL)
Localization     ██████████ (Lingo.dev Automated Pipeline)
Sleep            █░░░░░░░░░ (Who needs it?)
```

---
## 🏗️ ARCHITECTURE

Want to see how everything connects? Check out our high-level architecture diagram:

<img width="5335" height="2076" alt="High-level-architecture" src="https://github.com/user-attachments/assets/f3e4946c-860e-4d70-9f9e-791e6095eda3" />


## 📂 PROJECT STRUCTURE

```
.
├── backend/            <-- The Brain (Go + WebSockets)
│   ├── hub.go          <-- Manages all active game rooms
│   ├── room.go         <-- Handles game logic & broadcasting
│   └── main.go         <-- Entry point
├── frontend/           <-- The Face (React + Vite)
│   ├── src/lingo/      <-- Automated translation cache (The Magic)
│   ├── src/game/       <-- Game panels (Chat, Sabotage, Tasks)
│   └── vite.config.js  <-- Lingo compiler integration
└── docker-compose.yml  <-- Spin it all up in one command
```

---

## 🚀 INITIALIZING SEQUENCE (Setup)

You want to run this locally?  
**Good luck, Detective.**

### 1️⃣ Clone the Repository

```bash
git clone https://github.com/iYashMaurya/Code-Us.git
cd Code-Us
```

### 2️⃣ Prerequisites

**Docker & Docker Compose (Recommended)**  
OR

- Go 1.21+
- Node.js 20+
- Redis (Local or Cloud)
- Supabase Account

### 3️⃣ Environment Configuration

Create a `.env` file in the root directory (mandatory).

```bash
# =====================================================
# CODE MAFIA - ENVIRONMENT VARIABLES
# =====================================================

# Backend Configuration
PORT=8080
ENVIRONMENT=development

# Redis Configuration (Local or Cloud)
REDIS_URL=redis:6379
REDIS_PASSWORD=

# Supabase Configuration
# Get these from: https://app.supabase.com > Project > Settings > API
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key

# Frontend Configuration
# Get this from: https://lingo.dev
LINGODOTDEV_API_KEY=lng_your_key_here
```

### 4️⃣ Option A: "I want it now" (Docker)

Spins up Backend, Frontend, and Redis automatically.

```bash
docker-compose up --build
```

- **Frontend** → http://localhost:5173
- **Backend** → http://localhost:8080

### 5️⃣ Option B: "I like to control everything" (Manual)

**Terminal 1 — Backend**

```bash
cd backend
go mod download
go run main.go
```

**Terminal 2 — Frontend**

```bash
cd frontend
npm install

# Initialize the Translation Engine
npm run lingo:setup
npm run lingo:sync

npm run dev
```

---

## 🔮 ROADMAP

We are just getting started.

- [ ] **Voice Chat Integration** — Because typing "It wasn't me" is too slow
- [ ] **IDE Extensions** — Play directly from VS Code
- [ ] **Ranked Matchmaking** — Elo system for debugging skills
- [ ] **More Languages** — Japanese & Portuguese via Lingo CI/CD

---

## 🤝 CONTRIBUTING

Found a bug?  
It's probably a **Sabotage** feature. (Just kidding — PRs welcome.)

1. Fork the repo
2. Create your feature branch
   ```bash
   git checkout -b feature/cool-mechanic
   ```
3. Commit your changes
   ```bash
   git commit -m "Add sabotage"
   ```
4. Push to the branch
   ```bash
   git push origin feature/cool-mechanic
   ```
5. Open a Pull Request

---

```
                                  /\_/\
                                 ( o.o )   < "Code compiled." >
                                  > ^ <
                               Code Mafia
                          Developed by Yash Maurya
```

---
