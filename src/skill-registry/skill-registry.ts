/**
 * Skill Registry - Main Facade
 * 
 * Central interface for skill management
 * Coordinates all skill-related operations
 */

import { DirectoryScanner, type ScanOptions } from './directory-scanner';
import { SkillLoader, type LoadResult, type BatchLoadResult } from './skill-loader';
import { SkillStore } from './skill-store';
import { PrecedenceResolver } from './precedence-resolver';
import { DependencyResolver } from './dependency-resolver';
import { TriggerMatcher, type TriggerMatch } from './trigger-matcher';
import { ActivationManager } from './activation-manager';
import type { 
  Skill, 
  SkillLevel, 
  SkillInfo,
  SkillLocation,
  ActivationContext,
  DependencyResult,
  Override 
} from './types';
import { EventEmitter } from 'events';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Skill Registry Configuration
 */
export interface SkillRegistryConfig {
  /** Workspace skills directory */
  workspaceDir?: string;
  /** User skills directory (e.g., ~/.openclaw/skills) */
  userDir?: string;
  /** Bundled skills directory */
  bundledDir?: string;
  /** Enable auto-discovery */
  autoDiscover?: boolean;
  /** Scan options */
  scanOptions?: ScanOptions;
}

/**
 * Skill Registry
 * 
 * Main entry point for all skill operations
 */
export class SkillRegistry extends EventEmitter {
  private scanner: DirectoryScanner;
  private loader: SkillLoader;
  private store: SkillStore;
  private precedence: PrecedenceResolver;
  private dependencies: DependencyResolver;
  private triggers: TriggerMatcher;
  private activation: ActivationManager;
  
  private config: SkillRegistryConfig;
  private locations: SkillLocation[] = [];
  private initialized = false;

  constructor(config: SkillRegistryConfig = {}) {
    super();
    
    this.config = {
      autoDiscover: true,
      ...config
    };

    // Initialize components
    this.scanner = new DirectoryScanner();
    this.loader = new SkillLoader();
    this.store = new SkillStore();
    this.precedence = new PrecedenceResolver();
    this.dependencies = new DependencyResolver();
    this.triggers = new TriggerMatcher();
    this.activation = new ActivationManager();

    // Forward events from store and activation
    this.store.on('skill.added', (skill) => this.emit('skill.added', skill));
    this.store.on('skill.updated', (skill, old) => this.emit('skill.updated', skill, old));
    this.store.on('skill.removed', (name) => this.emit('skill.removed', name));
    this.activation.on('skill.activated', (data) => this.emit('skill.activated', data));
    this.activation.on('skill.deactivated', (data) => this.emit('skill.deactivated', data));

    this.setupLocations();
  }

  /**
   * Setup skill locations based on config
   */
  private setupLocations(): void {
    this.locations = [];

    if (this.config.workspaceDir) {
      this.locations.push({
        type: 'workspace',
        path: this.config.workspaceDir,
        enabled: true,
        priority: 3
      });
    }

    if (this.config.userDir) {
      this.locations.push({
        type: 'user',
        path: this.config.userDir,
        enabled: true,
        priority: 2
      });
    }

    if (this.config.bundledDir) {
      this.locations.push({
        type: 'bundled',
        path: this.config.bundledDir,
        enabled: true,
        priority: 1
      });
    }
  }

  /**
   * Initialize the registry - discover and load skills
   * 
   * @returns Load statistics
   */
  async initialize(): Promise<{
    loaded: number;
    failed: number;
    overridden: number;
  }> {
    if (this.initialized) {
      return { loaded: 0, failed: 0, overridden: 0 };
    }

    let totalLoaded = 0;
    let totalFailed = 0;

    // Scan all locations
    const scanResults = await this.scanner.scanAll(
      this.locations,
      this.config.scanOptions
    );

    // Load skills from each location
    const scanEntries = Array.from(scanResults.entries());
    for (const [level, scanResult] of scanEntries) {
      if (scanResult.files.length > 0) {
        const loadResult = await this.loader.loadMany(
          scanResult.files,
          level as SkillLevel
        );

        // Add loaded skills to store
        for (const skill of loadResult.loaded) {
          this.store.add(skill);
        }

        totalLoaded += loadResult.stats.successful;
        totalFailed += loadResult.stats.failed;
      }
    }

    // Resolve precedence
    const allSkills = this.store.getAll();
    const resolved = this.precedence.resolveAll(allSkills);
    
    // Disable overridden skills
    for (const skill of allSkills) {
      const active = resolved.get(skill.name);
      if (active && active !== skill) {
        this.store.disable(skill.name);
      }
    }

    const overrideSummary = this.precedence.getOverrideSummary(allSkills);

    this.initialized = true;
    this.emit('registry.initialized', {
      loaded: totalLoaded,
      failed: totalFailed,
      overridden: overrideSummary.total
    });

    return {
      loaded: totalLoaded,
      failed: totalFailed,
      overridden: overrideSummary.total
    };
  }

