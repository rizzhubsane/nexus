import { getReasoningCache, upsertReasoningCache } from '@/lib/db/queries';

export async function getDailyBrief(userId: string): Promise<Record<string, unknown> | null> {
  const cache = await getReasoningCache(userId, 'daily_brief');
  if (!cache) return null;

  const age = Date.now() - new Date(cache.computed_at).getTime();
  const MAX_AGE = 12 * 60 * 60 * 1000; // 12 hours
  if (age > MAX_AGE) return null;

  return cache.data;
}

export async function saveDailyBrief(userId: string, brief: Record<string, unknown>): Promise<void> {
  await upsertReasoningCache(userId, 'daily_brief', brief);
}

export async function getGradeProjections(userId: string): Promise<Record<string, unknown> | null> {
  const cache = await getReasoningCache(userId, 'grade_projections');
  return cache?.data || null;
}

export async function saveGradeProjections(userId: string, projections: Record<string, unknown>): Promise<void> {
  await upsertReasoningCache(userId, 'grade_projections', projections);
}

export async function getPatterns(userId: string): Promise<Record<string, unknown> | null> {
  const cache = await getReasoningCache(userId, 'patterns');
  return cache?.data || null;
}

export async function savePatterns(userId: string, patterns: Record<string, unknown>): Promise<void> {
  await upsertReasoningCache(userId, 'patterns', patterns);
}

export async function getConflictAlerts(userId: string): Promise<Record<string, unknown> | null> {
  const cache = await getReasoningCache(userId, 'conflict_alerts');
  return cache?.data || null;
}

export async function saveConflictAlerts(userId: string, alerts: Record<string, unknown>): Promise<void> {
  await upsertReasoningCache(userId, 'conflict_alerts', alerts);
}
