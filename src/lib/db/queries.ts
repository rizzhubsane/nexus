import { createServerSupabase } from './supabase';
import type {
  Message, Course, Mark, RecurringSchedule,
  Event, Task, Reminder, Person, Goal, ReasoningCache,
} from './types';

const db = () => createServerSupabase();

// ── Messages ──────────────────────────────────────────────
export async function getMessages(userId: string, limit = 50, before?: string) {
  let query = db()
    .from('messages')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt('created_at', before);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as Message[]).reverse();
}

export async function getRecentMessages(userId: string, limit = 5) {
  const { data, error } = await db()
    .from('messages')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as Message[]).reverse();
}

export async function insertMessage(
  userId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  metadata: Record<string, unknown> = {}
) {
  const { data, error } = await db()
    .from('messages')
    .insert({ user_id: userId, role, content, metadata })
    .select()
    .single();
  if (error) throw error;
  return data as Message;
}

// ── Courses ───────────────────────────────────────────────
export async function getCourses(userId: string) {
  const { data, error } = await db()
    .from('courses')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return data as Course[];
}

export async function getCourseByName(userId: string, name: string) {
  const { data, error } = await db()
    .from('courses')
    .select('*')
    .eq('user_id', userId)
    .ilike('name', `%${name}%`)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Course | null;
}

