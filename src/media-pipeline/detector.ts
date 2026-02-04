/**
 * Media Type Detector
 * 
 * Detects media type using:
 * 1. Magic bytes (file signature)
 * 2. MIME type
 * 3. File extension
 */

import { MediaTypeInfo, MediaCategory, MediaInput } from './types';
import * as path from 'path';

// ============================================================================
// Magic Bytes Signatures
// ============================================================================

interface MagicSignature {
  signature: number[];
  offset: number;
  format: string;
  mimeType: string;
  category: MediaCategory;
}

const MAGIC_SIGNATURES: MagicSignature[] = [
  // Images
  { signature: [0xFF, 0xD8, 0xFF], offset: 0, format: 'jpeg', mimeType: 'image/jpeg', category: 'image' },
  { signature: [0x89, 0x50, 0x4E, 0x47], offset: 0, format: 'png', mimeType: 'image/png', category: 'image' },
  { signature: [0x47, 0x49, 0x46, 0x38], offset: 0, format: 'gif', mimeType: 'image/gif', category: 'image' },
  { signature: [0x52, 0x49, 0x46, 0x46], offset: 0, format: 'webp', mimeType: 'image/webp', category: 'image' },
  { signature: [0x00, 0x00, 0x01, 0x00], offset: 0, format: 'ico', mimeType: 'image/x-icon', category: 'image' },
  
  // Audio
  { signature: [0x49, 0x44, 0x33], offset: 0, format: 'mp3', mimeType: 'audio/mpeg', category: 'audio' },
  { signature: [0xFF, 0xFB], offset: 0, format: 'mp3', mimeType: 'audio/mpeg', category: 'audio' },
  { signature: [0x52, 0x49, 0x46, 0x46], offset: 0, format: 'wav', mimeType: 'audio/wav', category: 'audio' },
  { signature: [0x66, 0x4C, 0x61, 0x43], offset: 0, format: 'flac', mimeType: 'audio/flac', category: 'audio' },
  { signature: [0x4F, 0x67, 0x67, 0x53], offset: 0, format: 'ogg', mimeType: 'audio/ogg', category: 'audio' },
  
  // Video
  { signature: [0x66, 0x74, 0x79, 0x70], offset: 4, format: 'mp4', mimeType: 'video/mp4', category: 'video' },
  { signature: [0x1A, 0x45, 0xDF, 0xA3], offset: 0, format: 'webm', mimeType: 'video/webm', category: 'video' },
  { signature: [0x52, 0x49, 0x46, 0x46], offset: 0, format: 'avi', mimeType: 'video/x-msvideo', category: 'video' },
  
  // Documents
  { signature: [0x25, 0x50, 0x44, 0x46], offset: 0, format: 'pdf', mimeType: 'application/pdf', category: 'document' },
  { signature: [0x50, 0x4B, 0x03, 0x04], offset: 0, format: 'zip', mimeType: 'application/zip', category: 'document' },
  { signature: [0xD0, 0xCF, 0x11, 0xE0], offset: 0, format: 'doc', mimeType: 'application/msword', category: 'document' },
];

// ============================================================================
// Extension to Format Mapping
// ============================================================================

interface FormatMapping {
  format: string;
  mimeType: string;
  category: MediaCategory;
}

const EXTENSION_MAP: Record<string, FormatMapping> = {
  // Images
  '.jpg': { format: 'jpeg', mimeType: 'image/jpeg', category: 'image' },
  '.jpeg': { format: 'jpeg', mimeType: 'image/jpeg', category: 'image' },
  '.png': { format: 'png', mimeType: 'image/png', category: 'image' },
  '.gif': { format: 'gif', mimeType: 'image/gif', category: 'image' },
  '.webp': { format: 'webp', mimeType: 'image/webp', category: 'image' },
  '.heic': { format: 'heic', mimeType: 'image/heic', category: 'image' },
  '.heif': { format: 'heif', mimeType: 'image/heif', category: 'image' },
  '.bmp': { format: 'bmp', mimeType: 'image/bmp', category: 'image' },
  '.svg': { format: 'svg', mimeType: 'image/svg+xml', category: 'image' },
  
  // Audio
  '.mp3': { format: 'mp3', mimeType: 'audio/mpeg', category: 'audio' },
  '.wav': { format: 'wav', mimeType: 'audio/wav', category: 'audio' },
  '.m4a': { format: 'm4a', mimeType: 'audio/m4a', category: 'audio' },
  '.ogg': { format: 'ogg', mimeType: 'audio/ogg', category: 'audio' },
  '.oga': { format: 'oga', mimeType: 'audio/ogg', category: 'audio' },
  '.flac': { format: 'flac', mimeType: 'audio/flac', category: 'audio' },
  '.webm': { format: 'webm', mimeType: 'audio/webm', category: 'audio' },
  '.aac': { format: 'aac', mimeType: 'audio/aac', category: 'audio' },
  
  // Video
  '.mp4': { format: 'mp4', mimeType: 'video/mp4', category: 'video' },
  '.mov': { format: 'mov', mimeType: 'video/quicktime', category: 'video' },
  '.avi': { format: 'avi', mimeType: 'video/x-msvideo', category: 'video' },
  '.mkv': { format: 'mkv', mimeType: 'video/x-matroska', category: 'video' },
  '.wmv': { format: 'wmv', mimeType: 'video/x-ms-wmv', category: 'video' },
  '.flv': { format: 'flv', mimeType: 'video/x-flv', category: 'video' },
  
  // Documents
  '.pdf': { format: 'pdf', mimeType: 'application/pdf', category: 'document' },
  '.doc': { format: 'doc', mimeType: 'application/msword', category: 'document' },
  '.docx': { format: 'docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', category: 'document' },
  '.txt': { format: 'txt', mimeType: 'text/plain', category: 'document' },
  '.md': { format: 'markdown', mimeType: 'text/markdown', category: 'document' },
  '.html': { format: 'html', mimeType: 'text/html', category: 'document' },
  '.htm': { format: 'html', mimeType: 'text/html', category: 'document' },
  '.csv': { format: 'csv', mimeType: 'text/csv', category: 'document' },
  '.xlsx': { format: 'xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', category: 'document' },
  '.xls': { format: 'xls', mimeType: 'application/vnd.ms-excel', category: 'document' },
  '.ppt': { format: 'ppt', mimeType: 'application/vnd.ms-powerpoint', category: 'document' },
  '.pptx': { format: 'pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', category: 'document' },
  '.rtf': { format: 'rtf', mimeType: 'application/rtf', category: 'document' },
};

