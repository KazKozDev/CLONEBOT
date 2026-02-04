/**
 * Activation Manager
 * 
 * Manages skill activation and deactivation
 * Tracks active skills per session
 */

import type { Skill, ActivationContext } from './types';
import { EventEmitter } from 'events';

/**
 * Activation state for a session
 */
export interface SessionActivation {
  sessionId: string;
  activeSkills: Set<string>;
  activatedAt: Map<string, Date>;
  activationReasons: Map<string, string>;
}

/**
 * Activation Manager
 * 
 * Manages which skills are active in which sessions
 */
export class ActivationManager extends EventEmitter {
  private sessions: Map<string, SessionActivation> = new Map();

  /**
   * Create or get session activation state
   * 
   * @param sessionId - Session ID
   * @returns Session activation state
   */
  private getOrCreateSession(sessionId: string): SessionActivation {
    let session = this.sessions.get(sessionId);
    
    if (!session) {
      session = {
        sessionId,
        activeSkills: new Set(),
        activatedAt: new Map(),
        activationReasons: new Map()
      };
      this.sessions.set(sessionId, session);
    }
    
    return session;
  }

  /**
   * Activate a skill for a session
   * 
   * @param skillName - Name of skill to activate
   * @param context - Activation context
   * @param reason - Reason for activation
   * @returns true if activated, false if already active
   */
  activate(skillName: string, context: ActivationContext, reason?: string): boolean {
    const session = this.getOrCreateSession(context.sessionId);
    
    if (session.activeSkills.has(skillName)) {
      return false; // Already active
    }

    session.activeSkills.add(skillName);
    session.activatedAt.set(skillName, new Date());
    session.activationReasons.set(skillName, reason || 'Manual activation');
    
    this.emit('skill.activated', {
      skillName,
      sessionId: context.sessionId,
      reason
    });
    
    return true;
  }

  /**
   * Deactivate a skill for a session
   * 
   * @param skillName - Name of skill to deactivate
   * @param sessionId - Session ID
   * @returns true if deactivated, false if not active
   */
  deactivate(skillName: string, sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    
    if (!session || !session.activeSkills.has(skillName)) {
      return false; // Not active
    }

    session.activeSkills.delete(skillName);
    session.activatedAt.delete(skillName);
    session.activationReasons.delete(skillName);
    
    this.emit('skill.deactivated', {
      skillName,
      sessionId
    });
    
    return true;
  }

  /**
   * Check if a skill is active in a session
   * 
   * @param skillName - Skill name
   * @param sessionId - Session ID
   * @returns true if active
   */
  isActive(skillName: string, sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session ? session.activeSkills.has(skillName) : false;
  }

  /**
   * Get all active skills for a session
   * 
   * @param sessionId - Session ID
   * @returns Array of active skill names
   */
  getActiveSkills(sessionId: string): string[] {
    const session = this.sessions.get(sessionId);
    return session ? Array.from(session.activeSkills) : [];
  }

  /**
   * Get activation info for a skill in a session
   * 
   * @param skillName - Skill name
   * @param sessionId - Session ID
   * @returns Activation info or undefined
   */
  getActivationInfo(skillName: string, sessionId: string): {
    activatedAt: Date;
    reason: string;
  } | undefined {
    const session = this.sessions.get(sessionId);
    
    if (!session || !session.activeSkills.has(skillName)) {
      return undefined;
    }

    return {
      activatedAt: session.activatedAt.get(skillName)!,
      reason: session.activationReasons.get(skillName)!
    };
  }

  /**
   * Deactivate all skills in a session
   * 
   * @param sessionId - Session ID
   * @returns Number of skills deactivated
   */
  deactivateAll(sessionId: string): number {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return 0;
    }

    const count = session.activeSkills.size;
    session.activeSkills.clear();
    session.activatedAt.clear();
    session.activationReasons.clear();
    
    this.emit('session.cleared', { sessionId });
    
    return count;
  }

  /**
   * Clear session data
   * 
   * @param sessionId - Session ID
   */
  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.emit('session.removed', { sessionId });
  }

  /**
   * Get all sessions
   * 
   * @returns Array of session IDs
   */
  getAllSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Get session count
   * 
   * @returns Number of active sessions
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get statistics
   * 
   * @returns Activation statistics
   */
  getStats(): {
    totalSessions: number;
    totalActiveSkills: number;
    averageSkillsPerSession: number;
    mostActiveSkills: Array<{ skillName: string; count: number }>;
  } {
    const skillCounts = new Map<string, number>();
    let totalActiveSkills = 0;

    const sessions = Array.from(this.sessions.values());
    for (const session of sessions) {
      totalActiveSkills += session.activeSkills.size;
      
      const skillNames = Array.from(session.activeSkills); for (const skillName of skillNames) {
        skillCounts.set(skillName, (skillCounts.get(skillName) || 0) + 1);
      }
    }

    const mostActive = Array.from(skillCounts.entries())
      .map(([skillName, count]) => ({ skillName, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalSessions: this.sessions.size,
      totalActiveSkills,
      averageSkillsPerSession: this.sessions.size > 0 
        ? totalActiveSkills / this.sessions.size 
        : 0,
      mostActiveSkills: mostActive
    };
  }

  /**
   * Activate multiple skills at once
   * 
   * @param skillNames - Names of skills to activate
   * @param context - Activation context
   * @param reason - Reason for activation
   * @returns Number of skills activated
   */
  activateMany(
    skillNames: string[], 
    context: ActivationContext, 
    reason?: string
  ): number {
    let count = 0;
    
    for (const skillName of skillNames) {
      if (this.activate(skillName, context, reason)) {
        count++;
      }
    }
    
    return count;
  }

  /**
   * Auto-activate skills based on triggers
   * 
   * @param skills - Skills that matched triggers
   * @param context - Activation context
   * @returns Activated skill names
   */
  autoActivate(skills: Skill[], context: ActivationContext): string[] {
    const activated: string[] = [];
    
    for (const skill of skills) {
      if (skill.autoActivate) {
        if (this.activate(skill.name, context, 'Auto-activated by trigger')) {
          activated.push(skill.name);
        }
      }
    }
    
    return activated;
  }
}
