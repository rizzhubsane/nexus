import { chatCompletion, type ChatMessage } from '@/lib/llm/client';
import { type ContextPacket } from '@/lib/llm/prompts';
import { getIdentity } from './identity';
import { getAcademicStanding, getCourseContext, getScheduleSummary, getPeopleContext } from './world';
import { getGoalsContext } from './goals';
import { getTodayScheduleContext, getUpcomingDeadlinesContext, getActiveTasksContext } from './timeline';
import { getCurrentState, getContradictions, getRecentWins } from './dynamics';
import { getDailyBrief } from './reasoning';

type Intent = 'question' | 'info_dump' | 'action_request' | 'vent' | 'greeting' | 'grade_query' | 'schedule_query' | 'planning';
type Topic = 'academics' | 'schedule' | 'emotional' | 'goal' | 'person' | 'task' | 'general';

export async function classifyIntent(message: string): Promise<{ intent: Intent; topics: Topic[]; entities: string[] }> {
  const classificationPrompt: ChatMessage[] = [
    {
      role: 'system',
      content: `Classify the user message. Return JSON only:
{
  "intent": "question|info_dump|action_request|vent|greeting|grade_query|schedule_query|planning",
  "topics": ["academics","schedule","emotional","goal","person","task","general"],
  "entities": ["extracted names, courses, or key terms"]
}`,
    },
    { role: 'user', content: message },
  ];

  try {
    const raw = await chatCompletion(classificationPrompt);
    const cleaned = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return { intent: 'general' as Intent, topics: ['general'], entities: [] };
  }
}

// Minimal, targeted mappings: only load what the intent truly needs.
// The rule: if the user mentions it, load it. If they don't, don't.
const INTENT_TO_LAYERS: Record<Intent, string[]> = {
  question:       ['tasks'],          // default fallback — topics will add specifics
  info_dump:      [],                 // user is giving info, not querying it
  action_request: ['tasks'],
  vent:           ['state', 'wins', 'identity'],
  greeting:       [],
  grade_query:    ['academics'],
  schedule_query: ['schedule', 'deadlines'],
  planning:       ['schedule', 'deadlines', 'tasks', 'goals'],
};

const TOPIC_TO_LAYERS: Record<Topic, string[]> = {
  academics: ['academics'],           // removed 'identity' — not needed for grade queries
  schedule:  ['schedule', 'deadlines'],
  emotional: ['state', 'wins', 'identity', 'contradictions'],
  goal:      ['goals'],               // removed 'state' — only load state on emotional queries
  person:    ['people'],
  task:      ['tasks'],               // removed 'deadlines' — loaded by schedule topic if needed
  general:   ['tasks'],               // minimal: just tasks for generic messages
};

export async function compileContext(
  userId: string,
  message: string,
): Promise<ContextPacket> {
  const { intent, topics, entities } = await classifyIntent(message);

  const neededLayers = new Set<string>();

  for (const layer of INTENT_TO_LAYERS[intent] || []) {
    neededLayers.add(layer);
  }
  for (const topic of topics) {
    for (const layer of TOPIC_TO_LAYERS[topic] || []) {
      neededLayers.add(layer);
    }
  }

  // Only add tasks as a default for messages that aren't topic-specific
  // (avoids loading tasks for pure grade/emotional/people queries)
  const hasSpecificTopics = topics.some(t => t !== 'general');
  if (intent !== 'greeting' && !hasSpecificTopics) {
    neededLayers.add('tasks');
  }

  const packet: ContextPacket = {};
  const promises: Promise<void>[] = [];

  if (neededLayers.has('identity')) {
    promises.push(
      getIdentity(userId).then(r => { if (r) packet.identity = r; })
    );
  }

  if (neededLayers.has('schedule')) {
    promises.push(
      getTodayScheduleContext(userId).then(r => { if (r) packet.scheduleToday = r; })
    );
  }

  if (neededLayers.has('deadlines')) {
    promises.push(
      getUpcomingDeadlinesContext(userId, 7).then(r => { if (r) packet.upcomingDeadlines = r; })
    );
  }

  if (neededLayers.has('academics')) {
    const courseEntity = entities.find(e => e.length > 1);
    if (courseEntity) {
      promises.push(
        getCourseContext(userId, courseEntity).then(r => { if (r) packet.academicStanding = r; })
      );
    } else {
      promises.push(
        getAcademicStanding(userId).then(r => { if (r) packet.academicStanding = r; })
      );
    }
  }

  if (neededLayers.has('tasks')) {
    promises.push(
      getActiveTasksContext(userId).then(r => { if (r) packet.activeTasks = r; })
    );
  }

  if (neededLayers.has('state')) {
    promises.push(
      getCurrentState(userId).then(r => { if (r) packet.currentState = r; })
    );
  }

  if (neededLayers.has('goals')) {
    promises.push(
      getGoalsContext(userId).then(r => { if (r) packet.relevantGoals = r; })
    );
  }

  if (neededLayers.has('people')) {
    const personEntity = entities.find(e => e.length > 1);
    promises.push(
      getPeopleContext(userId, personEntity).then(r => { if (r) packet.relevantPeople = r; })
    );
  }

  if (neededLayers.has('wins')) {
    promises.push(
      getRecentWins(userId).then(r => { if (r) packet.recentWins = r; })
    );
  }

  if (neededLayers.has('contradictions')) {
    promises.push(
      getContradictions(userId).then(r => { if (r) packet.contradictions = r; })
    );
  }

  // Use daily brief cache when available for schedule/planning queries
  if (intent === 'schedule_query' || intent === 'planning') {
    promises.push(
      getDailyBrief(userId).then(brief => {
        if (brief && !packet.scheduleToday) {
          packet.scheduleToday = JSON.stringify(brief);
        }
      })
    );
  }

  await Promise.all(promises);

  return packet;
}
