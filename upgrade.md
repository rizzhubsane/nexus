# UPGRADE.md — The Breathing Brain

## What This Document Is

This document describes a fundamental architectural upgrade to NEXUS. The current system uses separate cron jobs (morning briefing, reminders, goal check-ins) that fire at hardcoded times and dump large context into LLM prompts. This upgrade replaces all of that with a three-layer conscious architecture where the database itself is the brain, and the LLM is only invoked when the system determines something genuinely needs to be said.

**Read the full PRD (NEXUS_PRD.md) first for overall product context. This document only covers the proactive/consciousness upgrade.**

---

## The Problem With the Current System

### Current behavior:
- Separate cron jobs for morning briefing, reminders, goal check-ins, weekly review
- Each cron loads large amounts of user data, serializes it into a text prompt, and asks the LLM "what should I say?"
- Reminders are dumb timers — they fire at exact times regardless of context
- The LLM receives the user's entire life state every time, even when most of it is irrelevant
- No real awareness — the system wakes up on a schedule, reads a report, and speaks. That's not consciousness, that's a cuckoo clock.

### What's wrong with this:
1. **Lossy.** Structured database rows (score: 18, max: 30, component: midterm) degrade when serialized into prompt text. The precision of the database is lost.
2. **Doesn't scale.** As user data grows over months, prompt size balloons. You hit context limits or start summarizing, which means forgetting.
3. **Expensive.** Full context LLM calls every 30 minutes per user, even when there's nothing to say.
4. **Fake consciousness.** Re-reading everything periodically is not awareness. A real assistant knows things and gets alerted when something changes.

---

## The New Architecture: Three-Layer Consciousness

The brain is NOT the LLM. The brain is the system. The LLM is the mouth — it speaks when needed. Consciousness lives in the database layer and monitoring system.

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│   LAYER 1: THE SUBCONSCIOUS                         │
│   (Database triggers + SQL queries)                 │
│   Always watching. Zero LLM cost.                   │
│   Fires triggers when state changes matter.         │
│                                                     │
│   ┌─────────────────────────────────┐               │
│   │ deadline_monitor                │               │
│   │ overdue_monitor                 │               │
│   │ reminder_monitor                │               │
│   │ morning_monitor                 │               │
│   │ goal_drift_monitor              │               │
│   │ conflict_monitor (on INSERT)    │               │
│   │ grade_change_monitor (on INSERT)│               │
│   │ inactivity_monitor              │               │
│   └──────────────┬──────────────────┘               │
│                  │ fires trigger                     │
│                  ▼                                   │
│   ┌─────────────────────────────────┐               │
│   │                                 │               │
│   │   LAYER 2: THE ATTENTION FILTER │               │
│   │   (Pure code logic. No LLM.)    │               │
│   │                                 │               │
│   │   Decides: should we speak?     │               │
│   │   - Max 4 proactive msgs/day    │               │
│   │   - No messages 11pm-7am        │               │
│   │   - No double-texting < 30 min  │               │
│   │   - No duplicate notifications  │               │
│   │   - Urgency assessment          │               │
│   │                                 │               │
│   └──────────────┬──────────────────┘               │
│                  │ yes → speak                      │
│                  ▼                                   │
│   ┌─────────────────────────────────┐               │
│   │                                 │               │
│   │   LAYER 3: THE CONSCIOUS MIND   │               │
│   │   (LLM — invoked ONLY here)     │               │
│   │                                 │               │
│   │   Receives ONLY trigger-specific│               │
│   │   context (200-500 tokens).     │               │
│   │   Generates 2-4 sentence msg.   │               │
│   │                                 │               │
│   └─────────────────────────────────┘               │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Step 1: Create the Monitor System

**Delete** the existing separate cron route files:
- `/api/cron/morning/route.ts`
- `/api/cron/reminders/route.ts`
- `/api/cron/weekly/route.ts`
- `/api/cron/goals/route.ts`

**Replace with** a single heartbeat endpoint and a modular monitor system.

#### New file: `src/lib/brain/monitors.ts`

This file contains all the monitor functions. Each monitor is a pure database query that returns triggers (or nothing).

