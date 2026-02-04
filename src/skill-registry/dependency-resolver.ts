/**
 * Dependency Resolver
 * 
 * Resolves and validates skill dependencies
 * Detects circular dependencies and missing requirements
 */

import type { 
  Skill, 
  DependencyResult, 
  UnsatisfiedDependency, 
  Conflict 
} from './types';

/**
 * Dependency Resolver
 * 
 * Checks if all skill dependencies are satisfied
 * and detects conflicts
 */
export class DependencyResolver {
  /**
   * Check if all dependencies are satisfied
   * 
   * @param skill - Skill to check
   * @param availableSkills - All available skills
   * @returns Dependency resolution result
   */
  resolve(skill: Skill, availableSkills: Skill[]): DependencyResult {
    const result: DependencyResult = {
      loadOrder: [],
      satisfied: [],
      unsatisfied: [],
      conflicts: []
    };

    // Check requires (critical dependencies)
    for (const requiredName of skill.requires) {
      const found = availableSkills.find(s => s.name === requiredName && s.enabled);
      
      if (!found) {
        result.unsatisfied.push({
          skill: skill.name,
          type: 'skill',
          missing: requiredName
        });
      } else {
        result.satisfied.push(requiredName);
      }
    }

    // Check dependencies (optional but recommended)
    for (const depName of skill.dependencies) {
      const found = availableSkills.find(s => s.name === depName && s.enabled);
      
      if (!found) {
        result.unsatisfied.push({
          skill: skill.name,
          type: 'skill',
          missing: depName
        });
      } else {
        result.satisfied.push(depName);
      }
    }

    // Check conflicts
    for (const conflictName of skill.conflicts) {
      const found = availableSkills.find(s => s.name === conflictName && s.enabled);
      
      if (found) {
        result.conflicts.push({
          skill1: skill.name,
          skill2: conflictName,
          reason: `${skill.name} declares conflict with ${conflictName}`
        });
      }
    }

    return result;
  }

  /**
   * Resolve dependencies for all skills
   * 
   * @param skills - Skills to check
   * @returns Map of skill name to dependency result
   */
  resolveAll(skills: Skill[]): Map<string, DependencyResult> {
    const results = new Map<string, DependencyResult>();

    for (const skill of skills) {
      results.set(skill.name, this.resolve(skill, skills));
    }

    return results;
  }

  /**
   * Get skills with unsatisfied dependencies
   * 
   * @param skills - All skills
   * @returns Skills with missing dependencies
   */
  getUnsatisfied(skills: Skill[]): Skill[] {
    const unsatisfied: Skill[] = [];

    for (const skill of skills) {
      const result = this.resolve(skill, skills);
      if (result.unsatisfied.length > 0 || result.conflicts.length > 0) {
        unsatisfied.push(skill);
      }
    }

    return unsatisfied;
  }

  /**
   * Detect circular dependencies
   * 
   * @param skills - All skills
   * @returns List of circular dependency chains
   */
  detectCircular(skills: Skill[]): string[][] {
    const circular: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (skillName: string, path: string[]): void => {
      visited.add(skillName);
      recursionStack.add(skillName);
      path.push(skillName);

      const skill = skills.find(s => s.name === skillName);
      if (!skill) {
        recursionStack.delete(skillName);
        return;
      }

      const deps = [...skill.requires, ...skill.dependencies];
      
      for (const dep of deps) {
        if (!visited.has(dep)) {
          dfs(dep, [...path]);
        } else if (recursionStack.has(dep)) {
          // Found circular dependency
          const cycleStart = path.indexOf(dep);
          const cycle = path.slice(cycleStart);
          cycle.push(dep);
          circular.push(cycle);
        }
      }

      recursionStack.delete(skillName);
    };

    for (const skill of skills) {
      if (!visited.has(skill.name)) {
        dfs(skill.name, []);
      }
    }

    return circular;
  }

  /**
   * Get dependency tree for a skill
   * 
   * @param skillName - Skill to analyze
   * @param skills - All skills
   * @returns Dependency tree
   */
  getDependencyTree(skillName: string, skills: Skill[]): any {
    const skill = skills.find(s => s.name === skillName);
    if (!skill) {
      return null;
    }

    const tree: any = {
      name: skillName,
      requires: [],
      dependencies: []
    };

    for (const req of skill.requires) {
      tree.requires.push(this.getDependencyTree(req, skills));
    }

    for (const dep of skill.dependencies) {
      tree.dependencies.push(this.getDependencyTree(dep, skills));
    }

    return tree;
  }

  /**
   * Order skills by dependencies (topological sort)
   * 
   * @param skills - Skills to order
   * @returns Ordered skills (dependencies first)
   */
  topologicalSort(skills: Skill[]): Skill[] {
    const result: Skill[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();

    const visit = (skillName: string): void => {
      if (visited.has(skillName)) return;
      if (temp.has(skillName)) {
        // Circular dependency - skip
        return;
      }

      temp.add(skillName);

      const skill = skills.find(s => s.name === skillName);
      if (skill) {
        const deps = [...skill.requires, ...skill.dependencies];
        for (const dep of deps) {
          visit(dep);
        }
        
        visited.add(skillName);
        temp.delete(skillName);
        result.push(skill);
      }
    };

    for (const skill of skills) {
      visit(skill.name);
    }

    return result;
  }

  /**
   * Get all conflicts in skill set
   * 
   * @param skills - All skills
   * @returns List of all conflicts
   */
  getAllConflicts(skills: Skill[]): Conflict[] {
    const conflicts: Conflict[] = [];

    for (const skill of skills) {
      if (!skill.enabled) continue;

      for (const conflictName of skill.conflicts) {
        const conflictSkill = skills.find(s => s.name === conflictName && s.enabled);
        
        if (conflictSkill) {
          conflicts.push({
            skill1: skill.name,
            skill2: conflictName,
            reason: `${skill.name} declares conflict with ${conflictName}`
          });
        }
      }
    }

    return conflicts;
  }
}
