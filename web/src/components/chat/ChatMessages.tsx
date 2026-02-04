'use client';

import { useEffect, useRef } from 'react';
import { ChatMessage } from './ChatMessage';
import { StreamingText } from './StreamingText';
import { ToolUseCard } from './ToolUseCard';
import { EmptyState } from './EmptyState';
import type { ChatMessage as ChatMessageType, ToolCallDisplay } from '@/lib/types';

interface ChatMessagesProps {
  messages: ChatMessageType[];
  streamingContent: string;
  toolCalls: ToolCallDisplay[];
  isStreaming: boolean;
}

export function ChatMessages({
  messages,
  streamingContent,
  toolCalls,
  isStreaming,
}: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  if (messages.length === 0 && !isStreaming) {
    return <EmptyState />;
  }

  return (
    <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-6">
      <div className="max-w-[768px] mx-auto">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

        {/* Active streaming */}
        {isStreaming && (streamingContent || toolCalls.length > 0) && (
          <div className="message-appear mb-6">
            {toolCalls.length > 0 && (
              <div className="mb-3">
                {toolCalls.map((tool) => (
                  <ToolUseCard key={tool.id} tool={tool} />
                ))}
              </div>
            )}
            {streamingContent && (
              <StreamingText content={streamingContent} isStreaming />
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
