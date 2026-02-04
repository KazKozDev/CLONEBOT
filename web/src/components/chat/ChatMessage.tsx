'use client';

import { cn } from '@/lib/utils';
import { StreamingText } from './StreamingText';
import { ToolUseCard } from './ToolUseCard';
import type { ChatMessage as ChatMessageType, ContentBlock } from '@/lib/types';

interface ChatMessageProps {
  message: ChatMessageType;
  isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === 'user';

  const renderUserContent = (content: string | ContentBlock[]) => {
    if (typeof content === 'string') {
      return <div className="text-[15px] leading-relaxed whitespace-pre-wrap">{content}</div>;
    }

    return (
      <div className="space-y-3">
        {content.map((block, idx) => {
          if (block.type === 'text') {
            return (
              <div key={`text-${idx}`} className="text-[15px] leading-relaxed whitespace-pre-wrap">
                {block.text}
              </div>
            );
          }
          if (block.type === 'image' && block.source?.data) {
            const mediaType = block.source.mediaType || 'image/png';
            const src = `data:${mediaType};base64,${block.source.data}`;
            return (
              <img
                key={`img-${idx}`}
                src={src}
                alt="attachment"
                className="max-h-64 rounded-lg border border-[var(--border)]"
              />
            );
          }
          return null;
        })}
      </div>
    );
  };

  return (
    <div className={cn('message-appear mb-6', isUser ? 'flex justify-end' : 'bg-[var(--assistant-bg)] -mx-4 px-4 py-6')}>
      <div
        className={cn(
          'max-w-[720px] mx-auto',
          isUser
            ? 'bg-[var(--user-bubble)] rounded-2xl rounded-br-md px-4 py-3 max-w-[85%]'
            : 'w-full'
        )}
      >
        {/* Tool calls (before text for assistant) */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-3">
            {message.toolCalls.map((tool) => (
              <ToolUseCard key={tool.id} tool={tool} />
            ))}
          </div>
        )}

        {/* Message content */}
        {isUser ? (
          renderUserContent(message.content)
        ) : (
          <StreamingText content={String(message.content)} isStreaming={isStreaming} />
        )}
      </div>
    </div>
  );
}
