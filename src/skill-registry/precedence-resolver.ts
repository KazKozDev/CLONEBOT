/**
 * Precedence Resolver
 * 
 * Resolves conflicts between skills at different levels
 * Priority: workspace > user > bundled
 */

import type { Skill, SkillLevel, Override } from './types';

/**
 * Precedence Resolver
 * 
 * Determines which skill version takes precedence when multiple
 * versions of the same skill exist at different levels
 */
export class PrecedenceResolver {
  private readonly levelPriority: Map<SkillLevel, number> = new Map([
    ['workspace', 3],
    ['user', 2],
    ['bundled', 1]
  ]);

  /**
   * Resolve precedence between multiple versions of same skill
   * 
   * @param skills - Array of skills with same name
   * @returns The skill that takes precedence
   */
  resolve(skills: Skill[]): Skill {
    if (skills.length === 0) {
      throw new Error('Cannot resolve precedence: empty skill list');
    }

    if (skills.length === 1) {
      return skills[0];
    }

    // Sort by level priority (highest first), then by skill priority
    const sorted = [...skills].sort((a, b) => {
      const levelA = this.levelPriority.get(a.level) ?? 0;
      const levelB = this.levelPriority.get(b.level) ?? 0;

      if (levelA !== levelB) {
        return levelB - levelA; // Higher level wins
      }

      // Same level - use skill priority
      return b.priority - a.priority;
    });

    return sorted[0];
  }

  /**
   * Get all overrides for a skill
   * 
   * @param skillName - Name of skill to check
   * @param allSkills - All available skills
   * @returns List of overrides
   */
  getOverrides(skillName: string, allSkills: Skill[]): Override[] {
    const versions = allSkills.filter(s => s.name === skillName);
    
    if (versions.length <= 1) {
      return [];
    }

    const active = this.resolve(versions);
    const overrides: Override[] = [];

    for (const skill of versions) {
      if (skill !== active) {
        overrides.push({
          skillName: skill.name,
          winner: {
            level: active.level,
            path: active.path,
            version: active.version
          },
          loser: {
            level: skill.level,
            path: skill.path,
            version: skill.version
          }
        });
      }
    }

    return overrides;
  }

  /**
   * Check if a skill is overridden by another level
   * 
   * @param skill - Skill to check
   * @param allSkills - All available skills
   * @returns true if skill is overridden
   */
  isOverridden(skill: Skill, allSkills: Skill[]): boolean {
    const versions = allSkills.filter(s => s.name === skill.name);
    const active = this.resolve(versions);
    return active !== skill;
  }

  /**
   * Get the active skill for a name
   * 
   * @param skillName - Name of skill
   * @param allSkills - All available skills
   * @returns Active skill or undefined
   */
  getActive(skillName: string, allSkills: Skill[]): Skill | undefined {
    const versions = allSkills.filter(s => s.name === skillName);
    return versions.length > 0 ? this.resolve(versions) : undefined;
  }

  /**
   * Group skills by precedence level
   * 
   * @param allSkills - All available skills
   * @returns Map of skill name to active skill
   */
  resolveAll(allSkills: Skill[]): Map<string, Skill> {
    const grouped = new Map<string, Skill[]>();

    // Group by name
    for (const skill of allSkills) {
      const existing = grouped.get(skill.name) || [];
      existing.push(skill);
      grouped.set(skill.name, existing);
    }

    // Resolve each group
    const result = new Map<string, Skill>();
    const entries = Array.from(grouped.entries());
    for (const [name, versions] of entries) {
      result.set(name, this.resolve(versions));
    }

    return result;
  }

  /**
   * Get override summary for all skills
   * 
   * @param allSkills - All available skills
   * @returns Summary of overrides
   */
  getOverrideSummary(allSkills: Skill[]): {
    total: number;
    byLevel: Map<SkillLevel, number>;
    overrides: Override[];
  } {
    const overrides: Override[] = [];
    const byLevel = new Map<SkillLevel, number>();
    const grouped = new Map<string, Skill[]>();

    // Group by name
    for (const skill of allSkills) {
      const existing = grouped.get(skill.name) || [];
      existing.push(skill);
      grouped.set(skill.name, existing);
    }

    // Find all overrides
    const allVersions = Array.from(grouped.values());
    for (const versions of allVersions) {
      if (versions.length > 1) {
        const active = this.resolve(versions);
        
        for (const skill of versions) {
          if (skill !== active) {
            overrides.push({
              skillName: skill.name,
              winner: {
                level: active.level,
                path: active.path,
                version: active.version
              },
              loser: {
                level: skill.level,
                path: skill.path,
                version: skill.version
              }
            });

            const count = byLevel.get(skill.level) || 0;
            byLevel.set(skill.level, count + 1);
          }
        }
      }
    }

    return {
      total: overrides.length,
      byLevel,
      overrides
    };
  }
}
