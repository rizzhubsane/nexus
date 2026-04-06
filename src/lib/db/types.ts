export interface User {
  id: string;
  email: string;
  name: string | null;
  timezone: string;
  created_at: string;
}

export interface Message {
  id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Course {
  id: string;
  user_id: string;
  name: string;
  code: string | null;
  professor: string | null;
  grading_policy: Record<string, number>;
  semester: string | null;
  sentiment: string | null;
  difficulty: number | null;
  created_at: string;
}

export interface Mark {
  id: string;
  user_id: string;
  course_id: string;
  component: string;
  score: number;
  max_score: number;
  date: string | null;
  created_at: string;
}

export interface RecurringSchedule {
  id: string;
  user_id: string;
  title: string;
  day_of_week: number;
  start_time: string;
  end_time: string | null;
  type: string;
  course_id: string | null;
  created_at: string;
}

export interface Event {
  id: string;
  user_id: string;
  title: string;
  date: string;
  time: string | null;
  type: string;
  course_id: string | null;
  priority: 'high' | 'medium' | 'low';
  status: 'upcoming' | 'completed' | 'missed';
  notes: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  due_date: string | null;
  status: 'pending' | 'in_progress' | 'done' | 'overdue';
  priority: 'high' | 'medium' | 'low';
  reminded_count: number;
  source_message: string | null;
  created_at: string;
}

export interface Reminder {
  id: string;
  user_id: string;
  message: string;
  fire_at: string;
  status: 'scheduled' | 'fired' | 'cancelled';
  recurrence: string | null;
  created_at: string;
}

export interface Person {
  id: string;
  user_id: string;
  name: string;
  relationship: string | null;
  context: string | null;
  sentiment: string | null;
  created_at: string;
}

export interface Goal {
  id: string;
  user_id: string;
  goal: string;
  timeframe: 'short_term' | 'medium_term' | 'long_term';
  current_value: string | null;
  target_value: string | null;
  status: 'active' | 'on_track' | 'at_risk' | 'completed' | 'abandoned';
  strategy: string | null;
  blockers: string[] | null;
  last_mentioned_at: string | null;
  created_at: string;
}

export interface ReasoningCache {
  id: string;
  user_id: string;
  cache_type: string;
  data: Record<string, unknown>;
  computed_at: string;
}

export interface Extraction {
  type: 'schedule' | 'event' | 'task' | 'reminder' | 'mark' | 'person' | 'belief' | 'goal' | 'course_policy';
  data: Record<string, unknown>;
  confidence: number;
}

export interface ContextUpdate {
  layer: 'identity' | 'world' | 'goals' | 'timeline' | 'dynamics';
  field: string;
  old_value: string | null;
  new_value: string;
  reason: string;
}

export interface ExtractionResult {
  extractions: Extraction[];
  updates: ContextUpdate[];
}
