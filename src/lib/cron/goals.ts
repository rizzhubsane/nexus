import { chatCompletion, type ChatMessage } from '@/lib/llm/client';
import { insertMessage } from '@/lib/db/queries';
import { checkDormantGoals } from '@/lib/nexus/goals';

export async function processGoalCheckins(userId: string): Promise<number> {
  const dormant = await checkDormantGoals(userId);
  let sentCount = 0;

  for (const goal of dormant) {
    const daysSince = goal.last_mentioned_at
      ? Math.floor((Date.now() - new Date(goal.last_mentioned_at).getTime()) / 86400000)
      : null;

    const timeAgo = daysSince
      ? `about ${daysSince} days ago`
      : 'a while back';

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are NEXUS doing a gentle goal check-in. The user mentioned a goal ${timeAgo} but hasn't brought it up since. Write 1-2 sentences asking if they're still working on it. Be casual, not judgmental. Offer to help if they want to revisit it. No bullet points.`,
      },
      {
        role: 'user',
        content: `Goal: "${goal.goal}"${goal.target_value ? ` (target: ${goal.target_value})` : ''}${goal.strategy ? ` (strategy: ${goal.strategy})` : ''}. Last mentioned ${timeAgo}.`,
      },
    ];

    const checkin = await chatCompletion(messages);

    await insertMessage(userId, 'assistant', checkin, {
      proactive: true,
      type: 'goal_checkin',
      goal_id: goal.id,
    });

    sentCount++;

    // Only one goal check-in per run to avoid overwhelming
    break;
  }

  return sentCount;
}
