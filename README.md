# NEXUS — Your AI That Knows You

A WhatsApp-style chat interface that acts as a personal AI assistant. No buttons, no dashboards — just conversation. It extracts every piece of information you share, structures it into a living model of your life, and uses it to think on your behalf.

## Quick Start

### 1. Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- An LLM API key (OpenRouter, OpenAI, Google, or DeepSeek)
- A [Supermemory](https://supermemory.ai) API key (for semantic memory)

### 2. Setup

```bash
# Clone and install
cd nexus
npm install

# Configure environment
cp .env.local.example .env.local
# Fill in your API keys in .env.local
```

### 3. Database

Run the migration in your Supabase SQL editor:

```bash
# Copy the contents of supabase/migrations/001_initial_schema.sql
# and run it in Supabase Dashboard → SQL Editor
```

Enable Realtime for the `messages` table in Supabase Dashboard → Database → Replication.

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Architecture

```
User → Chat UI → /api/chat → Intent Parser → Memory Extractor → Context Compiler → LLM → Response
                                    ↓                    ↓
                              Supabase (structured)   Supermemory (semantic)
```

### NEXUS Memory Layers

1. **Identity** — who you are (personality, preferences, cognitive style)
2. **World** — structure of your life (courses, people, schedule)
3. **Goals** — what you're working toward
4. **Timeline** — events, tasks, reminders, recurring schedule
5. **Dynamics** — current mood, energy, contradictions, wins
6. **Reasoning Cache** — pre-computed insights (daily brief, grade projections)

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (React), Tailwind CSS |
| Backend | Next.js API Routes (SSE streaming) |
| LLM | Model-agnostic (OpenRouter / OpenAI / Gemini / DeepSeek) |
| Structured Data | Supabase (PostgreSQL) |
| Semantic Memory | Supermemory API |
| Auth | Supabase Auth |
| Cron | Vercel Cron Jobs |

## Environment Variables

```env
LLM_PROVIDER=openrouter
LLM_MODEL=google/gemini-2.5-flash
LLM_API_KEY=your_key
LLM_BASE_URL=https://openrouter.ai/api/v1

NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

SUPERMEMORY_API_KEY=your_supermemory_key

CRON_SECRET=your_random_secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Cron Jobs

| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `/api/cron/morning` | 7:30 AM IST daily | Morning briefing |
| `/api/cron/reminders` | Every hour | Task & reminder checks |
| `/api/cron/weekly` | Sunday 7:30 PM IST | Weekly review |
| `/api/cron/goals` | 3:30 PM IST daily | Dormant goal check-ins |

Cron endpoints are secured with `CRON_SECRET` via Bearer token.

## LLM Configuration

Switch models by changing env vars — zero code changes:

```env
# OpenRouter (default)
LLM_PROVIDER=openrouter
LLM_MODEL=google/gemini-2.5-flash
LLM_BASE_URL=https://openrouter.ai/api/v1

# OpenAI direct
LLM_PROVIDER=openai
LLM_MODEL=gpt-4.1-mini
LLM_BASE_URL=https://api.openai.com/v1

# DeepSeek
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-chat
LLM_BASE_URL=https://api.deepseek.com/v1
```
