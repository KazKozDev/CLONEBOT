/**
 * Context Assembler Integration
 * 
 * Hooks into ContextAssembler to inject skill instructions
 */

import type { SkillRegistry } from './skill-registry';
import type { AgentLoopIntegration } from './agent-loop-integration';

/**
 * Create ContextAssembler hook for skill injection
 * 
 * @param registry - Skill registry instance
 * @param integration - Agent loop integration
 * @returns Hook function for ContextAssembler
 */
export function createContextAssemblerHook(
  registry: SkillRegistry,
  integration: AgentLoopIntegration
) {
  /**
   * Hook function to be called during context assembly
   * 
   * Usage in ContextAssembler:
   * ```typescript
   * const hook = createContextAssemblerHook(registry, integration);
   * assembler.addHook('pre-assembly', hook);
   * ```
   */
  return async (context: any): Promise<any> => {
    const sessionId = context.sessionId || context.session?.id;
    
    if (!sessionId) {
      console.warn('No sessionId in context, skipping skill injection');
      return context;
    }

    // Inject skills into context
    const enhanced = integration.injectSkills(context, sessionId);
    
    return enhanced;
  };
}

/**
 * Skill-aware context transformer
 * 
 * Transforms context to include skill metadata
 */
export class SkillContextTransformer {
  constructor(
    private registry: SkillRegistry,
    private integration: AgentLoopIntegration
  ) {}

  /**
   * Transform context with skill information
   * 
   * @param context - Base context
   * @param sessionId - Session ID
   * @returns Transformed context
   */
  async transform(context: any, sessionId: string): Promise<any> {
    const activeSkills = this.registry.getActiveSkills(sessionId);
    
    // Add skill metadata to context
    const transformed = {
      ...context,
      skills: {
        active: activeSkills,
        count: activeSkills.length,
        summary: this.integration.getActivationSummary(sessionId)
      }
    };

    // Inject skill instructions
    return this.integration.injectSkills(transformed, sessionId);
  }

  /**
   * Extract skill mentions from user message
   * 
   * Detects patterns like "@skillname" or "use skill X"
   * 
   * @param message - User message
   * @returns Mentioned skill names
   */
  extractSkillMentions(message: string): string[] {
    const mentions: string[] = [];
    
    // Pattern: @skillname
    const atMentions = message.match(/@([a-z0-9-]+)/gi);
    if (atMentions) {
      mentions.push(...atMentions.map(m => m.substring(1)));
    }

    // Pattern: "use skill X"
    const usePattern = /use\s+(?:skill\s+)?([a-z0-9-]+)/gi;
    let match;
    while ((match = usePattern.exec(message)) !== null) {
      mentions.push(match[1]);
    }

    // Pattern: "with X skill"
    const withPattern = /with\s+([a-z0-9-]+)\s+skill/gi;
    while ((match = withPattern.exec(message)) !== null) {
      mentions.push(match[1]);
    }

    return [...new Set(mentions)]; // Deduplicate
  }

  /**
   * Activate skills mentioned in message
   * 
   * @param message - User message
   * @param sessionId - Session ID
   * @returns Activated skill names
   */
  async activateMentionedSkills(
    message: string,
    sessionId: string
  ): Promise<string[]> {
    const mentions = this.extractSkillMentions(message);
    const activated: string[] = [];

    for (const skillName of mentions) {
      const skill = this.registry.get(skillName);
      if (skill && skill.enabled) {
        const success = this.registry.activate(
          skillName,
          { sessionId, userMessage: message },
          'Mentioned in user message'
        );
        
        if (success) {
          activated.push(skillName);
        }
      }
    }

    return activated;
  }
}

/**
 * Integration helper functions
 */
export const IntegrationHelpers = {
  /**
   * Format skill list for display
   */
  formatSkillList(skillNames: string[], registry: SkillRegistry): string {
    if (skillNames.length === 0) {
      return 'No active skills';
    }

    const skills = skillNames
      .map(name => registry.get(name))
      .filter(s => s !== undefined);

    return skills
      .map(s => `- **${s!.name}** v${s!.version}: ${s!.description}`)
      .join('\n');
  },

  /**
   * Create skill activation message
   */
  createActivationMessage(skillNames: string[]): string {
    if (skillNames.length === 0) {
      return '';
    }

    if (skillNames.length === 1) {
      return `Activated skill: **${skillNames[0]}**`;
    }

    return `Activated ${skillNames.length} skills: ${skillNames.map(n => `**${n}**`).join(', ')}`;
  },

  /**
   * Validate skill compatibility with context
   */
  validateCompatibility(
    skillNames: string[],
    registry: SkillRegistry
  ): { compatible: string[]; incompatible: string[] } {
    const compatible: string[] = [];
    const incompatible: string[] = [];

    for (const name of skillNames) {
      const deps = registry.checkDependencies(name);
      
      if (deps && deps.unsatisfied.length === 0 && deps.conflicts.length === 0) {
        compatible.push(name);
      } else {
        incompatible.push(name);
      }
    }

    return { compatible, incompatible };
  }
};
