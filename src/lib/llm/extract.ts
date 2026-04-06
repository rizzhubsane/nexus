import type { Extraction, ContextUpdate } from '@/lib/db/types';

export const EXTRACTION_PROMPT = `After responding to the user, also output a JSON block delimited by ---EXTRACTIONS--- markers. This block is hidden from the user and used for data extraction.

Format:
---EXTRACTIONS---
{
  "extractions": [
    {
      "type": "schedule|event|task|reminder|mark|person|belief|goal|course_policy",
      "data": { ... },
      "confidence": 0.0-1.0
    }
  ],
  "updates": [
    {
      "layer": "identity|world|goals|timeline|dynamics",
      "field": "...",
      "old_value": null,
      "new_value": "...",
      "reason": "..."
    }
  ]
}
---EXTRACTIONS---

Extraction guidelines:
- Only include extractions when the user shares new information (schedule, marks, tasks, people, goals, etc.)
- Set confidence to 0.0-1.0 based on how certain you are about the extraction
- For schedule: include title, days (array of day names), time (24h format), type (class/lab/tutorial)
- For events: include title, date (YYYY-MM-DD), type (quiz/exam/deadline/hackathon/meeting/personal/reminder)
- For tasks: include title, due_date (YYYY-MM-DD or null), status (pending)
- For reminders: include message, fire_at (ISO datetime in UTC). You MUST convert the user's requested local time to UTC before saving.
- For marks: include course_name, component (quiz/midterm/assignment/final), score, max_score
- For people: include name, relationship, context
- For beliefs/identity: include the inferred trait or preference
- For goals: include goal text, timeframe (short_term/medium_term/long_term), target_value if mentioned
- For course_policy: include course_name and grading weights as key-value pairs
- If no information to extract, output empty arrays
- When the user's message is purely a question or greeting, output empty arrays`;

export function parseExtractions(fullResponse: string): {
  userResponse: string;
  extractions: Extraction[];
  updates: ContextUpdate[];
} {
  const marker = '---EXTRACTIONS---';
  const parts = fullResponse.split(marker);

  if (parts.length < 3) {
    return { userResponse: fullResponse.trim(), extractions: [], updates: [] };
  }

  const userResponse = parts[0].trim();
  const jsonBlock = parts[1].trim();

  try {
    const parsed = JSON.parse(jsonBlock);
    return {
      userResponse,
      extractions: (parsed.extractions || []) as Extraction[],
      updates: (parsed.updates || []) as ContextUpdate[],
    };
  } catch {
    return { userResponse, extractions: [], updates: [] };
  }
}
