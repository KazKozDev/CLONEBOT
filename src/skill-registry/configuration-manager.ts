/**
 * Configuration Manager - Step 12
 * 
 * Manages skill configurations with schema validation
 */

import { EventEmitter } from 'events';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import type { Skill, ConfigSchema, ConfigParam } from './types.js';

export interface ConfigurationManagerConfig {
  /**
   * Directory to store configuration files
   * @default './skill-configs'
   */
  configDir?: string;

  /**
   * Whether to create config directory if it doesn't exist
   * @default true
   */
  autoCreate?: boolean;

  /**
   * Whether to validate configs against schema
   * @default true
   */
  validateSchema?: boolean;

  /**
   * Whether to auto-save on changes
   * @default true
   */
  autoSave?: boolean;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

export interface SkillConfig {
  skillName: string;
  version: string;
  config: Record<string, any>;
  updatedAt: Date;
}

/**
 * Manages skill configurations with schema validation
 */
export class ConfigurationManager extends EventEmitter {
  private config: Required<ConfigurationManagerConfig>;
  private configurations: Map<string, SkillConfig> = new Map();
  private schemas: Map<string, ConfigSchema> = new Map();

  constructor(config: ConfigurationManagerConfig = {}) {
    super();
    
    this.config = {
      configDir: config.configDir ?? './skill-configs',
      autoCreate: config.autoCreate ?? true,
      validateSchema: config.validateSchema ?? true,
      autoSave: config.autoSave ?? true
    };
  }

  /**
   * Initialize configuration manager
   */
  async initialize(): Promise<void> {
    // Create config directory if needed
    if (this.config.autoCreate && !existsSync(this.config.configDir)) {
      await mkdir(this.config.configDir, { recursive: true });
      this.emit('dir.created', { dir: this.config.configDir });
    }

    // Load existing configurations
    await this.loadAllConfigs();
    
    this.emit('initialized', { 
      configDir: this.config.configDir,
      loaded: this.configurations.size 
    });
  }

  /**
   * Register a skill's configuration schema
   */
  registerSchema(skillName: string, schema: ConfigSchema): void {
    this.schemas.set(skillName, schema);
    this.emit('schema.registered', { skillName, schema });
  }

  /**
   * Register schemas from multiple skills
   */
  registerSkills(skills: Skill[]): void {
    for (const skill of skills) {
      if (skill.configSchema) {
        this.registerSchema(skill.name, skill.configSchema);
      }
    }
    this.emit('skills.registered', { count: skills.length });
  }

  /**
   * Get configuration for a skill
   */
  getConfig(skillName: string): Record<string, any> | undefined {
    const config = this.configurations.get(skillName);
    return config ? { ...config.config } : undefined;
  }

  /**
   * Set configuration for a skill
   */
  async setConfig(
    skillName: string,
    config: Record<string, any>,
    version?: string
  ): Promise<ConfigValidationResult> {
    // Validate against schema if available
    if (this.config.validateSchema) {
      const schema = this.schemas.get(skillName);
      if (schema) {
        const validation = this.validateConfig(config, schema);
        if (!validation.valid) {
          this.emit('validation.failed', { skillName, validation });
          return validation;
        }
      }
    }

    // Store configuration
    const skillConfig: SkillConfig = {
      skillName,
      version: version ?? '1.0.0',
      config: { ...config },
      updatedAt: new Date()
    };

    this.configurations.set(skillName, skillConfig);
    this.emit('config.updated', { skillName, config });

    // Auto-save if enabled
    if (this.config.autoSave) {
      await this.saveConfig(skillName);
    }

    return {
      valid: true,
      errors: [],
      warnings: []
    };
  }

  /**
   * Update partial configuration for a skill
   */
  async updateConfig(
    skillName: string,
    updates: Record<string, any>
  ): Promise<ConfigValidationResult> {
    const existing = this.getConfig(skillName) || {};
    const merged = { ...existing, ...updates };
    
    return this.setConfig(skillName, merged);
  }

  /**
   * Delete configuration for a skill
   */
  async deleteConfig(skillName: string): Promise<void> {
    this.configurations.delete(skillName);
    
    // Delete file
    const filePath = this.getConfigPath(skillName);
    if (existsSync(filePath)) {
      const { unlink } = await import('fs/promises');
      await unlink(filePath);
    }

    this.emit('config.deleted', { skillName });
  }

  /**
   * Validate configuration against schema
   */
  validateConfig(config: Record<string, any>, schema: ConfigSchema): ConfigValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // Validate each property
    for (const [paramName, paramSchema] of Object.entries(schema)) {
      const value = config[paramName];

      // Check required fields
      if (paramSchema.required && value === undefined) {
        errors.push({
          field: paramName,
          message: 'Required field is missing'
        });
        continue;
      }

      // Skip validation if value is undefined and not required
      if (value === undefined) {
        continue;
      }

      // Validate property
      const propErrors = this.validateProperty(paramName, value, paramSchema);
      errors.push(...propErrors);
    }

