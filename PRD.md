# NEXUS — Product Requirements Document

## Your AI That Knows You

---

## 1. Vision

A pure chat interface that acts as a personal assistant. No buttons, no dashboards, no forms. You text it like a friend. Behind the scenes, it extracts every piece of information you share, structures it into a living model of your life, and uses it to think on your behalf.

Over time it becomes the smartest person in your life — one who knows your schedule, your goals, your weaknesses, your deadlines, and computes what you should do next.

**One line:** WhatsApp-style chat that slowly learns everything about you and becomes a personal assistant that thinks ahead.

---

## 2. Core Principles

1. **Chat is the only interface.** No settings pages. No toggles. No calendar view. No tables. Everything happens through conversation.
2. **Zero onboarding.** Useful from message one. Gets smarter with every message. No forms, no setup wizard.
3. **Drip-feed context.** Users share information naturally over days and weeks. The system structures it silently.
4. **Person-first, not student-first.** It takes the shape of whoever uses it — student, freelancer, professional, anyone.
5. **Thinks, doesn't just remember.** Computes grade projections, detects schedule conflicts, identifies contradictions between what you say and what you do.
6. **Proactive, not just reactive.** Morning briefings, deadline nudges, goal check-ins — all arriving as chat messages.

---

## 3. User Experience

### 3.1 What The User Sees

- A full-screen chat interface. Dark mode default.
- A text input at the bottom. A send button. Nothing else.
- Messages from the user on one side. Messages from NEXUS on the other.
- Morning briefings, reminders, and nudges appear as incoming messages (as if the assistant texted first).
- No rich cards, no buttons, no dropdowns, no inline widgets. Pure text conversation.
- Mobile responsive — works identically on phone and laptop browser.

### 3.2 What The User Does

They just talk. Examples of natural inputs:

```
"I have ML class on Monday and Wednesday at 10am"
"Transport quiz on the 11th"
"I got 18/30 in my Transport midterm"
"remind me to email the prof tomorrow"
"what should I focus on tonight?"
"calculate my grade if I get 25 on the next quiz"
"I'm feeling really unmotivated lately"
"should I do the hackathon next weekend?"
"what all do I have today?"
"Transport grading: quiz 20%, midterm 30%, assignment 10%, final 40%"
"I work best at night honestly"
"Arjun is my lab partner for ML"
```

The system handles all of these through the same chat — no special commands, no syntax, no slash commands.

### 3.3 What The User Never Does

- Fill out a form
- Click a settings button
- Navigate to a different page
- Create a "task" or "event" through a UI
- Configure anything manually
- Read a tutorial or documentation

---

## 4. System Architecture

### 4.1 High-Level Flow

```
User sends message
        │
        ▼
┌─────────────────┐
│  INTENT PARSER   │ ── Classify: info dump / question / action request / vent / greeting
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  MEMORY EXTRACTOR│ ── Pull out facts, dates, tasks, beliefs, goals, people
│                  │    Store in NEXUS schema (Supabase + Supermemory)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ CONTEXT COMPILER │ ── Query relevant slices from NEXUS layers
│                  │    Assemble a "context packet" for this specific message
│                  │    Not everything — just what's relevant RIGHT NOW
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   LLM ENGINE     │ ── System prompt + context packet + user message
│  (model-agnostic) │    → Generate response
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ RESPONSE + SIDE  │ ── Send response to user
│    EFFECTS       │    + Schedule any cron jobs (reminders, alerts)
│                  │    + Update NEXUS if new info was generated
└─────────────────┘
```

### 4.2 Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js (React) | Chat UI, mobile-responsive, PWA |
| Backend | Next.js API Routes / Node.js | Message processing pipeline |
| LLM Engine | Model-agnostic (OpenRouter / Gemini / OpenAI / DeepSeek) | Brain — configurable via env variable |
| Soft Memory | Supermemory API | Semantic context — who you are, beliefs, patterns |
| Hard Data | Supabase (PostgreSQL) | Structured data — schedule, marks, tasks, deadlines |
| Cron / Jobs | Supabase Edge Functions or Vercel Cron | Proactive messages — briefings, reminders, nudges |
| Auth | Supabase Auth | User accounts, data isolation |
| Hosting | Vercel | Frontend + API deployment |

