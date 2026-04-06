'use client';

export default function TypingIndicator() {
  return (
    <div className="message-enter flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl bg-assistant-bubble px-4 py-3">
        <span className="typing-dot h-2 w-2 rounded-full bg-[#6c63ff]" />
        <span className="typing-dot h-2 w-2 rounded-full bg-[#6c63ff]" />
        <span className="typing-dot h-2 w-2 rounded-full bg-[#6c63ff]" />
      </div>
    </div>
  );
}