```typescript
import { supabase } from '@/lib/db/supabase';

// Types
export interface Trigger {
  type: 
    | 'deadline_approaching'
    | 'task_overdue'
    | 'reminder_due'
    | 'morning_briefing'
    | 'goal_dormant'
    | 'schedule_conflict'
    | 'grade_alert'
    | 'inactivity_nudge';
  userId: string;
  data: Record<string, any>;
  urgency: 'low' | 'medium' | 'high' | 'critical';
}

// ─── DEADLINE MONITOR ───
// Checks for events/deadlines within the next 24 hours that haven't been notified
export async function deadlineMonitor(userId: string): Promise<Trigger[]> {
  const triggers: Trigger[] = [];
  
  const { data: events } = await supabase
    .from('events')
    .select('*, courses(name)')
    .eq('user_id', userId)
    .eq('status', 'upcoming')
    .gte('date', new Date().toISOString().split('T')[0]) // today or later
    .lte('date', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]) // within 24h
    .in('type', ['quiz', 'exam', 'deadline']);
  
  if (events && events.length > 0) {
    for (const event of events) {
      triggers.push({
        type: 'deadline_approaching',
        userId,
        data: { event },
        urgency: event.type === 'exam' ? 'critical' : 'high',
      });
    }
  }
  
  return triggers;
}

// ─── OVERDUE TASK MONITOR ───
// Checks for tasks past their due date that are still pending
export async function overdueMonitor(userId: string): Promise<Trigger[]> {
  const triggers: Trigger[] = [];
  
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .lt('due_date', new Date().toISOString().split('T')[0]); // past due
  
  if (tasks && tasks.length > 0) {
    for (const task of tasks) {
      const hoursOverdue = Math.floor(
        (Date.now() - new Date(task.due_date).getTime()) / (1000 * 60 * 60)
      );
      triggers.push({
        type: 'task_overdue',
        userId,
        data: { task, hoursOverdue },
        urgency: hoursOverdue > 24 ? 'high' : 'medium',
      });
    }
  }
  
  return triggers;
}

// ─── REMINDER MONITOR ───
// Checks for reminders whose fire_at time has passed
export async function reminderMonitor(userId: string): Promise<Trigger[]> {
  const triggers: Trigger[] = [];
  
  const { data: reminders } = await supabase
    .from('reminders')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .lte('fire_at', new Date().toISOString());
  
  if (reminders && reminders.length > 0) {
    for (const reminder of reminders) {
      triggers.push({
        type: 'reminder_due',
        userId,
        data: { reminder },
        urgency: 'high', // User explicitly asked for this
      });
      
      // Mark reminder as fired immediately
      await supabase
        .from('reminders')
        .update({ status: 'fired' })
        .eq('id', reminder.id);
    }
  }
  
  return triggers;
}

// ─── MORNING BRIEFING MONITOR ───
// Checks if it's morning in user's timezone and no briefing has been sent today
export async function morningMonitor(userId: string, userTimezone: string): Promise<Trigger[]> {
  const triggers: Trigger[] = [];
  
  // Get current hour in user's timezone
  const userTime = new Date().toLocaleString('en-US', { timeZone: userTimezone, hour12: false });
  const userHour = parseInt(userTime.split(', ')[1]?.split(':')[0] || '0');
  
  // Only fire between 7:00 and 8:30 AM
  if (userHour < 7 || userHour > 8) return triggers;
  
  // Check if we already sent a morning briefing today
  const today = new Date().toISOString().split('T')[0];
  const { data: existing } = await supabase
    .from('messages')
    .select('id')
    .eq('user_id', userId)
    .eq('role', 'assistant')
    .gte('created_at', today)
    .contains('metadata', { proactive: true, trigger: 'morning_briefing' })
    .limit(1);
  
  if (!existing || existing.length === 0) {
    triggers.push({
      type: 'morning_briefing',
      userId,
      data: {},
      urgency: 'low',
    });
  }
  
  return triggers;
}

// ─── GOAL DRIFT MONITOR ───
// Checks for goals not mentioned in 7+ days
export async function goalDriftMonitor(userId: string): Promise<Trigger[]> {
  const triggers: Trigger[] = [];
  
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  
  const { data: goals } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .lt('last_mentioned_at', sevenDaysAgo);
  
  if (goals && goals.length > 0) {
    for (const goal of goals) {
      triggers.push({
        type: 'goal_dormant',
        userId,
        data: { goal },
        urgency: 'low',
      });
    }
  }
  
  return triggers;
}

// ─── INACTIVITY MONITOR ───
// Checks if user hasn't messaged in 24+ hours but has pending tasks
export async function inactivityMonitor(userId: string): Promise<Trigger[]> {
  const triggers: Trigger[] = [];
  
  // Get last user message
  const { data: lastMsg } = await supabase
    .from('messages')
    .select('created_at')
    .eq('user_id', userId)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(1);
  
  if (!lastMsg || lastMsg.length === 0) return triggers;
  
  const hoursSinceLastMessage = Math.floor(
    (Date.now() - new Date(lastMsg[0].created_at).getTime()) / (1000 * 60 * 60)
  );
  
  if (hoursSinceLastMessage < 24) return triggers;
  
  // Check if they have pending tasks or upcoming deadlines
  const { data: pendingTasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .limit(5);
  
  if (pendingTasks && pendingTasks.length > 0) {
    triggers.push({
      type: 'inactivity_nudge',
      userId,
      data: { pendingTasks, hoursSinceLastMessage },
      urgency: 'low',
    });
  }
  
  return triggers;
}

// ─── RUN ALL MONITORS ───
// Main function that runs all monitors for a given user
export async function runAllMonitors(userId: string, timezone: string): Promise<Trigger[]> {
  const allTriggers: Trigger[] = [];
  
  const results = await Promise.allSettled([
    deadlineMonitor(userId),
    overdueMonitor(userId),
    reminderMonitor(userId),
    morningMonitor(userId, timezone),
    goalDriftMonitor(userId),
    inactivityMonitor(userId),
  ]);
  
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allTriggers.push(...result.value);
    }
  }
  
  // Sort by urgency: critical > high > medium > low
  const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  allTriggers.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);
  
  return allTriggers;
}
```

