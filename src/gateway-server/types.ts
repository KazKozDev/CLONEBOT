/**
 * Gateway Server Types
 * 
 * Unified types for HTTP, WebSocket, and SSE handling
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { Socket } from 'net';
import type { Duplex } from 'stream';

// ============================================================================
// Server Configuration
// ============================================================================

export interface GatewayConfig {
  /** Network binding */
  host: string;
  port: number;

  /** TLS configuration (optional) */
  tls?: {
    enabled: boolean;
    cert: string;
    key: string;
  };

  /** Authentication */
  auth: AuthConfig;

  /** CORS */
  cors: CORSConfig;

  /** Rate limiting */
  rateLimit: RateLimitConfig;

  /** Static file serving */
  static: StaticConfig;

  /** Timeouts */
  timeouts: TimeoutConfig;

  /** Limits */
  limits: LimitsConfig;

  /** Logging */
  logging: LoggingConfig;
}

export interface AuthConfig {
  mode: 'none' | 'token' | 'apikey' | 'multi';
  token?: string;
  keys?: ApiKey[];
  providers?: AuthProvider[];
}

export interface ApiKey {
  key: string;
  name: string;
  permissions: string[];
}

export interface AuthProvider {
  type: 'token' | 'apikey';
  token?: string;
  keys?: ApiKey[];
}

export interface CORSConfig {
  enabled: boolean;
  origins: string[];
  methods?: string[];
  headers?: string[];
  credentials?: boolean;
  maxAge?: number;
}

export interface RateLimitConfig {
  enabled: boolean;
  defaultLimit: number;
  windowMs: number;
  endpoints?: Record<string, EndpointRateLimit>;
}

export interface EndpointRateLimit {
  limit: number;
  window: number;
}

export interface StaticConfig {
  enabled: boolean;
  root: string;
  index?: string;
  maxAge?: number;
  compression?: boolean;
}

export interface TimeoutConfig {
  request: number;
  websocket: number;
  shutdown: number;
}

export interface LimitsConfig {
  maxBodySize: number;
  maxConnections: number;
  maxConnectionsPerIp: number;

  /** Max run subscriptions per single WebSocket connection */
  maxWsSubscriptionsPerConnection?: number;

  /** Max ws.bufferedAmount allowed while streaming run events (bytes) */
  maxWsBufferedAmount?: number;
}

export interface LoggingConfig {
  requests: boolean;
  responses: boolean;
  errors: boolean;
}

// ============================================================================
// HTTP Types
// ============================================================================

export interface Request {
  /** HTTP method */
  method: string;

  /** Request path */
  path: string;

  /** Path parameters */
  params: Record<string, string>;

  /** Query string parameters */
  query: Record<string, string>;

  /** Request headers */
  headers: Record<string, string>;

  /** Get a header value (case-insensitive) */
  getHeader(name: string): string | undefined;

  /** Parsed body */
  body: any;

  /** Client IP */
  ip: string;

  /** User agent */
  userAgent: string;

  /** Authentication info */
  auth?: AuthInfo;

  /** Underlying HTTP request */
  raw: IncomingMessage;
}

export interface Response {
  /** Set status code */
  status(code: number): this;

  /** Set header */
  header(name: string, value: string | number): this;

  /** Send JSON response */
  json(data: any): void;

  /** Send text response */
  text(data: string): void;

  /** Redirect to URL */
  redirect(url: string, code?: number): void;

  /** Stream response */
  stream(readable: NodeJS.ReadableStream): void;

  /** Create SSE writer */
  sse(): SSEWriter;

  /** Send response */
  send(body?: string): void;

  /** Check if response already sent */
  readonly sent: boolean;

  /** Underlying HTTP response */
  raw: ServerResponse;
}

export interface AuthInfo {
  authenticated: boolean;
  method: string;
  identity: string;
  permissions: string[];
}

// ============================================================================
// Routing Types
// ============================================================================

export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export type RouteHandler = (req: Request, res: Response) => Promise<void> | void;

export interface Route {
  method: HTTPMethod | '*';
  pattern: string;
  handler: RouteHandler;
  regex?: RegExp;
  paramNames?: string[];
}

export interface RouteMatch {
  handler: RouteHandler;
  params: Record<string, string>;
}

// ============================================================================
// Middleware Types
// ============================================================================

export type NextFunction = () => Promise<void> | void;

export type Middleware = (req: Request, res: Response, next: NextFunction) => Promise<void> | void;

export interface MiddlewareConfig {
  path?: string;
  middleware: Middleware;
}

// ============================================================================
// WebSocket Types
// ============================================================================

export interface WebSocketConnection {
  /** Unique connection ID */
  id: string;

  /** Send message */
  send(message: WebSocketMessage | string): void;

  /** Close connection */
  close(code?: number, reason?: string): void;

  /** Subscribe to channel */
  subscribe(channel: string): void;

  /** Unsubscribe from channel */
  unsubscribe(channel: string): void;

  /** Check if connection is alive */
  isAlive(): boolean;

  /** Connection metadata */
  metadata: ConnectionMetadata;

  /** Subscribed channels */
  subscriptions: Set<string>;

