'use client';

import { useCallback, useEffect } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { listSessions, deleteSession as apiDeleteSession } from '@/lib/api';

export function useSessions() {
  const { sessions, loading, error, setLoading, setSessions, setError, removeSession } = useSessionStore();

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listSessions({ limit: 100 });
      setSessions(data.sessions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    }
  }, [setLoading, setSessions, setError]);

  const deleteSessionById = useCallback(
    async (sessionId: string) => {
      try {
        await apiDeleteSession(sessionId);
        removeSession(sessionId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete session');
      }
    },
    [removeSession, setError]
  );

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return {
    sessions,
    loading,
    error,
    refresh: fetchSessions,
    deleteSession: deleteSessionById,
  };
}