---

### Step 2: Create the Attention Filter

#### New file: `src/lib/brain/attention.ts`

Pure code logic. No LLM calls. Decides whether a trigger should result in a message.

```typescript
import { supabase } from '@/lib/db/supabase';
import { Trigger } from './monitors';

interface AttentionDecision {
  shouldSpeak: boolean;
  reason: string;
}

export async function attentionFilter(trigger: Trigger): Promise<AttentionDecision> {
  const userId = trigger.userId;
  
  // ─── RULE 1: Max proactive messages per day ───
  const today = new Date().toISOString().split('T')[0];
  const { count: todayCount } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('role', 'assistant')
    .gte('created_at', today)
    .contains('metadata', { proactive: true });
  
  if ((todayCount || 0) >= 4) {
    // Exception: user-requested reminders always fire
    if (trigger.type !== 'reminder_due') {
      return { shouldSpeak: false, reason: 'Daily proactive limit reached (4)' };
    }
  }
  
  // ─── RULE 2: Night time silence ───
  // Get user timezone from the trigger or default
  const userTime = new Date().toLocaleString('en-US', { 
    timeZone: 'Asia/Kolkata', // TODO: pull from user record
    hour12: false 
  });
  const userHour = parseInt(userTime.split(', ')[1]?.split(':')[0] || '0');
  
  if (userHour >= 23 || userHour < 7) {
    // Only break night silence for explicit reminders or critical urgency
    if (trigger.type !== 'reminder_due' && trigger.urgency !== 'critical') {
      return { shouldSpeak: false, reason: 'Night hours — not urgent enough' };
    }
  }
  
  // ─── RULE 3: No double-texting within 30 minutes ───
  const { data: lastProactive } = await supabase
    .from('messages')
    .select('created_at')
    .eq('user_id', userId)
    .eq('role', 'assistant')
    .contains('metadata', { proactive: true })
    .order('created_at', { ascending: false })
    .limit(1);
  
  if (lastProactive && lastProactive.length > 0) {
    const minutesSinceLast = Math.floor(
      (Date.now() - new Date(lastProactive[0].created_at).getTime()) / (1000 * 60)
    );
    if (minutesSinceLast < 30 && trigger.type !== 'reminder_due') {
      return { shouldSpeak: false, reason: `Only ${minutesSinceLast}min since last proactive` };
    }
  }
  
  // ─── RULE 4: No duplicate notifications ───
  // Check if we already notified about this specific item today
  const triggerFingerprint = `${trigger.type}:${JSON.stringify(trigger.data?.event?.id || trigger.data?.task?.id || trigger.data?.goal?.id || trigger.data?.reminder?.id)}`;
  
  const { data: alreadyNotified } = await supabase
    .from('messages')
    .select('id')
    .eq('user_id', userId)
    .eq('role', 'assistant')
    .gte('created_at', today)
    .contains('metadata', { triggerFingerprint })
    .limit(1);
  
  if (alreadyNotified && alreadyNotified.length > 0) {
    // Exception: overdue tasks can be re-nudged once (max 2 per day)
    if (trigger.type !== 'task_overdue') {
      return { shouldSpeak: false, reason: 'Already notified about this today' };
    }
  }
  
  // ─── RULE 5: Trigger-specific rules ───
  switch (trigger.type) {
    case 'reminder_due':
      // User explicitly asked for this. Always fire.
      return { shouldSpeak: true, reason: 'User-requested reminder' };
    
    case 'deadline_approaching':
      // Always notify for deadlines within 24 hours
      return { shouldSpeak: true, reason: 'Deadline within 24 hours' };
    
    case 'task_overdue':
      // Only nudge if overdue by > 2 hours (breathing room)
      if (trigger.data.hoursOverdue < 2) {
        return { shouldSpeak: false, reason: 'Task barely overdue — give them time' };
      }
      return { shouldSpeak: true, reason: `Task overdue by ${trigger.data.hoursOverdue}h` };
    
    case 'morning_briefing':
      return { shouldSpeak: true, reason: 'Morning briefing time' };
    
    case 'goal_dormant':
      // Only if we haven't nagged much today
      if ((todayCount || 0) >= 2) {
        return { shouldSpeak: false, reason: 'Already sent enough messages today for a non-urgent nudge' };
      }
      return { shouldSpeak: true, reason: 'Goal dormant for 7+ days' };
    
    case 'schedule_conflict':
      // Always notify — this is contextual awareness
      return { shouldSpeak: true, reason: 'Schedule conflict detected' };
    
    case 'grade_alert':
      return { shouldSpeak: true, reason: 'Grade dropped below target' };
    
    case 'inactivity_nudge':
      // Only if there are genuinely pending things
      if ((trigger.data.pendingTasks?.length || 0) < 2) {
        return { shouldSpeak: false, reason: 'Not enough pending items to justify a nudge' };
      }
      return { shouldSpeak: true, reason: 'User inactive 24h+ with pending tasks' };
    
    default:
      return { shouldSpeak: false, reason: 'Unknown trigger type' };
  }
}
```

