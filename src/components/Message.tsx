'use client';

import { useState } from 'react';

interface MessageProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isProactive?: boolean;
}

export default function Message({ role, content, timestamp, isProactive }: MessageProps) {
  const [showTime, setShowTime] = useState(false);
  const isUser = role === 'user';

  const formattedTime = new Date(timestamp).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <div
      className={`message-enter flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}
      onClick={() => setShowTime(!showTime)}
    >
      <div className="max-w-[75%] space-y-1">
        <div
          className={`rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
            isUser
              ? 'bg-user-bubble text-[#e0e0e0]'
              : 'bg-assistant-bubble text-[#e0e0e0]'
          } ${isProactive ? 'border-l-2 border-[#6c63ff]/30' : ''}`}
        >
          <p className="whitespace-pre-wrap break-words">{content}</p>
        </div>
        {showTime && (
          <p className={`text-[11px] text-[#555] ${isUser ? 'text-right' : 'text-left'} px-1`}>
            {formattedTime}
          </p>
        )}
      </div>
    </div>
  );
}