    // Check for unknown properties
    for (const propName of Object.keys(config)) {
      if (!schema[propName]) {
        warnings.push(`Unknown property: ${propName}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate a single property
   */
  private validateProperty(
    name: string,
    value: any,
    schema: ConfigParam
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // Type validation
    if (schema.type && typeof value !== schema.type) {
      errors.push({
        field: name,
        message: `Expected type ${schema.type}, got ${typeof value}`,
        value
      });
      return errors;
    }

    // Enum validation
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push({
        field: name,
        message: `Value must be one of: ${schema.enum.join(', ')}`,
        value
      });
    }

    // Number validations
    if (schema.type === 'number') {
      if (schema.minimum !== undefined && value < schema.minimum) {
        errors.push({
          field: name,
          message: `Value must be >= ${schema.minimum}`,
          value
        });
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        errors.push({
          field: name,
          message: `Value must be <= ${schema.maximum}`,
          value
        });
      }
    }

    return errors;
  }

  /**
   * Save configuration to file
   */
  async saveConfig(skillName: string): Promise<void> {
    const config = this.configurations.get(skillName);
    if (!config) {
      throw new Error(`No configuration found for skill: ${skillName}`);
    }

    const filePath = this.getConfigPath(skillName);
    const dirPath = dirname(filePath);

    // Ensure directory exists
    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true });
    }

    // Write configuration
    const json = JSON.stringify(config, null, 2);
    await writeFile(filePath, json, 'utf-8');

    this.emit('config.saved', { skillName, path: filePath });
  }

  /**
   * Save all configurations
   */
  async saveAll(): Promise<{ saved: number; errors: string[] }> {
    const results = {
      saved: 0,
      errors: [] as string[]
    };

    for (const skillName of this.configurations.keys()) {
      try {
        await this.saveConfig(skillName);
        results.saved++;
      } catch (error) {
        const err = error as Error;
        results.errors.push(`${skillName}: ${err.message}`);
      }
    }

    this.emit('configs.saved', results);
    return results;
  }

  /**
   * Load configuration from file
   */
  async loadConfig(skillName: string): Promise<SkillConfig | null> {
    const filePath = this.getConfigPath(skillName);
    
    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const content = await readFile(filePath, 'utf-8');
      const config = JSON.parse(content) as SkillConfig;
      
      // Convert date string back to Date
      config.updatedAt = new Date(config.updatedAt);
      
      this.configurations.set(skillName, config);
      this.emit('config.loaded', { skillName });
      
      return config;
    } catch (error) {
      const err = error as Error;
      this.emit('config.load.error', { skillName, error: err.message });
      return null;
    }
  }

  /**
   * Load all configurations from directory
   */
  async loadAllConfigs(): Promise<{ loaded: number; errors: string[] }> {
    const results = {
      loaded: 0,
      errors: [] as string[]
    };

    if (!existsSync(this.config.configDir)) {
      return results;
    }

    try {
      const { readdir } = await import('fs/promises');
      const files = await readdir(this.config.configDir);

      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }

        const skillName = file.replace('.json', '');
        try {
          await this.loadConfig(skillName);
          results.loaded++;
        } catch (error) {
          const err = error as Error;
          results.errors.push(`${skillName}: ${err.message}`);
        }
      }
    } catch (error) {
      const err = error as Error;
      results.errors.push(`Directory read error: ${err.message}`);
    }

    return results;
  }

  /**
   * Get configuration file path
   */
  private getConfigPath(skillName: string): string {
    return join(this.config.configDir, `${skillName}.json`);
  }

  /**
   * Get all configurations
   */
  getAllConfigs(): Map<string, SkillConfig> {
    return new Map(this.configurations);
  }

  /**
   * Check if skill has configuration
   */
  hasConfig(skillName: string): boolean {
    return this.configurations.has(skillName);
  }

  /**
   * Get configuration with defaults from schema
   */
  getConfigWithDefaults(skillName: string): Record<string, any> {
    const schema = this.schemas.get(skillName);
    const config = this.getConfig(skillName) || {};

    if (!schema) {
      return config;
    }

    // Merge with defaults from schema
    const withDefaults: Record<string, any> = {};
    
    for (const [paramName, paramSchema] of Object.entries(schema)) {
      if (config[paramName] !== undefined) {
        withDefaults[paramName] = config[paramName];
      } else if (paramSchema.default !== undefined) {
        withDefaults[paramName] = paramSchema.default;
      }
    }

    return withDefaults;
  }

  /**
   * Reset configuration to defaults
   */
  async resetToDefaults(skillName: string): Promise<void> {
    const schema = this.schemas.get(skillName);
    if (!schema) {
      throw new Error(`No schema registered for skill: ${skillName}`);
    }

    const defaults: Record<string, any> = {};
    
    for (const [paramName, paramSchema] of Object.entries(schema)) {
      if (paramSchema.default !== undefined) {
        defaults[paramName] = paramSchema.default;
      }
    }

    await this.setConfig(skillName, defaults);
    this.emit('config.reset', { skillName });
  }

  /**
   * Clear all configurations from memory
   */
  clear(): void {
    this.configurations.clear();
    this.emit('configs.cleared');
  }

  /**
   * Get statistics
   */
  getStats(): {
    total: number;
    withSchema: number;
    withoutSchema: number;
  } {
    const skillNames = Array.from(this.configurations.keys());
    const withSchema = skillNames.filter(name => this.schemas.has(name)).length;
    
    return {
      total: this.configurations.size,
      withSchema,
      withoutSchema: this.configurations.size - withSchema
    };
  }
}
