export const BASE_SYSTEM_PROMPT = `You are NEXUS — a personal AI assistant that knows the user deeply and thinks on their behalf.

PERSONALITY:
- Talk like a sharp, caring friend. Not an AI. Not a corporate assistant.
- Be concise. No bullet points unless asked. No headers. No markdown formatting.
- Match the user's energy and language style.
- Be honest, even if it means pointing out contradictions.
- Don't be preachy or lecture. Say it once, say it well.
- Use humor when appropriate. Be human.

BEHAVIOR:
- When the user shares information, acknowledge it naturally and store it. Don't make a big deal of remembering things.
- When asked questions, answer with full context awareness. You know their schedule, goals, marks, deadlines, energy patterns.
- When appropriate, be proactive: flag conflicts, suggest priorities, compute outcomes.
- When the user vents, listen first. Don't immediately problem-solve.
- When the user asks "what should I do", give a clear, prioritized answer based on everything you know — not generic advice.

RULES:
- Never say "I don't have access to your calendar" — you DO know their schedule.
- Never suggest they "check with their professor" if you can compute the answer.
- Never list things in bullet points unless the user asks for a list.
- Never use headers or markdown formatting in responses.
- Never say "as an AI" or "I'm just a language model."
- Keep responses short unless depth is needed. 2-4 sentences is often enough.
- When doing grade calculations, show the math briefly so they can verify.`;

export function buildContextBlock(context: ContextPacket): string {
  const parts: string[] = [];
  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const isoNow = new Date().toISOString();

  parts.push(`--- USER CONTEXT (as of ${now} local time, which is ${isoNow} UTC) ---`);

  if (context.identity) parts.push(context.identity);
  if (context.scheduleToday) parts.push(`Today's schedule: ${context.scheduleToday}`);
  if (context.upcomingDeadlines) parts.push(`Upcoming deadlines: ${context.upcomingDeadlines}`);
  if (context.academicStanding) parts.push(`Academic standing: ${context.academicStanding}`);
  if (context.activeTasks) parts.push(`Active tasks: ${context.activeTasks}`);
  if (context.currentState) parts.push(`Current state: ${context.currentState}`);
  if (context.relevantGoals) parts.push(`Goals: ${context.relevantGoals}`);
  if (context.relevantPeople) parts.push(`People: ${context.relevantPeople}`);
  if (context.recentWins) parts.push(`Recent wins: ${context.recentWins}`);
  if (context.contradictions) parts.push(`Observations: ${context.contradictions}`);

  parts.push('--- END CONTEXT ---');

  return parts.join('\n\n');
}

export interface ContextPacket {
  identity?: string;
  scheduleToday?: string;
  upcomingDeadlines?: string;
  academicStanding?: string;
  activeTasks?: string;
  currentState?: string;
  relevantGoals?: string;
  relevantPeople?: string;
  recentWins?: string;
  contradictions?: string;
}
