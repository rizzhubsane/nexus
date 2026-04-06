import { chatCompletion, type ChatMessage } from '@/lib/llm/client';
import { insertMessage, getPendingTasks, getActiveGoals } from '@/lib/db/queries';
import { getRecentWins, getContradictions } from '@/lib/nexus/dynamics';
import { getPatterns, savePatterns } from '@/lib/nexus/reasoning';

export async function generateWeeklyReview(userId: string): Promise<void> {
  const [tasks, goals, wins, contradictions, patterns] = await Promise.all([
    getPendingTasks(userId),
    getActiveGoals(userId),
    getRecentWins(userId),
    getContradictions(userId),
    getPatterns(userId),
  ]);

  const contextParts: string[] = [];

  if (tasks.length > 0) {
    const done = tasks.filter(t => t.status === 'done').length;
    const pending = tasks.filter(t => t.status === 'pending').length;
    contextParts.push(`Tasks: ${done} completed, ${pending} still pending`);
  }

  if (goals.length > 0) {
    contextParts.push(
      `Goals: ${goals.map(g => `${g.goal} (${g.status})`).join('; ')}`
    );
  }

  if (wins) contextParts.push(`Wins: ${wins}`);
  if (contradictions) contextParts.push(`Contradictions noticed: ${contradictions}`);
  if (patterns) contextParts.push(`Known patterns: ${JSON.stringify(patterns)}`);

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are NEXUS generating a weekly review. Summarize the user's week conversationally. Mention wins, progress on goals, contradictions (gently), and patterns you notice. Be concise, honest, and supportive. No bullet points. Keep under 200 words. End with something forward-looking for next week.`,
    },
    {
      role: 'user',
      content: `Generate weekly review:\n${contextParts.join('\n')}`,
    },
  ];

  const review = await chatCompletion(messages);

  await insertMessage(userId, 'assistant', review, {
    proactive: true,
    type: 'weekly_review',
  });

  // Update patterns cache
  await savePatterns(userId, {
    updated_at: new Date().toISOString(),
    last_review: review,
  });
}