  /**
   * Get a skill by name
   * 
   * @param name - Skill name
   * @returns Skill or undefined
   */
  get(name: string): Skill | undefined {
    return this.store.get(name);
  }

  /**
   * Get all skills
   * 
   * @param enabledOnly - Return only enabled skills
   * @returns Array of skills
   */
  getAll(enabledOnly = false): Skill[] {
    return enabledOnly ? this.store.getEnabled() : this.store.getAll();
  }

  /**
   * Get skill info (lightweight)
   * 
   * @param name - Skill name
   * @returns Skill info or undefined
   */
  getInfo(name: string): SkillInfo | undefined {
    return this.store.getInfo(name);
  }

  /**
   * List all skills (info only)
   * 
   * @returns Array of skill info
   */
  list(): SkillInfo[] {
    return this.store.getAllInfo();
  }

  /**
   * Search skills
   * 
   * @param query - Search query
   * @returns Matching skills
   */
  search(query: string): Skill[] {
    return this.store.search(query);
  }

  /**
   * Match skills to user input
   * 
   * @param input - User input
   * @param threshold - Minimum match score
   * @returns Matching skills sorted by score
   */
  match(input: string, threshold = 3): TriggerMatch[] {
    const enabledSkills = this.store.getEnabled();
    return this.triggers.matchAll(input, enabledSkills, threshold);
  }

  /**
   * Activate a skill for a session
   * 
   * @param skillName - Skill name
   * @param context - Activation context
   * @param reason - Reason for activation
   * @returns true if activated
   */
  activate(skillName: string, context: ActivationContext, reason?: string): boolean {
    const skill = this.store.get(skillName);
    if (!skill || !skill.enabled) {
      return false;
    }

    return this.activation.activate(skillName, context, reason);
  }

  /**
   * Deactivate a skill for a session
   * 
   * @param skillName - Skill name
   * @param sessionId - Session ID
   * @returns true if deactivated
   */
  deactivate(skillName: string, sessionId: string): boolean {
    return this.activation.deactivate(skillName, sessionId);
  }

  /**
   * Get active skills for a session
   * 
   * @param sessionId - Session ID
   * @returns Array of active skill names
   */
  getActiveSkills(sessionId: string): string[] {
    return this.activation.getActiveSkills(sessionId);
  }

  /**
   * Check dependencies for a skill
   * 
   * @param skillName - Skill name
   * @returns Dependency resolution result
   */
  checkDependencies(skillName: string): DependencyResult | undefined {
    const skill = this.store.get(skillName);
    if (!skill) {
      return undefined;
    }

    const allSkills = this.store.getAll();
    return this.dependencies.resolve(skill, allSkills);
  }

  /**
   * Get overrides for a skill
   * 
   * @param skillName - Skill name
   * @returns Array of overrides
   */
  getOverrides(skillName: string): Override[] {
    const allSkills = this.store.getAll();
    return this.precedence.getOverrides(skillName, allSkills);
  }

  /**
   * Enable a skill
   * 
   * @param skillName - Skill name
   * @returns true if enabled
   */
  enable(skillName: string): boolean {
    return this.store.enable(skillName);
  }

  /**
   * Disable a skill
   * 
   * @param skillName - Skill name
   * @returns true if disabled
   */
  disable(skillName: string): boolean {
    return this.store.disable(skillName);
  }

  /**
   * Reload skills (re-scan and re-load)
   * 
   * @returns Reload statistics
   */
  async reload(): Promise<{
    loaded: number;
    failed: number;
    overridden: number;
  }> {
    this.store.clear();
    this.initialized = false;
    return this.initialize();
  }

  /**
   * Get registry statistics
   * 
   * @returns Statistics object
   */
  getStats(): {
    totalSkills: number;
    enabledSkills: number;
    disabledSkills: number;
    byLevel: Map<SkillLevel, number>;
    activeSessions: number;
    totalActiveSkills: number;
  } {
    const activationStats = this.activation.getStats();
    
    return {
      totalSkills: this.store.count(),
      enabledSkills: this.store.getEnabled().length,
      disabledSkills: this.store.getDisabled().length,
      byLevel: this.store.countByLevel(),
      activeSessions: activationStats.totalSessions,
      totalActiveSkills: activationStats.totalActiveSkills
    };
  }

  /**
   * Check if registry is initialized
   * 
   * @returns true if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
