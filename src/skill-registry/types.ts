/**
 * Skill Registry Types
 * 
 * Type definitions for the Skill Registry system
 */

// ============================================================================
// Core Skill Types
// ============================================================================

export type SkillLevel = 'workspace' | 'user' | 'bundled';

export interface Skill {
  // Identity
  name: string;
  version: string;
  description: string;
  
  // Metadata
  author?: string;
  license?: string;
  tags: string[];
  category?: string;
  homepage?: string;
  repository?: string;
  
  // Location
  level: SkillLevel;
  path: string;
  
  // State
  enabled: boolean;
  priority: number;
  
  // Activation
  triggers: string[];
  autoActivate: boolean;
  
  // Dependencies
  requires: string[];
  dependencies: string[];
  conflicts: string[];
  
  // Content
  instructions: string;
  tools: ToolDefinition[];
  examples: Example[];
  
  // Configuration
  configSchema?: ConfigSchema;
  config: Record<string, any>;
  
  // Metadata
  loadedAt: Date;
  modifiedAt?: Date;
  source: 'local' | 'clawhub' | 'git';
  sourceUrl?: string;
}

export interface SkillInfo {
  name: string;
  version: string;
  description: string;
  author?: string;
  tags: string[];
  category?: string;
  enabled: boolean;
  priority: number;
  level: SkillLevel;
  path: string;
  toolCount: number;
  exampleCount: number;
}

// ============================================================================
// Parsed Skill
// ============================================================================

export interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  body: string;
  sections: Map<string, string>;
}

export interface SkillFrontmatter {
  // Required
  name: string;
  version: string;
  description: string;
  
  // Optional - Metadata
  author?: string;
  license?: string;
  homepage?: string;
  repository?: string;
  tags?: string[];
  category?: string;
  
  // Optional - Behavior
  enabled?: boolean;
  priority?: number;
  
  // Optional - Triggers
  triggers?: string[];
  autoActivate?: boolean;
  
  // Optional - Dependencies
  requires?: string[];
  dependencies?: string[];
  conflicts?: string[];
  
  // Optional - Tools
  tools?: string[];
  toolsPath?: string;
  
  // Optional - Configuration
  config?: ConfigSchema;
}

// ============================================================================
// Tool Definition
// ============================================================================

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
  handler: string; // "builtin:name" | "module:path" | "script:path"
  metadata?: {
    category?: string;
    dangerous?: boolean;
    permissions?: string[];
  };
}