export async function upsertCourse(userId: string, course: Partial<Course>) {
  const { data, error } = await db()
    .from('courses')
    .upsert({ ...course, user_id: userId }, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data as Course;
}

// ── Marks ─────────────────────────────────────────────────
export async function getMarks(userId: string, courseId?: string) {
  let query = db().from('marks').select('*').eq('user_id', userId);
  if (courseId) query = query.eq('course_id', courseId);
  const { data, error } = await query;
  if (error) throw error;
  return data as Mark[];
}

export async function insertMark(userId: string, mark: Partial<Mark>) {
  const { data, error } = await db()
    .from('marks')
    .insert({ ...mark, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data as Mark;
}

// ── Schedule ──────────────────────────────────────────────
export async function getScheduleForDay(userId: string, dayOfWeek: number) {
  const { data, error } = await db()
    .from('recurring_schedule')
    .select('*')
    .eq('user_id', userId)
    .eq('day_of_week', dayOfWeek)
    .order('start_time');
  if (error) throw error;
  return data as RecurringSchedule[];
}

export async function getFullSchedule(userId: string) {
  const { data, error } = await db()
    .from('recurring_schedule')
    .select('*')
    .eq('user_id', userId)
    .order('day_of_week')
    .order('start_time');
  if (error) throw error;
  return data as RecurringSchedule[];
}

export async function insertSchedule(userId: string, schedule: Partial<RecurringSchedule>) {
  const { data, error } = await db()
    .from('recurring_schedule')
    .insert({ ...schedule, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data as RecurringSchedule;
}

// ── Events ────────────────────────────────────────────────
export async function getUpcomingEvents(userId: string, days = 7) {
  const today = new Date().toISOString().split('T')[0];
  const future = new Date(Date.now() + days * 86400000).toISOString().split('T')[0];

  const { data, error } = await db()
    .from('events')
    .select('*')
    .eq('user_id', userId)
    .gte('date', today)
    .lte('date', future)
    .order('date');
  if (error) throw error;
  return data as Event[];
}

export async function getEventsForDate(userId: string, date: string) {
  const { data, error } = await db()
    .from('events')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .order('time');
  if (error) throw error;
  return data as Event[];
}

export async function insertEvent(userId: string, event: Partial<Event>) {
  const { data, error } = await db()
    .from('events')
    .insert({ ...event, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data as Event;
}

export async function updateEvent(eventId: string, updates: Partial<Event>) {
  const { data, error } = await db()
    .from('events')
    .update(updates)
    .eq('id', eventId)
    .select()
    .single();
  if (error) throw error;
  return data as Event;
}

// ── Tasks ─────────────────────────────────────────────────
export async function getPendingTasks(userId: string) {
  const { data, error } = await db()
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['pending', 'in_progress', 'overdue'])
    .order('due_date', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data as Task[];
}

export async function getTasksDueOn(userId: string, date: string) {
  const { data, error } = await db()
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('due_date', date)
    .in('status', ['pending', 'in_progress']);
  if (error) throw error;
  return data as Task[];
}

export async function getOverdueTasks(userId: string) {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await db()
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .lt('due_date', today)
    .in('status', ['pending', 'in_progress']);
  if (error) throw error;
  return data as Task[];
}

export async function insertTask(userId: string, task: Partial<Task>) {
  const { data, error } = await db()
    .from('tasks')
    .insert({ ...task, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data as Task;
}

export async function updateTask(taskId: string, updates: Partial<Task>) {
  const { data, error } = await db()
    .from('tasks')
    .update(updates)
    .eq('id', taskId)
    .select()
    .single();
  if (error) throw error;
  return data as Task;
}

// ── Reminders ─────────────────────────────────────────────
export async function getDueReminders() {
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from('reminders')
    .select('*')
    .eq('status', 'scheduled')
    .lte('fire_at', now);
  if (error) throw error;
  return data as Reminder[];
}

export async function insertReminder(userId: string, reminder: Partial<Reminder>) {
  const { data, error } = await db()
    .from('reminders')
    .insert({ ...reminder, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data as Reminder;
}

export async function updateReminder(reminderId: string, updates: Partial<Reminder>) {
  const { data, error } = await db()
    .from('reminders')
    .update(updates)
    .eq('id', reminderId)
    .select()
    .single();
  if (error) throw error;
  return data as Reminder;
}

// ── People ────────────────────────────────────────────────
export async function getPeople(userId: string) {
  const { data, error } = await db()
    .from('people')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return data as Person[];
}

export async function getPersonByName(userId: string, name: string) {
  const { data, error } = await db()
    .from('people')
    .select('*')
    .eq('user_id', userId)
    .ilike('name', `%${name}%`)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Person | null;
}

export async function upsertPerson(userId: string, person: Partial<Person>) {
  const { data, error } = await db()
    .from('people')
    .upsert({ ...person, user_id: userId }, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data as Person;
}

// ── Goals ─────────────────────────────────────────────────
export async function getActiveGoals(userId: string) {
  const { data, error } = await db()
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['active', 'on_track', 'at_risk']);
  if (error) throw error;
  return data as Goal[];
}

export async function getDormantGoals(userId: string, daysSinceLastMention = 7) {
  const cutoff = new Date(Date.now() - daysSinceLastMention * 86400000).toISOString();
  const { data, error } = await db()
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .or(`last_mentioned_at.is.null,last_mentioned_at.lt.${cutoff}`);
  if (error) throw error;
  return data as Goal[];
}

export async function upsertGoal(userId: string, goal: Partial<Goal>) {
  const { data, error } = await db()
    .from('goals')
    .upsert({ ...goal, user_id: userId, last_mentioned_at: new Date().toISOString() }, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data as Goal;
}

// ── Reasoning Cache ───────────────────────────────────────
export async function getReasoningCache(userId: string, cacheType: string) {
  const { data, error } = await db()
    .from('reasoning_cache')
    .select('*')
    .eq('user_id', userId)
    .eq('cache_type', cacheType)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as ReasoningCache | null;
}

export async function upsertReasoningCache(
  userId: string,
  cacheType: string,
  cacheData: Record<string, unknown>
) {
  const existing = await getReasoningCache(userId, cacheType);
  if (existing) {
    const { data, error } = await db()
      .from('reasoning_cache')
      .update({ data: cacheData, computed_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data as ReasoningCache;
  }

  const { data, error } = await db()
    .from('reasoning_cache')
    .insert({ user_id: userId, cache_type: cacheType, data: cacheData })
    .select()
    .single();
  if (error) throw error;
  return data as ReasoningCache;
}

// ── User ──────────────────────────────────────────────────
export async function getUser(userId: string) {
  const { data, error } = await db()
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

export async function updateUser(userId: string, updates: { name?: string; timezone?: string }) {
  const { data, error } = await db()
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
