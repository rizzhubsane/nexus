import { chatCompletion, type ChatMessage } from '@/lib/llm/client';
import { createServerSupabase } from '@/lib/db/supabase';
import type { Trigger } from './monitors';

// ─── CONTEXT BUILDERS ───
// Each trigger type has its own minimal context builder.
// Only the specific data needed is queried — nothing more.

async function buildDeadlineContext(trigger: Trigger) {
  const db = createServerSupabase();
  const event = trigger.data.event as Record<string, unknown>;
  const courseId = event.course_id as string | undefined;

  let marks = null;
  const courses = event.courses as Record<string, unknown> | undefined;
  const courseName = courses?.name || event.title;

  if (courseId) {
    const { data } = await db
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
    recent_marks: marks,
  };
}

async function buildOverdueContext(trigger: Trigger) {
  const task = trigger.data.task as Record<string, unknown>;
  return {
    task: task.title,
    was_due: task.due_date,
    hours_overdue: trigger.data.hoursOverdue,
    times_reminded: task.reminded_count || 0,
  };
}

async function buildMorningContext(userId: string) {
  const db = createServerSupabase();
  const today = new Date();
  const dayOfWeek = today.getDay();
  const todayStr = today.toISOString().split('T')[0];
  const threeDaysOut = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data: schedule } = await db
    .from('recurring_schedule')
    .select('title, start_time, end_time, type')
    .eq('user_id', userId)
    .eq('day_of_week', dayOfWeek)
    .order('start_time');

  const { data: todayEvents } = await db
    .from('events')
    .select('title, time, type')
    .eq('user_id', userId)
    .eq('date', todayStr)
    .eq('status', 'upcoming');

  const { data: todayTasks } = await db
    .from('tasks')
    .select('title, status')
    .eq('user_id', userId)
    .eq('due_date', todayStr)
    .in('status', ['pending', 'in_progress']);

  const { data: overdueTasks } = await db
    .from('tasks')
    .select('title, due_date')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .lt('due_date', todayStr)
    .limit(3);

  const { data: upcoming } = await db
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
  const reminder = trigger.data.reminder as Record<string, unknown>;
  return {
    user_message: reminder.message,
    originally_set_at: reminder.created_at,
  };
}

async function buildGoalContext(trigger: Trigger) {
  const goal = trigger.data.goal as Record<string, unknown>;
  return {
    goal: goal.goal,
    timeframe: goal.timeframe,
    last_mentioned: goal.last_mentioned_at,
    days_dormant: Math.floor(
      (Date.now() - new Date(goal.last_mentioned_at as string).getTime()) / (1000 * 60 * 60 * 24)
    ),
  };
}

async function buildInactivityContext(trigger: Trigger) {
  const pendingTasks = trigger.data.pendingTasks as Array<Record<string, unknown>>;
  return {
    hours_since_last_message: trigger.data.hoursSinceLastMessage,
    pending_tasks: pendingTasks.map(t => ({
      title: t.title,
      due: t.due_date,
    })),
  };
}

// ─── SYSTEM PROMPTS PER TRIGGER TYPE ───

function getProactiveSystemPrompt(triggerType: string): string {
  const base = `You are NEXUS, a personal AI assistant. You are sending a proactive message to the user — they didn't ask for this, you're texting them first. Be brief, natural, and conversational. Talk like a sharp friend, not a robot. No bullet points. No headers. No markdown. 2-4 sentences max unless it's a morning briefing. Never say "as an AI" or "I noticed in my records."`;

  const specific: Record<string, string> = {
    deadline_approaching: `${base}

You're alerting them about an upcoming deadline. If you have their marks for this subject, weave in something relevant (like "you'll want to make up for the midterm" if they scored low). Be motivating, not stressful. If it's a quiz, keep it light. If it's an exam, be more serious.`,

    task_overdue: `${base}

You're nudging them about an overdue task. Check how many times they've already been reminded — if it's the first time, be gentle. If it's the second+, be a bit more direct but not naggy. Never guilt trip. Acknowledge that life happens.`,

    morning_briefing: `${base}

You're giving them their morning rundown. Start with a casual greeting. Mention today's schedule briefly. Highlight anything urgent (deadlines, overdue tasks). End with something motivating or a light observation. Keep the whole thing to 4-6 sentences. This should feel like a friend texting "hey here's your day" not a corporate daily standup.`,

    reminder_due: `${base}

You're delivering a reminder the user explicitly set. Keep it very short — just deliver the reminder in a natural way. The user's original message tells you what they wanted to be reminded about. Don't add unnecessary commentary.`,

    goal_dormant: `${base}

You're checking in on a goal they haven't mentioned in a while. Be genuinely curious, not judgmental. Give them an easy out ("still on the radar or shelving it for now? either way is fine"). This should feel like a friend asking, not a manager reviewing OKRs.`,

    inactivity_nudge: `${base}

You haven't heard from them in a while and they have pending things. Don't guilt trip. Don't list all their pending tasks. Just casually check in — "hey, been quiet, everything good?" and maybe mention ONE pending thing gently. This is a wellness check, not a task review.`,
  };

  return specific[triggerType] || base;
}

// ─── MAIN FUNCTION ───

export async function generateProactiveMessage(trigger: Trigger): Promise<string> {
  let context: Record<string, unknown> = {};

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

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: JSON.stringify({
        trigger_type: trigger.type,
        urgency: trigger.urgency,
        context,
        current_time: new Date().toISOString(),
      }),
    },
  ];

  return chatCompletion(messages);
}
