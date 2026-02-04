/**
 * Error Handling - Step 15
 * 
 * Comprehensive error types for Skill Registry
 */

/**
 * Base error class for all Skill Registry errors
 */
export class SkillRegistryError extends Error {
  public code: string;
  public readonly context?: Record<string, any>;
  public readonly timestamp: Date;

  constructor(message: string, code: string, context?: Record<string, any>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
    this.timestamp = new Date();

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

// ============================================================================
// Parsing Errors
// ============================================================================

export class SkillParseError extends SkillRegistryError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'SKILL_PARSE_ERROR', context);
  }
}

export class YAMLParseError extends SkillParseError {
  constructor(message: string, line?: number) {
    super(message, { line });
    this.code = 'YAML_PARSE_ERROR';
  }
}

export class MarkdownParseError extends SkillParseError {
  constructor(message: string, section?: string) {
    super(message, { section });
    this.code = 'MARKDOWN_PARSE_ERROR';
  }
}

// ============================================================================
// Validation Errors
// ============================================================================

export class SkillValidationError extends SkillRegistryError {
  public readonly validationErrors: Array<{ field: string; message: string }>;

  constructor(
    message: string,
    validationErrors: Array<{ field: string; message: string }>,
    context?: Record<string, any>
  ) {
    super(message, 'SKILL_VALIDATION_ERROR', context);
    this.validationErrors = validationErrors;
  }
}

export class RequiredFieldError extends SkillValidationError {
  constructor(fieldName: string, context?: Record<string, any>) {
    super(
      `Required field missing: ${fieldName}`,
      [{ field: fieldName, message: 'Required field is missing' }],
      context
    );
    this.code = 'REQUIRED_FIELD_ERROR';
  }
}

export class InvalidFieldError extends SkillValidationError {
  constructor(
    fieldName: string,
    expectedType: string,
    actualValue: any,
    context?: Record<string, any>
  ) {
    super(
      `Invalid field: ${fieldName}`,
      [{
        field: fieldName,
        message: `Expected ${expectedType}, got ${typeof actualValue}`
      }],
      { ...context, expectedType, actualValue }
    );
    this.code = 'INVALID_FIELD_ERROR';
  }
}

export class SchemaValidationError extends SkillValidationError {
  constructor(
    skillName: string,
    errors: Array<{ field: string; message: string }>,
    context?: Record<string, any>
  ) {
    super(
      `Schema validation failed for skill: ${skillName}`,
      errors,
      { ...context, skillName }
    );
    this.code = 'SCHEMA_VALIDATION_ERROR';
  }
}

// ============================================================================
// Loading Errors
// ============================================================================

export class SkillLoadError extends SkillRegistryError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'SKILL_LOAD_ERROR', context);
  }
}

export class FileNotFoundError extends SkillLoadError {
  constructor(filePath: string) {
    super(`Skill file not found: ${filePath}`, { filePath });
    this.code = 'FILE_NOT_FOUND_ERROR';
  }
}

export class FileReadError extends SkillLoadError {
  constructor(filePath: string, originalError: Error) {
    super(
      `Failed to read skill file: ${filePath}`,
      { filePath, originalError: originalError.message }
    );
    this.code = 'FILE_READ_ERROR';
  }
}

export class DirectoryScanError extends SkillLoadError {
  constructor(directory: string, originalError: Error) {
    super(
      `Failed to scan directory: ${directory}`,
      { directory, originalError: originalError.message }
    );
    this.code = 'DIRECTORY_SCAN_ERROR';
  }
}

// ============================================================================
// Store Errors
// ============================================================================

export class SkillStoreError extends SkillRegistryError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'SKILL_STORE_ERROR', context);
  }
}

export class SkillNotFoundError extends SkillStoreError {
  constructor(skillName: string) {
    super(`Skill not found: ${skillName}`, { skillName });
    this.code = 'SKILL_NOT_FOUND_ERROR';
  }
}

