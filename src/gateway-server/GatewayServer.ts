/**
 * Gateway Server Facade
 *
 * Unified HTTP + WebSocket (+ SSE via Response.sse) server on a single port.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import type {
  GatewayConfig,
  GatewayDependencies,
  HTTPMethod,
  RouteHandler,
  Middleware,
  ShutdownOptions,
  ServerEvent,
  ServerEventHandler,
  GatewayError,
} from './types';
import { NotFoundError, ValidationError } from './types';
import { createHTTPServer, HTTPServer } from './http-server';
import { createRouter, HTTPRouter } from './router';
import { createMiddlewareManager, MiddlewareManager } from './middleware';
import { createRequest, createResponse, parseBody } from './request-response';
import { createCORSMiddleware } from './cors-middleware';
import { createRateLimitMiddleware } from './rate-limiter';
import { createStaticMiddleware } from './static-middleware';
import { createHealthCheckManager, HealthCheckManager } from './health-check';
import { createShutdownManager, ShutdownManager } from './shutdown-manager';
import { createAuthMiddleware, optionalAuth } from './auth-middleware';
import { createConnectionManager, ConnectionManager } from './connection-manager';
import { createWebSocketHandler, WebSocketUpgradeHandler, WebSocketConnection } from './websocket-upgrade';
import { RunRegistry } from './run-registry';
import type { AgentLoop } from '../agent-loop/AgentLoop';
import type { RunHandle } from '../agent-loop/types';
import { createForRun } from '../block-streamer/agent-loop-integration';
import type { Block } from '../block-streamer/types';
import type { MessageBus } from '../message-bus';
import { formatError, formatResponse, formatEvent } from './websocket-protocol';
import type { SessionStore } from '../session-store/SessionStore';
import type { ToolExecutor } from '../tool-executor/ToolExecutor';

export const DEFAULT_GATEWAY_CONFIG: GatewayConfig = {
  host: '127.0.0.1',
  port: 0,
  auth: { mode: 'none' },
  cors: { enabled: false, origins: ['*'] },
  rateLimit: { enabled: false, defaultLimit: 60, windowMs: 60_000 },
  static: { enabled: false, root: '.', index: 'index.html', maxAge: 3600, compression: true },
  timeouts: { request: 30_000, websocket: 60_000, shutdown: 10_000 },
  limits: {
    maxBodySize: 10 * 1024 * 1024,
    maxConnections: 1000,
    maxConnectionsPerIp: 100,
    maxWsSubscriptionsPerConnection: 25,
    maxWsBufferedAmount: 2 * 1024 * 1024,
  },
  logging: { requests: false, responses: false, errors: true },
};

function normalizePath(pathname: string): string {
  if (!pathname) return '/';
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

function shouldParseBody(method: string): boolean {
  return method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
}

export class GatewayServer {
  private config: GatewayConfig;
  private readonly deps: GatewayDependencies;

  private readonly http: HTTPServer;
  private readonly router: HTTPRouter;
  private readonly middleware: MiddlewareManager;
  private readonly connections: ConnectionManager;
  private readonly health: HealthCheckManager;
  private readonly shutdown: ShutdownManager;

  private ws: WebSocketUpgradeHandler | null = null;
  private events = new Map<ServerEvent, Set<ServerEventHandler>>();

  private runs = new RunRegistry();

  private readonly customMiddlewares: Array<{ path?: string; middleware: Middleware }> = [];

  private readonly logBuffer: Array<{ ts: number; level: 'info' | 'warn' | 'error'; message: string; data?: unknown }> = [];
  private readonly maxLogBufferSize = 500;

  // connection.id -> runId -> unsubscribe
  private wsRunSubscriptions = new Map<string, Map<string, () => void>>();

  private startWsRunSubscription(
    connection: WebSocketConnection,
    runId: string,
    afterId?: number
  ): { ok: true } | { ok: false; code: string; message: string } {
    const existing = this.wsRunSubscriptions.get(connection.id)?.get(runId);
    if (existing) return { ok: true };

    const currentCount = this.wsRunSubscriptions.get(connection.id)?.size ?? 0;
    const maxSubs = this.config.limits.maxWsSubscriptionsPerConnection ?? 25;
    if (currentCount >= maxSubs) {
      return { ok: false, code: 'SUBSCRIPTION_LIMIT', message: 'Too many run subscriptions for this connection' };
    }

    const subscription = this.runs.subscribeWithIdsHandle(runId, afterId);
    if (!subscription) return { ok: false, code: 'NOT_FOUND', message: 'Run not found' };

    const connSubs = this.wsRunSubscriptions.get(connection.id) ?? new Map<string, () => void>();
    connSubs.set(runId, subscription.unsubscribe);
    this.wsRunSubscriptions.set(connection.id, connSubs);
    connection.subscribe(`run:${runId}`);

    const cleanup = () => {
      try {
        subscription.unsubscribe();
      } catch {
        // ignore
      }

      const map = this.wsRunSubscriptions.get(connection.id);
      if (map?.get(runId) === subscription.unsubscribe) {
        map.delete(runId);
        if (map.size === 0) {
          this.wsRunSubscriptions.delete(connection.id);
        }
      }

      connection.unsubscribe(`run:${runId}`);
    };

    void (async () => {
      try {
        for await (const item of subscription.stream) {
          if (!connection.isAlive()) break;

          const maxBuffered = this.config.limits.maxWsBufferedAmount ?? 2 * 1024 * 1024;
          if (connection.ws.bufferedAmount > maxBuffered) {
            // Protect process memory under slow consumers.
            try {
              connection.close(1013, 'Backpressure');
            } catch {
              // ignore
            }
            break;
          }

          connection.send(
            formatEvent('run', item.event.type, { runId, event: item.event }, String(item.id))
          );
        }
      } finally {
        cleanup();
      }
    })();

    return { ok: true };
  }

  constructor(config: GatewayConfig, deps: GatewayDependencies = {}) {
    this.config = config;
    this.deps = deps;

    this.http = createHTTPServer({ host: config.host, port: config.port });
    this.router = createRouter();
    this.middleware = createMiddlewareManager();
    this.connections = createConnectionManager();
    // Keep decoupled from src/index.ts exports to avoid circular deps.
    this.health = createHealthCheckManager('1.0.0');
    this.shutdown = createShutdownManager();

    this.installDefaultMiddleware();
    this.installDefaultRoutes();

    this.http.onRequest((req, res) => this.handleHttp(req, res));

    // Best-effort graceful shutdown
    this.shutdown.onShutdown(async () => {
      this.emit('shutdown');
      this.ws?.closeAll(1001, 'Server shutting down');
      await this.http.stop({ graceful: true, timeout: this.config.timeouts.shutdown });
    });
  }

  // ------------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------------

  on(event: ServerEvent, handler: ServerEventHandler): () => void {
    const set = this.events.get(event) ?? new Set<ServerEventHandler>();
    set.add(handler);
    this.events.set(event, set);
    return () => set.delete(handler);
  }

  route(method: HTTPMethod | '*', pattern: string, handler: RouteHandler): this {
    this.router.addRoute(method, pattern, handler);
    return this;
  }

  use(middleware: Middleware): this;
  use(path: string, middleware: Middleware): this;
  use(pathOrMiddleware: string | Middleware, middleware?: Middleware): this {
    if (typeof pathOrMiddleware === 'string' && typeof middleware === 'function') {
      this.customMiddlewares.push({ path: pathOrMiddleware, middleware });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.middleware as any).use(pathOrMiddleware as any, middleware as any);
      return this;
    }

    if (typeof pathOrMiddleware === 'function') {
      this.customMiddlewares.push({ middleware: pathOrMiddleware });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.middleware as any).use(pathOrMiddleware as any, middleware as any);
      return this;
    }

    throw new Error('Invalid middleware registration');
  }

  async start(): Promise<void> {
    this.shutdown.setState('starting');
    await this.http.start();

    // Attach WS handler after HTTP server exists
    const serverInstance = this.http.getServerInstance();
    if (!serverInstance) {
      throw new Error('HTTP server instance not available');
    }

    if (!this.ws) {
      this.ws = createWebSocketHandler(serverInstance, {
        path: '/ws',
        subprotocol: 'openclaw-v1',
        heartbeatIntervalMs: Math.max(5_000, Math.floor(this.config.timeouts.websocket / 2)),
      });

      this.ws.onConnection((conn) => this.handleWsConnect(conn));
      this.ws.onDisconnection((conn) => this.handleWsDisconnect(conn));
      this.ws.onMessage((msg, conn) => this.handleWsMessage(msg, conn));
    }

    this.shutdown.setState('running');
    this.emit('start');
  }

  async stop(options?: ShutdownOptions): Promise<void> {
    await this.shutdown.shutdown({ graceful: options?.graceful ?? true, timeout: options?.timeout ?? this.config.timeouts.shutdown });
    this.shutdown.setState('stopped');
    this.emit('stop');
  }

  getAddress(): { host: string; port: number } | null {
    return this.http.getAddress();
  }

  getState(): 'stopped' | 'starting' | 'running' | 'shutting_down' {
    return this.shutdown.getState();
  }

  getConnectionStats(): ReturnType<ConnectionManager['getStats']> {
    return this.connections.getStats();
  }

  // ------------------------------------------------------------------------
  // Setup
  // ------------------------------------------------------------------------

  private installDefaultMiddleware(): void {
    // CORS first (handles preflight)
    this.middleware.use(createCORSMiddleware(this.config.cors));

    // Optional auth for identity-aware rate limits / logging
    this.middleware.use(optionalAuth(this.config.auth));

    // Rate limit globally (can be overridden per-endpoint in config)
    this.middleware.use(createRateLimitMiddleware(this.config.rateLimit));

    // Static files (last, so API routes take priority)
    this.middleware.use(createStaticMiddleware(this.config.static));

    // Enforced auth for API routes, with a small public allowlist
    const enforceApiAuth = createAuthMiddleware(this.config.auth);
    this.middleware.use('/api', async (req, res, next) => {
      // Public endpoints
      if (req.path === '/api/v1/health' || req.path === '/api/v1/health/quick') {
        await next();
        return;
      }

      await enforceApiAuth(req, res, next);
    });
  }

  private installDefaultRoutes(): void {
    // --------------------------------------------------------------------
    // System endpoints
    // --------------------------------------------------------------------

    // Friendly root page (useful when static UI isn't configured)
    this.router.addRoute('GET', '/', async (_req, res) => {
      res.status(200)
        .header('Content-Type', 'text/html; charset=utf-8')
        .send(
          [
            '<!doctype html>',
            '<html lang="en">',
            '<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />',
            '<title>CLONEBOT Gateway</title></head>',
            '<body style="font-family: ui-sans-serif, system-ui, -apple-system; padding: 24px;">',
            '<h1>CLONEBOT Gateway</h1>',
            '<p>Gateway server is running. Useful endpoints:</p>',
            '<ul>',
            '<li><a href="/api/v1/health">/api/v1/health</a></li>',
            '<li><a href="/api/v1/stats">/api/v1/stats</a></li>',
            '<li><a href="/api/v1/config">/api/v1/config</a></li>',
            '</ul>',
            '<p>Chat API:</p>',
            '<ul>',
            '<li><code>POST /api/v1/chat</code></li>',
            '<li><code>GET /api/v1/chat/:runId/stream</code> (SSE)</li>',
            '<li><code>GET /api/v1/chat/:runId/blocks</code> (SSE)</li>',
            '</ul>',
            '</body></html>',
          ].join('')
        );
    });

    // Avoid noisy 404s from browsers
    this.router.addRoute('GET', '/favicon.ico', async (_req, res) => {
      res.status(204).send();
    });

    this.router.addRoute('GET', '/api/v1/stats', async (_req, res) => {
      res.status(200).json(this.buildStats(false));
    });

    this.router.addRoute('GET', '/api/v1/config', async (_req, res) => {
      res.status(200).json(this.getSanitizedConfig(false));
    });

    this.router.addRoute('GET', '/api/v1/health', async (_req, res) => {
      const report = await this.health.runChecks(5000);
      res.status(report.status === 'healthy' ? 200 : 503).json(report);
    });

    this.router.addRoute('GET', '/api/v1/health/quick', async (_req, res) => {
      const report = this.health.quickCheck();
      res.status(200).json(report);
    });

    this.router.addRoute('GET', '/api/v1/connections', async (req, res) => {
      // Basic introspection endpoint; keep minimal until admin auth/permissions are wired.
      if (!req.auth?.permissions?.includes('*')) {
        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Missing permission' } });
        return;
      }

      res.status(200).json({ stats: this.connections.getStats() });
    });

    // --------------------------------------------------------------------
    // Sessions API
    // --------------------------------------------------------------------

    this.router.addRoute('GET', '/api/v1/sessions', async (req, res) => {
      const store = this.getSessionStoreOrNull();
      if (!store) {
        res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'SessionStore not configured' } });
        return;
      }

      const key = req.query.key;
      const limit = req.query.limit ? Math.max(0, Number(req.query.limit)) : 50;
      const offset = req.query.offset ? Math.max(0, Number(req.query.offset)) : 0;

      let ids: string[];
      if (typeof key === 'string' && key.length > 0) {
        const id = store.getSessionId?.(key as any);
        ids = id ? [id] : [];
      } else {
        ids = store.getAllSessionIds();
      }

      const total = ids.length;
      const page = ids.slice(offset, offset + limit);

      const sessions = page.map((sessionId) => {
        const metadata = store.getMetadata(sessionId);
        const keys = store.getSessionKeys ? store.getSessionKeys(sessionId) : [];
        return { sessionId, keys, metadata };
      });

      res.status(200).json({ sessions, total });
    });

    this.router.addRoute('GET', '/api/v1/sessions/:sessionId', async (req, res) => {
      const store = this.getSessionStoreOrNull();
      if (!store) {
        res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'SessionStore not configured' } });
        return;
      }

      const sessionId = req.params.sessionId;
      const metadata = store.getMetadata(sessionId);
      if (!metadata) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found' } });
        return;
      }

      const keys = store.getSessionKeys ? store.getSessionKeys(sessionId) : [];
      res.status(200).json({ sessionId, keys, metadata });
    });

    this.router.addRoute('GET', '/api/v1/sessions/:sessionId/messages', async (req, res) => {
      const store = this.getSessionStoreOrNull();
      if (!store) {
        res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'SessionStore not configured' } });
        return;
      }

      const sessionId = req.params.sessionId;
      
      // Try to get messages - this will create session if it doesn't exist
      try {
        const leafMessageId = req.query.leafMessageId;
        const limit = req.query.limit ? Math.max(0, Number(req.query.limit)) : undefined;
        const offset = req.query.offset ? Math.max(0, Number(req.query.offset)) : 0;

        let messages: any[];
        if (typeof leafMessageId === 'string' && leafMessageId.length > 0 && typeof store.getLinearHistory === 'function') {
          messages = await store.getLinearHistory(sessionId, leafMessageId);
        } else {
          messages = await store.getMessages(sessionId);
        }

        const total = messages.length;
        if (typeof limit === 'number' && Number.isFinite(limit)) {
          messages = messages.slice(offset, offset + limit);
        }

        res.status(200).json({ sessionId, total, messages });
      } catch (error: any) {
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message } });
      }
    });

    this.router.addRoute('DELETE', '/api/v1/sessions/:sessionId', async (req, res) => {
      const store = this.getSessionStoreOrNull();
      if (!store) {
        res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'SessionStore not configured' } });
        return;
      }

      if (!req.auth?.permissions?.includes('*')) {
        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Missing permission' } });
        return;
      }

      const sessionId = req.params.sessionId;
      const metadata = store.getMetadata(sessionId);
      if (!metadata) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found' } });
        return;
      }

      await store.deleteSession(sessionId);
      res.status(204).send();
    });

    // --------------------------------------------------------------------
    // Tools API
    // --------------------------------------------------------------------

    this.router.addRoute('GET', '/api/v1/tools', async (req, res) => {
      const tools = this.getToolExecutorOrNull();
      if (!tools) {
        res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'ToolExecutor not configured' } });
        return;
      }

      const category = req.query.category;
      const defs = typeof category === 'string' && category.length > 0
        ? tools.list({ category })
        : tools.list();

      res.status(200).json({ tools: defs });
    });

    this.router.addRoute('GET', '/api/v1/tools/:name', async (req, res) => {
      const tools = this.getToolExecutorOrNull();
      if (!tools) {
        res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'ToolExecutor not configured' } });
        return;
      }

      const name = req.params.name;
      const data = typeof tools.introspect === 'function' ? tools.introspect(name) : null;
      if (!data) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tool not found' } });
        return;
      }

      res.status(200).json(data);
    });

    this.router.addRoute('POST', '/api/v1/tools/:name/validate', async (req, res) => {
      const tools = this.getToolExecutorOrNull();
      if (!tools) {
        res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'ToolExecutor not configured' } });
        return;
      }

      if (typeof tools.validate !== 'function') {
        res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Tool validation not supported' } });
        return;
      }

      const name = req.params.name;
      const params = (req.body ?? {}).params;
      const result = tools.validate(name, params);
      res.status(200).json(result);
    });

    this.router.addRoute('POST', '/api/v1/tools/:name/execute', async (req, res) => {
      const tools = this.getToolExecutorOrNull();
      if (!tools) {
        res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'ToolExecutor not configured' } });
        return;
      }

      if (!req.auth?.permissions?.includes('*')) {
        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Missing permission' } });
        return;
      }

      const name = req.params.name;
      const body = req.body ?? {};
      const params = body.params ?? {};
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId : 'default';
      const runId = typeof body.runId === 'string' ? body.runId : `tool_${randomUUID()}`;
      const toolCallId = `http_${randomUUID()}`;
      const timeout = typeof body.timeout === 'number' ? body.timeout : undefined;
      const sandboxMode = typeof body.sandboxMode === 'boolean' ? body.sandboxMode : undefined;

      if (typeof tools.createContext !== 'function' || typeof tools.execute !== 'function') {
        res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Tool execution not supported by configured ToolExecutor' } });
        return;
      }

      const context = tools.createContext({
        sessionId,
        runId,
        toolCallId,
        permissions: req.auth?.permissions ?? [],
        sandboxMode,
        workingDirectory: process.cwd(),
        env: {},
        timeout,
      });

      const result = await tools.execute(name, params, context);
      res.status(200).json(result);
    });

    // --------------------------------------------------------------------
    // Admin API
    // --------------------------------------------------------------------

    this.router.addRoute('GET', '/api/v1/admin/stats', async (req, res) => {
      if (!req.auth?.permissions?.includes('*')) {
        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Missing permission' } });
        return;
      }

      res.status(200).json(this.buildStats(true));
    });

    this.router.addRoute('GET', '/api/v1/admin/config', async (req, res) => {
      if (!req.auth?.permissions?.includes('*')) {
        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Missing permission' } });
        return;
      }

      res.status(200).json(this.getSanitizedConfig(true));
    });

    this.router.addRoute('POST', '/api/v1/admin/config', async (req, res) => {
      if (!req.auth?.permissions?.includes('*')) {
        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Missing permission' } });
        return;
      }

      const patch = (req.body ?? {}).config ?? req.body ?? {};
      if (!patch || typeof patch !== 'object') {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'config patch must be an object' } });
        return;
      }

      if ('auth' in (patch as any)) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Updating auth via admin/config is not supported' } });
        return;
      }

      this.applyAdminConfigPatch(patch as Partial<GatewayConfig>);
      res.status(200).json({ ok: true, config: this.getSanitizedConfig(true) });
    });

    this.router.addRoute('GET', '/api/v1/admin/logs', async (req, res) => {
      if (!req.auth?.permissions?.includes('*')) {
        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Missing permission' } });
        return;
      }

      const limit = req.query.limit ? Math.max(0, Math.min(1000, Number(req.query.limit))) : 200;
      const logs = this.logBuffer.slice(Math.max(0, this.logBuffer.length - limit));
      res.status(200).json({ logs });
    });

    this.router.addRoute('POST', '/api/v1/admin/shutdown', async (req, res) => {
      if (!req.auth?.permissions?.includes('*')) {
        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Missing permission' } });
        return;
      }

      const timeout = typeof (req.body ?? {}).timeout === 'number'
        ? (req.body as any).timeout
        : this.config.timeouts.shutdown;

      res.status(202).json({ ok: true, state: this.getState() });

      // Stop after responding
      setImmediate(() => {
        void this.stop({ graceful: true, timeout }).catch(() => {
          // ignore
        });
      });
    });

    // Agent Loop integration (minimal)
    this.router.addRoute('POST', '/api/v1/chat', async (req, res) => {
      const agentLoop = this.getAgentLoopOrNull();
      if (!agentLoop) {
        res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'AgentLoop not configured' } });
        return;
      }

      const body = req.body ?? {};
      const message = body.message;
      const sessionId = body.sessionId ?? body.sessionKey ?? body.session ?? undefined;
      const priority = body.priority;
      const contextOptions = body.contextOptions;

      const isMessageString = typeof message === 'string';
      const isMessageBlocks = Array.isArray(message);

      if (!isMessageString && !isMessageBlocks) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'message is required' } });
        return;
      }

      if (isMessageString && message.trim().length === 0) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'message is required' } });
        return;
      }

      if (isMessageBlocks && message.length === 0) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'message blocks are required' } });
        return;
      }

      const handle = await agentLoop.execute({
        message,
        sessionId,
        priority: typeof priority === 'number' ? priority : undefined,
        contextOptions: typeof contextOptions === 'object' ? contextOptions : undefined,
      });

      this.runs.register(handle);

      // Bridge to MessageBus if available
      const messageBus = this.getMessageBusOrNull();
      if (messageBus) {
        const subscription = this.runs.subscribeWithIdsHandle(handle.runId);
        if (subscription) {
          // Stream run events to MessageBus in background
          void (async () => {
            try {
              for await (const item of subscription.stream) {
                messageBus.emit('agent.run.event', {
                  runId: handle.runId,
                  sessionId: handle.sessionId,
                  event: item.event,
                });
              }
            } finally {
              subscription.unsubscribe();
            }
          })();
        }
      }

      res.status(200).json({ runId: handle.runId, sessionId: handle.sessionId });
    });

    // Alias for run info under /chat per spec compatibility
    this.router.addRoute('GET', '/api/v1/chat/:runId', async (req, res) => {
      const runId = req.params.runId;
      if (!runId || typeof runId !== 'string') {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'runId is required' } });
        return;
      }

      const info = this.runs.getInfo(runId);
      if (!info) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
        return;
      }

      res.status(200).json(info);
    });

    // Alias for cancel/delete under /chat per spec compatibility
    this.router.addRoute('DELETE', '/api/v1/chat/:runId', async (req, res) => {
      const runId = req.params.runId;
      if (!runId || typeof runId !== 'string') {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'runId is required' } });
        return;
      }

      const cancelled = this.runs.cancel(runId);
      if (!cancelled) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
        return;
      }

      res.status(202).json({ ok: true });
    });

    this.router.addRoute('GET', '/api/v1/chat/:runId/stream', async (req, res) => {
      const runId = req.params.runId;
      if (!runId || typeof runId !== 'string') {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'runId is required' } });
        return;
      }

      if (!this.canAcceptConnection(req.ip)) {
        res.status(503).json({ error: { code: 'CONNECTION_LIMIT', message: 'Too many connections' } });
        return;
      }

      const lastEventIdHeader = req.getHeader('last-event-id');
      const lastEventId = lastEventIdHeader ? Number(lastEventIdHeader) : undefined;

      const subscription = this.runs.subscribeWithIdsHandle(
        runId,
        typeof lastEventId === 'number' && Number.isFinite(lastEventId) ? lastEventId : undefined
      );
      if (!subscription) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
        return;
      }

      const writer = res.sse();
      writer.comment(`stream runId=${runId}`);

      const sseConnId = this.connections.add('sse', {
        ip: req.ip,
        userAgent: req.userAgent,
        auth: req.auth,
        connectedAt: Date.now(),
        lastActivityAt: Date.now(),
      }, { sse: writer });

      res.raw.on('close', () => {
        this.connections.remove(sseConnId);
        subscription.unsubscribe();
      });

      try {
        for await (const item of subscription.stream) {
          try {
            writer.send(item.event.type, item.event, String(item.id));
          } catch {
            break;
          }

          if (res.raw.writableEnded || res.raw.destroyed) {
            break;
          }
        }
      } finally {
        writer.close();
        subscription.unsubscribe();
      }
    });

    // BlockStreamer SSE endpoint — returns channel-optimized text blocks
    this.router.addRoute('GET', '/api/v1/chat/:runId/blocks', async (req, res) => {
      const runId = req.params.runId;
      if (!runId || typeof runId !== 'string') {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'runId is required' } });
        return;
      }

      if (!this.canAcceptConnection(req.ip)) {
        res.status(503).json({ error: { code: 'CONNECTION_LIMIT', message: 'Too many connections' } });
        return;
      }

      const profile = (req.query.profile || 'web') as any;

      const subscription = this.runs.subscribeWithIdsHandle(runId);
      if (!subscription) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
        return;
      }

      const writer = res.sse();
      writer.comment(`blocks runId=${runId} profile=${profile}`);

      const sseConnId = this.connections.add('sse', {
        ip: req.ip,
        userAgent: req.userAgent,
        auth: req.auth,
        connectedAt: Date.now(),
        lastActivityAt: Date.now(),
      }, { sse: writer });

      const streamer = createForRun(runId, profile, (block: Block) => {
        try {
          writer.send('block', block);
        } catch {
          // client disconnected
        }
      });

      res.raw.on('close', () => {
        this.connections.remove(sseConnId);
        subscription.unsubscribe();
        streamer.abort();
      });

      try {
        for await (const item of subscription.stream) {
          if (res.raw.writableEnded || res.raw.destroyed) break;

          const event = item.event;
          if (event.type === 'model.delta') {
            streamer.push((event as any).delta || '');
          } else if (event.type === 'model.complete') {
            streamer.complete();
          } else if (event.type === 'run.error' || event.type === 'run.cancelled') {
            streamer.abort();
            break;
          } else if (event.type === 'run.completed') {
            break;
          }
        }
      } finally {
        writer.close();
        subscription.unsubscribe();
      }
    });

    this.router.addRoute('GET', '/api/v1/runs/:runId', async (req, res) => {
      const runId = req.params.runId;
      if (!runId || typeof runId !== 'string') {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'runId is required' } });
        return;
      }

      const info = this.runs.getInfo(runId);
      if (!info) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
        return;
      }

      res.status(200).json(info);
    });

    this.router.addRoute('POST', '/api/v1/chat/:runId/cancel', async (req, res) => {
      const runId = req.params.runId;
      if (!runId || typeof runId !== 'string') {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'runId is required' } });
        return;
      }

      const cancelled = this.runs.cancel(runId);
      if (!cancelled) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
        return;
      }

      res.status(202).json({ ok: true });
    });

    // --------------------------------------------------------------------
    // Session reset (admin)
    // --------------------------------------------------------------------

    this.router.addRoute('POST', '/api/v1/sessions/:sessionId/reset', async (req, res) => {
      const store = this.getSessionStoreOrNull();
      if (!store) {
        res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'SessionStore not configured' } });
        return;
      }

      if (!req.auth?.permissions?.includes('*')) {
        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Missing permission' } });
        return;
      }

      if (typeof (store as any).resetSession !== 'function') {
        res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Session reset not supported by configured SessionStore' } });
        return;
      }

      const sessionId = req.params.sessionId;
      const metadata = store.getMetadata(sessionId);
      if (!metadata) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found' } });
        return;
      }

      await (store as any).resetSession(sessionId);
      res.status(200).json({ ok: true, sessionId });
    });
  }

  // ------------------------------------------------------------------------
  // HTTP handling
  // ------------------------------------------------------------------------

  private async handleHttp(rawReq: IncomingMessage, rawRes: ServerResponse): Promise<void> {
    const startedAt = Date.now();
    
    // Create wrapped response early so we can check its state in catch block
    const res = createResponse(rawRes);

    try {
      const method = (rawReq.method || 'GET').toUpperCase();
      const host = rawReq.headers.host || 'localhost';
      const url = new URL(rawReq.url || '/', `http://${host}`);
      const path = normalizePath(url.pathname);

      const match = this.router.match(method, path);

      const req = createRequest(rawReq, match?.params ?? {});

      if (!this.canAcceptConnection(req.ip)) {
        res.status(503).json({ error: { code: 'CONNECTION_LIMIT', message: 'Too many connections' } });
        return;
      }

      // Body parsing (only when needed)
      if (shouldParseBody(req.method)) {
        req.body = await parseBody(rawReq, this.config.limits.maxBodySize);
      }

      // Track as an HTTP connection for observability
      const connId = this.connections.add(
        'http',
        {
          ip: req.ip,
          userAgent: req.userAgent,
          auth: req.auth,
          connectedAt: Date.now(),
          lastActivityAt: Date.now(),
        },
        { request: rawReq, response: rawRes }
      );

      rawRes.on('close', () => {
        this.connections.remove(connId);
      });

      this.emit('request', req);

      if (this.config.logging.requests) {
        this.addLog('info', 'http.request', { method, path, ip: req.ip });
      }

      const middlewares = this.middleware.getMiddlewaresForPath(req.path);

      const routeMiddleware: Middleware = async (_req, _res, _next) => {
        if (!match) {
          throw new NotFoundError(`No route for ${method} ${path}`);
        }
        await Promise.resolve(match.handler(req, res));
      };

      await this.middleware.execute(req, res, [...middlewares, routeMiddleware]);

      if (!res.sent) {
        res.status(204).send();
      }

      if (this.config.logging.responses) {
        // eslint-disable-next-line no-console
        console.log(`[gateway] ${method} ${path} -> ${rawRes.statusCode} (${Date.now() - startedAt}ms)`);
      }

      if (this.config.logging.responses) {
        this.addLog('info', 'http.response', {
          method,
          path,
          statusCode: rawRes.statusCode,
          durationMs: Date.now() - startedAt,
        });
      }
    } catch (error) {
      this.emit('error', error);

      const normalized = this.normalizeError(error);
      const isNotFound = normalized.statusCode === 404 || normalized.code === 'NOT_FOUND';

      this.addLog(isNotFound ? 'info' : 'error', 'http.error', {
        error: error instanceof Error ? error.message : String(error),
        code: normalized.code,
        statusCode: normalized.statusCode,
      });

      // eslint-disable-next-line no-console
      if (this.config.logging.errors && !isNotFound) console.error('[gateway] request error', error);

      // Check if response was already sent by the wrapped response object or raw response
      if (res.sent || rawRes.headersSent) {
        // Response already sent, just ensure stream is closed
        if (!rawRes.writableEnded) {
          try {
            rawRes.end();
          } catch {
            // ignore - response already ended
          }
        }
        return;
      }

      // Send error response only if headers haven't been sent yet
      try {
        const { statusCode, code, message, details } = normalized;
        rawRes.statusCode = statusCode;
        rawRes.setHeader('Content-Type', 'application/json');
        rawRes.end(
          JSON.stringify({
            error: { code, message, details },
          })
        );
      } catch (headerError) {
        // If we still can't send, just try to close the connection
        if (!rawRes.writableEnded) {
          try {
            rawRes.end();
          } catch {
            // ignore
          }
        }
      }
    }
  }

  private normalizeError(err: unknown): { statusCode: number; code: string; message: string; details?: unknown } {
    if (err && typeof err === 'object' && 'statusCode' in err && 'code' in err && 'message' in err) {
      const ge = err as GatewayError;
      return {
        statusCode: (ge as any).statusCode ?? 500,
        code: (ge as any).code ?? 'INTERNAL_ERROR',
        message: (ge as any).message ?? 'Internal Server Error',
        details: (ge as any).details,
      };
    }

    if (err instanceof SyntaxError) {
      return { statusCode: 400, code: 'INVALID_JSON', message: 'Invalid JSON body' };
    }

    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return { statusCode: 500, code: 'INTERNAL_ERROR', message };
  }

  // ------------------------------------------------------------------------
  // WebSocket handling (minimal scaffold)
  // ------------------------------------------------------------------------

  private handleWsConnect(connection: WebSocketConnection): void {
    if (!this.canAcceptConnection(connection.metadata.ip)) {
      connection.close(1013, 'Try again later');
      return;
    }

    // Authenticate WS handshake similarly to HTTP.
    void this.authenticateWebSocketConnection(connection)
      .then((auth) => {
        connection.metadata.auth = auth;

        if (this.config.auth.mode !== 'none' && !auth.authenticated) {
          connection.close(1008, 'Authentication required');
          return;
        }

        this.connections.add('websocket', {
          ip: connection.metadata.ip,
          userAgent: connection.metadata.userAgent,
          auth: connection.metadata.auth,
          connectedAt: connection.metadata.connectedAt,
          lastActivityAt: connection.metadata.lastActivityAt,
          subscriptions: connection.subscriptions,
        }, { ws: connection });

        this.emit('connection', connection);
      })
      .catch((err) => {
        this.addLog('error', 'ws.auth_error', { error: err instanceof Error ? err.message : String(err) });
        connection.close(1011, 'Authentication error');
      });

    return;
  }

  private handleWsDisconnect(connection: WebSocketConnection): void {
    const subs = this.wsRunSubscriptions.get(connection.id);
    if (subs) {
      for (const unsubscribe of subs.values()) {
        try {
          unsubscribe();
        } catch {
          // ignore
        }
      }
      this.wsRunSubscriptions.delete(connection.id);
    }

    // Best-effort: remove by scanning (ws handler keeps own ids).
    for (const conn of this.connections.list((c) => c.type === 'websocket')) {
      if (conn.ws?.id === connection.id) {
        this.connections.remove(conn.id);
        break;
      }
    }

    this.emit('disconnection', connection);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleWsMessage(message: any, connection: WebSocketConnection): void {
    if (this.config.auth.mode !== 'none') {
      const auth = connection.metadata.auth;
      if (!auth) {
        connection.send(formatError('AUTH_PENDING', 'Authentication in progress'));
        return;
      }

      if (!auth.authenticated) {
        connection.send(formatError('AUTHENTICATION_ERROR', 'Authentication required'));
        try {
          connection.close(1008, 'Authentication required');
        } catch {
          // ignore
        }
        return;
      }
    }

    // Minimal request/response protocol for chat.send & chat.cancel
    if (!message || typeof message !== 'object') {
      connection.send(formatError('INVALID_MESSAGE', 'Message must be an object'));
      return;
    }

    if (message.type !== 'request' || typeof message.id !== 'string') {
      connection.send(formatError('INVALID_MESSAGE', 'Only request messages are supported'));
      return;
    }

    const requestId = message.id;
    const channel = message.channel;
    const action = message.action;
    const payload = message.payload ?? {};

    if (channel === 'system' && action === 'ping') {
      connection.send(formatResponse(requestId, { ok: true, ts: Date.now() }, true));
      return;
    }

    if (channel === 'system' && action === 'stats') {
      connection.send(formatResponse(requestId, this.buildStats(false), true));
      return;
    }

    if (channel === 'session' && action === 'get') {
      const store = this.getSessionStoreOrNull();
      if (!store) {
        connection.send(formatError('SERVICE_UNAVAILABLE', 'SessionStore not configured', requestId));
        return;
      }

      const sessionId = payload?.sessionId;
      const key = payload?.key;
      const resolvedId = typeof sessionId === 'string'
        ? sessionId
        : (typeof key === 'string' && typeof store.getSessionId === 'function' ? store.getSessionId(key as any) : undefined);

      if (typeof resolvedId !== 'string' || resolvedId.length === 0) {
        connection.send(formatError('VALIDATION_ERROR', 'payload.sessionId (or payload.key) is required', requestId));
        return;
      }

      const metadata = store.getMetadata(resolvedId);
      if (!metadata) {
        connection.send(formatError('NOT_FOUND', 'Session not found', requestId));
        return;
      }

      const keys = store.getSessionKeys ? store.getSessionKeys(resolvedId) : [];
      connection.send(formatResponse(requestId, { sessionId: resolvedId, keys, metadata }, true));
      return;
    }

    if (channel === 'session' && action === 'subscribe') {
      const store = this.getSessionStoreOrNull();
      if (!store) {
        connection.send(formatError('SERVICE_UNAVAILABLE', 'SessionStore not configured', requestId));
        return;
      }

      const sessionId = payload?.sessionId;
      const key = payload?.key;
      const resolvedId = typeof sessionId === 'string'
        ? sessionId
        : (typeof key === 'string' && typeof store.getSessionId === 'function' ? store.getSessionId(key as any) : undefined);

      if (typeof resolvedId !== 'string' || resolvedId.length === 0) {
        connection.send(formatError('VALIDATION_ERROR', 'payload.sessionId (or payload.key) is required', requestId));
        return;
      }

      const metadata = store.getMetadata(resolvedId);
      if (!metadata) {
        connection.send(formatError('NOT_FOUND', 'Session not found', requestId));
        return;
      }

      connection.subscribe(`session:${resolvedId}`);
      const keys = store.getSessionKeys ? store.getSessionKeys(resolvedId) : [];
      connection.send(formatResponse(requestId, { ok: true, sessionId: resolvedId }, true));
      connection.send(formatEvent('session', 'snapshot', { sessionId: resolvedId, keys, metadata }));
      return;
    }

    if (channel === 'session' && action === 'unsubscribe') {
      const sessionId = payload?.sessionId;
      if (typeof sessionId !== 'string' || sessionId.length === 0) {
        connection.send(formatError('VALIDATION_ERROR', 'payload.sessionId is required', requestId));
        return;
      }

      connection.unsubscribe(`session:${sessionId}`);
      connection.send(formatResponse(requestId, { ok: true, sessionId }, true));
      return;
    }

    if (channel === 'chat' && action === 'send') {
      const agentLoop = this.getAgentLoopOrNull();
      if (!agentLoop) {
        connection.send(formatError('SERVICE_UNAVAILABLE', 'AgentLoop not configured', requestId));
        return;
      }

      const text = payload?.message;
      const sessionId = payload?.sessionId ?? payload?.sessionKey;
      if (typeof text !== 'string' || text.trim().length === 0) {
        connection.send(formatError('VALIDATION_ERROR', 'payload.message is required', requestId));
        return;
      }

      void agentLoop
        .execute({ message: text, sessionId })
        .then((handle: RunHandle) => {
          this.runs.register(handle);
          connection.send(formatResponse(requestId, { runId: handle.runId, sessionId: handle.sessionId }, true));

          const stream = payload?.stream ?? payload?.subscribe;
          if (stream === true) {
            const started = this.startWsRunSubscription(connection, handle.runId);
            if (!started.ok) {
              connection.send(formatError(started.code, started.message));
            }
          }
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'Failed to start run';
          connection.send(formatError('RUN_START_FAILED', msg, requestId));
        });

      return;
    }

    if (channel === 'chat' && action === 'cancel') {
      const runId = payload?.runId;
      if (typeof runId !== 'string' || runId.length === 0) {
        connection.send(formatError('VALIDATION_ERROR', 'payload.runId is required', requestId));
        return;
      }

      const ok = this.runs.cancel(runId);
      if (!ok) {
        connection.send(formatError('NOT_FOUND', 'Run not found', requestId));
        return;
      }

      connection.send(formatResponse(requestId, { ok: true }, true));
      return;
    }

    if (channel === 'run' && action === 'status') {
      const runId = payload?.runId;
      if (typeof runId !== 'string' || runId.length === 0) {
        connection.send(formatError('VALIDATION_ERROR', 'payload.runId is required', requestId));
        return;
      }

      const info = this.runs.getInfo(runId);
      if (!info) {
        connection.send(formatError('NOT_FOUND', 'Run not found', requestId));
        return;
      }

      connection.send(formatResponse(requestId, info, true));
      return;
    }

    if (channel === 'run' && action === 'subscribe') {
      const runId = payload?.runId;
      const afterIdRaw = payload?.afterId ?? payload?.lastEventId;
      const afterId = typeof afterIdRaw === 'number' && Number.isFinite(afterIdRaw) ? afterIdRaw : undefined;

      if (typeof runId !== 'string' || runId.length === 0) {
        connection.send(formatError('VALIDATION_ERROR', 'payload.runId is required', requestId));
        return;
      }

      const started = this.startWsRunSubscription(connection, runId, afterId);
      if (!started.ok) {
        connection.send(formatError(started.code, started.message, requestId));
        return;
      }

      connection.send(formatResponse(requestId, { ok: true, runId }, true));
      return;
    }

    if (channel === 'run' && action === 'unsubscribe') {
      const runId = payload?.runId;
      if (typeof runId !== 'string' || runId.length === 0) {
        connection.send(formatError('VALIDATION_ERROR', 'payload.runId is required', requestId));
        return;
      }

      const map = this.wsRunSubscriptions.get(connection.id);
      const unsubscribe = map?.get(runId);
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch {
          // ignore
        }
        map!.delete(runId);
        if (map!.size === 0) {
          this.wsRunSubscriptions.delete(connection.id);
        }
      }

      connection.unsubscribe(`run:${runId}`);
      connection.send(formatResponse(requestId, { ok: true, runId }, true));
      return;
    }

    if (channel !== 'chat' && channel !== 'run' && channel !== 'system' && channel !== 'session') {
      connection.send(formatError('UNKNOWN_CHANNEL', `Unknown channel: ${String(channel)}`, requestId));
      return;
    }

    connection.send(formatError('UNKNOWN_ACTION', `Unknown action: ${String(action)}`, requestId));
  }

  private getAgentLoopOrNull(): AgentLoop | null {
    const candidate = this.deps.agentLoop as AgentLoop | undefined;
    if (!candidate || typeof (candidate as any).execute !== 'function') return null;
    return candidate;
  }

  private getSessionStoreOrNull(): SessionStore | null {
    const candidate = this.deps.sessionStore as SessionStore | undefined;
    if (!candidate) return null;
    if (typeof (candidate as any).getAllSessionIds !== 'function') return null;
    if (typeof (candidate as any).getMetadata !== 'function') return null;
    if (typeof (candidate as any).getMessages !== 'function') return null;
    if (typeof (candidate as any).deleteSession !== 'function') return null;
    return candidate;
  }

  private getMessageBusOrNull(): MessageBus | null {
    const candidate = this.deps.messageBus as MessageBus | undefined;
    if (!candidate || typeof (candidate as any).emit !== 'function') return null;
    return candidate;
  }

  private getToolExecutorOrNull(): ToolExecutor | null {
    const candidate = this.deps.toolExecutor as ToolExecutor | undefined;
    if (!candidate) return null;
    if (typeof (candidate as any).list !== 'function') return null;
    return candidate;
  }

  private canAcceptConnection(ip: string): boolean {
    const stats = this.connections.getStats();
    if (stats.total >= this.config.limits.maxConnections) return false;

    const perIp = stats.perIp[ip] ?? 0;
    if (perIp >= this.config.limits.maxConnectionsPerIp) return false;

    return true;
  }

  private addLog(level: 'info' | 'warn' | 'error', message: string, data?: unknown): void {
    this.logBuffer.push({ ts: Date.now(), level, message, data });
    if (this.logBuffer.length > this.maxLogBufferSize) {
      this.logBuffer.splice(0, this.logBuffer.length - this.maxLogBufferSize);
    }
  }

  private buildStats(admin: boolean): any {
    const mem = process.memoryUsage();

    const base = {
      uptimeSeconds: Math.floor(process.uptime()),
      now: Date.now(),
      connections: this.connections.getStats(),
      runs: this.runs.getStats(),
      process: {
        pid: process.pid,
        node: process.version,
        platform: process.platform,
      },
      memory: {
        rss: mem.rss,
        heapTotal: mem.heapTotal,
        heapUsed: mem.heapUsed,
      },
    };

    if (!admin) return base;

    return {
      ...base,
      config: this.getSanitizedConfig(true),
    };
  }

  private getSanitizedConfig(admin: boolean): any {
    const cfg: any = {
      host: this.config.host,
      port: this.config.port,
      cors: this.config.cors,
      rateLimit: this.config.rateLimit,
      static: this.config.static,
      timeouts: this.config.timeouts,
      limits: this.config.limits,
      logging: this.config.logging,
      auth: { mode: this.config.auth.mode },
    };

    if (admin) {
      // Never return secrets; only include counts.
      cfg.auth = {
        mode: this.config.auth.mode,
        hasToken: Boolean(this.config.auth.token),
        apiKeyCount: Array.isArray(this.config.auth.keys) ? this.config.auth.keys.length : 0,
        providerCount: Array.isArray(this.config.auth.providers) ? this.config.auth.providers.length : 0,
      };
    }

    const agentLoop = this.getAgentLoopOrNull();
    if (agentLoop && typeof (agentLoop as any).getConfig === 'function') {
      cfg.agentLoop = (agentLoop as any).getConfig();
    }

    return cfg;
  }

  private applyAdminConfigPatch(patch: Partial<GatewayConfig>): void {
    const next: GatewayConfig = {
      ...this.config,
      cors: patch.cors ? { ...this.config.cors, ...patch.cors } : this.config.cors,
      rateLimit: patch.rateLimit ? { ...this.config.rateLimit, ...patch.rateLimit } : this.config.rateLimit,
      static: patch.static ? { ...this.config.static, ...patch.static } : this.config.static,
      timeouts: patch.timeouts ? { ...this.config.timeouts, ...patch.timeouts } : this.config.timeouts,
      limits: patch.limits ? { ...this.config.limits, ...patch.limits } : this.config.limits,
      logging: patch.logging ? { ...this.config.logging, ...patch.logging } : this.config.logging,
    };

    this.config = next;

    // Rebuild default middleware to reflect updated config.
    this.middleware.clear();
    this.installDefaultMiddleware();
    for (const m of this.customMiddlewares) {
      if (m.path) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.middleware as any).use(m.path as any, m.middleware as any);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.middleware as any).use(m.middleware as any);
      }
    }
  }

  private async authenticateWebSocketConnection(connection: WebSocketConnection): Promise<any> {
    const meta = connection.metadata.custom ?? {};
    const rawUrl = typeof meta.url === 'string' ? meta.url : '/ws';

    const url = new URL(rawUrl, 'http://localhost');
    const headers: Record<string, string> = {};
    const rawHeaders = meta.headers as any;
    if (rawHeaders && typeof rawHeaders === 'object') {
      for (const [k, v] of Object.entries(rawHeaders)) {
        if (typeof v === 'string') headers[k.toLowerCase()] = v;
        else if (Array.isArray(v)) headers[k.toLowerCase()] = v[0] || '';
      }
    }

    const query: Record<string, string> = {};
    for (const [k, v] of url.searchParams.entries()) {
      query[k] = v;
    }

    const reqLike: any = {
      method: 'GET',
      path: url.pathname,
      params: {},
      query,
      headers,
      getHeader: (name: string) => headers[name.toLowerCase()],
      body: null,
      ip: connection.metadata.ip,
      userAgent: connection.metadata.userAgent,
      raw: {},
    };

    // optionalAuth never throws and never writes to res.
    await optionalAuth(this.config.auth)(reqLike, {} as any, async () => undefined);
    return reqLike.auth;
  }

  private emit(event: ServerEvent, ...args: any[]): void {
    const handlers = this.events.get(event);
    if (!handlers || handlers.size === 0) return;
    for (const handler of handlers) {
      try {
        handler(...args);
      } catch {
        // ignore handler errors
      }
    }
  }

  // ------------------------------------------------------------------------
  // Validation helpers
  // ------------------------------------------------------------------------

  static validateConfig(config: GatewayConfig): void {
    if (!config.host) throw new ValidationError('config.host is required');
    if (typeof config.port !== 'number') throw new ValidationError('config.port must be a number');
    if (config.port < 0 || config.port > 65535) throw new ValidationError('config.port out of range');
  }
}
