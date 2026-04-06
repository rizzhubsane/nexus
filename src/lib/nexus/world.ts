import {
  getCourses, getCourseByName, upsertCourse, getMarks,
  getPeople, getPersonByName, upsertPerson, getFullSchedule,
} from '@/lib/db/queries';
import type { Course, Mark, Person, RecurringSchedule } from '@/lib/db/types';

export interface AcademicSnapshot {
  courses: Course[];
  marks: Mark[];
}

export async function getAcademicStanding(userId: string): Promise<string> {
  const courses = await getCourses(userId);
  if (courses.length === 0) return '';

  const summaries: string[] = [];

  for (const course of courses) {
    const marks = await getMarks(userId, course.id);
    if (marks.length === 0) {
      summaries.push(course.name);
      continue;
    }

    const totalWeighted = marks.reduce((acc, m) => acc + (m.score / m.max_score) * 100, 0);
    const avgPct = totalWeighted / marks.length;
    const components = marks.map(m => `${m.component}: ${m.score}/${m.max_score}`).join(', ');
    summaries.push(`${course.name}: ${avgPct.toFixed(0)}% avg (${components})`);
  }

  return summaries.join('; ');
}

export async function getCourseContext(userId: string, courseName: string): Promise<string> {
  const course = await getCourseByName(userId, courseName);
  if (!course) return '';

  const marks = await getMarks(userId, course.id);
  const parts: string[] = [`Course: ${course.name}`];

  if (course.professor) parts.push(`Professor: ${course.professor}`);
  if (Object.keys(course.grading_policy).length > 0) {
    const policy = Object.entries(course.grading_policy)
      .map(([k, v]) => `${k}: ${v}%`)
      .join(', ');
    parts.push(`Grading: ${policy}`);
  }

  if (marks.length > 0) {
    const markLines = marks.map(m => `${m.component}: ${m.score}/${m.max_score}`);
    parts.push(`Marks: ${markLines.join(', ')}`);

    if (Object.keys(course.grading_policy).length > 0) {
      const projection = computeGradeProjection(marks, course.grading_policy);
      parts.push(`Current weighted: ${projection.currentPct.toFixed(1)}%`);
    }
  }

  return parts.join('\n');
}

export function computeGradeProjection(
  marks: Mark[],
  gradingPolicy: Record<string, number>
): { currentPct: number; completedWeight: number; remainingWeight: number } {
  let weightedSum = 0;
  let completedWeight = 0;

  for (const mark of marks) {
    const component = mark.component.toLowerCase();
    const weight = Object.entries(gradingPolicy).find(
      ([k]) => k.toLowerCase().includes(component) || component.includes(k.toLowerCase())
    )?.[1];

    if (weight) {
      weightedSum += (mark.score / mark.max_score) * weight;
      completedWeight += weight;
    }
  }

  const currentPct = completedWeight > 0 ? (weightedSum / completedWeight) * 100 : 0;
  const remainingWeight = 100 - completedWeight;

  return { currentPct, completedWeight, remainingWeight };
}

export async function getScheduleSummary(userId: string, dayOfWeek?: number): Promise<string> {
  const schedule = await getFullSchedule(userId);
  if (schedule.length === 0) return '';

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  if (dayOfWeek !== undefined) {
    const dayItems = schedule.filter(s => s.day_of_week === dayOfWeek);
    if (dayItems.length === 0) return `No scheduled items on ${dayNames[dayOfWeek]}`;
    return dayItems.map(s => `${s.title} at ${s.start_time}${s.end_time ? `-${s.end_time}` : ''}`).join(', ');
  }

  const grouped = schedule.reduce((acc, s) => {
    const day = dayNames[s.day_of_week];
    if (!acc[day]) acc[day] = [];
    acc[day].push(s);
    return acc;
  }, {} as Record<string, RecurringSchedule[]>);

  return Object.entries(grouped)
    .map(([day, items]) => {
      const list = items.map(s => `${s.title} at ${s.start_time}`).join(', ');
      return `${day}: ${list}`;
    })
    .join('; ');
}

export async function getPeopleContext(userId: string, query?: string): Promise<string> {
  if (query) {
    const person = await getPersonByName(userId, query);
    if (!person) return '';
    return `${person.name} — ${person.relationship || 'known'} (${person.context || 'no context'})`;
  }

  const people = await getPeople(userId);
  if (people.length === 0) return '';
  return people.map(p => `${p.name}: ${p.relationship || 'known'} (${p.context || ''})`).join('; ');
}

export { upsertCourse, upsertPerson, getCourseByName };