// ============================================================================
// MIME Type to Category Mapping
// ============================================================================

const MIME_CATEGORY_MAP: Record<string, MediaCategory> = {
  'image/': 'image',
  'audio/': 'audio',
  'video/': 'video',
  'application/pdf': 'document',
  'text/': 'document',
  'application/msword': 'document',
  'application/vnd.': 'document',
  'application/rtf': 'document',
};

// ============================================================================
// Media Type Detector Class
// ============================================================================

export class MediaTypeDetector {
  /**
   * Detect media type from input
   */
  detect(input: MediaInput): MediaTypeInfo {
    // Try magic bytes first (most reliable)
    if (input.type === 'buffer') {
      const magicResult = this.detectFromBuffer(input.data);
      if (magicResult.confidence > 0.8) {
        return magicResult;
      }
    }
    
    // Try MIME type
    if (input.type === 'buffer' && input.mimeType) {
      const mimeResult = this.detectFromMimeType(input.mimeType);
      if (mimeResult.confidence > 0.6) {
        return mimeResult;
      }
    }
    
    // Try extension
    const filename = this.getFilename(input);
    if (filename) {
      const pathResult = this.detectFromPath(filename);
      if (pathResult.confidence > 0.5) {
        return pathResult;
      }
    }
    
    // Unknown
    return {
      category: 'unknown',
      format: 'unknown',
      mimeType: 'application/octet-stream',
      confidence: 0,
    };
  }
  
  /**
   * Detect from buffer using magic bytes
   */
  detectFromBuffer(buffer: Buffer): MediaTypeInfo {
    for (const sig of MAGIC_SIGNATURES) {
      if (this.matchesMagicSignature(buffer, sig)) {
        return {
          category: sig.category,
          format: sig.format,
          mimeType: sig.mimeType,
          confidence: 0.95,
        };
      }
    }
    
    return {
      category: 'unknown',
      format: 'unknown',
      mimeType: 'application/octet-stream',
      confidence: 0,
    };
  }
  
  /**
   * Detect from file path/extension
   */
  detectFromPath(filepath: string): MediaTypeInfo {
    const ext = path.extname(filepath).toLowerCase();
    const mapping = EXTENSION_MAP[ext];
    
    if (mapping) {
      return {
        category: mapping.category,
        format: mapping.format,
        mimeType: mapping.mimeType,
        confidence: 0.7,
      };
    }
    
    return {
      category: 'unknown',
      format: 'unknown',
      mimeType: 'application/octet-stream',
      confidence: 0,
    };
  }
  
  /**
   * Detect from MIME type
   */
  detectFromMimeType(mimeType: string): MediaTypeInfo {
    // Exact match
    for (const [ext, mapping] of Object.entries(EXTENSION_MAP)) {
      if (mapping.mimeType === mimeType) {
        return {
          category: mapping.category,
          format: mapping.format,
          mimeType: mapping.mimeType,
          confidence: 0.85,
        };
      }
    }
    
    // Category match
    for (const [prefix, category] of Object.entries(MIME_CATEGORY_MAP)) {
      if (mimeType.startsWith(prefix)) {
        const format = mimeType.split('/')[1]?.split(';')[0] || 'unknown';
        return {
          category,
          format,
          mimeType,
          confidence: 0.6,
        };
      }
    }
    
    return {
      category: 'unknown',
      format: 'unknown',
      mimeType: mimeType || 'application/octet-stream',
      confidence: 0,
    };
  }
  
  /**
   * Check if buffer matches magic signature
   */
  private matchesMagicSignature(buffer: Buffer, sig: MagicSignature): boolean {
    if (buffer.length < sig.offset + sig.signature.length) {
      return false;
    }
    
    for (let i = 0; i < sig.signature.length; i++) {
      if (buffer[sig.offset + i] !== sig.signature[i]) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Extract filename from input
   */
  private getFilename(input: MediaInput): string | undefined {
    switch (input.type) {
      case 'buffer':
      case 'stream':
        return input.filename;
      case 'path':
        return input.path;
      case 'url':
        return new URL(input.url).pathname.split('/').pop();
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const detector = new MediaTypeDetector();
