/**
 * Skill Validator
 * 
 * Validates skill frontmatter and structure
 */

import type { ParsedSkill, ValidationResult, ValidationError, ValidationWarning } from './types.js';

export class SkillValidator {
  
  /**
   * Validate parsed skill
   */
  validate(parsedSkill: ParsedSkill): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    
    const { frontmatter } = parsedSkill;
    
    // Required fields
    if (!frontmatter.name) {
      errors.push({ field: 'name', message: 'Name is required' });
    } else {
      // Validate name pattern
      if (!/^[a-z0-9-]+$/.test(frontmatter.name)) {
        errors.push({
          field: 'name',
          message: 'Name must contain only lowercase letters, numbers, and hyphens',
          value: frontmatter.name
        });
      }
    }
    
    if (!frontmatter.version) {
      errors.push({ field: 'version', message: 'Version is required' });
    } else {
      // Validate semver
      if (!/^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/.test(frontmatter.version)) {
        errors.push({
          field: 'version',
          message: 'Version must be valid semver (e.g., 1.0.0)',
          value: frontmatter.version
        });
      }
    }
    
    if (!frontmatter.description) {
      errors.push({ field: 'description', message: 'Description is required' });
    } else if (frontmatter.description.length > 500) {
      errors.push({
        field: 'description',
        message: 'Description must be 500 characters or less',
        value: frontmatter.description.length
      });
    }
    
    // Optional field validation
    if (frontmatter.priority !== undefined) {
      if (typeof frontmatter.priority !== 'number') {
        errors.push({ field: 'priority', message: 'Priority must be a number' });
      } else if (frontmatter.priority < 0 || frontmatter.priority > 1000) {
        errors.push({
          field: 'priority',
          message: 'Priority must be between 0 and 1000',
          value: frontmatter.priority
        });
      }
    }
    
    if (frontmatter.tags && frontmatter.tags.length > 10) {
      errors.push({
        field: 'tags',
        message: 'Maximum 10 tags allowed',
        value: frontmatter.tags.length
      });
    }
    
    // Warnings for recommended fields
    if (!frontmatter.author) {
      warnings.push({ field: 'author', message: 'Author is recommended' });
    }
    
    if (!frontmatter.license) {
      warnings.push({ field: 'license', message: 'License is recommended' });
    }
    
    if (!frontmatter.tags || frontmatter.tags.length === 0) {
      warnings.push({ field: 'tags', message: 'Tags are recommended for discoverability' });
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}
