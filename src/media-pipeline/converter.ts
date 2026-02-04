/**
 * Format Converter
 * 
 * Converts media formats when needed:
 * - HEIC → JPEG
 * - Large images → resized
 * - Unusual audio → MP3/WAV
 * - AVI/MKV → MP4
 */

import { MediaCategory } from './types';
import { exec } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { join } from 'path';
import { promises as fs } from 'fs';
import { randomBytes } from 'crypto';

const execAsync = promisify(exec);

// ============================================================================
// Conversion Options
// ============================================================================

export interface ConversionOptions {
  quality?: number;              // 0-100
  maxDimension?: number;         // For image resize
  targetFormat?: string;
  preserveMetadata?: boolean;
}

export interface ConversionResult {
  buffer: Buffer;
  format: string;
  originalSize: number;
  newSize: number;
  metadata?: {
    width?: number;
    height?: number;
    duration?: number;
  };
}

// ============================================================================
// Format Converter Class
// ============================================================================

export class FormatConverter {
  /**
   * Check if conversion is needed for provider
   */
  needsConversion(
    format: string,
    category: MediaCategory,
    targetProvider: string
  ): boolean {
    // HEIC always needs conversion
    if (format === 'heic' || format === 'heif') {
      return true;
    }
    
    // Unusual video formats
    if (category === 'video' && ['avi', 'mkv', 'wmv', 'flv'].includes(format)) {
      return true;
    }
    
    // Provider-specific requirements
    if (targetProvider === 'openai') {
      // OpenAI supports most common formats
      if (category === 'audio') {
        return !['mp3', 'wav', 'm4a', 'webm'].includes(format);
      }
    }
    
    return false;
  }
  
  /**
   * Convert format
   */
  async convert(
    buffer: Buffer,
    sourceFormat: string,
    targetFormat: string,
    category: MediaCategory,
    options: ConversionOptions = {}
  ): Promise<ConversionResult> {
    switch (category) {
      case 'image':
        return await this.convertImage(buffer, sourceFormat, targetFormat, options);
      case 'audio':
        return await this.convertAudio(buffer, sourceFormat, targetFormat, options);
      case 'video':
        return await this.convertVideo(buffer, sourceFormat, targetFormat, options);
      default:
        throw new Error(`Conversion not supported for category: ${category}`);
    }
  }
  
