/**
 * Anthropic Claude Vision Provider
 * 
 * Uses Anthropic Claude for image understanding
 */

import { BaseProvider } from './base';
import { ProcessingOptions, ProviderResult, ProcessingMode } from '../types';

// ============================================================================
// Anthropic Vision Provider
// ============================================================================

export class AnthropicVisionProvider extends BaseProvider {
  private static readonly ENDPOINT = 'https://api.anthropic.com/v1/messages';
  private static readonly MODEL = 'claude-3-5-sonnet-20241022';
  private static readonly MAX_SIZE = 20 * 1024 * 1024; // 20MB
  
  constructor() {
    super('anthropic-vision', 'image');
  }
  
  get supportedFormats(): string[] {
    return ['jpeg', 'jpg', 'png', 'gif', 'webp'];
  }
  
  get maxFileSize(): number {
    return AnthropicVisionProvider.MAX_SIZE;
  }
  
  get maxDuration(): number | undefined {
    return undefined;
  }
  
  get features(): string[] {
    return ['description', 'ocr', 'object-detection', 'scene-understanding'];
  }
  
  protected hasCredentials(): boolean {
    return !!this.config.apiKey;
  }
  
  protected async doProcess(
    buffer: Buffer,
    options: ProcessingOptions
  ): Promise<any> {
    const apiKey = this.getApiKey();
    const endpoint = this.getEndpoint(AnthropicVisionProvider.ENDPOINT);
    
    // Convert buffer to base64
    const base64 = buffer.toString('base64');
    const mediaType = this.getMediaType(options.mimeType);
    
    // Build prompt based on mode
    const prompt = this.buildPrompt(options.mode || 'full');
    
    // Build request
    const requestBody = {
      model: AnthropicVisionProvider.MODEL,
      max_tokens: options.maxLength || 2000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    };
    
    // Make request
    const response = await this.fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      timeout: this.config.timeout || 60000,
    });
    
    await this.checkResponse(response);
    
    const result = await response.json();
    return result;
  }
  
  /**
   * Get media type for Anthropic API
   */
  private getMediaType(mimeType?: string): string {
    if (!mimeType) return 'image/jpeg';
    
    // Anthropic accepts: image/jpeg, image/png, image/gif, image/webp
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    
    if (allowed.includes(mimeType)) {
      return mimeType;
    }
    
    // Default to JPEG
    return 'image/jpeg';
  }
  
  /**
   * Build prompt based on processing mode
   */
  private buildPrompt(mode: ProcessingMode): string {
    switch (mode) {
      case 'ocr':
        return 'Extract and transcribe all visible text from this image. Return only the text content, preserving formatting and structure where possible.';
      
      case 'summary':
        return 'Provide a brief, concise description of this image in 2-3 sentences.';
      
      case 'full':
      default:
        return 'Analyze this image comprehensively:\n' +
               '1. Describe what you see in detail\n' +
               '2. If there is any visible text, transcribe it\n' +
               '3. Identify any notable objects, people, or elements\n' +
               '4. Describe the scene, setting, and context';
    }
  }
  
  /**
   * Parse response to extract description and OCR text
   */
  private parseResponse(content: string, mode: ProcessingMode): {
    description?: string;
    ocrText?: string;
  } {
    if (mode === 'ocr') {
      return {
        ocrText: content.trim(),
      };
    }
    
    if (mode === 'summary') {
      return {
        description: content.trim(),
      };
    }
    
    // For full mode, try to separate description and OCR
    const lines = content.split('\n');
    let description = '';
    let ocrText = '';
    let inOcrSection = false;
    
    for (const line of lines) {
      const lower = line.toLowerCase();
      
      if (lower.includes('text:') || lower.includes('transcription:') || 
          lower.includes('visible text:')) {
        inOcrSection = true;
        continue;
      }
      
      if (inOcrSection) {
        ocrText += line + '\n';
      } else {
        description += line + '\n';
      }
    }
    
    return {
      description: description.trim() || content.trim(),
      ocrText: ocrText.trim() || undefined,
    };
  }
  
  protected formatResult(raw: any, processingTime: number): ProviderResult {
    // Extract text from Claude's response
    const textContent = raw.content?.find((c: any) => c.type === 'text');
    const content = textContent?.text || '';
    
    const mode = 'full'; // TODO: Get from context
    const parsed = this.parseResponse(content, mode);
    
    return {
      success: true,
      type: 'image',
      content,
      data: {
        description: parsed.description,
        ocrText: parsed.ocrText,
      },
      metadata: {
        provider: this.name,
        model: AnthropicVisionProvider.MODEL,
        processingTime,
        cached: false,
        originalSize: 0,
        truncated: false,
      },
    };
  }
}
