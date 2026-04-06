'use client';

import { useEffect, useState } from 'react';
import { createBrowserSupabase } from '@/lib/db/supabase';
import type { Message } from '@/lib/db/types';

export function useRealtime(userId: string) {
  const [latestMessage, setLatestMessage] = useState<Message | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabase();

    const channel = supabase
      .channel('messages-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          // Only surface proactive messages (user-initiated ones are handled by useChat)
          if (msg.role === 'assistant' && (msg.metadata as Record<string, unknown>)?.proactive) {
            setLatestMessage(msg);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return latestMessage;
}
