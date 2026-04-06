'use client';

import { useEffect, useState } from 'react';
import MessageList from './MessageList';
import InputBar from './InputBar';
import { useChat } from '@/hooks/useChat';
import { useRealtime } from '@/hooks/useRealtime';
import { createBrowserSupabase } from '@/lib/db/supabase';
import type { Message } from '@/lib/db/types';

export default function ChatPage() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, []);

  if (!userId) {
    return (
      <div className="flex h-full items-center justify-center bg-transparent">
        <div className="typing-dot h-3 w-3 rounded-full bg-[#6c63ff]" />
      </div>
    );
  }

  return <ChatContent userId={userId} />;
}

function ChatContent({ userId }: { userId: string }) {
  const {
    messages,
    isStreaming,
    streamingContent,
    sendMessage,
    loadMore,
    hasMore,
  } = useChat(userId);

  const realtimeMessage = useRealtime(userId);

  const [allMessages, setAllMessages] = useState<Message[]>([]);

  useEffect(() => {
    setAllMessages(messages);
  }, [messages]);

  useEffect(() => {
    if (realtimeMessage && !allMessages.find(m => m.id === realtimeMessage.id)) {
      setAllMessages(prev => [...prev, realtimeMessage]);
    }
  }, [realtimeMessage, allMessages]);

  return (
    <div className="flex h-full flex-col bg-transparent">
      <MessageList
        messages={allMessages}
        isStreaming={isStreaming}
        streamingContent={streamingContent}
        onLoadMore={loadMore}
        hasMore={hasMore}
      />
      <InputBar onSend={sendMessage} disabled={isStreaming} />
    </div>
  );
}
