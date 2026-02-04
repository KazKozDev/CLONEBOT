'use client';

import { ChatInput } from '@/components/chat/ChatInput';
import { ChatMessages } from '@/components/chat/ChatMessages';
import { useChat } from '@/hooks/useChat';
import { useEffect } from 'react';

export default function ChatPage() {
  const {
    messages,
    streamingContent,
    toolCalls,
    isStreaming,
    send,
    stop,
    reset,
  } = useChat();

  useEffect(() => {
    reset();
  }, [reset]);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0">
        <ChatMessages
          messages={messages}
          streamingContent={streamingContent}
          toolCalls={toolCalls}
          isStreaming={isStreaming}
        />
      </div>
      <div className="border-t border-border p-4">
        <ChatInput
          onSend={send}
          isStreaming={isStreaming}
          onStop={stop}
        />
      </div>
    </div>
  );
}