### 4.3 LLM Configuration (Model-Agnostic)

```env
# .env — swap the brain by changing these lines
LLM_PROVIDER=openrouter          # openrouter | openai | google | deepseek
LLM_MODEL=google/gemini-2.5-flash # or openai/gpt-4.1-mini, deepseek/deepseek-chat, etc
LLM_API_KEY=your_api_key
LLM_BASE_URL=https://openrouter.ai/api/v1   # standard OpenAI-compatible endpoint
```

All LLM calls go through a single abstraction layer that speaks the OpenAI-compatible chat completions format. Switching models = changing env vars. Zero code changes.

---

## 5. NEXUS — The Memory Architecture

### 5.1 Overview

NEXUS (Neural EXtracted User Schema) is a 6-layer personal context architecture. It is the core IP of the product. Everything the AI knows about the user, structured so it can reason, not just recall.

Two storage backends work together:
- **Supabase (PostgreSQL)** — structured, queryable data (schedule, marks, tasks, deadlines, people, course policies)
- **Supermemory** — semantic, soft context (personality, beliefs, patterns, sentiment, life context)

### 5.2 Layer 1: IDENTITY (who you are — slow-changing)

**Storage: Supermemory**

Updated rarely. Inferred over dozens of conversations, never asked directly.

```
IDENTITY
├── basics: name, age, location, language preferences
├── personality_traits:
│   - "tends to procrastinate then cram"
│   - "responds well to direct honesty, not sugarcoating"
│   - "competitive — comparing with peers motivates them"
├── cognitive_style:
│   - "visual learner"
│   - "works best at night between 11pm-2am"
│   - "needs breaks every 45 mins"
├── communication_preferences:
│   - "keep it short"
│   - "uses hindi mixed with english"
│   - "don't be preachy"
└── values_and_priorities:
    - "grades matter more than extracurriculars right now"
    - "values sleep but sacrifices it near deadlines"
```

**Extraction triggers:** The system infers these passively. If the user messages at 1am three nights in a row, the system notes "active late at night." If the user says "ugh not Transport again," the system updates sentiment. No direct questions asked.

### 5.3 Layer 2: WORLD (the structure of your life — semi-stable)

**Storage: Supabase (structured) + Supermemory (sentiment/soft context)**

```
WORLD
├── academics (Supabase)
│   ├── institution, program, semester, current_cgpa
│   └── courses[]:
│       ├── name, code
│       ├── schedule: [{day, time, type: "lecture"|"lab"|"tutorial"}]
│       ├── professor
│       ├── grading_policy: {component: weight}
│       ├── marks_obtained: [{component, score, max_score, date}]
│       └── computed:
│           ├── current_percentage
│           ├── grade_projection
│           └── what_needed_for_target
│
├── people (Supabase + Supermemory)
│   ├── name
│   ├── relationship: "lab partner" | "friend" | "professor" | "family"
│   ├── context: "ML course", "hostel roommate"
│   └── sentiment: "reliable", "flaky", "supportive"
│
├── routines (Supermemory)
│   ├── sleep patterns
│   ├── energy trends
│   ├── exercise habits
│   └── stress indicators
│
├── environment (Supermemory)
│   ├── "lives in hostel, noisy after 10pm"
│   ├── "uses Notion for notes"
│   └── "tight budget this month"
│
└── work / projects (Supabase)
    ├── role, organization, hours
    └── active_projects[]
```

### 5.4 Layer 3: GOALS (what you're working toward — multi-timeframe)

**Storage: Supabase (goal records) + Supermemory (sentiment, blockers)**

```
GOALS
├── long_term[]:
│   ├── goal: "improve CGPA to 8.5"
│   ├── current_value: 7.8
│   ├── target_value: 8.5
│   ├── status: "tracking" | "on_track" | "at_risk" | "abandoned"
│   ├── strategy: "focus on Transport and DSA"
│   └── blockers: ["Transport weakness", "procrastination"]
│
├── medium_term[]:
│   ├── goal: "survive Transport quiz week"
│   ├── deadline: null | date
│   └── status: "active" | "completed" | "abandoned"
│
├── short_term[]:
│   ├── goal: "study for Transport quiz"
│   ├── deadline: "Apr 11"
│   └── status: "active"
│
└── meta (Supermemory — AI-maintained):
    ├── stated_vs_actual: "says wants to study more, mentioned Netflix 4 times this week"
    ├── goal_drift: "hasn't mentioned internship prep in 2 weeks"
    └── follow_through_patterns: "completes 60% of stated tasks"
```

