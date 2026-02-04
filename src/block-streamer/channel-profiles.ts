/**
 * Channel Profile Manager
 * 
 * Manages predefined and custom channel profiles
 */

import type { ChannelProfile, ChannelProfileName, ValidationResult } from './types';

// Predefined channel profiles
const PROFILES: Record<ChannelProfileName, ChannelProfile> = {
  telegram: {
    maxChars: 4096,
    maxLines: null,
    minChars: 100,
    supportsEdit: true,
    supportsMarkdown: true,
    coalesceGap: 200,
    defaultMode: 'streaming',
  },
  
  whatsapp: {
    maxChars: 65536,
    maxLines: null,
    minChars: 200,
    supportsEdit: false,
    supportsMarkdown: false,
    coalesceGap: 500,
    defaultMode: 'block',
  },
  
  discord: {
    maxChars: 2000,
    maxLines: 17,
    minChars: 150,
    supportsEdit: true,
    supportsMarkdown: true,
    coalesceGap: 300,
    defaultMode: 'streaming',
  },
  
  slack: {
    maxChars: 40000,
    maxLines: null,
    minChars: 200,
    supportsEdit: true,
    supportsMarkdown: true,
    coalesceGap: 400,
    defaultMode: 'block',
  },
  
  web: {
    maxChars: null,
    maxLines: null,
    minChars: 1,
    supportsEdit: true,
    supportsMarkdown: true,
    coalesceGap: 0,
    defaultMode: 'streaming',
  },
  
  console: {
    maxChars: null,
    maxLines: null,
    minChars: 1,
    supportsEdit: false,
    supportsMarkdown: false,
    coalesceGap: 0,
    defaultMode: 'streaming',
  },
};

export class ChannelProfileManager {
  private customProfiles: Map<string, ChannelProfile> = new Map();
  
  /**
   * Get a channel profile by name
   */
  getProfile(name: string): ChannelProfile {
    // Check predefined profiles first
    if (name in PROFILES) {
      return { ...PROFILES[name as ChannelProfileName] };
    }
    
    // Check custom profiles
    const custom = this.customProfiles.get(name);
    if (custom) {
      return { ...custom };
    }
    
    throw new Error(`Unknown channel profile: ${name}`);
  }
  
  /**
   * Register a custom profile
   */
  registerProfile(name: string, profile: ChannelProfile): void {
    const validation = this.validateProfile(profile);
    if (!validation.valid) {
      throw new Error(`Invalid profile: ${validation.errors.join(', ')}`);
    }
    
    this.customProfiles.set(name, { ...profile });
  }
  
  /**
   * List all available profile names
   */
  listProfiles(): string[] {
    const predefined = Object.keys(PROFILES);
    const custom = Array.from(this.customProfiles.keys());
    return [...predefined, ...custom];
  }
  
  /**
   * Validate a channel profile
   */
  validateProfile(profile: Partial<ChannelProfile>): ValidationResult {
    const errors: string[] = [];
    
    // Required fields
    if (profile.minChars === undefined) {
      errors.push('minChars is required');
    } else if (profile.minChars < 0) {
      errors.push('minChars must be >= 0');
    }
    
    if (profile.supportsEdit === undefined) {
      errors.push('supportsEdit is required');
    }
    
    if (profile.supportsMarkdown === undefined) {
      errors.push('supportsMarkdown is required');
    }
    
    if (profile.coalesceGap === undefined) {
      errors.push('coalesceGap is required');
    } else if (profile.coalesceGap < 0) {
      errors.push('coalesceGap must be >= 0');
    }
    
    if (!profile.defaultMode) {
      errors.push('defaultMode is required');
    } else if (!['block', 'streaming', 'batch'].includes(profile.defaultMode)) {
      errors.push('defaultMode must be block, streaming, or batch');
    }
    
    // Logical validation
    if (profile.maxChars !== null && profile.maxChars !== undefined) {
      if (profile.maxChars < 1) {
        errors.push('maxChars must be >= 1 or null');
      }
      
      if (profile.minChars !== undefined && profile.maxChars < profile.minChars) {
        errors.push('maxChars must be >= minChars');
      }
    }
    
    if (profile.maxLines !== null && profile.maxLines !== undefined && profile.maxLines < 1) {
      errors.push('maxLines must be >= 1 or null');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }
  
  /**
   * Apply default values to a partial profile
   */
  applyDefaults(partial: Partial<ChannelProfile>): ChannelProfile {
    return {
      maxChars: partial.maxChars ?? null,
      maxLines: partial.maxLines ?? null,
      minChars: partial.minChars ?? 100,
      supportsEdit: partial.supportsEdit ?? true,
      supportsMarkdown: partial.supportsMarkdown ?? true,
      coalesceGap: partial.coalesceGap ?? 200,
      defaultMode: partial.defaultMode ?? 'block',
    };
  }
}

/**
 * Singleton instance
 */
const profileManager = new ChannelProfileManager();

/**
 * Get profile by name
 */
export function getProfile(name: string): ChannelProfile {
  return profileManager.getProfile(name);
}

/**
 * Register custom profile
 */
export function registerProfile(name: string, profile: ChannelProfile): void {
  profileManager.registerProfile(name, profile);
}

/**
 * List all profiles
 */
export function listProfiles(): string[] {
  return profileManager.listProfiles();
}

/**
 * Validate profile
 */
export function validateProfile(profile: Partial<ChannelProfile>): ValidationResult {
  return profileManager.validateProfile(profile);
}
