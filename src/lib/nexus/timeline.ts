import {
  getScheduleForDay, getUpcomingEvents, getEventsForDate,
  getPendingTasks, getOverdueTasks, getTasksDueOn,
  insertSchedule, insertEvent, insertTask, insertReminder,
  updateTask, updateEvent,
} from '@/lib/db/queries';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

function todayDayOfWeek(): number {
  return new Date().getDay();
}

export async function getTodayScheduleContext(userId: string): Promise<string> {
  const dayOfWeek = todayDayOfWeek();
  const schedule = await getScheduleForDay(userId, dayOfWeek);
  const events = await getEventsForDate(userId, todayString());

  const parts: string[] = [];

  if (schedule.length > 0) {
    const items = schedule.map(s =>
      `${s.title} at ${s.start_time}${s.end_time ? `-${s.end_time}` : ''}`
    );
    parts.push(`Classes: ${items.join(', ')}`);
  }

  if (events.length > 0) {
    const items = events.map(e =>
      `${e.title}${e.time ? ` at ${e.time}` : ''} (${e.type})`
    );
    parts.push(`Events: ${items.join(', ')}`);
  }

  if (parts.length === 0) return `Nothing scheduled today (${DAY_NAMES[dayOfWeek]})`;
  return `Today (${DAY_NAMES[dayOfWeek]}): ${parts.join('; ')}`;
}

export async function getUpcomingDeadlinesContext(userId: string, days = 7): Promise<string> {
  const events = await getUpcomingEvents(userId, days);
  const deadlineTypes = ['quiz', 'exam', 'deadline', 'assignment'];
  const deadlines = events.filter(e =>
    deadlineTypes.includes(e.type) || e.priority === 'high'
  );

  if (deadlines.length === 0) return '';

  return deadlines.map(d => {
    const daysUntil = Math.ceil(
      (new Date(d.date).getTime() - Date.now()) / 86400000
    );
    const urgency = daysUntil <= 1 ? 'TOMORROW' : daysUntil <= 3 ? `in ${daysUntil} days` : `on ${d.date}`;
    return `${d.title} ${urgency}`;
  }).join('; ');
}

export async function getActiveTasksContext(userId: string): Promise<string> {
  const tasks = await getPendingTasks(userId);
  const overdue = await getOverdueTasks(userId);

  const parts: string[] = [];

  if (overdue.length > 0) {
    parts.push(`OVERDUE: ${overdue.map(t => t.title).join(', ')}`);
  }

  const pending = tasks.filter(t => !overdue.find(o => o.id === t.id));
  if (pending.length > 0) {
    parts.push(pending.map(t => {
      const due = t.due_date ? ` (due ${t.due_date})` : '';
      return `${t.title}${due}`;
    }).join('; '));
  }

  return parts.join('; ');
}

export async function getTasksDueToday(userId: string) {
  return getTasksDueOn(userId, todayString());
}

export {
  insertSchedule, insertEvent, insertTask, insertReminder,
  updateTask, updateEvent, getUpcomingEvents,
};