export class SkillAlreadyExistsError extends SkillStoreError {
  constructor(skillName: string) {
    super(`Skill already exists: ${skillName}`, { skillName });
    this.code = 'SKILL_ALREADY_EXISTS_ERROR';
  }
}

export class DuplicateSkillError extends SkillStoreError {
  constructor(skillName: string, existingVersion: string, newVersion: string) {
    super(
      `Duplicate skill found: ${skillName}`,
      { skillName, existingVersion, newVersion }
    );
    this.code = 'DUPLICATE_SKILL_ERROR';
  }
}

// ============================================================================
// Dependency Errors
// ============================================================================

export class DependencyError extends SkillRegistryError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'DEPENDENCY_ERROR', context);
  }
}

export class MissingDependencyError extends DependencyError {
  constructor(skillName: string, missingDep: string) {
    super(
      `Missing dependency: ${skillName} requires ${missingDep}`,
      { skillName, missingDep }
    );
    this.code = 'MISSING_DEPENDENCY_ERROR';
  }
}

export class CircularDependencyError extends DependencyError {
  constructor(cycle: string[]) {
    super(
      `Circular dependency detected: ${cycle.join(' -> ')}`,
      { cycle }
    );
    this.code = 'CIRCULAR_DEPENDENCY_ERROR';
  }
}

export class ConflictError extends DependencyError {
  constructor(skill1: string, skill2: string, reason?: string) {
    super(
      `Conflict: ${skill1} conflicts with ${skill2}${reason ? ': ' + reason : ''}`,
      { skill1, skill2, reason }
    );
    this.code = 'CONFLICT_ERROR';
  }
}

export class VersionConflictError extends DependencyError {
  constructor(
    skillName: string,
    requiredVersion: string,
    actualVersion: string
  ) {
    super(
      `Version conflict: ${skillName} requires version ${requiredVersion}, found ${actualVersion}`,
      { skillName, requiredVersion, actualVersion }
    );
    this.code = 'VERSION_CONFLICT_ERROR';
  }
}

// ============================================================================
// Activation Errors
// ============================================================================

export class ActivationError extends SkillRegistryError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'ACTIVATION_ERROR', context);
  }
}

export class SkillNotActivatedError extends ActivationError {
  constructor(skillName: string, sessionId: string) {
    super(
      `Skill not activated: ${skillName} in session ${sessionId}`,
      { skillName, sessionId }
    );
    this.code = 'SKILL_NOT_ACTIVATED_ERROR';
  }
}

export class MaxActivationsExceededError extends ActivationError {
  constructor(sessionId: string, maxActivations: number) {
    super(
      `Maximum activations exceeded in session: ${sessionId}`,
      { sessionId, maxActivations }
    );
    this.code = 'MAX_ACTIVATIONS_EXCEEDED_ERROR';
  }
}

export class DependencyActivationError extends ActivationError {
  constructor(skillName: string, dependencyName: string) {
    super(
      `Cannot activate ${skillName}: dependency ${dependencyName} is not activated`,
      { skillName, dependencyName }
    );
    this.code = 'DEPENDENCY_ACTIVATION_ERROR';
  }
}

// ============================================================================
// Configuration Errors
// ============================================================================

export class ConfigurationError extends SkillRegistryError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'CONFIGURATION_ERROR', context);
  }
}

export class InvalidConfigError extends ConfigurationError {
  constructor(skillName: string, errors: Array<{ field: string; message: string }>) {
    super(
      `Invalid configuration for skill: ${skillName}`,
      { skillName, errors }
    );
    this.code = 'INVALID_CONFIG_ERROR';
  }
}

export class ConfigSchemaError extends ConfigurationError {
  constructor(skillName: string, schemaError: string) {
    super(
      `Configuration schema error for skill: ${skillName}`,
      { skillName, schemaError }
    );
    this.code = 'CONFIG_SCHEMA_ERROR';
  }
}

