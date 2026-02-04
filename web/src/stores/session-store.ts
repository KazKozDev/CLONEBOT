'use client';

import { create } from 'zustand';
import type { SessionInfo } from '@/lib/types';

interface SessionState {
  sessions: SessionInfo[];
  loading: boolean;
  error: string | null;
  setSessions: (sessions: SessionInfo[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  removeSession: (sessionId: string) => void;
  addOrUpdateSession: (sessionId: string, title?: string) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  loading: false,
  error: null,
  setSessions: (sessions) => set({ sessions, loading: false, error: null }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
  removeSession: (sessionId) =>
    set((s) => ({
      sessions: s.sessions.filter((sess) => sess.sessionId !== sessionId),
    })),
  addOrUpdateSession: (sessionId, title) =>
    set((s) => {
      const exists = s.sessions.find((sess) => sess.sessionId === sessionId);
      if (exists) return s;
      return {
        sessions: [
          {
            sessionId,
            keys: [],
            metadata: {
              sessionId,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              messageCount: 1,
            },
          },
          ...s.sessions,
        ],
      };
    }),
}));
