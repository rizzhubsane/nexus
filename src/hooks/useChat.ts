'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Message } from '@/lib/db/types';

export function useChat(userId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const initialLoadDone = useRef(false);

  // We don't fetch old messages on load anymore, so the chat starts empty.
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
  }, []);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || messages.length === 0) return;
    setIsLoadingMore(true);

    try {
      const oldest = messages[0]?.created_at;
      const res = await fetch(`/api/messages?limit=50&before=${encodeURIComponent(oldest)}`);
      const data = await res.json();
      const older = data.messages || [];
      setMessages(prev => [...older, ...prev]);
      setHasMore(data.hasMore ?? false);
    } catch (err) {
      console.error('Failed to load more messages:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, messages]);

  const sendMessage = useCallback(async (content: string) => {
    const optimisticMsg: Message = {
      id: `temp-${Date.now()}`,
      user_id: userId,
      role: 'user',
      content,
      metadata: {},
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, optimisticMsg]);
    setIsStreaming(true);
    setStreamingContent('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content }),
      });

      if (!res.ok) throw new Error('Chat request failed');

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('No reader available');

      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullContent += parsed.content;
                setStreamingContent(fullContent);
              }
              if (parsed.message) {
                setMessages(prev => {
                  const withoutTemp = prev.filter(m => !m.id.startsWith('temp-'));
                  const userMsg = parsed.userMessage || optimisticMsg;
                  return [...withoutTemp, userMsg, parsed.message];
                });
              }
            } catch {
              // Partial JSON, accumulate content text
              fullContent += data;
              setStreamingContent(fullContent);
            }
          }
        }
      }
    } catch (err) {
      console.error('Chat error:', err);
      setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
    } finally {
      setIsStreaming(false);
      setStreamingContent('');
    }
  }, [userId]);

  return { messages, isStreaming, streamingContent, sendMessage, loadMore, hasMore };
}
