import { createServerSupabase } from '@/lib/db/supabase';

// ─── CONFLICT DETECTOR ───
// Called immediately after a new event or schedule entry is inserted.
// Returns a conflict warning string, or null if no conflict.
export async function checkForConflicts(
  userId: string,
  newItem: {
    date?: string;
    day_of_week?: number;
    start_time?: string;
    end_time?: string;
    title: string;
  }
): Promise<string | null> {
  const db = createServerSupabase();

  if (!newItem.start_time) return null;

  // Check recurring schedule conflicts for a new recurring item
  if (newItem.day_of_week !== undefined) {
    const { data: existing } = await db
      .from('recurring_schedule')
      .select('title, start_time, end_time')
      .eq('user_id', userId)
      .eq('day_of_week', newItem.day_of_week);

    if (existing) {
      for (const item of existing) {
        if (timesOverlap(newItem.start_time, newItem.end_time, item.start_time, item.end_time)) {
          return `Heads up — "${newItem.title}" overlaps with "${item.title}" (${item.start_time}–${item.end_time}). Want to keep both?`;
        }
      }
    }
  }

  // Check one-off event against existing recurring schedule
  if (newItem.date) {
    const dayOfWeek = new Date(newItem.date).getDay();

    const { data: scheduleItems } = await db
      .from('recurring_schedule')
      .select('title, start_time, end_time')
      .eq('user_id', userId)
      .eq('day_of_week', dayOfWeek);

    if (scheduleItems) {
      for (const item of scheduleItems) {
        if (timesOverlap(newItem.start_time, newItem.end_time, item.start_time, item.end_time)) {
          return `That's during your "${item.title}" (${item.start_time}–${item.end_time}). Conflict?`;
        }
      }
    }
  }

  return null;
}

// ─── GRADE RECOMPUTER ───
// Called immediately after a new mark is inserted.
// Returns current grade percentage, projected letter grade, and an alert string if concerning.
export async function recomputeGradeProjection(
  userId: string,
  courseId: string
): Promise<{
  currentPercentage: number;
  projectedGrade: string;
  alert: string | null;
}> {
  const db = createServerSupabase();

  const { data: course } = await db
    .from('courses')
    .select('name, grading_policy')
    .eq('id', courseId)
    .single();

  if (!course) {
    return { currentPercentage: 0, projectedGrade: 'N/A', alert: null };
  }

  const { data: marks } = await db
    .from('marks')
    .select('component, score, max_score')
    .eq('course_id', courseId);

  if (!marks || marks.length === 0) {
    return { currentPercentage: 0, projectedGrade: 'N/A', alert: null };
  }

  const policy = (course.grading_policy || {}) as Record<string, number>;
  let weightedTotal = 0;
  let weightCovered = 0;

  for (const mark of marks) {
    const componentWeight = policy[mark.component.toLowerCase()];
    if (componentWeight) {
      const pct = (mark.score / mark.max_score) * 100;
      weightedTotal += pct * (componentWeight / 100);
      weightCovered += componentWeight;
    }
  }

  // If no grading policy matched, fall back to simple average
  let currentPercentage: number;
  if (weightCovered > 0) {
    currentPercentage = Math.round((weightedTotal / weightCovered) * 100) / 100;
  } else {
    const total = marks.reduce((sum, m) => sum + m.score, 0);
    const maxTotal = marks.reduce((sum, m) => sum + m.max_score, 0);
    currentPercentage = maxTotal > 0 ? Math.round((total / maxTotal) * 10000) / 100 : 0;
  }

  const projectedGrade = percentageToGrade(currentPercentage);

  let alert: string | null = null;
  if (currentPercentage < 50) {
    alert = `Your ${course.name} standing is at ${currentPercentage}% — that's in the danger zone.`;
  } else if (currentPercentage < 60) {
    alert = `${course.name} is at ${currentPercentage}%. Might want to push harder on the remaining assessments.`;
  }

  // Cache the grade projection
  await db.from('reasoning_cache').upsert(
    {
      user_id: userId,
      cache_type: `grade_projection:${courseId}`,
      data: { currentPercentage, projectedGrade, weightCovered, weightedTotal, courseName: course.name },
      computed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,cache_type' }
  );

  return { currentPercentage, projectedGrade, alert };
}

// ─── HELPERS ───

function timesOverlap(
  start1: string,
  end1: string | undefined | null,
  start2: string,
  end2: string | undefined | null
): boolean {
  const s1 = timeToMinutes(start1);
  const e1 = end1 ? timeToMinutes(end1) : s1 + 60;
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
