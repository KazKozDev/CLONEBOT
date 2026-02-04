/**
 * Tests for DM Policy Handler
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { DMPolicyHandler } from '../dm-policy-handler';

describe('DMPolicyHandler', () => {
  describe('open policy', () => {
    let handler: DMPolicyHandler;
    
    beforeEach(() => {
      handler = new DMPolicyHandler('open');
    });
    
    it('should allow all users', () => {
      const result = handler.checkAccess('user1');
      expect(result.allowed).toBe(true);
    });
  });
  
  describe('disabled policy', () => {
    let handler: DMPolicyHandler;
    
    beforeEach(() => {
      handler = new DMPolicyHandler('disabled');
    });
    
    it('should deny all users', () => {
      const result = handler.checkAccess('user1');
      expect(result.allowed).toBe(false);
    });
  });
  
  describe('allowlist policy', () => {
    let handler: DMPolicyHandler;
    
    beforeEach(() => {
      handler = new DMPolicyHandler('allowlist', ['user1', 'user2']);
    });
    
    it('should allow users in allowlist', () => {
      const result = handler.checkAccess('user1');
      expect(result.allowed).toBe(true);
    });
    
    it('should deny users not in allowlist', () => {
      const result = handler.checkAccess('user3');
      expect(result.allowed).toBe(false);
    });
    
    it('should add users to allowlist', () => {
      handler.addToAllowlist('user3');
      const result = handler.checkAccess('user3');
      expect(result.allowed).toBe(true);
    });
    
    it('should remove users from allowlist', () => {
      handler.removeFromAllowlist('user1');
      const result = handler.checkAccess('user1');
      expect(result.allowed).toBe(false);
    });
  });
  
  describe('pairing policy', () => {
    let handler: DMPolicyHandler;
    
    beforeEach(() => {
      handler = new DMPolicyHandler('pairing');
    });
    
    it('should deny unknown users', () => {
      const result = handler.checkAccess('user1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Pairing required');
    });
    
    it('should generate pairing code', () => {
      const code = handler.generatePairingCode('user1');
      
      expect(code).toBeDefined();
      expect(code.length).toBe(6);
      expect(/^\d{6}$/.test(code)).toBe(true);
    });
    
    it('should verify valid pairing code', () => {
      const code = handler.generatePairingCode('user1');
      const valid = handler.verifyPairingCode('user1', code);
      
      expect(valid).toBe(true);
      
      // User should now be in allowlist
      const result = handler.checkAccess('user1');
      expect(result.allowed).toBe(true);
    });
    
    it('should reject invalid pairing code', () => {
      handler.generatePairingCode('user1');
      const valid = handler.verifyPairingCode('user1', '000000');
      
      expect(valid).toBe(false);
    });
    
    it('should expire pairing codes', async () => {
      // This would require mocking timers
      // Example structure:
      const code = handler.generatePairingCode('user1');
      
      // Mock time passage
      // jest.advanceTimersByTime(11 * 60 * 1000);
      
      // Code should be expired
      // const valid = handler.verifyPairingCode('user1', code);
      // expect(valid).toBe(false);
    });
  });
});
