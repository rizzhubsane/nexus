import { createServerSupabase } from '@/lib/db/supabase';
import { getScheduleForDay, getUpcomingEvents, getPendingTasks, getOverdueTasks, insertMessage } from '@/lib/db/queries';
import { chatCompletion, type ChatMessage } from '@/lib/llm/client';
import { getRecentWins } from '@/lib/nexus/dynamics';
import { getGoalsContext } from '@/lib/nexus/goals';
import { saveDailyBrief } from '@/lib/nexus/reasoning';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export async function generateMorningBriefing(userId: string): Promise<void> {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const todayStr = today.toISOString().split('T')[0];

  const [schedule, events, tasks, overdue, wins, goals] = await Promise.all([
    getScheduleForDay(userId, dayOfWeek),
    getUpcomingEvents(userId, 3),
    getPendingTasks(userId),
    getOverdueTasks(userId),
    getRecentWins(userId),
    getGoalsContext(userId),
  ]);

  const briefData: Record<string, unknown> = {
    day: DAY_NAMES[dayOfWeek],
    date: todayStr,
    schedule: schedule.map(s => ({ title: s.title, time: s.start_time, type: s.type })),
    todayEvents: events.filter(e => e.date === todayStr),
    upcomingDeadlines: events.filter(e => e.date !== todayStr),
    pendingTasks: tasks.map(t => ({ title: t.title, due: t.due_date, priority: t.priority })),
    overdueTasks: overdue.map(t => ({ title: t.title, due: t.due_date })),
  };

  await saveDailyBrief(userId, briefData);

  const contextParts: string[] = [
    `Today is ${DAY_NAMES[dayOfWeek]}, ${todayStr}.`,
  ];

  if (schedule.length > 0) {
    contextParts.push(
      `Schedule: ${schedule.map(s => `${s.title} at ${s.start_time}`).join(', ')}`
    );
  } else {
    contextParts.push('No classes today.');
  }

  const todayEvents = events.filter(e => e.date === todayStr);
  if (todayEvents.length > 0) {
    contextParts.push(`Today's events: ${todayEvents.map(e => e.title).join(', ')}`);
  }

  const upcoming = events.filter(e => e.date !== todayStr);
  if (upcoming.length > 0) {
    contextParts.push(
      `Coming up: ${upcoming.map(e => `${e.title} on ${e.date} (${e.type})`).join('; ')}`
    );
  }

  if (overdue.length > 0) {
    contextParts.push(`OVERDUE: ${overdue.map(t => t.title).join(', ')}`);
  }

  if (tasks.length > 0) {
    const todayTasks = tasks.filter(t => t.due_date === todayStr);
    if (todayTasks.length > 0) {
      contextParts.push(`Due today: ${todayTasks.map(t => t.title).join(', ')}`);
    }
  }

  if (wins) contextParts.push(`Recent wins: ${wins}`);
  if (goals) contextParts.push(`Active goals: ${goals}`);

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are NEXUS generating a morning briefing. Write a concise, conversational morning message (not a report). Mention schedule, deadlines, tasks. Be direct, helpful, slightly motivating. No bullet points, no headers. Keep it under 150 words. Talk like a friend texting them in the morning.`,
    },
    {
      role: 'user',
      content: `Generate morning briefing with this context:\n${contextParts.join('\n')}`,
    },
  ];

  const briefing = await chatCompletion(messages);

  await insertMessage(userId, 'assistant', briefing, { proactive: true, type: 'morning_briefing' });
}
