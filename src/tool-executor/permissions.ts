/**
 * Permission Checker
 * 
 * Validates tool permissions against available permissions.
 */

/**
 * Check if required permissions are available
 */
export function checkPermissions(
  required: string[],
  available: Set<string>
): { allowed: boolean; missing: string[] } {
  const missing: string[] = [];
  
  for (const requiredPerm of required) {
    if (!hasPermission(requiredPerm, available)) {
      missing.push(requiredPerm);
    }
  }
  
  return {
    allowed: missing.length === 0,
    missing
  };
}

/**
 * Check if a single permission is available (with wildcard support)
 */
function hasPermission(required: string, available: Set<string>): boolean {
  // Exact match
  if (available.has(required)) {
    return true;
  }
  
  // Check wildcards
  // e.g., required='fs.read' matches available='fs.*'
  const parts = required.split('.');
  for (let i = parts.length - 1; i >= 0; i--) {
    const wildcard = parts.slice(0, i).join('.') + '.*';
    if (available.has(wildcard)) {
      return true;
    }
  }
  
  // Check if available has a wildcard that covers this
  // e.g., required='fs.read' matches available='*'
  if (available.has('*')) {
    return true;
  }
  
  return false;
}

/**
 * Expand wildcards to concrete permissions
 */
export function expandPermissions(
  permissions: string[],
  allKnownPermissions: string[]
): Set<string> {
  const expanded = new Set<string>();
  
  for (const perm of permissions) {
    if (perm === '*') {
      // Wildcard - add all known permissions
      allKnownPermissions.forEach(p => expanded.add(p));
    } else if (perm.endsWith('.*')) {
      // Prefix wildcard - add all matching
      const prefix = perm.slice(0, -2);
      for (const known of allKnownPermissions) {
        if (known.startsWith(prefix + '.')) {
          expanded.add(known);
        }
      }
      // Also add the wildcard itself
      expanded.add(perm);
    } else {
      // Concrete permission
      expanded.add(perm);
    }
  }
  
  return expanded;
}

/**
 * Check if tool is allowed in sandbox mode
 */
export function isSandboxAllowed(
  toolName: string,
  allowlist: string[],
  denylist: string[]
): boolean {
  // Denylist takes precedence
  if (denylist.includes(toolName)) {
    return false;
  }
  
  // Check allowlist
  if (allowlist.length === 0) {
    // Empty allowlist means all allowed (unless in denylist)
    return true;
  }
  
  return allowlist.includes(toolName);
}