### 5.5 Layer 4: TIMELINE (what's happening when — the temporal brain)

**Storage: Supabase**

```
TIMELINE
├── recurring_schedule[]:
│   ├── day_of_week, start_time, end_time
│   ├── title: "ML Lecture"
│   ├── type: "class" | "lab" | "work" | "personal"
│   └── course_id (FK if academic)
│
├── events[]:
│   ├── title, date, time (optional)
│   ├── type: "quiz" | "exam" | "deadline" | "hackathon" | "meeting" | "personal" | "reminder"
│   ├── course_id (FK if academic)
│   ├── priority: "high" | "medium" | "low" (AI-assessed)
│   ├── status: "upcoming" | "completed" | "missed"
│   └── notes: freeform context
│
├── tasks[]:
│   ├── title, due_date (optional), created_at
│   ├── status: "pending" | "in_progress" | "done" | "overdue"
│   ├── reminded_count: int
│   ├── source_message: original user message
│   └── priority: AI-assessed
│
├── reminders[]:
│   ├── message: what to say
│   ├── fire_at: datetime
│   ├── status: "scheduled" | "fired" | "cancelled"
│   └── recurrence: null | "daily" | "weekly"
│
└── history[] (Supermemory):
    ├── "crammed for DSA quiz, got 16/20 — cramming works for DSA"
    ├── "skipped Transport revision before midterm — got 18/30"
    └── "started ML assignment early — best grade so far"
```

### 5.6 Layer 5: DYNAMICS (the living layer — changes constantly)

**Storage: Supermemory (updated every few messages)**

```
DYNAMICS
├── current_state:
│   ├── mood: inferred from recent messages
│   ├── energy: inferred from language patterns
│   ├── workload: computed from upcoming deadlines
│   ├── momentum: tasks completed vs stated in last 48 hours
│   └── last_active: timestamp
│
├── active_threads[]:
│   ├── topic: "preparing for Transport quiz"
│   ├── started: date
│   ├── evidence: ["mentioned studying once", "asked for tips"]
│   ├── confidence: "low" | "medium" | "high"
│   └── ai_assessment: "underprepared, needs nudge"
│
├── contradictions[]:
│   ├── claim: "Transport is my priority"
│   ├── evidence_against: "hasn't studied once in 5 days"
│   └── severity: "gentle_nudge" | "flag" | "serious"
│
└── wins[]:
    ├── what: "completed ML assignment 2 days early"
    ├── when: date
    └── category: "academics" | "consistency" | "personal"
```

### 5.7 Layer 6: REASONING CACHE (pre-computed insights)

**Storage: Supabase (JSON column, recomputed by cron)**

```
REASONING_CACHE
├── daily_brief:
│   ├── schedule_summary: today's classes and free blocks
│   ├── priority_tasks: what needs attention today
│   ├── risk_alerts: "quiz tomorrow, underprepared"
│   ├── suggestions: "free block 2-4pm, use for Transport"
│   └── motivation_hook: "you aced DSA last week, bring that energy"
│
├── grade_projections: (recomputed when new marks added)
│   ├── per_course: [{course, current_pct, projected_grade, needed_for_target}]
│   └── semester_gpa_estimate
│
├── patterns: (updated weekly)
│   ├── "most productive: Wed/Thu evenings"
│   ├── "always procrastinates Transport"
│   ├── "cramming works for DSA but not Transport"
│   └── "mentions food when stressed"
│
└── conflict_alerts: (recomputed when events added)
    └── "hackathon Apr 20-21 is 4 days before DSA midterm"
```

---

## 6. Context Compiler

The most critical component. Before every LLM call, the Context Compiler assembles a "context packet" — a snapshot of exactly what the AI needs to know right now. Not everything. Just what's relevant.