export class ConfigFileError extends ConfigurationError {
  constructor(filePath: string, operation: string, originalError: Error) {
    super(
      `Configuration file ${operation} failed: ${filePath}`,
      { filePath, operation, originalError: originalError.message }
    );
    this.code = 'CONFIG_FILE_ERROR';
  }
}

// ============================================================================
// File Watcher Errors
// ============================================================================

export class FileWatcherError extends SkillRegistryError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'FILE_WATCHER_ERROR', context);
  }
}

export class WatcherStartError extends FileWatcherError {
  constructor(directory: string, originalError: Error) {
    super(
      `Failed to start watcher for directory: ${directory}`,
      { directory, originalError: originalError.message }
    );
    this.code = 'WATCHER_START_ERROR';
  }
}

export class WatcherAlreadyRunningError extends FileWatcherError {
  constructor() {
    super('File watcher is already running');
    this.code = 'WATCHER_ALREADY_RUNNING_ERROR';
  }
}

// ============================================================================
// Integration Errors
// ============================================================================

export class IntegrationError extends SkillRegistryError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'INTEGRATION_ERROR', context);
  }
}

export class ContextInjectionError extends IntegrationError {
  constructor(sessionId: string, reason: string) {
    super(
      `Failed to inject skills into context for session: ${sessionId}`,
      { sessionId, reason }
    );
    this.code = 'CONTEXT_INJECTION_ERROR';
  }
}

export class TriggerMatchError extends IntegrationError {
  constructor(message: string, originalError: Error) {
    super(
      `Trigger matching failed: ${message}`,
      { originalError: originalError.message }
    );
    this.code = 'TRIGGER_MATCH_ERROR';
  }
}

// ============================================================================
// Remote/ClawHub Errors
// ============================================================================

export class RemoteError extends SkillRegistryError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'REMOTE_ERROR', context);
  }
}

export class ClawHubConnectionError extends RemoteError {
  constructor(url: string, originalError: Error) {
    super(
      `Failed to connect to ClawHub: ${url}`,
      { url, originalError: originalError.message }
    );
    this.code = 'CLAWHUB_CONNECTION_ERROR';
  }
}

export class SkillDownloadError extends RemoteError {
  constructor(skillName: string, source: string, originalError: Error) {
    super(
      `Failed to download skill: ${skillName} from ${source}`,
      { skillName, source, originalError: originalError.message }
    );
    this.code = 'SKILL_DOWNLOAD_ERROR';
  }
}

export class SkillInstallError extends RemoteError {
  constructor(skillName: string, reason: string) {
    super(
      `Failed to install skill: ${skillName}`,
      { skillName, reason }
    );
    this.code = 'SKILL_INSTALL_ERROR';
  }
}

// ============================================================================
// Error Utilities
// ============================================================================

/**
 * Check if error is a SkillRegistryError
 */
export function isSkillRegistryError(error: unknown): error is SkillRegistryError {
  return error instanceof SkillRegistryError;
}

/**
 * Convert any error to SkillRegistryError
 */
export function toSkillRegistryError(error: unknown, defaultMessage = 'Unknown error'): SkillRegistryError {
  if (isSkillRegistryError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new SkillRegistryError(error.message, 'UNKNOWN_ERROR', {
      originalError: error.message,
      stack: error.stack
    });
  }

  return new SkillRegistryError(
    defaultMessage,
    'UNKNOWN_ERROR',
    { originalError: String(error) }
  );
}

/**
 * Safe error handler that always returns a SkillRegistryError
 */
export function handleError(error: unknown, context?: Record<string, any>): SkillRegistryError {
  const skillError = toSkillRegistryError(error);
  
  if (context) {
    return new SkillRegistryError(
      skillError.message,
      skillError.code,
      { ...skillError.context, ...context }
    );
  }

  return skillError;
}

/**
 * Create an error handler function
 */
export function createErrorHandler(defaultContext?: Record<string, any>) {
  return (error: unknown, additionalContext?: Record<string, any>) => {
    return handleError(error, { ...defaultContext, ...additionalContext });
  };
}