export interface JSONSchema {
  type: string;
  properties?: Record<string, PropertySchema>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface PropertySchema {
  type: string;
  description?: string;
  enum?: any[];
  default?: any;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: PropertySchema;
}

// ============================================================================
// Examples
// ============================================================================

export interface Example {
  title: string;
  user: string;
  assistant: string;
  context?: Record<string, any>;
}

// ============================================================================
// Configuration
// ============================================================================

export interface ConfigSchema {
  [paramName: string]: ConfigParam;
}

export interface ConfigParam {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  default?: any;
  description?: string;
  required?: boolean;
  enum?: any[];
  minimum?: number;
  maximum?: number;
}

export interface SkillConfig {
  [key: string]: any;
}

// ============================================================================
// Discovery & Loading
// ============================================================================

export interface DiscoveredSkill {
  path: string;
  level: SkillLevel;
  skillPath: string; // path to SKILL.md
  modifiedAt: Date;
}

export interface SkillLocation {
  type: SkillLevel;
  path: string;
  enabled: boolean;
  priority: number;
}

export interface FileInfo {
  path: string;
  relativePath: string;
  directory: string;
  name: string;
}

export interface ScanError {
  path: string;
  error: string;
  code?: string;
}

export interface ScanResult {
  directory: string;
  files: FileInfo[];
  errors: ScanError[];
  stats: {
    totalFiles: number;
    directories: number;
    skipped: number;
    errors: number;
  };
}

// ============================================================================
// Validation
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export interface ValidationWarning {
  field: string;
  message: string;
}

// ============================================================================
// Precedence
// ============================================================================

export interface Override {
  skillName: string;
  winner: {
    level: SkillLevel;
    path: string;
    version: string;
  };
  loser: {
    level: SkillLevel;
    path: string;
    version: string;
  };
}

// ============================================================================
// Dependencies
// ============================================================================

export interface DependencyResult {
  loadOrder: string[];
  satisfied: string[];
  unsatisfied: UnsatisfiedDependency[];
  conflicts: Conflict[];
}

export interface UnsatisfiedDependency {
  skill: string;
  type: 'module' | 'skill';
  missing: string;
}

export interface Conflict {
  skill1: string;
  skill2: string;
  reason: string;
}

// ============================================================================
// Activation
// ============================================================================

export interface ActivationContext {
  agentId?: string;
  sessionId: string;
  userMessage?: string;
  explicit?: string[]; // explicitly requested skills
}

// ============================================================================
// Query
// ============================================================================

export interface ListOptions {
  enabled?: boolean;
  category?: string;
  tags?: string[];
  search?: string;
  level?: SkillLevel;
  hasTools?: boolean;
  author?: string;
}

export interface QueryOptions extends ListOptions {
  sortBy?: 'name' | 'priority' | 'downloads' | 'loadedAt';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface QueryResult {
  skills: SkillInfo[];
  total: number;
  hasMore: boolean;
}

// ============================================================================
// ClawHub
// ============================================================================

export interface ClawHubSearchResult {
  slug: string;
  name: string;
  description: string;
  author: string;
  downloads: number;
  rating: number;
  tags: string[];
  version: string;
  updatedAt: Date;
}

export interface ClawHubSkillInfo {
  slug: string;
  name: string;
  description: string;
  author: string;
  license: string;
  homepage?: string;
  repository?: string;
  tags: string[];
  category?: string;
  versions: ClawHubVersion[];
  downloads: number;
  rating: number;
  readme: string;
}

export interface ClawHubVersion {
  version: string;
  publishedAt: Date;
  changelog?: string;
  downloadUrl: string;
}

export interface ClawHubSearchOptions {
  tags?: string[];
  category?: string;
  author?: string;
  sortBy?: 'downloads' | 'rating' | 'updated';
  limit?: number;
}

// ============================================================================
// Installation
// ============================================================================

export type SkillSource = 
  | { type: 'clawhub'; slug: string; version?: string }
  | { type: 'git'; url: string; ref?: string }
  | { type: 'path'; path: string };

export interface InstallOptions {
  force?: boolean; // overwrite existing
  version?: string;
  installDependencies?: boolean;
}

// ============================================================================
// Events
// ============================================================================

export type SkillEvent = 
  | 'loaded'
  | 'unloaded'
  | 'reloaded'
  | 'error'
  | 'activated'
  | 'deactivated';

export interface SkillEventPayload {
  skill: string;
  level?: SkillLevel;
  error?: Error;
  context?: ActivationContext;
}

// ============================================================================
// Configuration
// ============================================================================

export interface SkillRegistryConfig {
  // Directories
  directories?: {
    workspace?: string | null;
    user?: string;
    bundled?: string;
  };
  
  // Loading
  loading?: {
    validateOnLoad?: boolean;
    loadTools?: boolean;
    loadExamples?: boolean;
  };
  
  // Hot reload
  hotReload?: {
    enabled?: boolean;
    watchDirectories?: string[];
    debounceMs?: number;
  };
  
  // Activation
  activation?: {
    maxActiveSkills?: number;
    enableTriggerMatching?: boolean;
    enableSemanticMatching?: boolean;
  };
  
  // ClawHub
  clawhub?: {
    enabled?: boolean;
    baseUrl?: string;
    timeout?: number;
  };
  
  // Cache
  cache?: {
    enabled?: boolean;
    ttl?: number;
  };
}

// ============================================================================
// Watcher
// ============================================================================

export interface FileChange {
  type: 'add' | 'modify' | 'delete';
  path: string;
}

// ============================================================================
// Errors
// ============================================================================

export class SkillRegistryError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'SkillRegistryError';
  }
}

export class ClawHubConnectionError extends Error {
  constructor(message: string, cause?: any) {
    super(message);
    this.name = 'ClawHubConnectionError';
  }
}

export class SkillDownloadError extends Error {
  constructor(message: string, cause?: any) {
    super(message);
    this.name = 'SkillDownloadError';
  }
}
