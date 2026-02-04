/**
 * Skills Integration
 * 
 * Integrates with skill provider to get active skills and their tools.
 */

import type { Skill, SkillProvider } from './types';

// ============================================================================
// Skills Integrator
// ============================================================================

export class SkillsIntegrator {
  private skillProvider?: SkillProvider;
  
  constructor(skillProvider?: SkillProvider) {
    this.skillProvider = skillProvider;
  }
  
  /**
   * Get active skills for agent/session
   */
  async getActiveSkills(
    agentId: string,
    sessionId?: string,
    filter?: string[]
  ): Promise<Skill[]> {
    if (!this.skillProvider) {
      return [];
    }
    
    const skills = await this.skillProvider.getActiveSkills(agentId, sessionId);
    
    // Apply filter if provided
    if (filter && filter.length > 0) {
      return skills.filter(s => filter.includes(s.id));
    }
    
    return skills;
  }
  
  /**
   * Get skill instructions
   */
  async getSkillInstructions(skillId: string): Promise<string | null> {
    if (!this.skillProvider) {
      return null;
    }
    
    return this.skillProvider.getSkillInstructions(skillId);
  }
  
  /**
   * Get skill tools
   */
  async getSkillTools(skillId: string): Promise<import('./types').ToolDefinition[]> {
    if (!this.skillProvider) {
      return [];
    }
    
    return this.skillProvider.getSkillTools(skillId);
  }
  
  /**
   * Get skill priority
   */
  async getSkillPriority(skillId: string): Promise<number> {
    if (!this.skillProvider) {
      return 0;
    }
    
    return this.skillProvider.getSkillPriority(skillId);
  }
  
  /**
   * Enrich skills with full data
   */
  async enrichSkills(skills: Skill[]): Promise<Skill[]> {
    if (!this.skillProvider) {
      return skills;
    }
    
    const enriched: Skill[] = [];
    
    for (const skill of skills) {
      // Get instructions if not already present
      const instructions = skill.instructions ?? 
        await this.skillProvider.getSkillInstructions(skill.id);
      
      // Get tools if not already present
      const tools = skill.tools ?? 
        await this.skillProvider.getSkillTools(skill.id);
      
      // Get priority if not already present
      const priority = skill.priority ?? 
        await this.skillProvider.getSkillPriority(skill.id);
      
      enriched.push({
        ...skill,
        instructions: instructions ?? undefined,
        tools: tools.length > 0 ? tools : undefined,
        priority,
      });
    }
    
    return enriched;
  }
  
  /**
   * Sort skills by priority
   */
  sortByPriority(skills: Skill[]): Skill[] {
    return [...skills].sort((a, b) => {
      const aPriority = a.priority ?? 0;
      const bPriority = b.priority ?? 0;
      return bPriority - aPriority; // Higher priority first
    });
  }
  
  /**
   * Get all tools from skills
   */
  getToolsFromSkills(skills: Skill[]): import('./types').ToolDefinition[] {
    const allTools: import('./types').ToolDefinition[] = [];
    
    for (const skill of skills) {
      if (skill.tools) {
        allTools.push(...skill.tools);
      }
    }
    
    return allTools;
  }
  
  /**
   * Get all instructions from skills
   */
  getInstructionsFromSkills(skills: Skill[]): string[] {
    const instructions: string[] = [];
    
    // Sort by priority first
    const sorted = this.sortByPriority(skills);
    
    for (const skill of sorted) {
      if (skill.instructions) {
        instructions.push(skill.instructions);
      }
    }
    
    return instructions;
  }
  
  /**
   * Check if skill provider is available
   */
  isAvailable(): boolean {
    return this.skillProvider !== undefined;
  }
  
  /**
   * Get skill by ID
   */
  async getSkill(skillId: string, agentId: string, sessionId?: string): Promise<Skill | null> {
    if (!this.skillProvider) {
      return null;
    }
    
    const skills = await this.skillProvider.getActiveSkills(agentId, sessionId);
    return skills.find(s => s.id === skillId) ?? null;
  }
  
  /**
   * Filter skills by IDs
   */
  filterSkills(skills: Skill[], filter: string[]): Skill[] {
    if (filter.length === 0) {
      return skills;
    }
    
    return skills.filter(s => filter.includes(s.id));
  }
  
  /**
   * Get skill names
   */
  getSkillNames(skills: Skill[]): string[] {
    return skills.map(s => s.name);
  }
  
  /**
   * Get skill IDs
   */
  getSkillIds(skills: Skill[]): string[] {
    return skills.map(s => s.id);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create skills integrator
 */
export function createSkillsIntegrator(skillProvider?: SkillProvider): SkillsIntegrator {
  return new SkillsIntegrator(skillProvider);
}
