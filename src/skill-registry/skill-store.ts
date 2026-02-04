/**
 * Skill Store
 * 
 * In-memory store for loaded skills
 * Provides CRUD operations and queries
 */

import type { Skill, SkillLevel, SkillInfo } from './types';
import { EventEmitter } from 'events';

/**
 * Store events
 */
export interface StoreEvents {
  'skill.added': (skill: Skill) => void;
  'skill.updated': (skill: Skill, old: Skill) => void;
  'skill.removed': (skillName: string) => void;
  'skill.enabled': (skillName: string) => void;
  'skill.disabled': (skillName: string) => void;
}

/**
 * Skill Store
 * 
 * Centralized store for all loaded skills
 */
export class SkillStore extends EventEmitter {
  private skills: Map<string, Skill> = new Map();
  private byLevel: Map<SkillLevel, Set<string>> = new Map<SkillLevel, Set<string>>([
    ['workspace', new Set<string>()],
    ['user', new Set<string>()],
    ['bundled', new Set<string>()]
  ]);

  /**
   * Add a skill to the store
   * 
   * @param skill - Skill to add
   * @returns true if added, false if already exists
   */
  add(skill: Skill): boolean {
    if (this.skills.has(skill.name)) {
      return false;
    }

    this.skills.set(skill.name, skill);
    this.byLevel.get(skill.level)?.add(skill.name);
    this.emit('skill.added', skill);
    
    return true;
  }

  /**
   * Update an existing skill
   * 
   * @param skill - Updated skill
   * @returns true if updated, false if not found
   */
  update(skill: Skill): boolean {
    const old = this.skills.get(skill.name);
    if (!old) {
      return false;
    }

    // Update level index if level changed
    if (old.level !== skill.level) {
      this.byLevel.get(old.level)?.delete(skill.name);
      this.byLevel.get(skill.level)?.add(skill.name);
    }

    this.skills.set(skill.name, skill);
    this.emit('skill.updated', skill, old);
    
    return true;
  }

  /**
   * Add or update a skill
   * 
   * @param skill - Skill to upsert
   */
  upsert(skill: Skill): void {
    if (!this.update(skill)) {
      this.add(skill);
    }
  }

  /**
   * Remove a skill
   * 
   * @param skillName - Name of skill to remove
   * @returns true if removed, false if not found
   */
  remove(skillName: string): boolean {
    const skill = this.skills.get(skillName);
    if (!skill) {
      return false;
    }

    this.skills.delete(skillName);
    this.byLevel.get(skill.level)?.delete(skillName);
    this.emit('skill.removed', skillName);
    
    return true;
  }

  /**
   * Get a skill by name
   * 
   * @param skillName - Name of skill
   * @returns Skill or undefined
   */
  get(skillName: string): Skill | undefined {
    return this.skills.get(skillName);
  }

  /**
   * Get all skills
   * 
   * @param filter - Optional filter function
   * @returns Array of skills
   */
  getAll(filter?: (skill: Skill) => boolean): Skill[] {
    const all = Array.from(this.skills.values());
    return filter ? all.filter(filter) : all;
  }

  /**
   * Get skills by level
   * 
   * @param level - Skill level
   * @returns Array of skills
   */
  getByLevel(level: SkillLevel): Skill[] {
    const names = this.byLevel.get(level) || new Set();
    return Array.from(names)
      .map(name => this.skills.get(name))
      .filter((s): s is Skill => s !== undefined);
  }

  /**
   * Get enabled skills only
   * 
   * @returns Array of enabled skills
   */
  getEnabled(): Skill[] {
    return this.getAll(s => s.enabled);
  }

  /**
   * Get disabled skills
   * 
   * @returns Array of disabled skills
   */
  getDisabled(): Skill[] {
    return this.getAll(s => !s.enabled);
  }

  /**
   * Enable a skill
   * 
   * @param skillName - Name of skill
   * @returns true if enabled, false if not found
   */
  enable(skillName: string): boolean {
    const skill = this.skills.get(skillName);
    if (!skill) {
      return false;
    }

    if (!skill.enabled) {
      skill.enabled = true;
      this.emit('skill.enabled', skillName);
    }
    
    return true;
  }

  /**
   * Disable a skill
   * 
   * @param skillName - Name of skill
   * @returns true if disabled, false if not found
   */
  disable(skillName: string): boolean {
    const skill = this.skills.get(skillName);
    if (!skill) {
      return false;
    }

    if (skill.enabled) {
      skill.enabled = false;
      this.emit('skill.disabled', skillName);
    }
    
    return true;
  }

  /**
   * Check if a skill exists
   * 
   * @param skillName - Name of skill
   * @returns true if exists
   */
  has(skillName: string): boolean {
    return this.skills.has(skillName);
  }

  /**
   * Get skill count
   * 
   * @returns Total number of skills
   */
  count(): number {
    return this.skills.size;
  }

  /**
   * Get skill count by level
   * 
   * @returns Map of level to count
   */
  countByLevel(): Map<SkillLevel, number> {
    return new Map([
      ['workspace', this.byLevel.get('workspace')?.size || 0],
      ['user', this.byLevel.get('user')?.size || 0],
      ['bundled', this.byLevel.get('bundled')?.size || 0]
    ]);
  }

  /**
   * Clear all skills
   */
  clear(): void {
    this.skills.clear();
    this.byLevel.forEach(set => set.clear());
  }

  /**
   * Get skill info (lightweight version)
   * 
   * @param skillName - Name of skill
   * @returns Skill info or undefined
   */
  getInfo(skillName: string): SkillInfo | undefined {
    const skill = this.skills.get(skillName);
    if (!skill) {
      return undefined;
    }

    return {
      name: skill.name,
      version: skill.version,
      description: skill.description,
      level: skill.level,
      enabled: skill.enabled,
      tags: skill.tags,
      author: skill.author,
      category: skill.category,
      priority: skill.priority,
      path: skill.path,
      toolCount: skill.tools.length,
      exampleCount: skill.examples.length
    };
  }

  /**
   * Get all skill info
   * 
   * @returns Array of skill info
   */
  getAllInfo(): SkillInfo[] {
    return this.getAll().map(skill => ({
      name: skill.name,
      version: skill.version,
      description: skill.description,
      level: skill.level,
      enabled: skill.enabled,
      tags: skill.tags,
      author: skill.author,
      category: skill.category,
      priority: skill.priority,
      path: skill.path,
      toolCount: skill.tools.length,
      exampleCount: skill.examples.length
    }));
  }

  /**
   * Find skills by tag
   * 
   * @param tag - Tag to search for
   * @returns Array of skills
   */
  findByTag(tag: string): Skill[] {
    return this.getAll(skill => skill.tags.includes(tag));
  }

  /**
   * Find skills by category
   * 
   * @param category - Category to search for
   * @returns Array of skills
   */
  findByCategory(category: string): Skill[] {
    return this.getAll(skill => skill.category === category);
  }

  /**
   * Search skills by query
   * 
   * @param query - Search query
   * @returns Array of skills
   */
  search(query: string): Skill[] {
    const lowerQuery = query.toLowerCase();
    
    return this.getAll(skill => {
      return skill.name.toLowerCase().includes(lowerQuery) ||
             skill.description.toLowerCase().includes(lowerQuery) ||
             skill.tags.some(tag => tag.toLowerCase().includes(lowerQuery));
    });
  }
}