---

### Step 3: Create the Conscious Mind (Trigger-Specific LLM Calls)

#### New file: `src/lib/brain/conscious.ts`

This is where the LLM is invoked — but ONLY with a tiny, precise context packet specific to the trigger. Not the user's entire life.

```typescript
import { llm } from '@/lib/llm/client';
import { supabase } from '@/lib/db/supabase';
import { Trigger } from './monitors';

// ─── CONTEXT BUILDERS ───
// Each trigger type has its own minimal context builder.
// These query ONLY the specific data needed. Nothing more.

async function buildDeadlineContext(trigger: Trigger) {
  const event = trigger.data.event;
  const courseId = event.course_id;
  
  let marks = null;
  let courseName = event.courses?.name || event.title;
  
  if (courseId) {
    const { data } = await supabase
      .from('marks')
      .select('component, score, max_score')
      .eq('course_id', courseId)
      .order('created_at', { ascending: false })
      .limit(3);
    marks = data;
  }
  
  return {
    what: `${event.type}: ${event.title}`,
    when: event.date,
    time: event.time || 'not specified',
    course: courseName,
    recent_marks: marks, // shows how they're doing in this subject
  };
}

async function buildOverdueContext(trigger: Trigger) {
  return {
    task: trigger.data.task.title,
    was_due: trigger.data.task.due_date,
    hours_overdue: trigger.data.hoursOverdue,
    times_reminded: trigger.data.task.reminded_count,
  };
}

async function buildMorningContext(userId: string) {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ...
  const todayStr = today.toISOString().split('T')[0];
  const threeDaysOut = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  // Today's recurring schedule
  const { data: schedule } = await supabase
    .from('recurring_schedule')
    .select('title, start_time, end_time, type')
    .eq('user_id', userId)
    .eq('day_of_week', dayOfWeek)
    .order('start_time');
  
  // Today's one-off events
  const { data: todayEvents } = await supabase
    .from('events')
    .select('title, time, type')
    .eq('user_id', userId)
    .eq('date', todayStr)
    .eq('status', 'upcoming');
  
  // Tasks due today
  const { data: todayTasks } = await supabase
    .from('tasks')
    .select('title, status')
    .eq('user_id', userId)
    .eq('due_date', todayStr)
    .in('status', ['pending', 'in_progress']);
  
  // Overdue tasks
  const { data: overdueTasks } = await supabase
    .from('tasks')
    .select('title, due_date')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .lt('due_date', todayStr)
    .limit(3);
  
  // Upcoming deadlines within 3 days
  const { data: upcoming } = await supabase
    .from('events')
    .select('title, date, type')
    .eq('user_id', userId)
    .eq('status', 'upcoming')
    .gt('date', todayStr)
    .lte('date', threeDaysOut)
    .in('type', ['quiz', 'exam', 'deadline'])
    .order('date');
  
  return {
    schedule_today: schedule || [],
    events_today: todayEvents || [],
    tasks_today: todayTasks || [],
    overdue: overdueTasks || [],
    upcoming_3_days: upcoming || [],
  };
}

async function buildReminderContext(trigger: Trigger) {
  return {
    user_message: trigger.data.reminder.message,
    originally_set_at: trigger.data.reminder.created_at,
  };
}

async function buildGoalContext(trigger: Trigger) {
  return {
    goal: trigger.data.goal.goal,
    timeframe: trigger.data.goal.timeframe,
    last_mentioned: trigger.data.goal.last_mentioned_at,
    days_dormant: Math.floor(
      (Date.now() - new Date(trigger.data.goal.last_mentioned_at).getTime()) / (1000 * 60 * 60 * 24)
    ),
  };
}

async function buildInactivityContext(trigger: Trigger) {
  return {
    hours_since_last_message: trigger.data.hoursSinceLastMessage,
    pending_tasks: trigger.data.pendingTasks.map((t: any) => ({
      title: t.title,
      due: t.due_date,
    })),
  };
}

// ─── MAIN FUNCTION ───
// Builds trigger-specific context, calls LLM with minimal prompt

export async function generateProactiveMessage(trigger: Trigger): Promise<string> {
  let context: Record<string, any> = {};
  
  switch (trigger.type) {
    case 'deadline_approaching':
      context = await buildDeadlineContext(trigger);
      break;
    case 'task_overdue':
      context = await buildOverdueContext(trigger);
      break;
    case 'morning_briefing':
      context = await buildMorningContext(trigger.userId);
      break;
    case 'reminder_due':
      context = await buildReminderContext(trigger);
      break;
    case 'goal_dormant':
      context = await buildGoalContext(trigger);
      break;
    case 'inactivity_nudge':
      context = await buildInactivityContext(trigger);
      break;
    default:
      context = trigger.data;
  }
  
  const systemPrompt = getProactiveSystemPrompt(trigger.type);
  
  const response = await llm.chat({
    messages: [
      { role: 'system', content: systemPrompt },
      { 
        role: 'user', 
        content: JSON.stringify({
          trigger_type: trigger.type,
          urgency: trigger.urgency,
          context,
          current_time: new Date().toISOString(),
        })
      },
    ],
  });
  
  return response.content;
}

// ─── SYSTEM PROMPTS PER TRIGGER TYPE ───
// Each trigger type gets a focused prompt. Not a generic one.

function getProactiveSystemPrompt(triggerType: string): string {
  const base = `You are NEXUS, a personal AI assistant. You are sending a proactive message to the user — they didn't ask for this, you're texting them first. Be brief, natural, and conversational. Talk like a sharp friend, not a robot. No bullet points. No headers. No markdown. 2-4 sentences max unless it's a morning briefing (which can be slightly longer but still conversational). Never say "as an AI" or "I noticed in my records."`;
  
  const specific: Record<string, string> = {
    'deadline_approaching': `${base}
    
You're alerting them about an upcoming deadline. If you have their marks for this subject, weave in something relevant (like "you'll want to make up for the midterm" if they scored low). Be motivating, not stressful. If it's a quiz, keep it light. If it's an exam, be more serious.`,
    
    'task_overdue': `${base}

You're nudging them about an overdue task. Check how many times they've already been reminded — if it's the first time, be gentle. If it's the second+, be a bit more direct but not naggy. Never guilt trip. Acknowledge that life happens.`,
    
    'morning_briefing': `${base}

You're giving them their morning rundown. Start with a casual greeting. Mention today's schedule briefly. Highlight anything urgent (deadlines, overdue tasks). End with something motivating or a light observation. Keep the whole thing to 4-6 sentences. This should feel like a friend texting "hey here's your day" not a corporate daily standup.`,
    
    'reminder_due': `${base}

You're delivering a reminder the user explicitly set. Keep it very short — just deliver the reminder in a natural way. The user's original message tells you what they wanted to be reminded about. Don't add unnecessary commentary.`,
    
    'goal_dormant': `${base}

You're checking in on a goal they haven't mentioned in a while. Be genuinely curious, not judgmental. Give them an easy out ("still on the radar or shelving it for now? either way is fine"). This should feel like a friend asking, not a manager reviewing OKRs.`,
    
    'inactivity_nudge': `${base}

You haven't heard from them in a while and they have pending things. Don't guilt trip. Don't list all their pending tasks. Just casually check in — "hey, been quiet, everything good?" and maybe mention ONE pending thing gently. This is a wellness check, not a task review.`,
  };
  
  return specific[triggerType] || base;
}
```

---

### Step 4: Create the Heartbeat Endpoint

#### New file: `src/app/api/cron/heartbeat/route.ts`

This replaces ALL existing cron endpoints. One endpoint, one loop.

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db/supabase';
import { runAllMonitors, Trigger } from '@/lib/brain/monitors';
import { attentionFilter } from '@/lib/brain/attention';
import { generateProactiveMessage } from '@/lib/brain/conscious';

export async function POST(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Get all active users
  const { data: users } = await supabase
    .from('users')
    .select('id, timezone');
  
  if (!users || users.length === 0) {
    return NextResponse.json({ message: 'No users' });
  }
  
  const results = [];
  
  for (const user of users) {
    try {
      // LAYER 1: Run all monitors (pure SQL, no LLM)
      const triggers = await runAllMonitors(user.id, user.timezone || 'Asia/Kolkata');
      
      if (triggers.length === 0) {
        results.push({ userId: user.id, action: 'silent', reason: 'No triggers' });
        continue;
      }
      
      // Process triggers in priority order (already sorted by urgency)
      for (const trigger of triggers) {
        // LAYER 2: Attention filter (pure code, no LLM)
        const decision = await attentionFilter(trigger);
        
        if (!decision.shouldSpeak) {
          results.push({ 
            userId: user.id, 
            trigger: trigger.type, 
            action: 'filtered', 
            reason: decision.reason 
          });
          continue;
        }
        
        // LAYER 3: Generate message (LLM call — minimal context)
        const message = await generateProactiveMessage(trigger);
        
        // Save the proactive message to chat
        const triggerFingerprint = `${trigger.type}:${JSON.stringify(
          trigger.data?.event?.id || 
          trigger.data?.task?.id || 
          trigger.data?.goal?.id || 
          trigger.data?.reminder?.id || 
          'general'
        )}`;
        
        await supabase.from('messages').insert({
          user_id: user.id,
          role: 'assistant',
          content: message,
          metadata: {
            proactive: true,
            trigger: trigger.type,
            urgency: trigger.urgency,
            triggerFingerprint,
          },
        });
        
        // Update reminded_count for tasks if applicable
        if (trigger.type === 'task_overdue' && trigger.data.task?.id) {
          await supabase
            .from('tasks')
            .update({ reminded_count: (trigger.data.task.reminded_count || 0) + 1 })
            .eq('id', trigger.data.task.id);
        }
        
        results.push({ 
          userId: user.id, 
          trigger: trigger.type, 
          action: 'sent', 
          urgency: trigger.urgency 
        });
        
        // After sending one message, break for this user 
        // (don't send multiple proactive messages in one heartbeat cycle)
        break;
      }
    } catch (error) {
      results.push({ userId: user.id, action: 'error', error: String(error) });
    }
  }
  
  return NextResponse.json({ 
    timestamp: new Date().toISOString(),
    results 
  });
}
```

