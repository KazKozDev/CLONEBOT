/**
 * Channel Profiles Tests
 */

import {
  getProfile,
  registerProfile,
  listProfiles,
  validateProfile,
} from '../channel-profiles';
import type { ChannelProfile } from '../types';

describe('Channel Profiles', () => {
  describe('getProfile', () => {
    it('should get predefined telegram profile', () => {
      const profile = getProfile('telegram');
      
      expect(profile.maxChars).toBe(4096);
      expect(profile.supportsEdit).toBe(true);
      expect(profile.supportsMarkdown).toBe(true);
      expect(profile.defaultMode).toBe('streaming');
    });
    
    it('should get whatsapp profile', () => {
      const profile = getProfile('whatsapp');
      
      expect(profile.maxChars).toBe(65536);
      expect(profile.supportsEdit).toBe(false);
    });
    
    it('should get discord profile', () => {
      const profile = getProfile('discord');
      
      expect(profile.maxChars).toBe(2000);
      expect(profile.maxLines).toBe(17);
    });
    
    it('should get web profile', () => {
      const profile = getProfile('web');
      
      expect(profile.maxChars).toBeNull();
      expect(profile.minChars).toBe(1);
      expect(profile.coalesceGap).toBe(0);
    });
    
    it('should throw on unknown profile', () => {
      expect(() => getProfile('unknown')).toThrow();
    });
  });
  
  describe('registerProfile', () => {
    it('should register custom profile', () => {
      const customProfile: ChannelProfile = {
        maxChars: 1000,
        maxLines: null,
        minChars: 50,
        supportsEdit: true,
        supportsMarkdown: false,
        coalesceGap: 100,
        defaultMode: 'block',
      };
      
      registerProfile('custom', customProfile);
      
      const retrieved = getProfile('custom');
      expect(retrieved.maxChars).toBe(1000);
      expect(retrieved.minChars).toBe(50);
    });
    
    it('should throw on invalid profile', () => {
      const invalidProfile = {
        maxChars: -1, // Invalid
        minChars: 100,
      } as any;
      
      expect(() => registerProfile('invalid', invalidProfile)).toThrow();
    });
  });
  
  describe('listProfiles', () => {
    it('should list all profiles', () => {
      const profiles = listProfiles();
      
      expect(profiles).toContain('telegram');
      expect(profiles).toContain('whatsapp');
      expect(profiles).toContain('discord');
      expect(profiles).toContain('slack');
      expect(profiles).toContain('web');
      expect(profiles).toContain('console');
    });
  });
  
  describe('validateProfile', () => {
    it('should validate correct profile', () => {
      const result = validateProfile({
        maxChars: 1000,
        minChars: 100,
        supportsEdit: true,
        supportsMarkdown: true,
        coalesceGap: 200,
        defaultMode: 'block',
      });
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('should reject missing required fields', () => {
      const result = validateProfile({
        maxChars: 1000,
        // missing other required fields
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
    
    it('should reject invalid maxChars', () => {
      const result = validateProfile({
        maxChars: 0, // Invalid
        minChars: 100,
        supportsEdit: true,
        supportsMarkdown: true,
        coalesceGap: 200,
        defaultMode: 'block',
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('maxChars'))).toBe(true);
    });
    
    it('should reject maxChars < minChars', () => {
      const result = validateProfile({
        maxChars: 50,
        minChars: 100,
        supportsEdit: true,
        supportsMarkdown: true,
        coalesceGap: 200,
        defaultMode: 'block',
      });
      
      expect(result.valid).toBe(false);
    });
  });
});
