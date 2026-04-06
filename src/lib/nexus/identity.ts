import { addMemory, searchMemory } from '@/lib/memory/supermemory';

const IDENTITY_TAG = 'identity';

export async function getIdentity(userId: string): Promise<string | null> {
  const results = await searchMemory(userId, 'user identity personality traits preferences cognitive style', 3);
  if (results.length === 0) return null;
  return results.map(r => r.content).join('\n');
}

export async function updateIdentity(
  userId: string,
  trait: string,
  category: 'personality' | 'cognitive_style' | 'communication' | 'values' | 'basics'
): Promise<void> {
  await addMemory(userId, `[${IDENTITY_TAG}:${category}] ${trait}`, {
    layer: 'identity',
    category,
  });
}
