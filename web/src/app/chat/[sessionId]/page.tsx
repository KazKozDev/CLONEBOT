'use client';

import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { ChatInput } from '@/components/chat/ChatInput';
import { ChatMessages } from '@/components/chat/ChatMessages';
import { useChat } from '@/hooks/useChat';
import { useSessionMessages } from '@/hooks/useSessionMessages';
import { Spinner } from '@/components/ui/Spinner';
import type { ChatMessage, SessionMessage } from '@/lib/types';

// Convert SessionMessage from API to ChatMessage for UI
function convertToChatMessage(msg: SessionMessage): ChatMessage | null {
  if (msg.type === 'user' || msg.type === 'assistant') {
    return {
      id: msg.id,
      role: msg.type,
      content: msg.content ?? '',
      timestamp: msg.timestamp,
    };
  }
  return null;
}

export default function SessionChatPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  
  const { messages: historyMessages, isLoading } = useSessionMessages(sessionId);
  const { messages, streamingContent, toolCalls, isStreaming, send, stop, loadMessages, setSession } = useChat();

  useEffect(() => {
    setSession(sessionId);
  }, [sessionId, setSession]);

  useEffect(() => {
    if (historyMessages && historyMessages.length > 0) {
      const chatMessages = historyMessages
        .map(convertToChatMessage)
        .filter((msg): msg is ChatMessage => msg !== null);
      loadMessages(chatMessages);
    }
  }, [historyMessages, loadMessages]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      <ChatMessages
        messages={messages}
        streamingContent={streamingContent}
        toolCalls={toolCalls}
        isStreaming={isStreaming}
      />
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
