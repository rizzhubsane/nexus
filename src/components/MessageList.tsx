'use client';

import { useRef, useEffect } from 'react';
import Message from './Message';
import TypingIndicator from './TypingIndicator';
import type { Message as MessageType } from '@/lib/db/types';

interface MessageListProps {
  messages: MessageType[];
  isStreaming: boolean;
  streamingContent: string;
  onLoadMore?: () => void;
  hasMore?: boolean;
}

export default function MessageList({
  messages,
  isStreaming,
  streamingContent,
  onLoadMore,
  hasMore,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingContent]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;

    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;

    if (el.scrollTop < 100 && hasMore && onLoadMore) {
      onLoadMore();
    }
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 py-6"
    >
      <div className="mx-auto max-w-3xl space-y-3">
        {messages.length === 0 && !isStreaming && (
          <div className="flex h-full items-center justify-center pt-32">
            <div className="text-center space-y-3">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900">NEXUS</h2>
              <p className="text-sm text-gray-700 max-w-xs mx-auto font-medium">
                Just start talking. Tell me about your classes, your schedule, your goals — anything. I&apos;ll remember it all.
              </p>
            </div>
          </div>
        )}

        {messages.map(msg => (
          <Message
            key={msg.id}
            role={msg.role as 'user' | 'assistant'}
            content={msg.content}
            timestamp={msg.created_at}
            isProactive={!!(msg.metadata as Record<string, unknown>)?.proactive}
          />
        ))}

        {isStreaming && streamingContent && (
          <Message
            role="assistant"
            content={streamingContent}
            timestamp={new Date().toISOString()}
          />
        )}

        {isStreaming && !streamingContent && <TypingIndicator />}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