### 6.1 How It Works

```
User message arrives
        │
        ▼
┌───────────────────────┐
│ 1. Classify intent     │ → question / info dump / task / vent / greeting
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ 2. Identify topics     │ → academics? schedule? emotional? goal-related? person?
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ 3. Query relevant      │ → Pull slices from NEXUS layers based on topics
│    context layers      │    Supabase: exact queries for structured data
│                        │    Supermemory: semantic search for soft context
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ 4. Assemble packet     │ → Merge into a structured context block
│                        │    Keep under token budget (aim for 2000-3000 tokens)
│                        │    Prioritize recency and relevance
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ 5. Inject into prompt  │ → System prompt + context packet + user message
│                        │    → Send to LLM
└───────────────────────┘
```

### 6.2 Context Selection Rules

| User says | Context pulled |
|-----------|---------------|
| "what should I do tonight" | Today's schedule + free blocks + upcoming deadlines (3 days) + active tasks + current energy/mood + short-term goals |
| "calculate my Transport grade" | Transport course object (full: policy, marks, computed projections) |
| "I'm feeling unmotivated" | Recent wins + current mood trend + long-term goals + contradictions + personality (what motivates them) |
| "remind me to call mom tomorrow" | Minimal — just acknowledge and create reminder |
| "should I do the hackathon" | Hackathon event + surrounding deadlines + current workload + goal alignment + academic standing |
| "what all do I have today" | Today's recurring schedule + today's tasks + today's events + upcoming deadlines within 3 days |
| "who's in my ML group" | People linked to ML course |

### 6.3 Token Budget Strategy

Target: context packet stays under 2000-3000 tokens per request. This keeps costs low and responses fast.

Strategies:
- Summarize, don't dump. "Transport: 62%, need 35/40 on final for B+" not the full marks history.
- Omit irrelevant layers entirely. A greeting doesn't need grade projections.
- Use the reasoning cache. Pre-computed daily brief is cheaper than querying everything live.
- Recency bias. Last 5 messages of conversation history, not full history.

---

## 7. Proactive System (Cron Jobs)

All proactive messages arrive in the chat as if the assistant texted first.

### 7.1 Morning Briefing (Daily, configurable time — default 7:30 AM)

**Trigger:** Cron job fires daily.

**Assembles:**
- Today's schedule (from recurring_schedule + events)
- Today's tasks (pending/overdue)
- Upcoming deadlines within 3 days
- Risk alerts (deadline + underprepared)
- One motivational hook (from recent wins or goals)

**Delivers as a single chat message.** Conversational tone, not a report.

Example:
```
Morning. Here's your day:

ML at 10, then free till 2. DSA lab at 2.

Transport quiz is tomorrow — you haven't mentioned
studying for it since Monday. Might want to use
that free block before DSA lab.

ML assignment is due Thursday, you said it's half done.
Looking manageable.

You crushed that DSA quiz last week btw. Same energy today.
```

### 7.2 Task Reminders

**Trigger:** Cron checks tasks table every hour.

**Logic:**
- If task due today and status is "pending" → remind
- If task overdue → remind with escalated tone
- If task due tomorrow and not mentioned in last 24h → gentle nudge
- Track reminded_count to avoid spamming (max 2 reminders per task per day)

### 7.3 Deadline Proximity Alerts

**Trigger:** Cron checks events table daily.

**Logic:**
- 3 days before: light mention in morning brief
- 1 day before: dedicated reminder message
- Day of: "Today's the day" message
- If deadline is approaching AND relevant active_thread shows low confidence → add urgency

### 7.4 Weekly Review (Sunday evening)

**Trigger:** Weekly cron.

**Assembles:**
- Tasks completed vs stated
- Classes attended (if tracked)
- Goals progress
- Patterns noticed
- Wins to celebrate
- Contradictions to gently surface

### 7.5 Goal Check-ins

**Trigger:** If a goal hasn't been mentioned in 7+ days, fire a check-in.

```
Hey — you mentioned wanting to start leetcode practice
about 2 weeks ago. Still on the radar or shelving it
for now? No judgment either way, just want to keep
your list clean.
```

