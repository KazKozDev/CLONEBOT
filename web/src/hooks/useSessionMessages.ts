import { useState, useEffect } from 'react';
import { SessionMessage } from '@/lib/types';
import { api } from '@/lib/api';

export function useSessionMessages(sessionId: string) {
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setIsLoading(false);
      return;
    }

    const fetchMessages = async () => {
      try {
        setIsLoading(true);
        const data = await api.getSessionMessages(sessionId);
        setMessages(data.messages || []);
        setError(null);
      } catch (err) {
        // If session doesn't exist yet, just return empty messages
        console.warn('Session messages not available:', err);
        setMessages([]);
        setError(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMessages();
  }, [sessionId]);

  return { messages, isLoading, error };
}
