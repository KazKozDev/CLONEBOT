/**
 * System Prompt Builder
 * 
 * Builds system prompts from multiple sources with 8 standard sections.
 */

import type { BootstrapFiles, SystemPromptOptions, SystemPromptSection, Skill } from './types';

// ============================================================================
// System Prompt Builder
// ============================================================================

export class SystemPromptBuilder {
  private sectionSeparator: string;
  
  constructor(sectionSeparator: string = '\n\n---\n\n') {
    this.sectionSeparator = sectionSeparator;
  }
  
  /**
   * Build complete system prompt from sections
   */
  build(sections: SystemPromptSection[]): string {
    if (sections.length === 0) {
      return '';
    }
    
    // Sort by priority (higher first)
    const sorted = [...sections].sort((a, b) => b.priority - a.priority);
    
    // Join sections
    return sorted
      .filter(s => s.content.trim().length > 0)
      .map(s => s.content.trim())
      .join(this.sectionSeparator);
  }
  
  /**
   * Create section from bootstrap file
   */
  createBootstrapSection(
    name: string,
    content: string | null | undefined,
    priority: number
  ): SystemPromptSection | null {
    if (!content || content.trim().length === 0) {
      return null;
    }
    
    return {
      name,
      content: content.trim(),
      priority,
    };
  }
  
  /**
   * Create datetime section
   */
  createDatetimeSection(
    options: {
      format?: string;
      timezone?: string;
    } = {}
  ): SystemPromptSection {
    const format = options.format || 'YYYY-MM-DD HH:mm:ss';
    const timezone = options.timezone || 'UTC';
    
    // Simple datetime formatting
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const hours = String(now.getUTCHours()).padStart(2, '0');
    const minutes = String(now.getUTCMinutes()).padStart(2, '0');
    const seconds = String(now.getUTCSeconds()).padStart(2, '0');
    
    const datetime = format
      .replace('YYYY', String(year))
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds);
    
    return {
      name: 'datetime',
      content: `Current datetime: ${datetime} ${timezone}`,
      priority: 100,
    };
  }
  
  /**
   * Create skills section from skill definitions
   */
  createSkillsSection(skills: Skill[]): SystemPromptSection | null {
    if (skills.length === 0) {
      return null;
    }
    
    // Sort skills by priority
    const sorted = [...skills].sort((a, b) => {
      const aPriority = a.priority ?? 0;
      const bPriority = b.priority ?? 0;
      return bPriority - aPriority;
    });
    
    // Build skills content
    const lines: string[] = ['You have access to the following skills:'];
    
    for (const skill of sorted) {
      lines.push(`\n## ${skill.name}`);
      
      if (skill.instructions) {
        lines.push(skill.instructions);
      }
      
      if (skill.examples && skill.examples.length > 0) {
        lines.push('\nExamples:');
        for (const example of skill.examples) {
          lines.push(`- ${example}`);
        }
      }
      
      if (skill.tools && skill.tools.length > 0) {
        lines.push(`\nTools: ${skill.tools.map(t => t.name).join(', ')}`);
      }
    }
    
    return {
      name: 'skills',
      content: lines.join('\n'),
      priority: 500,
    };
  }
  
  /**
   * Create tools summary section
   */
  createToolsSummarySection(toolNames: string[]): SystemPromptSection | null {
    if (toolNames.length === 0) {
      return null;
    }
    
    return {
      name: 'tools_summary',
      content: `Available tools: ${toolNames.join(', ')}`,
      priority: 400,
    };
  }
  
  /**
   * Create custom section
   */
  createCustomSection(name: string, content: string, priority: number): SystemPromptSection {
    return {
      name,
      content: content.trim(),
      priority,
    };
  }
  
  /**
   * Build standard system prompt
   */
  async buildStandard(
    bootstrap: BootstrapFiles,
    options: SystemPromptOptions = {}
  ): Promise<string> {
    const sections: SystemPromptSection[] = [];
    
    // Section 1: Agent definition (priority 1000)
    const agentSection = this.createBootstrapSection(
      'agent',
      bootstrap.agent,
      1000
    );
    if (agentSection) {
      sections.push(agentSection);
    }
    
    // Section 2: Soul/personality (priority 900)
    const soulSection = this.createBootstrapSection(
      'soul',
      bootstrap.soul,
      900
    );
    if (soulSection) {
      sections.push(soulSection);
    }
    
    // Section 3: Context instructions (priority 800)
    const contextSection = this.createBootstrapSection(
      'context',
      bootstrap.context,
      800
    );
    if (contextSection) {
      sections.push(contextSection);
    }
    
    // Section 4: Skills (priority 500)
    // Will be added by caller if skills are available
    
    // Section 5: Tools summary (priority 400)
    // Will be added by caller if generateToolsSummary is enabled
    
    // Section 6: Additional context (priority 300)
    if (options.additionalContext) {
      sections.push(
        this.createCustomSection(
          'additional_context',
          options.additionalContext,
          300
        )
      );
    }
    
    // Section 7: Datetime (priority 100)
    if (options.includeDatetime !== false) {
      sections.push(
        this.createDatetimeSection({
          format: options.datetimeFormat,
          timezone: options.datetimeTimezone,
        })
      );
    }
    
    // Section 8: Custom sections from caller
    // Will be added by caller if needed
    
    return this.build(sections);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create system prompt builder
 */
export function createSystemPromptBuilder(sectionSeparator?: string): SystemPromptBuilder {
  return new SystemPromptBuilder(sectionSeparator);
}