---

### Step 5: Add Reactive Monitors (Database Insert Triggers)

These monitors fire immediately when new data is inserted, not on a timer.

#### New file: `src/lib/brain/reactive.ts`

These functions are called from the main chat endpoint (`/api/chat/route.ts`) AFTER the extraction pipeline saves new data.

```typescript
import { supabase } from '@/lib/db/supabase';
import { Trigger } from './monitors';
import { attentionFilter } from './attention';
import { generateProactiveMessage } from './conscious';

// ─── CONFLICT DETECTOR ───
// Called immediately after a new event or schedule entry is inserted
export async function checkForConflicts(
  userId: string, 
  newItem: { date?: string; day_of_week?: number; start_time: string; end_time?: string; title: string }
): Promise<string | null> {
  
  // Check recurring schedule conflicts
  if (newItem.day_of_week !== undefined) {
    const { data: existing } = await supabase
      .from('recurring_schedule')
      .select('title, start_time, end_time')
      .eq('user_id', userId)
      .eq('day_of_week', newItem.day_of_week);
    
    if (existing) {
      for (const item of existing) {
        if (timesOverlap(newItem.start_time, newItem.end_time, item.start_time, item.end_time)) {
          return `Heads up — "${newItem.title}" overlaps with "${item.title}" (${item.start_time}-${item.end_time}). Want to keep both?`;
        }
      }
    }
  }
  
  // Check one-off event conflicts
  if (newItem.date) {
    const dayOfWeek = new Date(newItem.date).getDay();
    
    const { data: scheduleItems } = await supabase
      .from('recurring_schedule')
      .select('title, start_time, end_time')
      .eq('user_id', userId)
      .eq('day_of_week', dayOfWeek);
    
    if (scheduleItems) {
      for (const item of scheduleItems) {
        if (newItem.start_time && timesOverlap(newItem.start_time, newItem.end_time, item.start_time, item.end_time)) {
          return `That's during your "${item.title}" (${item.start_time}-${item.end_time}). Conflict?`;
        }
      }
    }
  }
  
  return null; // No conflict
}

