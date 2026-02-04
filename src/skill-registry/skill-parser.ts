/**
 * SKILL.md Parser
 * 
 * Parses SKILL.md files (YAML frontmatter + Markdown body)
 */

import type { ParsedSkill, SkillFrontmatter } from './types.js';
import { promises as fs } from 'fs';

// ============================================================================
// Parser
// ============================================================================

export class SkillParser {
  
  /**
   * Parse SKILL.md content
   */
  parse(content: string): ParsedSkill {
    const { frontmatter, body } = this.splitFrontmatter(content);
    const sections = this.extractSections(body);
    
    return {
      frontmatter,
      body,
      sections
    };
  }
  
  /**
   * Parse SKILL.md file
   */
  async parseFile(path: string): Promise<ParsedSkill> {
    const content = await fs.readFile(path, 'utf-8');
    return this.parse(content);
  }
  
  /**
   * Split frontmatter and body
   */
  private splitFrontmatter(content: string): { frontmatter: SkillFrontmatter; body: string } {
    // Remove BOM if present
    content = content.replace(/^\uFEFF/, '');
    
    // Normalize line endings
    content = content.replace(/\r\n/g, '\n');
    
    // Check for frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    
    if (!frontmatterMatch) {
      // No frontmatter
      return {
        frontmatter: {} as SkillFrontmatter,
        body: content
      };
    }
    
    const [, frontmatterText, body] = frontmatterMatch;
    
    try {
      const frontmatter = this.parseYAML(frontmatterText);
      return { frontmatter, body };
    } catch (error) {
      throw new Error(`Failed to parse frontmatter: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Simple YAML parser (for frontmatter)
   */
  private parseYAML(yaml: string): SkillFrontmatter {
    const result: any = {};
    const lines = yaml.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      
      // Parse key-value pair
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex === -1) {
        continue;
      }
      
      const key = trimmed.slice(0, colonIndex).trim();
      let value = trimmed.slice(colonIndex + 1).trim();
      
      // Parse value type
      if (value === 'true') {
        result[key] = true;
      } else if (value === 'false') {
        result[key] = false;
      } else if (value === 'null' || value === '') {
        result[key] = null;
      } else if (/^-?\d+$/.test(value)) {
        result[key] = parseInt(value, 10);
      } else if (/^-?\d+\.\d+$/.test(value)) {
        result[key] = parseFloat(value);
      } else if (value.startsWith('[') && value.endsWith(']')) {
        // Array
        const arrayContent = value.slice(1, -1);
        result[key] = arrayContent
          .split(',')
          .map(v => v.trim())
          .filter(v => v)
          .map(v => {
            // Remove quotes
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
              return v.slice(1, -1);
            }
            return v;
          });
      } else if (value.startsWith('{') && value.endsWith('}')) {
        // Simple object parsing
        try {
          result[key] = JSON.parse(value);
        } catch {
          result[key] = value;
        }
      } else {
        // String - remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          result[key] = value.slice(1, -1);
        } else {
          result[key] = value;
        }
      }
    }
    
    return result as SkillFrontmatter;
  }
  
  /**
   * Extract sections from Markdown body
   */
  private extractSections(body: string): Map<string, string> {
    const sections = new Map<string, string>();
    const lines = body.split('\n');
    
    let currentSection: string | null = null;
    let currentContent: string[] = [];
    
    for (const line of lines) {
      // Check for section header (## or ###)
      const headerMatch = line.match(/^(#{2,3})\s+(.+)$/);
      
      if (headerMatch) {
        // Save previous section
        if (currentSection) {
          sections.set(currentSection, currentContent.join('\n').trim());
        }
        
        // Start new section
        const [, , title] = headerMatch;
        currentSection = this.normalizeSectionName(title);
        currentContent = [];
      } else if (currentSection) {
        currentContent.push(line);
      }
    }
    
    // Save last section
    if (currentSection) {
      sections.set(currentSection, currentContent.join('\n').trim());
    }
    
    // Extract instructions (everything before first ## section or entire body)
    const firstSectionIndex = lines.findIndex(line => /^##\s/.test(line));
    const instructionsText = firstSectionIndex !== -1
      ? lines.slice(0, firstSectionIndex).join('\n').trim()
      : body.trim();
    
    if (instructionsText && !sections.has('instructions')) {
      sections.set('instructions', instructionsText);
    }
    
    return sections;
  }
  
  /**
   * Normalize section name
   */
  private normalizeSectionName(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
