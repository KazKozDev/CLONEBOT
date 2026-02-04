/**
 * Agent Loop Integration
 * 
 * Integrates Skill Registry with Agent Loop
 * Automatically activates skills and injects instructions into context
 */

import type { SkillRegistry } from './skill-registry';
import type { Skill, ActivationContext } from './types';
import { EventEmitter } from 'events';

/**
 * Integration configuration
 */
export interface AgentLoopIntegrationConfig {
  /** Enable auto-activation based on triggers */
  autoActivate?: boolean;
  /** Minimum trigger score for auto-activation */
  autoActivateThreshold?: number;
  /** Maximum skills to activate per message */
  maxAutoActivate?: number;
  /** Include skill examples in context */
  includeExamples?: boolean;
  /** Inject skills into system prompt or user message */
  injectionMode?: 'system' | 'user';
}

/**
 * Skill activation result
 */
export interface SkillActivationResult {
  activatedSkills: string[];
  skippedSkills: string[];
  errors: Array<{ skill: string; error: string }>;
}

/**
 * Context enhancement for Agent Loop
 */
export interface EnhancedContext {
  /** Original user message */
  userMessage: string;
  /** Active skill instructions */
  skillInstructions: string;
  /** Active skill names */
  activeSkills: string[];
  /** Session ID */
  sessionId: string;
}

/**
 * Agent Loop Integration
 * 
 * Bridges Skill Registry with Agent Loop
 */
export class AgentLoopIntegration extends EventEmitter {
  private config: Required<AgentLoopIntegrationConfig>;

  constructor(
    private registry: SkillRegistry,
    config: AgentLoopIntegrationConfig = {}
  ) {
    super();
    
    this.config = {
      autoActivate: config.autoActivate ?? true,
      autoActivateThreshold: config.autoActivateThreshold ?? 5,
      maxAutoActivate: config.maxAutoActivate ?? 3,
      includeExamples: config.includeExamples ?? false,
      injectionMode: config.injectionMode ?? 'system'
    };

    this.setupRegistryListeners();
  }

  /**
   * Setup listeners on registry events
   */
  private setupRegistryListeners(): void {
    this.registry.on('skill.activated', (data) => {
      this.emit('skill.activated', data);
    });

    this.registry.on('skill.deactivated', (data) => {
      this.emit('skill.deactivated', data);
    });
  }

  /**
   * Process user message and activate skills
   * 
   * @param message - User message
   * @param sessionId - Session ID
   * @param explicitSkills - Explicitly requested skills
   * @returns Activation result
   */
  async processMessage(
    message: string,
    sessionId: string,
    explicitSkills?: string[]
  ): Promise<SkillActivationResult> {
    const result: SkillActivationResult = {
      activatedSkills: [],
      skippedSkills: [],
      errors: []
    };

    const context: ActivationContext = {
      sessionId,
      userMessage: message,
      explicit: explicitSkills
    };

    // Activate explicitly requested skills first
    if (explicitSkills && explicitSkills.length > 0) {
      for (const skillName of explicitSkills) {
        const skill = this.registry.get(skillName);
        
        if (!skill) {
          result.errors.push({
            skill: skillName,
            error: 'Skill not found'
          });
          continue;
        }

        if (!skill.enabled) {
          result.errors.push({
            skill: skillName,
            error: 'Skill is disabled'
          });
          continue;
        }

        const activated = this.registry.activate(
          skillName,
          context,
          'Explicitly requested by user'
        );

        if (activated) {
          result.activatedSkills.push(skillName);
        } else {
          result.skippedSkills.push(skillName);
        }
      }
    }

    // Auto-activate based on triggers
    if (this.config.autoActivate) {
      const matches = this.registry.match(
        message,
        this.config.autoActivateThreshold
      );

      // Limit to max auto-activate
      const toActivate = matches
        .slice(0, this.config.maxAutoActivate)
        .filter(m => m.skill.autoActivate);

      for (const match of toActivate) {
        // Skip if already activated
        if (result.activatedSkills.includes(match.skill.name)) {
          continue;
        }

        const activated = this.registry.activate(
          match.skill.name,
          context,
          `Auto-activated (score: ${match.score}, triggers: ${match.matchedTriggers.join(', ')})`
        );

        if (activated) {
          result.activatedSkills.push(match.skill.name);
          this.emit('auto.activated', {
            skill: match.skill.name,
            score: match.score,
            triggers: match.matchedTriggers
          });
        }
      }
    }

    return result;
  }

  /**
   * Get enhanced context for Agent Loop
   * 
   * @param message - User message
   * @param sessionId - Session ID
   * @returns Enhanced context with skill instructions
   */
  getEnhancedContext(message: string, sessionId: string): EnhancedContext {
    const activeSkillNames = this.registry.getActiveSkills(sessionId);
    const activeSkills: Skill[] = [];

    // Get active skill objects
    for (const name of activeSkillNames) {
      const skill = this.registry.get(name);
      if (skill && skill.enabled) {
        activeSkills.push(skill);
      }
    }

    // Build skill instructions
    const instructions = this.buildSkillInstructions(activeSkills);

    return {
      userMessage: message,
      skillInstructions: instructions,
      activeSkills: activeSkillNames,
      sessionId
    };
  }

