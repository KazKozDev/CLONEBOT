/**
 * JSON Schema Validator
 * 
 * Validates parameters against JSON Schema with type coercion and defaults.
 */

import type { JSONSchema, PropertySchema, ValidationResult, ValidationError } from '../types';

/**
 * Validate and coerce parameters according to JSON Schema
 */
export function validateParameters(
  params: unknown,
  schema: JSONSchema
): ValidationResult {
  const errors: ValidationError[] = [];
  
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    errors.push({
      path: 'params',
      message: 'Parameters must be an object',
      code: 'INVALID_TYPE'
    });
    return { valid: false, errors };
  }
  
  const inputParams = params as Record<string, unknown>;
  const coerced: Record<string, unknown> = {};
  
  // Check required fields
  if (schema.required) {
    for (const required of schema.required) {
      if (!(required in inputParams)) {
        errors.push({
          path: required,
          message: `Missing required parameter: ${required}`,
          code: 'REQUIRED_FIELD'
        });
      }
    }
  }
  
  // Validate and coerce each property
  for (const [key, propSchema] of Object.entries(schema.properties)) {
    const value = inputParams[key];
    
    // Apply default if value is missing
    if (value === undefined) {
      if ('default' in propSchema) {
        coerced[key] = propSchema.default;
      }
      continue;
    }
    
    // Validate and coerce the value
    const result = validateValue(value, propSchema, key);
    
    if (!result.valid) {
      errors.push(...result.errors);
    } else {
      coerced[key] = result.value;
    }
  }
  
  // Check for additional properties
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(inputParams)) {
      if (!(key in schema.properties)) {
        errors.push({
          path: key,
          message: `Additional property not allowed: ${key}`,
          code: 'ADDITIONAL_PROPERTY'
        });
      }
    }
  } else {
    // Include additional properties in coerced
    for (const key of Object.keys(inputParams)) {
      if (!(key in coerced)) {
        coerced[key] = inputParams[key];
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
    coerced
  };
}

/**
 * Validate and coerce a single value
 */
function validateValue(
  value: unknown,
  schema: PropertySchema,
  path: string
): { valid: boolean; errors: ValidationError[]; value?: unknown } {
  const errors: ValidationError[] = [];
  
  // Handle null
  if (value === null) {
    if (schema.nullable || schema.type === 'null') {
      return { valid: true, errors: [], value: null };
    }
    errors.push({
      path,
      message: 'Value cannot be null',
      code: 'NULL_NOT_ALLOWED'
    });
    return { valid: false, errors };
  }
  
  // Validate based on type
  switch (schema.type) {
    case 'string':
      return validateString(value, schema, path);
    
    case 'number':
    case 'integer':
      return validateNumber(value, schema, path);
    
    case 'boolean':
      return validateBoolean(value, schema, path);
    
    case 'array':
      return validateArray(value, schema, path);
    
    case 'object':
      return validateObject(value, schema, path);
    
    case 'null':
      if (value === null) {
        return { valid: true, errors: [], value: null };
      }
      errors.push({
        path,
        message: 'Value must be null',
        code: 'INVALID_TYPE'
      });
      return { valid: false, errors };
    
    default:
      errors.push({
        path,
        message: `Unknown type: ${schema.type}`,
        code: 'UNKNOWN_TYPE'
      });
      return { valid: false, errors };
  }
}

/**
 * Validate string value
 */
function validateString(
  value: unknown,
  schema: PropertySchema,
  path: string
): { valid: boolean; errors: ValidationError[]; value?: unknown } {
  const errors: ValidationError[] = [];
  
  // Type coercion
  let str: string;
  if (typeof value === 'string') {
    str = value;
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    str = String(value);
  } else {
    errors.push({
      path,
      message: 'Value must be a string',
      code: 'INVALID_TYPE'
    });
    return { valid: false, errors };
  }
  
  // Check enum
  if (schema.enum) {
    if (!schema.enum.includes(str)) {
      errors.push({
        path,
        message: `Value must be one of: ${schema.enum.join(', ')}`,
        code: 'ENUM_MISMATCH'
      });
      return { valid: false, errors };
    }
  }
  
  // Check length
  if (schema.minLength !== undefined && str.length < schema.minLength) {
    errors.push({
      path,
      message: `String length must be at least ${schema.minLength}`,
      code: 'TOO_SHORT'
    });
  }
  
  if (schema.maxLength !== undefined && str.length > schema.maxLength) {
    errors.push({
      path,
      message: `String length must be at most ${schema.maxLength}`,
      code: 'TOO_LONG'
    });
  }
  
  // Check pattern
  if (schema.pattern) {
    const regex = new RegExp(schema.pattern);
    if (!regex.test(str)) {
      errors.push({
        path,
        message: `String does not match pattern: ${schema.pattern}`,
        code: 'PATTERN_MISMATCH'
      });
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    value: str
  };
}

/**
 * Validate number value
 */
function validateNumber(
  value: unknown,
  schema: PropertySchema,
  path: string
): { valid: boolean; errors: ValidationError[]; value?: unknown } {
  const errors: ValidationError[] = [];
  
  // Type coercion
  let num: number;
  if (typeof value === 'number') {
    num = value;
  } else if (typeof value === 'string') {
    num = Number(value);
    if (isNaN(num)) {
      errors.push({
        path,
        message: 'Value must be a valid number',
        code: 'INVALID_TYPE'
      });
      return { valid: false, errors };
    }
  } else {
    errors.push({
      path,
      message: 'Value must be a number',
      code: 'INVALID_TYPE'
    });
    return { valid: false, errors };
  }
  
  // Check integer
  if (schema.type === 'integer' && !Number.isInteger(num)) {
    errors.push({
      path,
      message: 'Value must be an integer',
      code: 'NOT_INTEGER'
    });
  }
  
  // Check enum
  if (schema.enum) {
    if (!schema.enum.includes(num)) {
      errors.push({
        path,
        message: `Value must be one of: ${schema.enum.join(', ')}`,
        code: 'ENUM_MISMATCH'
      });
      return { valid: false, errors };
    }
  }
  
  // Check range
  if (schema.minimum !== undefined && num < schema.minimum) {
    errors.push({
      path,
      message: `Value must be at least ${schema.minimum}`,
      code: 'TOO_SMALL'
    });
  }
  
  if (schema.maximum !== undefined && num > schema.maximum) {
    errors.push({
      path,
      message: `Value must be at most ${schema.maximum}`,
      code: 'TOO_LARGE'
    });
  }
  
  return {
    valid: errors.length === 0,
    errors,
    value: num
  };
}

/**
 * Validate boolean value
 */
function validateBoolean(
  value: unknown,
  schema: PropertySchema,
  path: string
): { valid: boolean; errors: ValidationError[]; value?: unknown } {
  const errors: ValidationError[] = [];
  
  // Type coercion
  let bool: boolean;
  if (typeof value === 'boolean') {
    bool = value;
  } else if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') {
      bool = true;
    } else if (value.toLowerCase() === 'false') {
      bool = false;
    } else {
      errors.push({
        path,
        message: 'Value must be a boolean',
        code: 'INVALID_TYPE'
      });
      return { valid: false, errors };
    }
  } else if (typeof value === 'number') {
    bool = value !== 0;
  } else {
    errors.push({
      path,
      message: 'Value must be a boolean',
      code: 'INVALID_TYPE'
    });
    return { valid: false, errors };
  }
  
  // Check enum
  if (schema.enum) {
    if (!schema.enum.includes(bool)) {
      errors.push({
        path,
        message: `Value must be one of: ${schema.enum.join(', ')}`,
        code: 'ENUM_MISMATCH'
      });
      return { valid: false, errors };
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    value: bool
  };
}

/**
 * Validate array value
 */
function validateArray(
  value: unknown,
  schema: PropertySchema,
  path: string
): { valid: boolean; errors: ValidationError[]; value?: unknown } {
  const errors: ValidationError[] = [];
  
  if (!Array.isArray(value)) {
    errors.push({
      path,
      message: 'Value must be an array',
      code: 'INVALID_TYPE'
    });
    return { valid: false, errors };
  }
  
  const coercedArray: unknown[] = [];
  
  // Validate each item
  if (schema.items) {
    for (let i = 0; i < value.length; i++) {
      const result = validateValue(value[i], schema.items, `${path}[${i}]`);
      if (!result.valid) {
        errors.push(...result.errors);
      } else {
        coercedArray.push(result.value);
      }
    }
  } else {
    // No item schema, include as-is
    coercedArray.push(...value);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    value: coercedArray
  };
}

/**
 * Validate object value
 */
function validateObject(
  value: unknown,
  schema: PropertySchema,
  path: string
): { valid: boolean; errors: ValidationError[]; value?: unknown } {
  const errors: ValidationError[] = [];
  
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push({
      path,
      message: 'Value must be an object',
      code: 'INVALID_TYPE'
    });
    return { valid: false, errors };
  }
  
  const inputObj = value as Record<string, unknown>;
  const coercedObj: Record<string, unknown> = {};
  
  // Check required fields
  if (schema.required) {
    for (const required of schema.required) {
      if (!(required in inputObj)) {
        errors.push({
          path: `${path}.${required}`,
          message: `Missing required field: ${required}`,
          code: 'REQUIRED_FIELD'
        });
      }
    }
  }
  
  // Validate each property
  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const propValue = inputObj[key];
      
      // Apply default if value is missing
      if (propValue === undefined) {
        if ('default' in propSchema) {
          coercedObj[key] = propSchema.default;
        }
        continue;
      }
      
      const result = validateValue(propValue, propSchema, `${path}.${key}`);
      if (!result.valid) {
        errors.push(...result.errors);
      } else {
        coercedObj[key] = result.value;
      }
    }
  }
  
  // Check additional properties
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(inputObj)) {
      if (!schema.properties || !(key in schema.properties)) {
        errors.push({
          path: `${path}.${key}`,
          message: `Additional property not allowed: ${key}`,
          code: 'ADDITIONAL_PROPERTY'
        });
      }
    }
  } else {
    // Include additional properties
    for (const key of Object.keys(inputObj)) {
      if (!(key in coercedObj)) {
        coercedObj[key] = inputObj[key];
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    value: coercedObj
  };
}
