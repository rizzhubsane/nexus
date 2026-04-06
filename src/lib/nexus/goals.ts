import { getActiveGoals, getDormantGoals, upsertGoal } from '@/lib/db/queries';
import type { Goal } from '@/lib/db/types';

export async function getGoalsContext(userId: string): Promise<string> {
  const goals = await getActiveGoals(userId);
  if (goals.length === 0) return '';

  return goals.map(g => {
    const parts = [g.goal];
    if (g.target_value) parts.push(`target: ${g.target_value}`);
    if (g.current_value) parts.push(`current: ${g.current_value}`);
    if (g.status !== 'active') parts.push(`status: ${g.status}`);
    if (g.blockers && g.blockers.length > 0) parts.push(`blockers: ${g.blockers.join(', ')}`);
    return parts.join(' | ');
  }).join('; ');
}

export async function checkDormantGoals(userId: string): Promise<Goal[]> {
  return getDormantGoals(userId, 7);
}

export { upsertGoal };
