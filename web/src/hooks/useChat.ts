'use client';

import { useCallback, useRef } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { useSessionStore } from '@/stores/session-store';
import { sendMessage, cancelRun } from '@/lib/api';
import { TEXT_MODEL_ID, VISION_MODEL_ID } from '@/lib/constants';
import type { ContentBlock, ImageAttachmentPayload } from '@/lib/types';
import { connectSSE } from '@/lib/sse';
import type { SSEConnection } from '@/lib/sse';

export function useChat() {
  const store = useChatStore();
  const sessionStore = useSessionStore();
  const sseRef = useRef<SSEConnection | null>(null);

  const send = useCallback(async (text: string, attachments?: ImageAttachmentPayload[]) => {
    const sessionId = store.currentSessionId;
    const hasAttachments = Boolean(attachments && attachments.length > 0);

    const contentBlocks: ContentBlock[] = [];
    if (text.trim().length > 0) {
      contentBlocks.push({ type: 'text', text: text.trim() });
    }
    if (hasAttachments) {
      attachments!.forEach((att) => {
        contentBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            mediaType: att.mediaType,
            data: att.data,
          },
        });
      });
    }

    const messagePayload: string | ContentBlock[] = hasAttachments ? contentBlocks : text;

    store.addUserMessage(messagePayload);

    try {
      const contextOptions = hasAttachments
        ? { modelId: VISION_MODEL_ID }
        : { modelId: TEXT_MODEL_ID };

      const result = await sendMessage({
        message: messagePayload,
        sessionId: sessionId || undefined,
        contextOptions,
      });

      store.startStreaming(result.runId, result.sessionId);
      
      // Add new session to sidebar if it's a new one
      if (!sessionId && result.sessionId) {
        sessionStore.addOrUpdateSession(result.sessionId);
      }

      sseRef.current = connectSSE(result.runId, {
        onEvent: (type, data: any) => {
          switch (type) {
            case 'model.delta':
              store.appendDelta(data?.delta || data?.text || '');
              break;
            case 'tool.start':
              store.addToolCall({
                id: data.toolCallId,
                name: data.toolName,
                arguments: data.arguments || {},
                status: 'running',
              });
              break;
            case 'tool.complete':
              store.updateToolCall(data.toolCallId, {
                status: 'completed',
                result: data.result,
              });
              break;
            case 'tool.error':
              store.updateToolCall(data.toolCallId, {
                status: 'error',
                error: data.error,
              });
              break;
            case 'run.completed':
              store.finalizeAssistant();
              sseRef.current?.close();
              sseRef.current = null;
              break;
            case 'run.error':
              store.setError(data?.error || 'Unknown error');
              sseRef.current?.close();
              sseRef.current = null;
              break;
            case 'run.cancelled':
              store.finalizeAssistant();
              sseRef.current?.close();
              sseRef.current = null;
              break;
          }
        },
        onError: () => {
          // SSE reconnection is automatic; if it truly fails,
          // the run.error event won't come — finalize after timeout
        },
      });
    } catch (err) {
      store.setError(err instanceof Error ? err.message : 'Failed to send message');
    }
  }, [store]);

  const stop = useCallback(async () => {
    const runId = store.currentRunId;
    if (runId) {
      try {
        await cancelRun(runId);
      } catch {
        // Ignore cancel errors
      }
    }
    sseRef.current?.close();
    sseRef.current = null;
    store.finalizeAssistant();
  }, [store]);

  return {
    messages: store.messages,
    streamingContent: store.streamingContent,
    toolCalls: store.toolCalls,
    isStreaming: store.isStreaming,
    currentSessionId: store.currentSessionId,
    send,
    stop,
    reset: store.reset,
    setSession: store.setSession,
    loadMessages: store.loadMessages,
  };
}
