/**
 * Tool Definition Validator
 * 
 * Validates ToolDefinition objects to ensure they meet all requirements.
 */

import type { ToolDefinition, PropertySchema, ValidationError } from '../types';

export interface DefinitionValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validate a tool definition
 */
export function validateToolDefinition(definition: unknown): DefinitionValidationResult {
  const errors: ValidationError[] = [];
  
  if (!definition || typeof definition !== 'object') {
    errors.push({
      path: 'definition',
      message: 'Tool definition must be an object',
      code: 'INVALID_TYPE'
    });
    return { valid: false, errors };
  }
  
  const def = definition as Partial<ToolDefinition>;
  
  // Validate name
  validateName(def.name, errors);
  
  // Validate description
  validateDescription(def.description, errors);
  
  // Validate parameters
  validateParameters(def.parameters, errors);
  
  // Validate returns (optional)
  if (def.returns !== undefined) {
    validateReturns(def.returns, errors);
  }
  
  // Validate metadata (optional)
  if (def.metadata !== undefined) {
    validateMetadata(def.metadata, errors);
  }
  
  // Validate examples (optional)
  if (def.examples !== undefined) {
    validateExamples(def.examples, def.parameters, errors);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate tool name
 */
function validateName(name: unknown, errors: ValidationError[]): void {
  if (typeof name !== 'string') {
    errors.push({
      path: 'name',
      message: 'Tool name must be a string',
      code: 'INVALID_TYPE'
    });
    return;
  }
  
  if (name.length === 0) {
    errors.push({
      path: 'name',
      message: 'Tool name cannot be empty',
      code: 'EMPTY_VALUE'
    });
    return;
  }
  
  // Only alphanumeric, dots, and underscores
  if (!/^[a-zA-Z0-9_.]+$/.test(name)) {
    errors.push({
      path: 'name',
      message: 'Tool name must contain only alphanumeric characters, dots, and underscores',
      code: 'INVALID_FORMAT'
    });
  }
  
  // Must start with a letter
  if (!/^[a-zA-Z]/.test(name)) {
    errors.push({
      path: 'name',
      message: 'Tool name must start with a letter',
      code: 'INVALID_FORMAT'
    });
  }
}

/**
 * Validate tool description
 */
function validateDescription(description: unknown, errors: ValidationError[]): void {
  if (typeof description !== 'string') {
    errors.push({
      path: 'description',
      message: 'Tool description must be a string',
      code: 'INVALID_TYPE'
    });
    return;
  }
  
  if (description.length === 0) {
    errors.push({
      path: 'description',
      message: 'Tool description cannot be empty',
      code: 'EMPTY_VALUE'
    });
    return;
  }
  
  if (description.length > 500) {
    errors.push({
      path: 'description',
      message: 'Tool description is too long (max 500 characters)',
      code: 'VALUE_TOO_LONG'
    });
  }
}

/**
 * Validate parameters schema
 */
function validateParameters(parameters: unknown, errors: ValidationError[]): void {
  if (!parameters || typeof parameters !== 'object') {
    errors.push({
      path: 'parameters',
      message: 'Parameters must be an object',
      code: 'INVALID_TYPE'
    });
    return;
  }
  
  const schema = parameters as Record<string, unknown>;
  
  // Must be object type
  if (schema.type !== 'object') {
    errors.push({
      path: 'parameters.type',
      message: 'Parameters type must be "object"',
      code: 'INVALID_VALUE'
    });
  }
  
  // Must have properties
  if (!schema.properties || typeof schema.properties !== 'object') {
    errors.push({
      path: 'parameters.properties',
      message: 'Parameters must have properties object',
      code: 'MISSING_FIELD'
    });
    return;
  }
  
  // Validate each property schema
  const properties = schema.properties as Record<string, unknown>;
  for (const [propName, propSchema] of Object.entries(properties)) {
    validatePropertySchema(propSchema, `parameters.properties.${propName}`, errors);
  }
  
  // Validate required array if present
  if (schema.required !== undefined) {
    if (!Array.isArray(schema.required)) {
      errors.push({
        path: 'parameters.required',
        message: 'Required must be an array',
        code: 'INVALID_TYPE'
      });
    } else {
      for (const req of schema.required) {
        if (typeof req !== 'string') {
          errors.push({
            path: 'parameters.required',
            message: 'Required items must be strings',
            code: 'INVALID_TYPE'
          });
        } else if (!properties[req]) {
          errors.push({
            path: 'parameters.required',
            message: `Required field "${req}" not found in properties`,
            code: 'INVALID_REFERENCE'
          });
        }
      }
    }
  }
}

/**
 * Validate a property schema
 */
function validatePropertySchema(schema: unknown, path: string, errors: ValidationError[]): void {
  if (!schema || typeof schema !== 'object') {
    errors.push({
      path,
      message: 'Property schema must be an object',
      code: 'INVALID_TYPE'
    });
    return;
  }
  
  const prop = schema as Partial<PropertySchema>;
  
  // Validate type
  const validTypes = ['string', 'number', 'integer', 'boolean', 'array', 'object', 'null'];
  if (!prop.type || !validTypes.includes(prop.type)) {
    errors.push({
      path: `${path}.type`,
      message: `Property type must be one of: ${validTypes.join(', ')}`,
      code: 'INVALID_VALUE'
    });
    return;
  }
  
  // Validate type-specific constraints
  if (prop.type === 'array' && prop.items !== undefined) {
    validatePropertySchema(prop.items, `${path}.items`, errors);
  }
  
  if (prop.type === 'object' && prop.properties !== undefined) {
    if (typeof prop.properties !== 'object') {
      errors.push({
        path: `${path}.properties`,
        message: 'Object properties must be an object',
        code: 'INVALID_TYPE'
      });
    } else {
      for (const [nestedName, nestedSchema] of Object.entries(prop.properties)) {
        validatePropertySchema(nestedSchema, `${path}.properties.${nestedName}`, errors);
      }
    }
  }
  
  // Validate numeric constraints
  if ((prop.type === 'number' || prop.type === 'integer') && prop.minimum !== undefined && prop.maximum !== undefined) {
    if (prop.minimum > prop.maximum) {
      errors.push({
        path: `${path}.minimum`,
        message: 'Minimum cannot be greater than maximum',
        code: 'INVALID_RANGE'
      });
    }
  }
  
  // Validate string constraints
  if (prop.type === 'string' && prop.minLength !== undefined && prop.maxLength !== undefined) {
    if (prop.minLength > prop.maxLength) {
      errors.push({
        path: `${path}.minLength`,
        message: 'minLength cannot be greater than maxLength',
        code: 'INVALID_RANGE'
      });
    }
  }
  
  // Validate pattern if present
  if (prop.pattern !== undefined) {
    if (typeof prop.pattern !== 'string') {
      errors.push({
        path: `${path}.pattern`,
        message: 'Pattern must be a string',
        code: 'INVALID_TYPE'
      });
    } else {
      try {
        new RegExp(prop.pattern);
      } catch {
        errors.push({
          path: `${path}.pattern`,
          message: 'Pattern is not a valid regular expression',
          code: 'INVALID_REGEX'
        });
      }
    }
  }
  
  // Validate enum if present
  if (prop.enum !== undefined) {
    if (!Array.isArray(prop.enum)) {
      errors.push({
        path: `${path}.enum`,
        message: 'Enum must be an array',
        code: 'INVALID_TYPE'
      });
    } else if (prop.enum.length === 0) {
      errors.push({
        path: `${path}.enum`,
        message: 'Enum cannot be empty',
        code: 'EMPTY_VALUE'
      });
    }
  }
}

/**
 * Validate returns specification
 */
function validateReturns(returns: unknown, errors: ValidationError[]): void {
  if (!returns || typeof returns !== 'object') {
    errors.push({
      path: 'returns',
      message: 'Returns must be an object',
      code: 'INVALID_TYPE'
    });
    return;
  }
  
  const ret = returns as Record<string, unknown>;
  
  if (typeof ret.description !== 'string' || ret.description.length === 0) {
    errors.push({
      path: 'returns.description',
      message: 'Returns description must be a non-empty string',
      code: 'INVALID_VALUE'
    });
  }
  
  // Schema is optional, but if present, validate it
  if (ret.schema !== undefined) {
    validateParameters(ret.schema, errors);
  }
}

/**
 * Validate metadata
 */
function validateMetadata(metadata: unknown, errors: ValidationError[]): void {
  if (!metadata || typeof metadata !== 'object') {
    errors.push({
      path: 'metadata',
      message: 'Metadata must be an object',
      code: 'INVALID_TYPE'
    });
    return;
  }
  
  const meta = metadata as Record<string, unknown>;
  
  // Validate category if present
  if (meta.category !== undefined && typeof meta.category !== 'string') {
    errors.push({
      path: 'metadata.category',
      message: 'Category must be a string',
      code: 'INVALID_TYPE'
    });
  }
  
  // Validate permissions if present
  if (meta.permissions !== undefined) {
    if (!Array.isArray(meta.permissions)) {
      errors.push({
        path: 'metadata.permissions',
        message: 'Permissions must be an array',
        code: 'INVALID_TYPE'
      });
    } else {
      for (const perm of meta.permissions) {
        if (typeof perm !== 'string') {
          errors.push({
            path: 'metadata.permissions',
            message: 'Permissions must be strings',
            code: 'INVALID_TYPE'
          });
        }
      }
    }
  }
  
  // Validate timeout if present
  if (meta.timeout !== undefined) {
    if (typeof meta.timeout !== 'number' || meta.timeout <= 0) {
      errors.push({
        path: 'metadata.timeout',
        message: 'Timeout must be a positive number',
        code: 'INVALID_VALUE'
      });
    }
  }
  
  // Validate rate limit if present
  if (meta.rateLimit !== undefined) {
    if (!meta.rateLimit || typeof meta.rateLimit !== 'object') {
      errors.push({
        path: 'metadata.rateLimit',
        message: 'Rate limit must be an object',
        code: 'INVALID_TYPE'
      });
    } else {
      const rl = meta.rateLimit as Record<string, unknown>;
      if (typeof rl.requests !== 'number' || rl.requests <= 0) {
        errors.push({
          path: 'metadata.rateLimit.requests',
          message: 'Rate limit requests must be a positive number',
          code: 'INVALID_VALUE'
        });
      }
      if (typeof rl.windowMs !== 'number' || rl.windowMs <= 0) {
        errors.push({
          path: 'metadata.rateLimit.windowMs',
          message: 'Rate limit windowMs must be a positive number',
          code: 'INVALID_VALUE'
        });
      }
    }
  }
  
  // Validate boolean flags
  for (const flag of ['dangerous', 'cacheable', 'streaming']) {
    if (meta[flag] !== undefined && typeof meta[flag] !== 'boolean') {
      errors.push({
        path: `metadata.${flag}`,
        message: `${flag} must be a boolean`,
        code: 'INVALID_TYPE'
      });
    }
  }
}

/**
 * Validate examples
 */
function validateExamples(
  examples: unknown,
  parametersSchema: unknown,
  errors: ValidationError[]
): void {
  if (!Array.isArray(examples)) {
    errors.push({
      path: 'examples',
      message: 'Examples must be an array',
      code: 'INVALID_TYPE'
    });
    return;
  }
  
  for (let i = 0; i < examples.length; i++) {
    const example = examples[i];
    
    if (!example || typeof example !== 'object') {
      errors.push({
        path: `examples[${i}]`,
        message: 'Example must be an object',
        code: 'INVALID_TYPE'
      });
      continue;
    }
    
    const ex = example as Record<string, unknown>;
    
    // Validate input
    if (!ex.input || typeof ex.input !== 'object') {
      errors.push({
        path: `examples[${i}].input`,
        message: 'Example input must be an object',
        code: 'INVALID_TYPE'
      });
    }
    
    // Validate output
    if (typeof ex.output !== 'string') {
      errors.push({
        path: `examples[${i}].output`,
        message: 'Example output must be a string',
        code: 'INVALID_TYPE'
      });
    }
    
    // Validate description if present
    if (ex.description !== undefined && typeof ex.description !== 'string') {
      errors.push({
        path: `examples[${i}].description`,
        message: 'Example description must be a string',
        code: 'INVALID_TYPE'
      });
    }
  }
}
