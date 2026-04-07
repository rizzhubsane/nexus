import { createServerSupabase } from '@/lib/db/supabase';
import type { Trigger } from './monitors';

export interface AttentionDecision {
  shouldSpeak: boolean;
  reason: string;
}

export async function attentionFilter(trigger: Trigger): Promise<AttentionDecision> {
  const db = createServerSupabase();
  const userId = trigger.userId;

  const today = new Date().toISOString().split('T')[0];

  // ─── RULE 1: Max proactive messages per day ───
  const { data: todayMessages } = await db
    .from('messages')
    .select('metadata')
    .eq('user_id', userId)
    .eq('role', 'assistant')
    .gte('created_at', `${today}T00:00:00.000Z`);

  const todayCount = (todayMessages || []).filter((m: { metadata: Record<string, unknown> }) => {
    const meta = m.metadata as Record<string, unknown>;
    return meta?.proactive === true;
  }).length;

  if (todayCount >= 4) {
    if (trigger.type !== 'reminder_due') {
      return { shouldSpeak: false, reason: 'Daily proactive limit reached (4)' };
    }
  }

  // ─── RULE 2: Night time silence (11pm-7am) ───
  const userTime = new Date().toLocaleString('en-US', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
  });
  const userHour = parseInt(userTime.split(', ')[1]?.split(':')[0] || '0');

  if (userHour >= 23 || userHour < 7) {
    if (trigger.type !== 'reminder_due' && trigger.urgency !== 'critical') {
      return { shouldSpeak: false, reason: 'Night hours — not urgent enough' };
    }
  }

  // ─── RULE 3: No double-texting within 30 minutes ───
  const { data: recentMessages } = await db
    .from('messages')
    .select('created_at, metadata')
    .eq('user_id', userId)
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(20);

  const lastProactive = (recentMessages || []).find((m: { metadata: Record<string, unknown>; created_at: string }) => {
    const meta = m.metadata as Record<string, unknown>;
    return meta?.proactive === true;
  });

  if (lastProactive) {
    const minutesSinceLast = Math.floor(
      (Date.now() - new Date(lastProactive.created_at).getTime()) / (1000 * 60)
    );
    if (minutesSinceLast < 30 && trigger.type !== 'reminder_due') {
      return { shouldSpeak: false, reason: `Only ${minutesSinceLast}min since last proactive` };
    }
  }

  // ─── RULE 4: No duplicate notifications ───
  const itemId =
    (trigger.data?.event as Record<string, unknown>)?.id ||
    (trigger.data?.task as Record<string, unknown>)?.id ||
    (trigger.data?.goal as Record<string, unknown>)?.id ||
    (trigger.data?.reminder as Record<string, unknown>)?.id;

  const triggerFingerprint = `${trigger.type}:${JSON.stringify(itemId)}`;

  const alreadyNotified = (todayMessages || []).some((m: { metadata: Record<string, unknown> }) => {
    const meta = m.metadata as Record<string, unknown>;
    return meta?.triggerFingerprint === triggerFingerprint;
  });

  if (alreadyNotified) {
    if (trigger.type !== 'task_overdue') {
      return { shouldSpeak: false, reason: 'Already notified about this today' };
    }
  }

  // ─── RULE 5: Trigger-specific rules ───
  switch (trigger.type) {
    case 'reminder_due':
      return { shouldSpeak: true, reason: 'User-requested reminder' };

    case 'deadline_approaching':
      return { shouldSpeak: true, reason: 'Deadline within 24 hours' };

    case 'task_overdue': {
      const hoursOverdue = trigger.data.hoursOverdue as number;
      if (hoursOverdue < 2) {
        return { shouldSpeak: false, reason: 'Task barely overdue — give them time' };
      }
      return { shouldSpeak: true, reason: `Task overdue by ${hoursOverdue}h` };
    }

    case 'morning_briefing':
      return { shouldSpeak: true, reason: 'Morning briefing time' };

    case 'goal_dormant':
      if (todayCount >= 2) {
        return { shouldSpeak: false, reason: 'Already sent enough messages today for a non-urgent nudge' };
      }
      return { shouldSpeak: true, reason: 'Goal dormant for 7+ days' };

    case 'schedule_conflict':
      return { shouldSpeak: true, reason: 'Schedule conflict detected' };

    case 'grade_alert':
      return { shouldSpeak: true, reason: 'Grade dropped below target' };

    case 'inactivity_nudge': {
      const pendingTasks = trigger.data.pendingTasks as unknown[];
      if ((pendingTasks?.length || 0) < 2) {
        return { shouldSpeak: false, reason: 'Not enough pending items to justify a nudge' };
      }
      return { shouldSpeak: true, reason: 'User inactive 24h+ with pending tasks' };
    }

    default:
      return { shouldSpeak: false, reason: 'Unknown trigger type' };
  }
}
