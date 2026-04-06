import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createServerSupabase } from '@/lib/db/supabase';
import { insertMessage, getRecentMessages } from '@/lib/db/queries';
import { streamChat, type ChatMessage } from '@/lib/llm/client';
import { BASE_SYSTEM_PROMPT, buildContextBlock } from '@/lib/llm/prompts';
import { EXTRACTION_PROMPT, parseExtractions } from '@/lib/llm/extract';
import { compileContext } from '@/lib/nexus/compiler';
import { processExtractions } from '@/lib/nexus/extractor';

async function getUserId(request: NextRequest): Promise<string | null> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

export async function POST(request: NextRequest) {
  const userId = await getUserId(request);
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { message } = await request.json();
  if (!message || typeof message !== 'string') {
    return new Response(JSON.stringify({ error: 'Message required' }), { status: 400 });
  }

  const db = createServerSupabase();

  // Save user message
  const userMsg = await insertMessage(userId, 'user', message);

  // Compile context in parallel with fetching recent messages
  const [contextPacket, recentMessages] = await Promise.all([
    compileContext(userId, message),
    getRecentMessages(userId, 5),
  ]);

  const contextBlock = buildContextBlock(contextPacket);

  // Build LLM messages
  const llmMessages: ChatMessage[] = [
    {
      role: 'system',
      content: `${BASE_SYSTEM_PROMPT}\n\n${contextBlock}\n\n${EXTRACTION_PROMPT}`,
    },
    ...recentMessages
      .filter(m => m.role !== 'system')
      .slice(-5)
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: message },
  ];

  // Stream response via SSE
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const chunks = await streamChat(llmMessages);
        let fullResponse = '';

        for await (const chunk of chunks) {
          fullResponse += chunk;

          // Don't stream the extraction block to the user
          if (fullResponse.includes('---EXTRACTIONS---')) {
            const visiblePart = fullResponse.split('---EXTRACTIONS---')[0];
            const alreadySent = visiblePart.length - chunk.length;
            if (alreadySent < visiblePart.length) {
              // Still in the visible part
              const safeChunk = chunk.split('---EXTRACTIONS---')[0];
              if (safeChunk) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: safeChunk })}\n\n`));
              }
            }
            continue;
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`));
        }

        // Parse response and extractions
        const { userResponse, extractions, updates } = parseExtractions(fullResponse);

        // Save assistant message
        const assistantMsg = await insertMessage(userId, 'assistant', userResponse);

        // Send final message with IDs
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({
            message: assistantMsg,
            userMessage: userMsg,
          })}\n\n`)
        );

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();

        // Process extractions in background (after stream is closed)
        if (extractions.length > 0 || updates.length > 0) {
          processExtractions(userId, extractions, updates).catch(err =>
            console.error('Extraction processing error:', err)
          );
        }
      } catch (err) {
        console.error('Streaming error:', err);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: 'Failed to generate response' })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