// ─── GRADE RECOMPUTER ───
// Called immediately after a new mark is inserted
export async function recomputeGradeProjection(userId: string, courseId: string): Promise<{
  currentPercentage: number;
  projectedGrade: string;
  alert: string | null;
}> {
  // Get course grading policy
  const { data: course } = await supabase
    .from('courses')
    .select('name, grading_policy')
    .eq('id', courseId)
    .single();
  
  if (!course || !course.grading_policy) {
    return { currentPercentage: 0, projectedGrade: 'N/A', alert: null };
  }
  
  // Get all marks for this course
  const { data: marks } = await supabase
    .from('marks')
    .select('component, score, max_score')
    .eq('course_id', courseId);
  
  if (!marks || marks.length === 0) {
    return { currentPercentage: 0, projectedGrade: 'N/A', alert: null };
  }
  
  // Calculate weighted score
  const policy = course.grading_policy as Record<string, number>;
  let weightedTotal = 0;
  let weightCovered = 0;
  
  for (const mark of marks) {
    const componentWeight = policy[mark.component.toLowerCase()];
    if (componentWeight) {
      const percentage = (mark.score / mark.max_score) * 100;
      weightedTotal += percentage * (componentWeight / 100);
      weightCovered += componentWeight;
    }
  }
  
  const currentPercentage = weightCovered > 0 
    ? Math.round((weightedTotal / weightCovered) * 100) / 100 
    : 0;
  
  const projectedGrade = percentageToGrade(currentPercentage);
  
  // Check if grade is concerning
  let alert: string | null = null;
  if (currentPercentage < 50) {
    alert = `Your ${course.name} standing is at ${currentPercentage}% — that's in the danger zone.`;
  } else if (currentPercentage < 60) {
    alert = `${course.name} is at ${currentPercentage}%. Might want to push harder on the remaining assessments.`;
  }
  
  // Update reasoning cache
  await supabase.from('reasoning_cache').upsert({
    user_id: userId,
    cache_type: `grade_projection:${courseId}`,
    data: { currentPercentage, projectedGrade, weightCovered, weightedTotal },
    computed_at: new Date().toISOString(),
  }, { onConflict: 'user_id,cache_type' });
  
  return { currentPercentage, projectedGrade, alert };
}

