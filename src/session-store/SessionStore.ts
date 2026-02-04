/**
 * SessionStore - main class for session management
 */

import * as path from 'path';
import { randomUUID } from 'crypto';
import type { FileSystem } from './FileSystem';
import { JSONLFile } from './JSONLFile';
import { SessionIndexManager } from './SessionIndex';
import { LockManager, type LockResult } from './LockManager';
import type {
  Message,
  Session,
  SessionMetadata,
  SessionKey,
  SessionStoreConfig,
  Branch,
  Lock
} from './types';

/**
 * Default configuration
 */
const DEFAULT_CONFIG: SessionStoreConfig = {
  storageDir: './sessions',
  indexSaveDelayMs: 100,
  lockTimeoutMs: 30000 // 30 seconds
};

/**
 * SessionStore class
 */
export class SessionStore {
  private index: SessionIndexManager;
  private lockManager: LockManager;
  private config: SessionStoreConfig;

  constructor(
    private fs: FileSystem,
    config?: Partial<SessionStoreConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    const indexPath = path.join(this.config.storageDir, 'sessions.json');
    this.index = new SessionIndexManager(fs, {
      indexPath,
      saveDelayMs: this.config.indexSaveDelayMs
    });

    this.lockManager = new LockManager(fs, {
      lockTimeoutMs: this.config.lockTimeoutMs ?? 30000,
      checkIntervalMs: 1000
    });
  }

  /**
   * Initialize store (load index)
   */
  async init(): Promise<void> {
    await this.fs.mkdir(this.config.storageDir);
    await this.index.load();
  }

  /**
   * Get the session index manager
   */
  getIndex(): SessionIndexManager {
    return this.index;
  }

  /**
   * Resolve session key to session ID
   * Creates new session if key doesn't exist
   */
  async resolve(key: SessionKey): Promise<string> {
    // Try to get existing session
    const existingId = this.index.getSessionId(key);
    if (existingId) {
      return existingId;
    }

    // Create new session
    const sessionId = randomUUID();
    const metadata: SessionMetadata = {
      sessionId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messageCount: 0
    };

    await this.index.registerSession(sessionId, key, metadata);
    
    // Ensure session directory exists
    const sessionDir = this.getSessionDir(sessionId);
    await this.fs.mkdir(sessionDir);

    return sessionId;
  }

  /**
   * Append message to session
   */
  async append(sessionId: string, message: Omit<Message, 'id' | 'timestamp'>): Promise<Message> {
    await this.ensureSessionExists(sessionId);

    const fullMessage: Message = {
      id: randomUUID(),
      timestamp: Date.now(),
      ...message
    };

    // Write to messages.jsonl
    const messagesFile = this.getMessagesFile(sessionId);
    await messagesFile.append(fullMessage);

    // Update metadata
    const metadata = this.index.getMetadata(sessionId);
    if (metadata) {
      await this.index.updateMetadata(sessionId, {
        updatedAt: Date.now(),
        messageCount: metadata.messageCount + 1
      });
    }

    return fullMessage;
  }

  private async ensureSessionExists(sessionId: string): Promise<void> {
    if (this.index.hasSession(sessionId)) return;

    // Extract userId from sessionId format or use default web user
    let userId = 'web-user'; // Default single user for web UI
    const telegramMatch = sessionId.match(/telegram:(\d+):(\d+)/);
    if (telegramMatch) {
      userId = `telegram:${telegramMatch[2]}`; // telegram:userId format
    }

    const metadata: SessionMetadata = {
      sessionId,
      userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messageCount: 0,
    };

    await this.index.registerSession(sessionId, sessionId, metadata);
    await this.fs.mkdir(this.getSessionDir(sessionId));
  }

  /**
   * Get all messages for session
   */
  async getMessages(sessionId: string): Promise<Message[]> {
    const messagesFile = this.getMessagesFile(sessionId);
    return await messagesFile.readAll();
  }

  /**
   * Get linear history from leaf message to root
   */
  async getLinearHistory(sessionId: string, leafMessageId: string): Promise<Message[]> {
    const allMessages = await this.getMessages(sessionId);
    const messageMap = new Map(allMessages.map(m => [m.id, m]));

    const history: Message[] = [];
    let currentId: string | null = leafMessageId;

    while (currentId) {
      const message = messageMap.get(currentId);
      if (!message) break;

      history.unshift(message); // Add to beginning
      currentId = message.parentId ?? null;
    }

    return history;
  }

  /**
   * Get session metadata
   */
  getMetadata(sessionId: string): SessionMetadata | undefined {
    return this.index.getMetadata(sessionId);
  }

  /**
   * Get session metadata by key
   */
  getMetadataByKey(key: SessionKey): SessionMetadata | undefined {
    return this.index.getMetadataByKey(key);
  }

  /**
   * Get session ID by key without creating a session
   */
  getSessionId(key: SessionKey): string | undefined {
    return this.index.getSessionId(key);
  }

  /**
   * Get all keys associated with a session
   */
  getSessionKeys(sessionId: string): string[] {
    return this.index.getSessionKeys(sessionId);
  }

  /**
   * Check if session exists
   */
  hasSession(sessionId: string): boolean {
    return this.index.hasSession(sessionId);
  }

