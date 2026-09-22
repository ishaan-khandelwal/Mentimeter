# PollWave — Live Polling & Interactive Presentations

PollWave is a high-performance, real-time audience engagement platform built with Next.js (App Router), Node.js + Express, Socket.io with Redis adapter, PostgreSQL (Prisma ORM), and Anthropic Claude AI.

---

## ⚡ Highlights & Key Features

- **6 Interactive Slide Types**:
  - 📊 **Multiple Choice**: Real-time animated percentage bars and live vote distribution.
  - ☁️ **Word Cloud**: Dynamic interactive word cloud sizing audience phrases by frequency.
  - 💬 **Open Text**: Qualitative feedback stream with AI theme extraction.
  - ⭐ **Rating Scale**: 1–5 or 1–10 score distribution histogram and live average calculation.
  - 🏆 **Ranking**: Audience drag-and-rank with weighted leaderboard scores.
  - ❓ **Live Q&A**: Audience question submissions with real-time upvoting (+1) and sorting.
- **Presenter Control Center**:
  - Full-screen high-contrast live presenter mode.
  - Slide navigation (Next, Prev, Jump to slide).
  - Voting lock/unlock toggle.
  - QR Code generator for quick mobile audience scan-to-join.
  - Live attendee count with presence tracking.
  - **Claude AI Insights**: One-click executive summary, recurring themes, and sentiment analysis.
- **AI Slide Generation**:
  - Generate 2–5 ready-to-use interactive poll questions from any topic or meeting goal using Claude.
- **Scale-Ready Architecture**:
  - Socket.io with Redis Adapter for multi-instance horizontal scaling.
  - Memory-backed 200ms throttled broadcasts (no Redis read hammering).
  - Background leader-elected flush worker persisting vote tallies to PostgreSQL.
  - Rate limiting with Redis store and Helmet security headers.

---

## 📁 Repository Structure

```
Mentimeter/
├── apps/
│   ├── web/               # Next.js 14 App Router, NextAuth, Slide Editor & UI
│   └── server/            # Express, Socket.io, Redis Adapter, Flush Worker
├── packages/
│   └── shared/            # Shared TypeScript types, Prisma Client, schema.prisma
├── docker-compose.yml     # Local PostgreSQL & Redis containers
└── README.md
```

---

## 🚀 Quickstart Guide

### 1. Prerequisites
- Node.js 18+ and npm 9+
- Docker & Docker Compose (or local PostgreSQL and Redis instances)

### 2. Start Local PostgreSQL & Redis
```bash
docker compose up -d
```

### 3. Push Schema to Database
```bash
npm run db:push
```

### 4. Configure Environment
Copy `.env.example` files:
```bash
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env.local
```

### 5. Build Shared Library
```bash
npm run build --workspace=@pollwave/shared
```

### 6. Start Development Servers
In two separate terminals:

**Backend Server (port 4000):**
```bash
npm run dev --workspace=@pollwave/server
```

**Web Application (port 3000):**
```bash
npm run dev --workspace=@pollwave/web
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing User Flows

1. **Sign Up / Login**: Navigate to [http://localhost:3000/signup](http://localhost:3000/signup) or use the **"Fill Demo Credentials"** button on `/login`.
2. **Create Presentation**: From `/dashboard`, click **"＋ New Presentation"**.
3. **Slide Editor**:
   - Add/edit slides of different types (Multiple Choice, Word Cloud, Rating, Q&A).
   - Click **"✨ AI Slide Generator"** to automatically generate interactive slides with Claude.
4. **Live Presentation**:
   - Click **"▶ Present Live"** to open `/present/[id]`.
   - In an incognito tab or mobile phone, navigate to [http://localhost:3000/join](http://localhost:3000/join) and enter the 6-character code.
   - Vote or ask questions and watch the live visualizations update instantly!

---

## 📊 Load-Testing Target

The server is architected to handle **500–1000 concurrent socket connections per session**:
- **Write Path**: `Vote -> Redis HINCRBY + Local Memory Update -> 200ms Throttled Broadcast`.
- **Read Path**: Reads from local memory (never querying Redis on each tick).
- **Persistence**: Leader election lock ensures only one server flushes dirty tallies to MongoDB every 3 seconds.

---

## 🚢 Production Deployment

- **Frontend (`apps/web`)**: Deploy to [Vercel](https://vercel.com).
- **Backend (`apps/server`)**: Deploy to [Render](https://render.com), [Railway](https://railway.app), or [Fly.io](https://fly.io) with persistent WebSocket support.
- **Redis**: [Upstash Redis](https://upstash.com) or managed Redis on cloud provider.
- **Database**: [MongoDB Atlas](https://www.mongodb.com/atlas).