  /**
   * Build skill instructions text
   * 
   * @param skills - Active skills
   * @returns Formatted instructions
   */
  private buildSkillInstructions(skills: Skill[]): string {
    if (skills.length === 0) {
      return '';
    }

    const sections: string[] = [
      '# Active Skills',
      '',
      'The following skills are currently active and should guide your behavior:',
      ''
    ];

    for (const skill of skills) {
      sections.push(`## Skill: ${skill.name}`);
      sections.push(`**Version**: ${skill.version}`);
      sections.push(`**Description**: ${skill.description}`);
      sections.push('');
      sections.push('**Instructions**:');
      sections.push(skill.instructions);
      sections.push('');

      // Include examples if configured
      if (this.config.includeExamples && skill.examples.length > 0) {
        sections.push('**Examples**:');
        for (const example of skill.examples) {
          sections.push(`### ${example.title}`);
          sections.push(`User: ${example.user}`);
          sections.push(`Assistant: ${example.assistant}`);
          if (example.context) {
            sections.push(`Context: ${JSON.stringify(example.context)}`);
          }
          sections.push('');
        }
      }

      sections.push('---');
      sections.push('');
    }

    return sections.join('\n');
  }

  /**
   * Inject skills into ContextAssembler
   * 
   * This method should be called by ContextAssembler during context assembly
   * 
   * @param baseContext - Base context from ContextAssembler
   * @param sessionId - Session ID
   * @returns Context with skill instructions injected
   */
  injectSkills(baseContext: any, sessionId: string): any {
    const activeSkillNames = this.registry.getActiveSkills(sessionId);
    
    if (activeSkillNames.length === 0) {
      return baseContext;
    }

    const activeSkills: Skill[] = activeSkillNames
      .map(name => this.registry.get(name))
      .filter((s): s is Skill => s !== undefined && s.enabled);

    const skillInstructions = this.buildSkillInstructions(activeSkills);

    if (!skillInstructions) {
      return baseContext;
    }

    // Clone context to avoid mutation
    const enhancedContext = { ...baseContext };

    if (this.config.injectionMode === 'system') {
      // Inject into system message
      if (typeof enhancedContext.systemPrompt === 'string') {
        enhancedContext.systemPrompt += '\n\n' + skillInstructions;
      } else if (Array.isArray(enhancedContext.messages)) {
        // Find system message
        const systemMsg = enhancedContext.messages.find(
          (m: any) => m.role === 'system'
        );
        
        if (systemMsg) {
          systemMsg.content += '\n\n' + skillInstructions;
        } else {
          // Add new system message
          enhancedContext.messages.unshift({
            role: 'system',
            content: skillInstructions
          });
        }
      }
    } else {
      // Inject into user message (prepend to last user message)
      if (Array.isArray(enhancedContext.messages)) {
        const userMessages = enhancedContext.messages.filter(
          (m: any) => m.role === 'user'
        );
        
        if (userMessages.length > 0) {
          const lastUserMsg = userMessages[userMessages.length - 1];
          lastUserMsg.content = skillInstructions + '\n\n' + lastUserMsg.content;
        }
      }
    }

    return enhancedContext;
  }

  /**
   * Deactivate skills after message processing
   * 
   * @param sessionId - Session ID
   * @param keepActive - Skills to keep active
   */
  deactivateAfterMessage(sessionId: string, keepActive?: string[]): void {
    const activeSkills = this.registry.getActiveSkills(sessionId);
    const toKeep = new Set(keepActive || []);

    for (const skillName of activeSkills) {
      if (!toKeep.has(skillName)) {
        this.registry.deactivate(skillName, sessionId);
      }
    }
  }

  /**
   * Get activation summary for session
   * 
   * @param sessionId - Session ID
   * @returns Activation summary
   */
  getActivationSummary(sessionId: string): {
    activeSkills: Array<{
      name: string;
      version: string;
      activatedAt: Date;
      reason: string;
    }>;
    count: number;
  } {
    const activeSkillNames = this.registry.getActiveSkills(sessionId);
    const activeSkills = [];

    for (const name of activeSkillNames) {
      const skill = this.registry.get(name);
      if (!skill) continue;

      // Get activation info from ActivationManager
      // This would need to be exposed by registry
      activeSkills.push({
        name: skill.name,
        version: skill.version,
        activatedAt: new Date(), // TODO: Get from ActivationManager
        reason: 'Unknown' // TODO: Get from ActivationManager
      });
    }

    return {
      activeSkills,
      count: activeSkills.length
    };
  }

  /**
   * Create hook for Agent Loop message processing
   * 
   * @returns Hook function
   */
  createAgentLoopHook(): (data: {
    message: string;
    sessionId: string;
    context: any;
  }) => Promise<any> {
    return async (data) => {
      // Auto-activate skills based on message
      await this.processMessage(data.message, data.sessionId);

      // Inject skills into context
      const enhancedContext = this.injectSkills(data.context, data.sessionId);

      return enhancedContext;
    };
  }

  /**
   * Update configuration
   * 
   * @param config - Partial config to update
   */
  updateConfig(config: Partial<AgentLoopIntegrationConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }

  /**
   * Get current configuration
   * 
   * @returns Current configuration
   */
  getConfig(): AgentLoopIntegrationConfig {
    return { ...this.config };
  }
}
