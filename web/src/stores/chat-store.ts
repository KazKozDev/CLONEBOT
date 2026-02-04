'use client';

import { create } from 'zustand';
import type { ChatMessage, ToolCallDisplay } from '@/lib/types';
import { generateId } from '@/lib/utils';

interface ChatState {
  messages: ChatMessage[];
  streamingContent: string;
  toolCalls: ToolCallDisplay[];
  isStreaming: boolean;
  currentRunId: string | null;
  currentSessionId: string | null;

  // Actions
  setSession: (sessionId: string | null) => void;
  addUserMessage: (content: string | ChatMessage['content']) => void;
  startStreaming: (runId: string, sessionId: string) => void;
  appendDelta: (delta: string) => void;
  addToolCall: (tool: ToolCallDisplay) => void;
  updateToolCall: (id: string, update: Partial<ToolCallDisplay>) => void;
  finalizeAssistant: () => void;
  setError: (error: string) => void;
  loadMessages: (messages: ChatMessage[]) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  streamingContent: '',
  toolCalls: [],
  isStreaming: false,
  currentRunId: null,
  currentSessionId: null,

  setSession: (sessionId) => set({ currentSessionId: sessionId }),

  addUserMessage: (content) =>
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: generateId(),
          role: 'user',
          content,
          timestamp: Date.now(),
        },
      ],
    })),

  startStreaming: (runId, sessionId) =>
    set({
      isStreaming: true,
      currentRunId: runId,
      currentSessionId: sessionId,
      streamingContent: '',
      toolCalls: [],
    }),

  appendDelta: (delta) =>
    set((s) => ({ streamingContent: s.streamingContent + delta })),

  addToolCall: (tool) =>
    set((s) => ({ toolCalls: [...s.toolCalls, tool] })),

  updateToolCall: (id, update) =>
    set((s) => ({
      toolCalls: s.toolCalls.map((t) =>
        t.id === id ? { ...t, ...update } : t
      ),
    })),

  finalizeAssistant: () =>
    set((s) => {
      const content = s.streamingContent;
      if (!content && s.toolCalls.length === 0) {
        return { isStreaming: false, currentRunId: null };
      }
      return {
        messages: [
          ...s.messages,
          {
            id: generateId(),
            role: 'assistant',
            content,
            timestamp: Date.now(),
            toolCalls: s.toolCalls.length > 0 ? [...s.toolCalls] : undefined,
          },
        ],
        streamingContent: '',
        toolCalls: [],
        isStreaming: false,
        currentRunId: null,
      };
    }),

  setError: (error) =>
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: generateId(),
          role: 'assistant',
          content: `Error: ${error}`,
          timestamp: Date.now(),
        },
      ],
      streamingContent: '',
      toolCalls: [],
      isStreaming: false,
      currentRunId: null,
    })),

  loadMessages: (messages) => set({ messages }),

  reset: () =>
    set({
      messages: [],
      streamingContent: '',
      toolCalls: [],
      isStreaming: false,
      currentRunId: null,
      currentSessionId: null,
    }),
}));