  /** Underlying WebSocket */
  ws: any; // WebSocket from 'ws' package
}

export interface WebSocketMessage {
  /** Message type */
  type: 'request' | 'response' | 'event' | 'error';

  /** Message ID (for request/response correlation) */
  id?: string;

  /** Routing channel */
  channel?: string;

  /** Action (for requests) */
  action?: string;

  /** Event name (for events) */
  event?: string;

  /** Payload data */
  payload?: any;

  /** Error info (for error type) */
  error?: {
    code: string;
    message: string;
    details?: any;
  };

  /** Success flag (for responses) */
  success?: boolean;
}

export type WebSocketMessageHandler = (
  message: WebSocketMessage,
  connection: WebSocketConnection
) => Promise<void> | void;

export type WebSocketConnectionHandler = (connection: WebSocketConnection) => Promise<void> | void;

// ============================================================================
// SSE Types
// ============================================================================

export interface SSEWriter {
  /** Send event */
  send(event: string, data: any, id?: string): void;

  /** Send comment (keep-alive) */
  comment(text: string): void;

  /** Close SSE stream */
  close(): void;

  /** Start keep-alive interval */
  keepAlive(intervalMs: number): void;

  /** Stop keep-alive */
  stopKeepAlive(): void;
}

// ============================================================================
// Connection Management Types
// ============================================================================

export type ConnectionType = 'http' | 'websocket' | 'sse';

export interface Connection {
  /** Unique ID */
  id: string;

  /** Connection type */
  type: ConnectionType;

  /** Client metadata */
  metadata: ConnectionMetadata;

  /** WebSocket connection (if type === 'websocket') */
  ws?: WebSocketConnection;

  /** SSE writer (if type === 'sse') */
  sse?: SSEWriter;

  /** HTTP request/response (if type === 'http') */
  http?: {
    request: IncomingMessage;
    response: ServerResponse;
  };
}

export interface ConnectionMetadata {
  /** Client IP address */
  ip: string;

  /** User agent */
  userAgent: string;

  /** Authentication info */
  auth?: AuthInfo;

  /** Connection timestamp */
  connectedAt: number;

  /** Last activity timestamp */
  lastActivityAt: number;

  /** Subscriptions (for WebSocket) */
  subscriptions?: Set<string>;

  /** Custom metadata */
  custom?: Record<string, any>;
}

export interface ConnectionStats {
  /** Total connections */
  total: number;

  /** By type */
  byType: Record<ConnectionType, number>;

  /** Active connections */
  active: number;

  /** Connections per IP */
  perIp: Record<string, number>;
}

export type ConnectionFilter = (connection: Connection) => boolean;

// ============================================================================
// Rate Limiting Types
// ============================================================================

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// ============================================================================
// Health Check Types
// ============================================================================

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthCheck {
  status: HealthStatus;
  latency?: number;
  message?: string;
  details?: any;
}

export interface HealthReport {
  status: HealthStatus;
  version: string;
  uptime: number;
  checks: Record<string, HealthCheck>;
}

export type HealthChecker = () => Promise<HealthCheck> | HealthCheck;

// ============================================================================
// Server Events
// ============================================================================

export type ServerEvent =
  | 'start'
  | 'stop'
  | 'connection'
  | 'disconnection'
  | 'error'
  | 'request'
  | 'shutdown';

export type ServerEventHandler = (...args: any[]) => void;

// ============================================================================
// Shutdown Types
// ============================================================================

export interface ShutdownOptions {
  /** Graceful shutdown (wait for requests) */
  graceful?: boolean;

  /** Timeout for graceful shutdown */
  timeout?: number;
}

export type ServerState = 'stopped' | 'starting' | 'running' | 'shutting_down';

// ============================================================================
// Gateway Dependencies
// ============================================================================

export interface GatewayDependencies {
  /** Agent Loop for chat requests */
  agentLoop?: any; // Will be AgentLoop instance

  /** Session Store for session operations */
  sessionStore?: any; // Will be SessionStore instance

  /** Tool Executor for direct tool execution */
  toolExecutor?: any; // Will be ToolExecutor instance

  /** MessageBus for global event distribution */
  messageBus?: any; // Will be MessageBus instance
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface ChatRequest {
  sessionKey: string;
  message: string;
  attachments?: any[];
  options?: Record<string, any>;
}

export interface ChatResponse {
  runId: string;
}

export interface SessionListRequest {
  key?: string;
  limit?: number;
  offset?: number;
}

export interface SessionListResponse {
  sessions: any[];
  total: number;
}

export interface RunStatusResponse {
  status: string;
  result?: any;
  error?: any;
}

// ============================================================================
// Error Types
// ============================================================================

export class GatewayError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

export class AuthenticationError extends GatewayError {
  constructor(message: string, details?: any) {
    super(message, 'AUTHENTICATION_ERROR', 401, details);
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends GatewayError {
  constructor(message: string, public resetAt: number, details?: any) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, details);
    this.name = 'RateLimitError';
  }
}

export class ValidationError extends GatewayError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends GatewayError {
  constructor(message: string, details?: any) {
    super(message, 'NOT_FOUND', 404, details);
    this.name = 'NotFoundError';
  }
}
