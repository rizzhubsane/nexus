'use client';

import { PromptInputBox } from '@/components/ui/ai-prompt-box';

interface InputBarProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export default function InputBar({ onSend, disabled }: InputBarProps) {
  const handleSend = (message: string, files?: File[]) => {
    // Currently the app only supports text messages
    if (message) {
      onSend(message);
    }
  };

  return (
    <div className="px-4 py-3 pb-6">
      <div className="mx-auto max-w-3xl">
        <PromptInputBox 
          onSend={handleSend} 
          isLoading={disabled}
          placeholder="Message NEXUS..."
        />
      </div>
    </div>
  );
}
