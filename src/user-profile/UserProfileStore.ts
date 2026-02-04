/**
 * User Profile Store
 * Управление долгосрочной памятью о пользователях
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type {
  UserProfile,
  UserProfileStoreConfig,
  UserFact,
  RememberFactOptions,
  RecallFactsOptions,
  FactCategory,
} from './types';

export class UserProfileStore {
  private config: Required<UserProfileStoreConfig>;
  private profiles: Map<string, UserProfile> = new Map();
  private initialized = false;

  constructor(config: UserProfileStoreConfig) {
    this.config = {
      profilesDir: config.profilesDir,
      autoSave: config.autoSave ?? true,
      maxFacts: config.maxFacts ?? 100,
      factExpiration: config.factExpiration ?? 30 * 24 * 60 * 60 * 1000, // 30 days
    };
  }

  /**
   * Initialize store
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Expand home directory
    const profilesDir = this.config.profilesDir.replace(/^~/, process.env.HOME || '~');
    this.config.profilesDir = profilesDir;

    // Create directory if not exists
    await fs.mkdir(profilesDir, { recursive: true });

    this.initialized = true;
  }

  /**
   * Get or create user profile
   */
  async getProfile(userId: string): Promise<UserProfile> {
    // Check cache
    if (this.profiles.has(userId)) {
      return this.profiles.get(userId)!;
    }

    // Load from disk
    const profilePath = this.getProfilePath(userId);
    
    try {
      const content = await fs.readFile(profilePath, 'utf-8');
      const profile: UserProfile = JSON.parse(content);
      
      // Clean expired facts
      profile.facts = profile.facts.filter(fact => {
        if (!fact.expiresAt) return true;
        return fact.expiresAt > Date.now();
      });
      
      // Update metadata
      profile.metadata.lastSeenAt = Date.now();
      
      // Cache
      this.profiles.set(userId, profile);
      
      // Auto-save
      if (this.config.autoSave) {
        await this.saveProfile(profile);
      }
      
      return profile;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Create new profile
        return this.createProfile(userId);
      }
      throw error;
    }
  }

  /**
   * Create new profile
   */
  async createProfile(userId: string): Promise<UserProfile> {
    const now = Date.now();
    
    const profile: UserProfile = {
      userId,
      facts: [],
      metadata: {
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
        totalSessions: 0,
        totalMessages: 0,
      },
    };

    // Cache
    this.profiles.set(userId, profile);

    // Save
    if (this.config.autoSave) {
      await this.saveProfile(profile);
    }

    return profile;
  }

  /**
   * Save profile to disk
   */
  async saveProfile(profile: UserProfile): Promise<void> {
    profile.metadata.updatedAt = Date.now();
    
    const profilePath = this.getProfilePath(profile.userId);
    const content = JSON.stringify(profile, null, 2);
    
    await fs.writeFile(profilePath, content, 'utf-8');
    
    // Update cache
    this.profiles.set(profile.userId, profile);
  }

  /**
   * Remember a fact about user
   */
  async rememberFact(
    userId: string,
    content: string,
    options: RememberFactOptions = {}
  ): Promise<UserFact> {
    const profile = await this.getProfile(userId);
    
    const fact: UserFact = {
      id: randomUUID(),
      category: options.category || 'personal',
      content: content.trim(),
      confidence: options.confidence ?? 1.0,
      source: options.source || 'user',
      timestamp: Date.now(),
      expiresAt: options.expiresIn ? Date.now() + options.expiresIn : undefined,
    };

    // Add to profile
    profile.facts.push(fact);

    // Limit facts
    if (profile.facts.length > this.config.maxFacts) {
      // Remove oldest facts with lowest confidence
      profile.facts.sort((a, b) => {
        if (a.confidence !== b.confidence) {
          return b.confidence - a.confidence;
        }
        return b.timestamp - a.timestamp;
      });
      profile.facts = profile.facts.slice(0, this.config.maxFacts);
    }

    // Save
    if (this.config.autoSave) {
      await this.saveProfile(profile);
    }

    return fact;
  }

  /**
   * Recall facts about user
   */
  async recallFacts(
    userId: string,
    options: RecallFactsOptions = {}
  ): Promise<UserFact[]> {
    const profile = await this.getProfile(userId);
    
    let facts = profile.facts;

    // Filter by category
    if (options.category) {
      facts = facts.filter(f => f.category === options.category);
    }

    // Filter by confidence
    if (options.minConfidence !== undefined) {
      facts = facts.filter(f => f.confidence >= options.minConfidence!);
    }

    // Filter expired
    if (!options.includeExpired) {
      facts = facts.filter(f => {
        if (!f.expiresAt) return true;
        return f.expiresAt > Date.now();
      });
    }

    // Sort by confidence and recency
    facts.sort((a, b) => {
      if (a.confidence !== b.confidence) {
        return b.confidence - a.confidence;
      }
      return b.timestamp - a.timestamp;
    });

    // Limit
    if (options.limit) {
      facts = facts.slice(0, options.limit);
    }

    return facts;
  }

  /**
   * Forget a fact
   */
  async forgetFact(userId: string, factId: string): Promise<boolean> {
    const profile = await this.getProfile(userId);
    
    const index = profile.facts.findIndex(f => f.id === factId);
    if (index === -1) {
      return false;
    }

    profile.facts.splice(index, 1);

    if (this.config.autoSave) {
      await this.saveProfile(profile);
    }

    return true;
  }

  /**
   * Update user name
   */
  async setUserName(userId: string, name: string): Promise<void> {
    const profile = await this.getProfile(userId);
    profile.name = name;
    
    if (this.config.autoSave) {
      await this.saveProfile(profile);
    }
  }

  /**
   * Update preferences
   */
  async setPreference(userId: string, key: string, value: unknown): Promise<void> {
    const profile = await this.getProfile(userId);
    
    if (!profile.preferences) {
      profile.preferences = {};
    }
    
    profile.preferences[key] = value;
    
    if (this.config.autoSave) {
      await this.saveProfile(profile);
    }
  }

  /**
   * Increment session count
   */
  async incrementSessionCount(userId: string): Promise<void> {
    const profile = await this.getProfile(userId);
    profile.metadata.totalSessions++;
    
    if (this.config.autoSave) {
      await this.saveProfile(profile);
    }
  }

  /**
   * Increment message count
   */
  async incrementMessageCount(userId: string, count = 1): Promise<void> {
    const profile = await this.getProfile(userId);
    profile.metadata.totalMessages += count;
    
    if (this.config.autoSave) {
      await this.saveProfile(profile);
    }
  }

  /**
   * Build context for system prompt
   */
  async buildUserContext(userId: string): Promise<string> {
    const profile = await this.getProfile(userId);
    const facts = await this.recallFacts(userId, { limit: 20 });

    const lines: string[] = [];

    if (profile.name) {
      lines.push(`User's name: ${profile.name}`);
    }

    if (profile.preferences?.language) {
      lines.push(`Preferred language: ${profile.preferences.language}`);
    }

    if (facts.length > 0) {
      lines.push('\nWhat you know about the user:');
      for (const fact of facts) {
        lines.push(`- ${fact.content}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Get profile file path
   */
  private getProfilePath(userId: string): string {
    // Sanitize userId for filename
    const safeUserId = userId.replace(/[^a-zA-Z0-9-_:]/g, '_');
    return path.join(this.config.profilesDir, `${safeUserId}.json`);
  }

  /**
   * List all user IDs
   */
  async listUsers(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.config.profilesDir);
      return files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', '').replace(/_/g, ':'));
    } catch (error) {
      return [];
    }
  }
}