  /**
   * Resize image if too large
   */
  async resize(
    buffer: Buffer,
    maxDimension: number,
    options: ConversionOptions = {}
  ): Promise<ConversionResult> {
    try {
      // Try using sharp if available
      const sharp = await this.tryImport('sharp');
      if (sharp) {
        return await this.resizeWithSharp(buffer, maxDimension, options);
      }
      
      // Fallback to ImageMagick/ffmpeg
      return await this.resizeWithCLI(buffer, maxDimension, options);
      
    } catch (error) {
      throw new Error(`Image resize failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Convert image format
   */
  private async convertImage(
    buffer: Buffer,
    sourceFormat: string,
    targetFormat: string,
    options: ConversionOptions
  ): Promise<ConversionResult> {
    // HEIC conversion
    if (sourceFormat === 'heic' || sourceFormat === 'heif') {
      try {
        const heicConvert = await this.tryImport('heic-convert');
        if (heicConvert) {
          const converted = await heicConvert({
            buffer,
            format: 'JPEG',
            quality: options.quality || 0.9,
          });
          
          return {
            buffer: Buffer.from(converted),
            format: 'jpeg',
            originalSize: buffer.length,
            newSize: converted.byteLength,
          };
        }
      } catch (err) {
        // Fallback to CLI
      }
    }
    
    // Try sharp for other conversions
    const sharp = await this.tryImport('sharp');
    if (sharp) {
      const image = sharp(buffer);
      
      let processor = image;
      if (targetFormat === 'jpeg') {
        processor = processor.jpeg({ quality: options.quality || 85 });
      } else if (targetFormat === 'png') {
        processor = processor.png({ quality: options.quality || 85 });
      } else if (targetFormat === 'webp') {
        processor = processor.webp({ quality: options.quality || 85 });
      }
      
      const result = await processor.toBuffer();
      const metadata = await sharp(result).metadata();
      
      return {
        buffer: result,
        format: targetFormat,
        originalSize: buffer.length,
        newSize: result.length,
        metadata: {
          width: metadata.width,
          height: metadata.height,
        },
      };
    }
    
    // Fallback to CLI
    return await this.convertImageWithCLI(buffer, sourceFormat, targetFormat, options);
  }
  
  /**
   * Convert audio format using ffmpeg
   */
  private async convertAudio(
    buffer: Buffer,
    sourceFormat: string,
    targetFormat: string,
    options: ConversionOptions
  ): Promise<ConversionResult> {
    const tempInput = await this.writeTempFile(buffer, sourceFormat);
    const tempOutput = this.getTempFilePath(targetFormat);
    
    try {
      // Build ffmpeg command
      let cmd = `ffmpeg -i "${tempInput}" -y`;
      
      if (targetFormat === 'mp3') {
        cmd += ` -codec:a libmp3lame -qscale:a 2`;
      } else if (targetFormat === 'wav') {
        cmd += ` -codec:a pcm_s16le`;
      } else if (targetFormat === 'm4a') {
        cmd += ` -codec:a aac -b:a 128k`;
      }
      
      cmd += ` "${tempOutput}"`;
      
      await execAsync(cmd);
      
      const result = await fs.readFile(tempOutput);
      
      return {
        buffer: result,
        format: targetFormat,
        originalSize: buffer.length,
        newSize: result.length,
      };
      
    } finally {
      // Cleanup temp files
      await this.cleanupTempFile(tempInput);
      await this.cleanupTempFile(tempOutput);
    }
  }
  
  /**
   * Convert video format using ffmpeg
   */
  private async convertVideo(
    buffer: Buffer,
    sourceFormat: string,
    targetFormat: string,
    options: ConversionOptions
  ): Promise<ConversionResult> {
    const tempInput = await this.writeTempFile(buffer, sourceFormat);
    const tempOutput = this.getTempFilePath(targetFormat);
    
    try {
      // Build ffmpeg command
      let cmd = `ffmpeg -i "${tempInput}" -y`;
      
      if (targetFormat === 'mp4') {
        cmd += ` -codec:v libx264 -codec:a aac -preset fast -crf 23`;
      } else if (targetFormat === 'webm') {
        cmd += ` -codec:v libvpx-vp9 -codec:a libopus`;
      }
      
      cmd += ` "${tempOutput}"`;
      
      await execAsync(cmd);
      
      const result = await fs.readFile(tempOutput);
      
      return {
        buffer: result,
        format: targetFormat,
        originalSize: buffer.length,
        newSize: result.length,
      };
      
    } finally {
      // Cleanup temp files
      await this.cleanupTempFile(tempInput);
      await this.cleanupTempFile(tempOutput);
    }
  }
  
  /**
   * Resize image using sharp
   */
  private async resizeWithSharp(
    buffer: Buffer,
    maxDimension: number,
    options: ConversionOptions
  ): Promise<ConversionResult> {
    const sharp = await this.tryImport('sharp');
    if (!sharp) {
      throw new Error('sharp not available');
    }
    
    const image = sharp(buffer);
    const metadata = await image.metadata();
    
    // Check if resize needed
    if (metadata.width && metadata.height) {
      if (metadata.width <= maxDimension && metadata.height <= maxDimension) {
        return {
          buffer,
          format: metadata.format || 'jpeg',
          originalSize: buffer.length,
          newSize: buffer.length,
          metadata: {
            width: metadata.width,
            height: metadata.height,
          },
        };
      }
    }
    
    // Resize
    const result = await image
      .resize(maxDimension, maxDimension, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: options.quality || 85 })
      .toBuffer();
    
    const newMetadata = await sharp(result).metadata();
    
    return {
      buffer: result,
      format: 'jpeg',
      originalSize: buffer.length,
      newSize: result.length,
      metadata: {
        width: newMetadata.width,
        height: newMetadata.height,
      },
    };
  }
  
  /**
   * Resize image using CLI (ImageMagick or ffmpeg)
   */
  private async resizeWithCLI(
    buffer: Buffer,
    maxDimension: number,
    options: ConversionOptions
  ): Promise<ConversionResult> {
    const tempInput = await this.writeTempFile(buffer, 'jpg');
    const tempOutput = this.getTempFilePath('jpg');
    
    try {
      // Try ImageMagick
      try {
        await execAsync(
          `convert "${tempInput}" -resize ${maxDimension}x${maxDimension}\\> "${tempOutput}"`
        );
      } catch {
        // Try ffmpeg
        await execAsync(
          `ffmpeg -i "${tempInput}" -vf scale='min(${maxDimension},iw)':'min(${maxDimension},ih)':force_original_aspect_ratio=decrease -y "${tempOutput}"`
        );
      }
      
      const result = await fs.readFile(tempOutput);
      
      return {
        buffer: result,
        format: 'jpeg',
        originalSize: buffer.length,
        newSize: result.length,
      };
      
    } finally {
      await this.cleanupTempFile(tempInput);
      await this.cleanupTempFile(tempOutput);
    }
  }
  
  /**
   * Convert image using CLI
   */
  private async convertImageWithCLI(
    buffer: Buffer,
    sourceFormat: string,
    targetFormat: string,
    options: ConversionOptions
  ): Promise<ConversionResult> {
    const tempInput = await this.writeTempFile(buffer, sourceFormat);
    const tempOutput = this.getTempFilePath(targetFormat);
    
    try {
      await execAsync(`convert "${tempInput}" "${tempOutput}"`);
      const result = await fs.readFile(tempOutput);
      
      return {
        buffer: result,
        format: targetFormat,
        originalSize: buffer.length,
        newSize: result.length,
      };
      
    } finally {
      await this.cleanupTempFile(tempInput);
      await this.cleanupTempFile(tempOutput);
    }
  }
  
  /**
   * Try to import a module
   */
  private async tryImport(moduleName: string): Promise<any> {
    try {
      return await import(moduleName);
    } catch {
      return null;
    }
  }
  
  /**
   * Write buffer to temp file
   */
  private async writeTempFile(buffer: Buffer, extension: string): Promise<string> {
    const filepath = this.getTempFilePath(extension);
    await fs.writeFile(filepath, buffer);
    return filepath;
  }
  
  /**
   * Get temp file path
   */
  private getTempFilePath(extension: string): string {
    const random = randomBytes(8).toString('hex');
    return join(tmpdir(), `media_${random}.${extension}`);
  }
  
  /**
   * Cleanup temp file
   */
  private async cleanupTempFile(filepath: string): Promise<void> {
    try {
      await fs.unlink(filepath);
    } catch {
      // Ignore errors
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const converter = new FormatConverter();
