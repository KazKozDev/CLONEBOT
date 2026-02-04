/**
 * Security Module
 * Безопасность и изолированные среды
 */

// Sandbox
export { CodeSandbox, executeSafely, getDefaultSandbox } from './sandbox';
export type { SandboxConfig, SandboxResult } from './sandbox';

// Rate Limiting
export { RateLimiter, createRateLimitMiddleware, RateLimitPresets } from './rate-limiter';
export type { RateLimitConfig, RateLimitResult } from './rate-limiter';

// Audit Logging
export { AuditLogger, getAuditLogger } from './audit-log';
export type { AuditEvent, AuditEventType, AuditLevel, AuditLogConfig } from './audit-log';

// Authentication & Authorization
export { AuthManager, createAuthMiddleware, Permissions } from './auth';
export type { User, UserRole, AuthToken, AuthConfig } from './auth';