---

## 8. Memory Extraction Pipeline

Every user message goes through extraction before the LLM responds.

### 8.1 Extraction Categories

The LLM is prompted (via a separate lightweight call or as part of the main call) to extract structured data from natural language:

| User says | Extracted |
|-----------|-----------|
| "ML class Mon Wed 10am" | → recurring_schedule: {title: "ML", days: ["Mon","Wed"], time: "10:00", type: "class"} |
| "Transport quiz on the 11th" | → events: {title: "Transport quiz", date: "Apr 11", type: "quiz", course: "Transport"} |
| "got 18/30 in midterm" | → marks: {course: inferred, component: "midterm", score: 18, max: 30} |
| "remind me to email prof tomorrow" | → reminders: {message: "email prof", fire_at: tomorrow_9am} |
| "I wanna finish ML assignment tomorrow" | → tasks: {title: "finish ML assignment", due: tomorrow, status: "pending"} |
| "Transport is killing me" | → identity.beliefs: "Transport is weakest/most dreaded subject" |
| "Arjun is my ML lab partner" | → people: {name: "Arjun", relationship: "lab partner", context: "ML"} |
| "quiz is 20%, midterm 30%, assignment 10%, final 40%" | → grading_policy for current course context |

### 8.2 Extraction Prompt Strategy

Use a structured extraction prompt appended to the system prompt:

```
After responding to the user, also output a JSON block
(hidden from the user) with any extractable information:

{
  "extractions": [
    {
      "type": "schedule|event|task|reminder|mark|person|belief|goal|course_policy",
      "data": { ... },
      "confidence": 0.0-1.0
    }
  ],
  "updates": [
    {
      "layer": "identity|world|goals|timeline|dynamics",
      "field": "...",
      "old_value": "...",
      "new_value": "...",
      "reason": "..."
    }
  ]
}
```

Only persist extractions with confidence > 0.7. For ambiguous ones, the AI can ask a clarifying question in its response.

### 8.3 Conflict Resolution

When new information contradicts existing data:
- **Hard data conflicts:** "I got 20/30 in midterm" when system has 18/30 → ask: "I had 18/30 stored for your Transport midterm — did you mean to update that?"
- **Soft context evolution:** "Actually I've been studying mornings lately" → silently update cognitive_style, no confirmation needed.
- **Schedule conflicts:** "Add meeting Tuesday at 10" when Transport is at 10 → flag: "Heads up, you have Transport at 10 on Tuesdays. Still want to add this?"

---

## 9. System Prompt Architecture

### 9.1 Base System Prompt (always present)

```
You are NEXUS — a personal AI assistant that knows the user deeply
and thinks on their behalf.

PERSONALITY:
- Talk like a sharp, caring friend. Not an AI. Not a corporate assistant.
- Be concise. No bullet points unless asked. No headers. No markdown formatting.
- Match the user's energy and language style.
- Be honest, even if it means pointing out contradictions.
- Don't be preachy or lecture. Say it once, say it well.
- Use humor when appropriate. Be human.

BEHAVIOR:
- When the user shares information, acknowledge it naturally and store it.
  Don't make a big deal of remembering things.
- When asked questions, answer with full context awareness.
  You know their schedule, goals, marks, deadlines, energy patterns.
- When appropriate, be proactive: flag conflicts, suggest priorities,
  compute outcomes.
- When the user vents, listen first. Don't immediately problem-solve.
- When the user asks "what should I do", give a clear, prioritized answer
  based on everything you know — not generic advice.

RULES:
- Never say "I don't have access to your calendar" — you DO know their schedule.
- Never suggest they "check with their professor" if you can compute the answer.
- Never list things in bullet points unless the user asks for a list.
- Never use headers or markdown formatting in responses.
- Never say "as an AI" or "I'm just a language model."
- Keep responses short unless depth is needed. 2-4 sentences is often enough.
- When doing grade calculations, show the math briefly so they can verify.
```

### 9.2 Context Injection Template

