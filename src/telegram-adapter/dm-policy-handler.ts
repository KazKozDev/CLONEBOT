/**
 * DM Policy Handler
 * 
 * Handles direct message access control
 */

import { AccessCheckResult, PairingRequest } from './types';
import crypto from 'crypto';

export type DMPolicy = 'pairing' | 'allowlist' | 'open' | 'disabled';

export class DMPolicyHandler {
  private allowlist: Set<string>;
  private pendingPairings: Map<string, PairingRequest>;
  
  private readonly codeExpiryTime = 10 * 60 * 1000; // 10 minutes

  constructor(
    private policy: DMPolicy,
    allowlist: string[] = []
  ) {
    this.allowlist = new Set(allowlist);
    this.pendingPairings = new Map();
  }

  /**
   * Check if user has access
   */
  checkAccess(userId: string): AccessCheckResult {
    switch (this.policy) {
      case 'open':
        return { allowed: true };
      
      case 'disabled':
        return { allowed: false, reason: 'DM is disabled' };
      
      case 'allowlist':
        if (this.allowlist.has(userId)) {
          return { allowed: true };
        }
        return { allowed: false, reason: 'User not in allowlist' };
      
      case 'pairing':
        if (this.allowlist.has(userId)) {
          return { allowed: true };
        }
        return { allowed: false, reason: 'Pairing required' };
      
      default:
        return { allowed: false, reason: 'Unknown policy' };
    }
  }

  /**
   * Generate pairing code for user
   */
  generatePairingCode(userId: string): string {
    // Clean up expired pairings
    this.cleanupExpiredPairings();
    
    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    const pairing: PairingRequest = {
      userId,
      code,
      timestamp: Date.now(),
      expires: Date.now() + this.codeExpiryTime,
    };
    
    this.pendingPairings.set(userId, pairing);
    
    return code;
  }

  /**
   * Verify pairing code
   */
  verifyPairingCode(userId: string, code: string): boolean {
    const pairing = this.pendingPairings.get(userId);
    
    if (!pairing) {
      return false;
    }
    
    // Check if expired
    if (Date.now() > pairing.expires) {
      this.pendingPairings.delete(userId);
      return false;
    }
    
    // Check if code matches
    if (pairing.code !== code) {
      return false;
    }
    
    // Code is valid, add to allowlist and remove pairing
    this.allowlist.add(userId);
    this.pendingPairings.delete(userId);
    
    return true;
  }

  /**
   * Add user to allowlist
   */
  addToAllowlist(userId: string): void {
    this.allowlist.add(userId);
  }

  /**
   * Remove user from allowlist
   */
  removeFromAllowlist(userId: string): void {
    this.allowlist.delete(userId);
  }

  /**
   * Get pending pairing requests
   */
  getPendingPairings(): PairingRequest[] {
    this.cleanupExpiredPairings();
    return Array.from(this.pendingPairings.values());
  }

  /**
   * Get allowlist
   */
  getAllowlist(): string[] {
    return Array.from(this.allowlist);
  }

  /**
   * Set policy
   */
  setPolicy(policy: DMPolicy): void {
    this.policy = policy;
  }

  /**
   * Get current policy
   */
  getPolicy(): DMPolicy {
    return this.policy;
  }

  /**
   * Clean up expired pairing requests
   */
  private cleanupExpiredPairings(): void {
    const now = Date.now();
    
    for (const [userId, pairing] of this.pendingPairings.entries()) {
      if (now > pairing.expires) {
        this.pendingPairings.delete(userId);
      }
    }
  }

  /**
   * Check if user has pending pairing
   */
  hasPendingPairing(userId: string): boolean {
    this.cleanupExpiredPairings();
    return this.pendingPairings.has(userId);
  }

  /**
   * Get pairing code for user if exists
   */
  getPairingCode(userId: string): string | null {
    this.cleanupExpiredPairings();
    const pairing = this.pendingPairings.get(userId);
    return pairing?.code ?? null;
  }
}
