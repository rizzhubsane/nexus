import OpenAI from 'openai';

let clientInstance: OpenAI | null = null;

function getClient(): OpenAI {
  if (clientInstance) return clientInstance;

  clientInstance = new OpenAI({
    apiKey: process.env.LLM_API_KEY!,
    baseURL: process.env.LLM_BASE_URL || 'https://openrouter.ai/api/v1',
  });

  return clientInstance;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function streamChat(messages: ChatMessage[]): Promise<AsyncIterable<string>> {
  const client = getClient();
  const model = process.env.LLM_MODEL || 'google/gemini-2.5-flash';

  const stream = await client.chat.completions.create({
    model,
    messages,
    stream: true,
    temperature: 0.7,
    max_tokens: 2048,
  });

  async function* generateChunks() {
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }

  return generateChunks();
}

export async function chatCompletion(messages: ChatMessage[]): Promise<string> {
  const client = getClient();
  const model = process.env.LLM_MODEL || 'google/gemini-2.5-flash';

  const response = await client.chat.completions.create({
    model,
    messages,
    temperature: 0.7,
    max_tokens: 2048,
  });

  return response.choices[0]?.message?.content || '';
}
