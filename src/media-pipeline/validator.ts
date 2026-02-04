/**
 * Media Validator
 * 
 * Validates media files before processing:
 * - Size limits
 * - Format support
 * - Corruption check
 * - Duration limits (for audio/video)
 */

import { 
  MediaCategory, 
  MediaInput, 
  ValidationResult, 
  ValidationError,
  ValidationWarning,
  MediaLimits 
} from './types';
import { detector } from './detector';
import { promises as fs } from 'fs';

// ============================================================================
// Default Limits
// ============================================================================

const DEFAULT_LIMITS: MediaLimits = {
  maxImageSize: 20 * 1024 * 1024,      // 20MB
  maxAudioSize: 25 * 1024 * 1024,      // 25MB
  maxVideoSize: 100 * 1024 * 1024,     // 100MB
  maxDocumentSize: 50 * 1024 * 1024,   // 50MB
  maxAudioDuration: 14400,              // 4 hours
  maxVideoDuration: 600,                // 10 minutes
};

// Supported formats by category
const SUPPORTED_FORMATS: Record<MediaCategory, string[]> = {
  image: ['jpeg', 'jpg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp'],
  audio: ['mp3', 'wav', 'm4a', 'ogg', 'oga', 'flac', 'webm', 'aac'],
  video: ['mp4', 'mov', 'webm', 'avi', 'mkv'],
  document: ['pdf', 'doc', 'docx', 'txt', 'markdown', 'md', 'html', 'htm', 'csv', 'xlsx', 'xls', 'rtf'],
  unknown: [],
};

// ============================================================================
// Media Validator Class
// ============================================================================

export class MediaValidator {
  private limits: MediaLimits;
  