// ─── HELPERS ───

function timesOverlap(
  start1: string, end1: string | undefined | null,
  start2: string, end2: string | undefined | null
): boolean {
  const s1 = timeToMinutes(start1);
  const e1 = end1 ? timeToMinutes(end1) : s1 + 60; // default 1 hour
  const s2 = timeToMinutes(start2);
  const e2 = end2 ? timeToMinutes(end2) : s2 + 60;
  return s1 < e2 && s2 < e1;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

function percentageToGrade(pct: number): string {
  if (pct >= 90) return 'A';
  if (pct >= 80) return 'A-';
  if (pct >= 70) return 'B+';
  if (pct >= 65) return 'B';
  if (pct >= 60) return 'B-';
  if (pct >= 55) return 'C+';
  if (pct >= 50) return 'C';
  if (pct >= 45) return 'D';
  return 'F';
}
```

---

### Step 6: Wire Reactive Monitors Into the Chat Pipeline

In `src/app/api/chat/route.ts`, after the extraction pipeline saves new data, call the reactive monitors:

```typescript
// ... inside the main chat handler, AFTER extraction saves data ...

// If a new event/schedule was extracted, check for conflicts
if (extractions.some(e => e.type === 'event' || e.type === 'schedule')) {
  const newItem = extractions.find(e => e.type === 'event' || e.type === 'schedule');
  const conflict = await checkForConflicts(userId, newItem.data);
  if (conflict) {
    // Append conflict warning to the LLM's response context
    // so the AI can mention it naturally in its reply
    additionalContext.conflictWarning = conflict;
  }
}

// If a new mark was extracted, recompute grade projection
if (extractions.some(e => e.type === 'mark')) {
  const markExtraction = extractions.find(e => e.type === 'mark');
  if (markExtraction.data.course_id) {
    const projection = await recomputeGradeProjection(userId, markExtraction.data.course_id);
    if (projection.alert) {
      additionalContext.gradeAlert = projection.alert;
    }
    additionalContext.gradeProjection = projection;
  }
}
```

---

### Step 7: Update Vercel Cron Configuration

#### Update `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/cron/heartbeat",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

Single cron. Every 5 minutes. Replaces everything.

**Note:** Vercel Hobby plan allows cron to run once per day. Vercel Pro allows every minute. If on Hobby plan, use an external cron service (cron-job.org, Upstash QStash, or similar) to hit the heartbeat endpoint every 5 minutes.

---

### Step 8: Update the Context Compiler for Reactive Chat

The context compiler in `src/lib/nexus/compiler.ts` should also follow the principle of minimal context. When the user sends a message, DON'T load everything. Classify first, then query only what's needed.

#### Update: `src/lib/nexus/compiler.ts`

```typescript
// Intent categories and what context they need
const CONTEXT_MAP: Record<string, string[]> = {
  'schedule_query':     ['schedule_today', 'events_today'],
  'planning':           ['schedule_today', 'tasks_pending', 'deadlines_3_days', 'current_mood'],
  'grade_question':     ['course_marks', 'grading_policy', 'grade_projection'],
  'task_management':    ['tasks_pending', 'tasks_overdue'],
  'goal_related':       ['active_goals', 'goal_progress'],
  'emotional':          ['recent_wins', 'current_mood', 'active_goals'],
  'person_related':     ['people'],
  'reminder_request':   [], // Minimal — just save the reminder
  'general_chat':       ['identity_summary'], // Light touch
  'what_should_i_do':   ['schedule_today', 'tasks_pending', 'deadlines_3_days', 'active_goals', 'current_mood'],
};

export async function compileContext(userId: string, message: string, intent: string): Promise<Record<string, any>> {
  const neededSlices = CONTEXT_MAP[intent] || CONTEXT_MAP['general_chat'];
  const context: Record<string, any> = {};
  
  // Only fetch what's needed
  for (const slice of neededSlices) {
    context[slice] = await fetchContextSlice(userId, slice);
  }
  
  return context;
}

async function fetchContextSlice(userId: string, slice: string): Promise<any> {
  switch (slice) {
    case 'schedule_today':
      const dayOfWeek = new Date().getDay();
      const { data: schedule } = await supabase
        .from('recurring_schedule')
        .select('title, start_time, end_time, type')
        .eq('user_id', userId)
        .eq('day_of_week', dayOfWeek)
        .order('start_time');
      return schedule;
    
    case 'tasks_pending':
      const { data: tasks } = await supabase
        .from('tasks')
        .select('title, due_date, priority')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('due_date')
        .limit(10);
      return tasks;
    
    case 'deadlines_3_days':
      const threeDays = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
      const { data: deadlines } = await supabase
        .from('events')
        .select('title, date, type')
        .eq('user_id', userId)
        .eq('status', 'upcoming')
        .lte('date', threeDays)
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date');
      return deadlines;
    
    case 'course_marks':
      // Will be filtered by course in the calling code
      return null; // handled specifically in grade questions
    
    case 'active_goals':
      const { data: goals } = await supabase
        .from('goals')
        .select('goal, timeframe, status, target_value, current_value')
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(5);
      return goals;
    
    case 'recent_wins':
      // Pull from Supermemory or reasoning_cache
      const { data: cache } = await supabase
        .from('reasoning_cache')
        .select('data')
        .eq('user_id', userId)
        .eq('cache_type', 'recent_wins')
        .single();
      return cache?.data;
    
    case 'identity_summary':
      // Pull from Supermemory — user's personality/preferences
      // Fallback to empty if Supermemory is down
      try {
        // TODO: Supermemory search for user identity/preferences
        return null;
      } catch {
        return null;
      }
    
    default:
      return null;
  }
}
```

---

### Step 9: Add Unique Constraint for Reasoning Cache Upserts

Add this to your Supabase migration:

```sql
-- Add unique constraint for reasoning_cache upserts
ALTER TABLE reasoning_cache ADD CONSTRAINT reasoning_cache_user_type_unique 
  UNIQUE (user_id, cache_type);
```

---

### Step 10: Updated File Structure

After this upgrade, the `src/lib/brain/` directory is the new core:

```
src/lib/brain/
├── monitors.ts      # Layer 1: SQL-based state monitors (the subconscious)
├── attention.ts     # Layer 2: Code-based filtering (should we speak?)
├── conscious.ts     # Layer 3: LLM message generation (minimal context)
└── reactive.ts      # Instant monitors: conflict detection, grade recomputation
```

Delete or deprecate:
```
src/lib/cron/
├── morning.ts       # REPLACED by heartbeat + morning_monitor
├── reminders.ts     # REPLACED by heartbeat + reminder_monitor
├── weekly.ts        # REPLACED by heartbeat + can add weekly_monitor later
└── goals.ts         # REPLACED by heartbeat + goal_drift_monitor
```

And:
```
src/app/api/cron/
├── morning/route.ts    # DELETE
├── reminders/route.ts  # DELETE
├── weekly/route.ts     # DELETE
├── goals/route.ts      # DELETE
└── heartbeat/route.ts  # NEW — the only cron endpoint
```

---

## Summary of What Changes

| Before | After |
|--------|-------|
| 4 separate cron endpoints | 1 heartbeat endpoint |
| Each cron dumps full context to LLM | Monitors are pure SQL, LLM only called when needed |
| LLM decides "should I message?" (expensive) | Code decides, LLM only generates the message (cheap) |
| Reminders are dumb timers | Reminders go through attention filter (context-aware) |
| No conflict detection | Instant conflict detection on data insert |
| No grade recomputation | Instant grade recomputation on mark insert |
| ~3000 tokens per proactive LLM call | ~200-500 tokens per proactive LLM call |
| Fake consciousness (periodic report reading) | Real awareness (database watches, system thinks, LLM speaks) |
| Fixed message timing | Dynamic — system decides optimal moment |

## Cost Comparison

**Before:** 4 cron jobs × ~3000 tokens × every 30 min = ~576 calls/day/user at ~3K tokens each = ~1.7M tokens/day/user

**After:** ~5-10 LLM calls/day/user (only when triggers pass filter) at ~500 tokens each = ~5K tokens/day/user

**That's a 340x reduction in token usage** while being MORE aware, not less.

-