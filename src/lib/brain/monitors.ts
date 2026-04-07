import { createServerSupabase } from '@/lib/db/supabase';

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
  data: Record<string, unknown>;
  urgency: 'low' | 'medium' | 'high' | 'critical';
}

// ─── DEADLINE MONITOR ───
// Checks for events/deadlines within the next 24 hours that haven't been notified
export async function deadlineMonitor(userId: string): Promise<Trigger[]> {
  const db = createServerSupabase();
  const triggers: Trigger[] = [];

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data: events } = await db
    .from('events')
    .select('*, courses(name)')
    .eq('user_id', userId)
    .eq('status', 'upcoming')
    .gte('date', today)
    .lte('date', tomorrow)
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
  const db = createServerSupabase();
  const triggers: Trigger[] = [];

  const today = new Date().toISOString().split('T')[0];

  const { data: tasks } = await db
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .lt('due_date', today);

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
  const db = createServerSupabase();
  const triggers: Trigger[] = [];

  const { data: reminders } = await db
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
        urgency: 'high',
      });

      // Mark reminder as fired immediately so it doesn't re-fire
      await db
        .from('reminders')
        .update({ status: 'fired' })
        .eq('id', reminder.id);

      // Reschedule if recurrent
      if (reminder.recurrence === 'daily') {
        const nextFire = new Date(reminder.fire_at);
        nextFire.setDate(nextFire.getDate() + 1);
        await db.from('reminders').insert({
          user_id: userId,
          message: reminder.message,
          fire_at: nextFire.toISOString(),
          status: 'scheduled',
          recurrence: 'daily',
        });
      } else if (reminder.recurrence === 'weekly') {
        const nextFire = new Date(reminder.fire_at);
        nextFire.setDate(nextFire.getDate() + 7);
        await db.from('reminders').insert({
          user_id: userId,
          message: reminder.message,
          fire_at: nextFire.toISOString(),
          status: 'scheduled',
          recurrence: 'weekly',
        });
      }
    }
  }

  return triggers;
}

// ─── MORNING BRIEFING MONITOR ───
// Checks if it's morning in user's timezone and no briefing has been sent today
export async function morningMonitor(userId: string, userTimezone: string): Promise<Trigger[]> {
  const db = createServerSupabase();
  const triggers: Trigger[] = [];

  const userTime = new Date().toLocaleString('en-US', { timeZone: userTimezone, hour12: false });
  const userHour = parseInt(userTime.split(', ')[1]?.split(':')[0] || '0');

  // Only fire between 7:00 and 8:30 AM
  if (userHour < 7 || userHour > 8) return triggers;

  // Check if we already sent a morning briefing today in user's local date
  const todayLocal = new Date().toLocaleDateString('en-CA', { timeZone: userTimezone }); // YYYY-MM-DD

  const { data: existing } = await db
    .from('messages')
    .select('id')
    .eq('user_id', userId)
    .eq('role', 'assistant')
    .gte('created_at', `${todayLocal}T00:00:00.000Z`)
    .limit(100);

  const alreadySent = (existing || []).some((m: { id: string }) => {
    return false; // We'll use a looser check — just the metadata filter below
  });

  // Also check metadata for morning_briefing proactive messages today
  const { data: proactiveToday } = await db
    .from('messages')
    .select('metadata')
    .eq('user_id', userId)
    .eq('role', 'assistant')
    .gte('created_at', `${todayLocal}T00:00:00.000Z`);

  const hasMorningBriefing = (proactiveToday || []).some((m: { metadata: Record<string, unknown> }) => {
    const meta = m.metadata as Record<string, unknown>;
    return meta?.proactive === true && meta?.trigger === 'morning_briefing';
  });

  if (!hasMorningBriefing && !alreadySent) {
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
  const db = createServerSupabase();
  const triggers: Trigger[] = [];

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: goals } = await db
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
  const db = createServerSupabase();
  const triggers: Trigger[] = [];

  const { data: lastMsg } = await db
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

  const { data: pendingTasks } = await db
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

  const urgencyOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  allTriggers.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

  return allTriggers;
}
