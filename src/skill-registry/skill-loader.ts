/**
 * Skill Loader
 * 
 * Loads and parses skills from discovered SKILL.md files
 * Validates skills and enriches with metadata
 */

import { SkillParser } from './skill-parser';
import { SkillValidator } from './skill-validator';
import type { 
  Skill, 
  SkillLevel, 
  ParsedSkill, 
  ValidationResult,
  FileInfo 
} from './types';
import { readFile, stat } from 'fs/promises';
import { dirname, basename } from 'path';

/**
 * Load result for a single skill
 */
export interface LoadResult {
  success: boolean;
  skill?: Skill;
  errors: string[];
  warnings: string[];
  path: string;
}

/**
 * Batch load result
 */
export interface BatchLoadResult {
  loaded: Skill[];
  failed: LoadResult[];
  total: number;
  stats: {
    successful: number;
    failed: number;
    warnings: number;
  };
}

/**
 * Skill Loader
 * 
 * Orchestrates loading, parsing, and validation of skills
 */
export class SkillLoader {
  private parser: SkillParser;
  private validator: SkillValidator;

  constructor() {
    this.parser = new SkillParser();
    this.validator = new SkillValidator();
  }

  /**
   * Load a single skill from file
   * 
   * @param filePath - Path to SKILL.md file
   * @param level - Skill level (workspace/user/bundled)
   * @returns Load result
   */
  async loadSkill(filePath: string, level: SkillLevel): Promise<LoadResult> {
    const result: LoadResult = {
      success: false,
      errors: [],
      warnings: [],
      path: filePath
    };

    try {
      // Parse the skill file
      const parsed = await this.parser.parseFile(filePath);
      
      // Validate
      const validation = this.validator.validate(parsed);
      
      if (!validation.valid) {
        result.errors = validation.errors.map(e => e.message);
        result.warnings = validation.warnings?.map(w => w.message) || [];
        return result;
      }

      // Add warnings
      if (validation.warnings && validation.warnings.length > 0) {
        result.warnings = validation.warnings.map(w => w.message);
      }

      // Get file stats
      const fileStat = await stat(filePath);

      // Convert parsed skill to full Skill object
      const skill = await this.parseToSkill(parsed, filePath, level, fileStat.mtime);
      
      result.success = true;
      result.skill = skill;
    } catch (error: any) {
      result.errors.push(`Failed to load skill: ${error.message}`);
    }

    return result;
  }

  /**
   * Load multiple skills from file info list
   * 
   * @param files - List of files to load
   * @param level - Skill level
   * @returns Batch load result
   */
  async loadMany(files: FileInfo[], level: SkillLevel): Promise<BatchLoadResult> {
    const result: BatchLoadResult = {
      loaded: [],
      failed: [],
      total: files.length,
      stats: {
        successful: 0,
        failed: 0,
        warnings: 0
      }
    };

    // Load all skills in parallel
    const loadPromises = files.map(file => this.loadSkill(file.path, level));
    const loadResults = await Promise.all(loadPromises);

    // Process results
    for (const loadResult of loadResults) {
      if (loadResult.success && loadResult.skill) {
        result.loaded.push(loadResult.skill);
        result.stats.successful++;
        if (loadResult.warnings.length > 0) {
          result.stats.warnings += loadResult.warnings.length;
        }
      } else {
        result.failed.push(loadResult);
        result.stats.failed++;
      }
    }

    return result;
  }

  /**
   * Reload a skill (re-parse and validate)
   * 
   * @param filePath - Path to SKILL.md
   * @param level - Skill level
   * @returns Load result
   */
  async reloadSkill(filePath: string, level: SkillLevel): Promise<LoadResult> {
    // Same as loadSkill - just reload from disk
    return this.loadSkill(filePath, level);
  }

  /**
   * Convert ParsedSkill to full Skill object
   */
  private async parseToSkill(
    parsed: ParsedSkill,
    filePath: string,
    level: SkillLevel,
    modifiedAt: Date
  ): Promise<Skill> {
    const fm = parsed.frontmatter;
    
    // Extract skill name from directory
    const skillDir = dirname(filePath);
    const skillName = fm.name || basename(skillDir);

    return {
      // Identity
      name: skillName,
      version: fm.version,
      description: fm.description,
      
      // Metadata
      author: fm.author,
      license: fm.license,
      tags: fm.tags || [],
      category: fm.category,
      homepage: fm.homepage,
      repository: fm.repository,
      
      // Location
      level,
      path: filePath,
      
      // State
      enabled: fm.enabled ?? true,
      priority: fm.priority ?? 100,
      
      // Activation
      triggers: fm.triggers || [],
      autoActivate: fm.autoActivate ?? false,
      
      // Dependencies
      requires: fm.requires || [],
      dependencies: fm.dependencies || [],
      conflicts: fm.conflicts || [],
      
      // Content
      instructions: parsed.sections.get('instructions') || '',
      tools: [], // Tools are loaded separately from toolsPath
      examples: this.extractExamples(parsed.sections),
      
      // Configuration
      configSchema: this.extractConfigSchema(parsed.sections),
      config: {}, // Config values are set at runtime
      
      // Metadata
      loadedAt: new Date(),
      modifiedAt,
      source: 'local',
      sourceUrl: fm.repository
    };
  }

  /**
   * Extract examples from sections
   */
  private extractExamples(sections: Map<string, string>): any[] {
    const examples: any[] = [];
    const examplesSection = sections.get('examples');
    
    if (examplesSection) {
      // Simple extraction - split by ## Example N
      const exampleMatches = examplesSection.split(/##\s+Example\s+\d+/);
      for (let i = 1; i < exampleMatches.length; i++) {
        examples.push({
          title: `Example ${i}`,
          content: exampleMatches[i].trim()
        });
      }
    }
    
    return examples;
  }

  /**
   * Extract config schema from sections
   */
  private extractConfigSchema(sections: Map<string, string>): any {
    const configSection = sections.get('configuration');
    if (!configSection) return undefined;

    // Simple extraction - parse YAML-like config
    // In real implementation, this would be more sophisticated
    return {
      type: 'object',
      properties: {}
    };
  }

  /**
   * Validate skill without loading
   * 
   * @param filePath - Path to SKILL.md
   * @returns Validation result
   */
  async validateSkill(filePath: string): Promise<ValidationResult> {
    try {
      const parsed = await this.parser.parseFile(filePath);
      return this.validator.validate(parsed);
    } catch (error: any) {
      return {
        valid: false,
        errors: [{
          field: 'file',
          message: `Failed to parse: ${error.message}`,
          value: filePath
        }],
        warnings: []
      };
    }
  }
}
