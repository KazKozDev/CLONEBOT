import { API_BASE } from './constants';
import type { SessionInfo, SessionMessage, HealthReport, ServerStats, LogEntry } from './types';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(body.error?.message || `HTTP ${res.status}`);
  }

  return res.json();
}

// ── Chat ──

export async function sendMessage(params: {
  message: string | Array<{ type: string; [key: string]: unknown }>;
  sessionId?: string;
  contextOptions?: Record<string, unknown>;
}): Promise<{ runId: string; sessionId: string }> {
  return request('/api/v1/chat', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function cancelRun(runId: string): Promise<void> {
  await request(`/api/v1/chat/${runId}/cancel`, { method: 'POST' });
}

// ── Sessions ──

export async function listSessions(params?: {
  limit?: number;
  offset?: number;
}): Promise<{ sessions: SessionInfo[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  const query = qs.toString();
  return request(`/api/v1/sessions${query ? `?${query}` : ''}`);
}

export async function getSession(sessionId: string): Promise<SessionInfo> {
  return request(`/api/v1/sessions/${sessionId}`);
}

export async function getSessionMessages(
  sessionId: string,
  params?: { limit?: number; offset?: number }
): Promise<{ sessionId: string; total: number; messages: SessionMessage[] }> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  const query = qs.toString();
  return request(`/api/v1/sessions/${sessionId}/messages${query ? `?${query}` : ''}`);
}

export async function deleteSession(sessionId: string): Promise<void> {
  await request(`/api/v1/sessions/${sessionId}`, { method: 'DELETE' });
}

// ── Admin ──

export async function getHealth(): Promise<HealthReport> {
  return request('/api/v1/health');
}

export async function getStats(): Promise<ServerStats> {
  return request('/api/v1/stats');
}

export async function getAdminLogs(limit = 200): Promise<{ logs: LogEntry[] }> {
  return request(`/api/v1/admin/logs?limit=${limit}`);
}

export async function getAdminConfig(): Promise<Record<string, unknown>> {
  return request('/api/v1/admin/config');
}

export async function updateConfig(config: Record<string, unknown>): Promise<void> {
  await request('/api/v1/admin/config', {
    method: 'POST',
    body: JSON.stringify({ config }),
  });
}

// ── Tools ──

export async function listTools(): Promise<{ tools: Array<{ name: string; description: string }> }> {
  return request('/api/v1/tools');
}

// Export all methods as a single `api` object for easier importing
export const api = {
  sendMessage,
  cancelRun,
  listSessions,
  getSession,
  getSessionMessages,
  deleteSession,
  getHealth,
  getStats,
  getAdminLogs,
  getAdminConfig,
  updateConfig,
  listTools,
};
