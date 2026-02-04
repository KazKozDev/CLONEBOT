/**
 * Session Store Module
 * Manages sessions with tree-structured messages, branching, and auto-reset
 */

export { SessionStore } from './SessionStore';
export { SessionIndexManager } from './SessionIndex';
export { LockManager, withLock, type LockResult } from './LockManager';
export { AutoResetManager, shouldAutoReset, performAutoReset, createResetMarker } from './AutoReset';
export { JSONLFile, createJSONLFile } from './JSONLFile';
export { RealFileSystem, InMemoryFileSystem, type FileSystem, type FileStats } from './FileSystem';

export type {
  Message,
  Session,
  SessionMetadata,
  SessionIndex,
  Branch,
  Lock,
  SessionKey,
  SessionStoreConfig,
  AutoResetConfig,
  MessageType,
  MessageRole
} from './types';