  /**
   * Check if session key exists
   */
  hasKey(key: SessionKey): boolean {
    return this.index.hasKey(key);
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<void> {
    // Delete from index
    await this.index.deleteSession(sessionId);

    // Delete session directory
    const sessionDir = this.getSessionDir(sessionId);
    const files = await this.fs.list(sessionDir);
    
    for (const file of files) {
      await this.fs.delete(path.join(sessionDir, file));
    }
  }

  /**
   * Reset session content (messages/branches) while keeping the same sessionId and key mappings.
   */
  async resetSession(sessionId: string): Promise<void> {
    const metadata = this.index.getMetadata(sessionId);
    if (!metadata) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const messagesPath = path.join(this.getSessionDir(sessionId), 'messages.jsonl');
    const branchesPath = path.join(this.getSessionDir(sessionId), 'branches.jsonl');

    if (await this.fs.exists(messagesPath)) {
      await this.fs.delete(messagesPath);
    }

    if (await this.fs.exists(branchesPath)) {
      await this.fs.delete(branchesPath);
    }

    await this.index.updateMetadata(sessionId, {
      updatedAt: Date.now(),
      messageCount: 0,
    });
  }

  /**
   * Get all session IDs
   */
  getAllSessionIds(): string[] {
    return this.index.getAllSessionIds();
  }

  /**
   * Get all session keys
   */
  getAllKeys(): string[] {
    return this.index.getAllKeys();
  }

  /**
   * Force save index
   */
  async flush(): Promise<void> {
    await this.index.saveNow();
  }

  /**
   * Get session directory path
   */
  private getSessionDir(sessionId: string): string {
    return path.join(this.config.storageDir, sessionId);
  }

  /**
   * Get messages JSONL file
   */
  private getMessagesFile(sessionId: string): JSONLFile<Message> {
    const filePath = path.join(this.getSessionDir(sessionId), 'messages.jsonl');
    return new JSONLFile<Message>(this.fs, filePath);
  }

  /**
   * Get branches JSONL file
   */
  private getBranchesFile(sessionId: string): JSONLFile<Branch> {
    const filePath = path.join(this.getSessionDir(sessionId), 'branches.jsonl');
    return new JSONLFile<Branch>(this.fs, filePath);
  }

  /**
   * Create new branch from message
   */
  async createBranch(sessionId: string, branchName: string, leafMessageId: string): Promise<Branch> {
    const branch: Branch = {
      name: branchName,
      leafMessageId,
      createdAt: Date.now(),
      path: await this.buildBranchPath(sessionId, leafMessageId)
    };

    const branchesFile = this.getBranchesFile(sessionId);
    await branchesFile.append(branch);

    return branch;
  }

  /**
   * Get all branches for session
   */
  async getBranches(sessionId: string): Promise<Branch[]> {
    const branchesFile = this.getBranchesFile(sessionId);
    return await branchesFile.readAll();
  }

  /**
   * Get branch by name
   */
  async getBranch(sessionId: string, branchName: string): Promise<Branch | undefined> {
    const branches = await this.getBranches(sessionId);
    return branches.find(b => b.name === branchName);
  }

  /**
   * Switch to branch (returns leaf message ID)
   */
  async switchToBranch(sessionId: string, branchName: string): Promise<string> {
    const branch = await this.getBranch(sessionId, branchName);
    if (!branch) {
      throw new Error(`Branch '${branchName}' not found in session ${sessionId}`);
    }
    return branch.leafMessageId;
  }

  /**
   * Build branch path (message IDs from root to leaf)
   */
  private async buildBranchPath(sessionId: string, leafMessageId: string): Promise<string[]> {
    const history = await this.getLinearHistory(sessionId, leafMessageId);
    return history.map(m => m.id);
  }

  /**
   * Get children of a message
   */
  async getChildren(sessionId: string, messageId: string | null): Promise<Message[]> {
    const allMessages = await this.getMessages(sessionId);
    return allMessages.filter(m => m.parentId === messageId);
  }

  /**
   * Check if message has children
   */
  async hasChildren(sessionId: string, messageId: string): Promise<boolean> {
    const children = await this.getChildren(sessionId, messageId);
    return children.length > 0;
  }

  /**
   * Get tree structure from a message
   */
  async getTree(sessionId: string, rootMessageId: string | null = null): Promise<Message[]> {
    const allMessages = await this.getMessages(sessionId);
    const result: Message[] = [];

    const addWithChildren = (parentId: string | null) => {
      const children = allMessages.filter(m => m.parentId === parentId);
      for (const child of children) {
        result.push(child);
        addWithChildren(child.id);
      }
    };

    addWithChildren(rootMessageId);
    return result;
  }

  /**
   * Acquire lock for session
   */
  async acquireLock(sessionId: string, ownerId: string): Promise<LockResult> {
    return await this.lockManager.acquire(sessionId, ownerId);
  }

  /**
   * Release lock for session
   */
  async releaseLock(sessionId: string, ownerId: string): Promise<boolean> {
    return await this.lockManager.release(sessionId, ownerId);
  }

  /**
   * Check if session is locked
   */
  isLocked(sessionId: string): boolean {
    return this.lockManager.isLocked(sessionId);
  }

  /**
   * Get lock for session
   */
  getLock(sessionId: string): Lock | undefined {
    return this.lockManager.getLock(sessionId);
  }

  /**
   * Execute function with lock
   */
  async withLock<T>(sessionId: string, ownerId: string, fn: () => Promise<T>): Promise<T> {
    const result = await this.lockManager.acquire(sessionId, ownerId);
    
    if (!result.acquired) {
      throw new Error(`Cannot acquire lock: ${result.reason}`);
    }

    try {
      return await fn();
    } finally {
      await this.lockManager.release(sessionId, ownerId);
    }
  }
}