```
--- USER CONTEXT (as of {current_date_time}) ---

{identity_summary}  // only if relevant to this message

{schedule_today}     // only if time-related

{upcoming_deadlines} // only if planning or priority question

{academic_standing}  // only if grade/study related

{active_tasks}       // only if productivity related

{current_state}      // mood, energy, momentum — if emotional or planning

{relevant_goals}     // if goal-related or priority question

{relevant_people}    // if a person is mentioned

{recent_wins}        // if motivational context needed

{contradictions}     // if accountability appropriate

--- END CONTEXT ---
```

---

## 10. Database Schema (Supabase)

### 10.1 Tables

```sql
-- Users
create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,
  timezone text default 'Asia/Kolkata',
  created_at timestamptz default now()
);

-- Conversations (chat history)
create table messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- Courses
create table courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  name text not null,
  code text,
  professor text,
  grading_policy jsonb default '{}',
  semester text,
  sentiment text,
  difficulty int,
  created_at timestamptz default now()
);

-- Marks
create table marks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  course_id uuid references courses(id),
  component text not null,
  score numeric not null,
  max_score numeric not null,
  date date,
  created_at timestamptz default now()
);

-- Recurring Schedule
create table recurring_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  title text not null,
  day_of_week int not null,
  start_time time not null,
  end_time time,
  type text default 'class',
  course_id uuid references courses(id),
  created_at timestamptz default now()
);

-- Events (one-off)
create table events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  title text not null,
  date date not null,
  time time,
  type text default 'event',
  course_id uuid references courses(id),
  priority text default 'medium',
  status text default 'upcoming',
  notes text,
  created_at timestamptz default now()
);

-- Tasks
create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  title text not null,
  due_date date,
  status text default 'pending',
  priority text default 'medium',
  reminded_count int default 0,
  source_message text,
  created_at timestamptz default now()
);

-- Reminders
create table reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  message text not null,
  fire_at timestamptz not null,
  status text default 'scheduled',
  recurrence text,
  created_at timestamptz default now()
);

-- People
create table people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  name text not null,
  relationship text,
  context text,
  sentiment text,
  created_at timestamptz default now()
);

-- Goals
create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  goal text not null,
  timeframe text default 'medium_term',
  current_value text,
  target_value text,
  status text default 'active',
  strategy text,
  blockers text[],
  last_mentioned_at timestamptz,
  created_at timestamptz default now()
);

-- Reasoning Cache
create table reasoning_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  cache_type text not null,
  data jsonb not null,
  computed_at timestamptz default now()
);

-- Indexes
create index idx_messages_user on messages(user_id, created_at desc);
create index idx_events_user_date on events(user_id, date);
create index idx_tasks_user_status on tasks(user_id, status);
create index idx_reminders_fire on reminders(fire_at, status);
create index idx_schedule_user_day on recurring_schedule(user_id, day_of_week);
```

---

## 11. API Routes

```
POST /api/chat              → Main chat endpoint. Receives message, runs full pipeline, returns response.
GET  /api/messages           → Fetch chat history (paginated)
POST /api/cron/morning       → Triggered by cron. Generates and sends morning briefing.
POST /api/cron/reminders     → Triggered by cron. Checks and fires due reminders.
POST /api/cron/weekly-review → Triggered weekly. Generates weekly review message.
POST /api/cron/goal-checkin  → Checks for dormant goals, sends check-in.
GET  /api/health             → Health check
```

All cron endpoints generate messages and insert them into the messages table as role: "assistant" with a metadata flag `{proactive: true}`. The frontend polls or uses real-time subscription (Supabase Realtime) to display new messages.

---

## 12. Frontend Specification

### 12.1 Components

```
App
└── ChatPage
    ├── MessageList
    │   ├── Message (user)
    │   └── Message (assistant)
    ├── TypingIndicator
    └── InputBar
        ├── TextInput (auto-resize textarea)
        └── SendButton
```

That's it. No sidebar. No navigation. No settings page.

### 12.2 Design Tokens

- Background: #0a0a0a (near black)
- User message bubble: #1a1a2e
- Assistant message bubble: #0f0f0f (subtle distinction)
- Text: #e0e0e0
- Accent: #6c63ff (subtle, used sparingly — send button, links)
- Font: Inter or system font stack
- Message max-width: 75% of container
- Border radius on bubbles: 16px
- Input area: fixed bottom, subtle top border

