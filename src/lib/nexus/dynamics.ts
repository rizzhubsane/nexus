import { addMemory, searchMemory } from '@/lib/memory/supermemory';

const DYNAMICS_TAG = 'dynamics';

export async function getCurrentState(userId: string): Promise<string> {
  const results = await searchMemory(
    userId,
    'current mood energy workload momentum state',
    3
  );
  if (results.length === 0) return '';
  return results.map(r => r.content).join('; ');
}

export async function updateCurrentState(
  userId: string,
  state: {
    mood?: string;
    energy?: string;
    workload?: string;
    momentum?: string;
  }
): Promise<void> {
  const parts: string[] = [];
  if (state.mood) parts.push(`mood: ${state.mood}`);
  if (state.energy) parts.push(`energy: ${state.energy}`);
  if (state.workload) parts.push(`workload: ${state.workload}`);
  if (state.momentum) parts.push(`momentum: ${state.momentum}`);

  if (parts.length > 0) {
    await addMemory(userId, `[${DYNAMICS_TAG}:state] ${parts.join(', ')}`, {
      layer: 'dynamics',
      category: 'state',
      timestamp: new Date().toISOString(),
    });
  }
}

export async function getContradictions(userId: string): Promise<string> {
  const results = await searchMemory(
    userId,
    'contradiction stated vs actual behavior mismatch',
    3
  );
  if (results.length === 0) return '';
  return results.map(r => r.content).join('; ');
}

export async function addContradiction(
  userId: string,
  claim: string,
  evidence: string,
  severity: 'gentle_nudge' | 'flag' | 'serious'
): Promise<void> {
  await addMemory(
    userId,
    `[${DYNAMICS_TAG}:contradiction] Claim: "${claim}" | Evidence against: "${evidence}" | Severity: ${severity}`,
    { layer: 'dynamics', category: 'contradiction' }
  );
}

export async function getActiveThreads(userId: string): Promise<string> {
  const results = await searchMemory(
    userId,
    'active thread preparing working on current focus',
    3
  );
  if (results.length === 0) return '';
  return results.map(r => r.content).join('; ');
}

export async function addWin(userId: string, win: string, category: string): Promise<void> {
  await addMemory(
    userId,
    `[${DYNAMICS_TAG}:win] ${win} (${category})`,
    { layer: 'dynamics', category: 'win', timestamp: new Date().toISOString() }
  );
}

export async function getRecentWins(userId: string): Promise<string> {
  const results = await searchMemory(
    userId,
    'win achievement completed accomplished success',
    3
  );
  if (results.length === 0) return '';
  return results.map(r => r.content).join('; ');
}