  constructor(limits?: Partial<MediaLimits>) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }
  
  /**
   * Validate media input
   */
  async validate(
    input: MediaInput,
    type?: MediaCategory,
    options?: { skipDurationCheck?: boolean }
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    
    try {
      // Get buffer from input
      const buffer = await this.getBuffer(input);
      
      // Check if empty
      if (buffer.length === 0) {
        errors.push({
          code: 'EMPTY',
          message: 'File is empty',
          actual: 0,
        });
        
        return {
          valid: false,
          errors,
          warnings,
          metadata: { size: 0, format: 'unknown' },
        };
      }
      
      // Detect type if not provided
      const detectedType = detector.detect(input);
      const category = type || detectedType.category;
      const format = detectedType.format;
      
      // Check format support
      if (category !== 'unknown' && !this.isFormatSupported(category, format)) {
        errors.push({
          code: 'UNSUPPORTED_FORMAT',
          message: `Format ${format} is not supported for category ${category}`,
        });
      }
      
      // Check size limit
      const maxSize = this.getMaxSize(category);
      if (buffer.length > maxSize) {
        errors.push({
          code: 'TOO_LARGE',
          message: `File size exceeds limit for ${category}`,
          limit: maxSize,
          actual: buffer.length,
        });
      }
      
      // Check corruption (basic validation)
      const isCorrupted = await this.checkCorruption(buffer, detectedType.category, format);
      if (isCorrupted) {
        errors.push({
          code: 'CORRUPTED',
          message: 'File appears to be corrupted',
        });
      }
      
      // Get metadata
      const metadata: ValidationResult['metadata'] = {
        size: buffer.length,
        format,
      };
      
      // Check duration for audio/video (if possible and not skipped)
      if (!options?.skipDurationCheck && (category === 'audio' || category === 'video')) {
        try {
          const duration = await this.getDuration(buffer, category, format);
          if (duration !== undefined) {
            metadata.duration = duration;
            
            const maxDuration = category === 'audio' 
              ? this.limits.maxAudioDuration 
              : this.limits.maxVideoDuration;
            
            if (duration > maxDuration) {
              errors.push({
                code: 'TOO_LONG',
                message: `Duration exceeds limit for ${category}`,
                limit: maxDuration,
                actual: duration,
              });
            }
          }
        } catch (err) {
          // Duration check failed, add warning but continue
          warnings.push({
            code: 'DURATION_CHECK_FAILED',
            message: 'Could not determine media duration',
          });
        }
      }
      
      // Get dimensions for images
      if (category === 'image') {
        try {
          const dimensions = await this.getDimensions(buffer, format);
          if (dimensions) {
            metadata.dimensions = dimensions;
            
            // Warn if very large
            if (dimensions.width > 10000 || dimensions.height > 10000) {
              warnings.push({
                code: 'VERY_LARGE_IMAGE',
                message: `Image dimensions are very large: ${dimensions.width}x${dimensions.height}`,
              });
            }
          }
        } catch (err) {
          // Dimension check failed, not critical
        }
      }
      
      return {
        valid: errors.length === 0,
        errors,
        warnings,
        metadata,
      };
      
    } catch (error) {
      errors.push({
        code: 'CORRUPTED',
        message: error instanceof Error ? error.message : 'Validation failed',
      });
      
      return {
        valid: false,
        errors,
        warnings,
        metadata: { size: 0, format: 'unknown' },
      };
    }
  }
  
  /**
   * Check if format is supported
   */
  private isFormatSupported(category: MediaCategory, format: string): boolean {
    const supportedFormats = SUPPORTED_FORMATS[category] || [];
    return supportedFormats.includes(format.toLowerCase());
  }
  
  /**
   * Get max size for category
   */
  private getMaxSize(category: MediaCategory): number {
    switch (category) {
      case 'image':
        return this.limits.maxImageSize;
      case 'audio':
        return this.limits.maxAudioSize;
      case 'video':
        return this.limits.maxVideoSize;
      case 'document':
        return this.limits.maxDocumentSize;
      default:
        return this.limits.maxDocumentSize; // Default
    }
  }
  
  /**
   * Get buffer from input
   */
  private async getBuffer(input: MediaInput): Promise<Buffer> {
    switch (input.type) {
      case 'buffer':
        return input.data;
      
      case 'path':
        return await fs.readFile(input.path);
      
      case 'url':
        // TODO: Download from URL
        throw new Error('URL input not yet implemented');
      
      case 'stream':
        return await this.streamToBuffer(input.stream);
    }
  }
  
  /**
   * Convert stream to buffer
   */
  private async streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }
  
  /**
   * Basic corruption check
   */
  private async checkCorruption(
    buffer: Buffer,
    category: MediaCategory,
    format: string
  ): Promise<boolean> {
    // For images, check if it starts with valid signature
    if (category === 'image') {
      const typeInfo = detector.detectFromBuffer(buffer);
      if (typeInfo.format === 'unknown' && buffer.length > 100) {
        return true; // Likely corrupted
      }
    }
    
    // For PDFs, check header and EOF marker
    if (format === 'pdf') {
      const header = buffer.slice(0, 5).toString();
      if (!header.startsWith('%PDF-')) {
        return true;
      }
      
      const tail = buffer.slice(-1024).toString();
      if (!tail.includes('%%EOF')) {
        return true;
      }
    }
    
    // Basic check passed
    return false;
  }
  
  /**
   * Get media duration (requires ffprobe or similar)
   */
  private async getDuration(
    buffer: Buffer,
    category: MediaCategory,
    format: string
  ): Promise<number | undefined> {
    // TODO: Implement using ffprobe
    // For now, return undefined to skip duration check
    return undefined;
  }
  
  /**
   * Get image dimensions
   */
  private async getDimensions(
    buffer: Buffer,
    format: string
  ): Promise<{ width: number; height: number } | undefined> {
    try {
      // Simple parsing for common formats
      if (format === 'png') {
        // PNG: IHDR chunk at bytes 16-24
        if (buffer.length >= 24) {
          const width = buffer.readUInt32BE(16);
          const height = buffer.readUInt32BE(20);
          return { width, height };
        }
      } else if (format === 'jpeg') {
        // JPEG: scan for SOF marker
        return this.parseJpegDimensions(buffer);
      }
      
      return undefined;
    } catch {
      return undefined;
    }
  }
  
  /**
   * Parse JPEG dimensions
   */
  private parseJpegDimensions(buffer: Buffer): { width: number; height: number } | undefined {
    let offset = 2; // Skip SOI marker
    
    while (offset < buffer.length - 8) {
      // Check for marker
      if (buffer[offset] !== 0xFF) {
        break;
      }
      
      const marker = buffer[offset + 1];
      
      // SOF markers (Start of Frame)
      if ((marker >= 0xC0 && marker <= 0xC3) || 
          (marker >= 0xC5 && marker <= 0xC7) ||
          (marker >= 0xC9 && marker <= 0xCB) ||
          (marker >= 0xCD && marker <= 0xCF)) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        return { width, height };
      }
      
      // Skip to next marker
      const segmentLength = buffer.readUInt16BE(offset + 2);
      offset += segmentLength + 2;
    }
    
    return undefined;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const validator = new MediaValidator();