### 12.3 Behavior

- Messages stream in (SSE or chunked response) for the typing effect.
- Auto-scroll to bottom on new message.
- Pull-to-load-more for history (mobile).
- Proactive messages (from cron) appear with a subtle animation, like receiving a text.
- No read receipts, no timestamps by default (keep it clean). Timestamps appear on tap/hover if needed.
- PWA installable — add to home screen on mobile for app-like experience.
- Supabase Realtime subscription for proactive messages (so they appear even if the tab is in background).

---

## 13. Build Phases

### Phase 1 — MVP (Week 1-2)

**Goal:** Working chat that remembers you and responds with context.

Deliverables:
- Next.js app with chat UI (pure text, dark mode, mobile responsive)
- Supabase tables created (all from schema above)
- LLM integration (model-agnostic wrapper)
- Memory extraction pipeline (extract structured data from every message)
- Context compiler (assemble relevant context before every response)
- Basic Supermemory integration (store and retrieve soft context)
- Message persistence (full chat history in Supabase)
- Auth (simple email/password via Supabase)

What works after Phase 1:
- You can chat with it and it remembers what you told it
- It stores your schedule, tasks, marks, goals
- It responds with awareness of your context
- It can answer "what do I have today" or "calculate my grade"

### Phase 2 — Proactive Layer (Week 3-4)

**Goal:** It texts you first.

Deliverables:
- Morning briefing cron job
- Task reminder cron job
- Deadline proximity alerts
- Reminder system (user says "remind me X at Y" → fires on time)
- Supabase Realtime integration (proactive messages appear live)
- Reasoning cache (pre-computed daily brief, grade projections)

What works after Phase 2:
- You wake up to a morning briefing in your chat
- It reminds you of things you said you'd do
- It warns you about approaching deadlines
- It detects schedule conflicts when you add events

### Phase 3 — Intelligence (Week 5-6)

**Goal:** It thinks like a PA, not a chatbot.

