/**
 * Result Compression
 * 
 * Compresses large tool results to fit within token limits.
 */

import type { ToolResult } from './types';

export type TruncationStrategy = 'end' | 'middle' | 'smart';

/**
 * Compress a tool result if it exceeds max length
 */
export function compressResult(
  result: ToolResult,
  maxLength: number,
  strategy: TruncationStrategy = 'smart'
): ToolResult {
  // Already short enough
  if (result.content.length <= maxLength) {
    return result;
  }
  
  let compressed: string;
  
  switch (strategy) {
    case 'end':
      compressed = compressEnd(result.content, maxLength);
      break;
    
    case 'middle':
      compressed = compressMiddle(result.content, maxLength);
      break;
    
    case 'smart':
      compressed = compressSmart(result.content, maxLength);
      break;
    
    default:
      compressed = compressEnd(result.content, maxLength);
  }
  
  return {
    ...result,
    content: compressed,
    metadata: {
      ...result.metadata,
      truncated: true,
      originalLength: result.content.length
    }
  };
}

/**
 * Truncate at the end
 */
function compressEnd(content: string, maxLength: number): string {
  const suffix = '\n\n... [truncated]';
  const availableLength = maxLength - suffix.length;
  
  if (availableLength <= 0) {
    return suffix;
  }
  
  return content.slice(0, availableLength) + suffix;
}

/**
 * Truncate in the middle
 */
function compressMiddle(content: string, maxLength: number): string {
  const marker = '\n\n... [middle section truncated] ...\n\n';
  const availableLength = maxLength - marker.length;
  
  if (availableLength <= 0) {
    return marker;
  }
  
  const halfLength = Math.floor(availableLength / 2);
  const start = content.slice(0, halfLength);
  const end = content.slice(-halfLength);
  
  return start + marker + end;
}

/**
 * Smart compression based on content type
 */
function compressSmart(content: string, maxLength: number): string {
  // Try to detect content type
  const trimmed = content.trim();
  
  // JSON
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    return compressJSON(content, maxLength);
  }
  
  // Code (has function declarations or similar patterns)
  if (trimmed.match(/^(function|class|def|async|const|let|var|export|import)/m)) {
    return compressCode(content, maxLength);
  }
  
  // Logs (multiple lines with timestamps or similar)
  if (trimmed.split('\n').length > 10 && 
      trimmed.match(/^\d{4}-\d{2}-\d{2}|^\[\d{2}:\d{2}:\d{2}\]/m)) {
    return compressLogs(content, maxLength);
  }
  
  // Default to middle truncation
  return compressMiddle(content, maxLength);
}

/**
 * Compress JSON while preserving structure
 */
function compressJSON(content: string, maxLength: number): string {
  try {
    const data = JSON.parse(content);
    const compressed = compressJSONData(data, maxLength);
    return JSON.stringify(compressed, null, 2);
  } catch {
    // Not valid JSON, use default
    return compressMiddle(content, maxLength);
  }
}

/**
 * Recursively compress JSON data
 */
function compressJSONData(data: any, maxLength: number): any {
  if (typeof data === 'string' && data.length > 100) {
    return data.slice(0, 100) + '... [truncated]';
  }
  
  if (Array.isArray(data)) {
    if (data.length > 10) {
      return [
        ...data.slice(0, 5),
        `... [${data.length - 10} items omitted] ...`,
        ...data.slice(-5)
      ];
    }
    return data.map(item => compressJSONData(item, maxLength / data.length));
  }
  
  if (data && typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.length > 20) {
      const result: any = {};
      keys.slice(0, 10).forEach(key => {
        result[key] = compressJSONData(data[key], maxLength / keys.length);
      });
      result['...'] = `[${keys.length - 20} keys omitted]`;
      keys.slice(-10).forEach(key => {
        result[key] = compressJSONData(data[key], maxLength / keys.length);
      });
      return result;
    }
    
    const result: any = {};
    keys.forEach(key => {
      result[key] = compressJSONData(data[key], maxLength / keys.length);
    });
    return result;
  }
  
  return data;
}

/**
 * Compress code while preserving function signatures
 */
function compressCode(content: string, maxLength: number): string {
  const lines = content.split('\n');
  
  if (lines.length <= 20) {
    return compressMiddle(content, maxLength);
  }
  
  // Keep first 10 and last 10 lines
  const header = lines.slice(0, 10).join('\n');
  const footer = lines.slice(-10).join('\n');
  const omitted = lines.length - 20;
  
  const result = `${header}\n\n... [${omitted} lines omitted] ...\n\n${footer}`;
  
  if (result.length > maxLength) {
    return compressMiddle(result, maxLength);
  }
  
  return result;
}

/**
 * Compress logs keeping first and last entries
 */
function compressLogs(content: string, maxLength: number): string {
  const lines = content.split('\n');
  
  if (lines.length <= 20) {
    return compressMiddle(content, maxLength);
  }
  
  // Keep first 10 and last 10 lines
  const header = lines.slice(0, 10).join('\n');
  const footer = lines.slice(-10).join('\n');
  const omitted = lines.length - 20;
  
  const result = `${header}\n\n... [${omitted} log lines omitted] ...\n\n${footer}`;
  
  if (result.length > maxLength) {
    return compressMiddle(result, maxLength);
  }
  
  return result;
}