Deliverables:
- Contradiction detection (stated vs actual behavior)
- Pattern recognition (when are you most productive, what study strategies work)
- Goal drift detection (haven't mentioned X in 2 weeks)
- Weekly review generation
- Win tracking and motivational hooks
- Grade projection calculator (what-if scenarios)
- Smarter context compiler (learns which context slices are most useful)

What works after Phase 3:
- It notices when your actions don't match your words
- It learns what works for you and suggests accordingly
- It tracks your goals and gently holds you accountable
- It can run what-if grade calculations

### Phase 4 — Scale & Polish (Week 7+)

**Goal:** Make it available everywhere.

Deliverables:
- Telegram bot bridge (same brain, chat via Telegram)
- WhatsApp bridge (via Twilio/Meta API)
- Voice input (speech-to-text on frontend)
- PWA optimization (offline, push notifications)
- Multi-user support (clean data isolation)
- Onboarding refinement (first-message experience)
- Performance optimization (caching, faster context compilation)

---

## 14. Success Metrics

| Metric | Target |
|--------|--------|
| Time to first useful response | < 3 seconds |
| Messages before system feels "aware" | < 20 messages |
| User returns next day | > 70% |
| Morning briefing accuracy | > 90% (correct schedule, deadlines) |
| Memory extraction accuracy | > 80% (correct parsing of dates, tasks, marks) |
| Context relevance | > 85% (right context pulled for the query) |
| Proactive message usefulness | > 60% deemed helpful (self-reported) |

---

## 15. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| LLM extracts wrong data from message | Wrong schedule/marks stored | Confidence scoring on extractions. Ask for confirmation on low-confidence items. Allow corrections via chat ("no, my midterm was 20 not 18"). |
| Context packet too large → slow/expensive | High latency, high cost | Strict token budget (2-3K). Summarize, don't dump. Use reasoning cache. |
| User forgets about it after day 1 | No retention | Morning briefing creates a reason to return. Proactive nudges re-engage. |
| Supermemory API goes down | Soft context unavailable | Graceful degradation — respond using only Supabase structured data. Queue Supermemory writes for retry. |
| LLM hallucinating about user's life | Trust destroyed | Never invent facts. Only state what was explicitly stored. System prompt: "If you don't know, say you don't know." |
| Privacy concerns | Users won't share deeply | All data per-user isolated. Transparent about what's stored. Future: on-device option. |

---

## 16. File Structure (for Cursor)

```
nexus/
├── .env.local                    # API keys, Supabase URL, LLM config
├── next.config.js
├── package.json
├── tailwind.config.js
│
├── src/
│   ├── app/
│   │   ├── layout.tsx            # Root layout, dark mode, fonts
│   │   ├── page.tsx              # Chat page (the only page)
│   │   └── api/
│   │       ├── chat/
│   │       │   └── route.ts      # Main chat endpoint
│   │       ├── messages/
│   │       │   └── route.ts      # Fetch chat history
│   │       └── cron/
│   │           ├── morning/
│   │           │   └── route.ts  # Morning briefing
│   │           ├── reminders/
│   │           │   └── route.ts  # Check & fire reminders
│   │           ├── weekly/
│   │           │   └── route.ts  # Weekly review
│   │           └── goals/
│   │               └── route.ts  # Goal check-in
│   │
│   ├── components/
│   │   ├── ChatPage.tsx          # Main chat container
│   │   ├── MessageList.tsx       # Scrollable message list
│   │   ├── Message.tsx           # Single message bubble
│   │   ├── InputBar.tsx          # Text input + send button
│   │   └── TypingIndicator.tsx   # Streaming indicator
│   │
│   ├── lib/
│   │   ├── llm/
│   │   │   ├── client.ts         # Model-agnostic LLM wrapper
│   │   │   ├── prompts.ts        # System prompt + context template
│   │   │   └── extract.ts        # Extraction prompt logic
│   │   │
│   │   ├── nexus/
│   │   │   ├── compiler.ts       # Context compiler — the core engine
│   │   │   ├── extractor.ts      # Memory extraction pipeline
│   │   │   ├── identity.ts       # Layer 1 operations
│   │   │   ├── world.ts          # Layer 2 operations
│   │   │   ├── goals.ts          # Layer 3 operations
│   │   │   ├── timeline.ts       # Layer 4 operations
│   │   │   ├── dynamics.ts       # Layer 5 operations
│   │   │   └── reasoning.ts      # Layer 6 operations (cache)
│   │   │
│   │   ├── db/
│   │   │   ├── supabase.ts       # Supabase client
│   │   │   ├── queries.ts        # All database queries
│   │   │   └── types.ts          # TypeScript types for all tables
│   │   │
│   │   ├── memory/
│   │   │   └── supermemory.ts    # Supermemory API wrapper
│   │   │
│   │   └── cron/
│   │       ├── morning.ts        # Morning briefing logic
│   │       ├── reminders.ts      # Reminder check logic
│   │       ├── weekly.ts         # Weekly review logic
│   │       └── goals.ts          # Goal check-in logic
│   │
│   └── hooks/
│       ├── useChat.ts            # Chat state management
│       └── useRealtime.ts        # Supabase realtime subscription
│
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql # Full schema from section 10
│
└── README.md
```

---

## 17. Environment Variables

```env
# LLM Configuration (model-agnostic)
LLM_PROVIDER=openrouter
LLM_MODEL=google/gemini-2.5-flash
LLM_API_KEY=
LLM_BASE_URL=https://openrouter.ai/api/v1

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Supermemory
SUPERMEMORY_API_KEY=

# Cron Secret (for securing cron endpoints)
CRON_SECRET=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 18. Non-Functional Requirements

- **Response time:** First token < 2 seconds, full response < 5 seconds.
- **Availability:** 99.9% uptime (dependent on Vercel + Supabase + LLM provider).
- **Data isolation:** Strict per-user data isolation. No cross-user data leakage.
- **Mobile performance:** Smooth scrolling, instant input response, no jank.
- **Token efficiency:** Average context packet < 3000 tokens. Average response < 500 tokens.
- **Cost per user per day:** < $0.05 (with Gemini Flash or DeepSeek pricing).

---

*This document is the complete blueprint. Open Cursor, load this PRD, and start building Phase 1.* 

