/**
 * OpenAI Vision Provider
 * 
 * Uses OpenAI GPT-4 Vision for image understanding
 */

import { BaseProvider } from './base';
import { ProcessingOptions, ProviderResult, ProcessingMode } from '../types';

// ============================================================================
// OpenAI Vision Provider
// ============================================================================

export class OpenAIVisionProvider extends BaseProvider {
  private static readonly ENDPOINT = 'https://api.openai.com/v1/chat/completions';
  private static readonly MODEL = 'gpt-4-vision-preview';
  private static readonly MAX_SIZE = 20 * 1024 * 1024; // 20MB
  
  constructor() {
    super('openai-vision', 'image');
  }
  
  get supportedFormats(): string[] {
    return ['jpeg', 'jpg', 'png', 'gif', 'webp'];
  }
  
  get maxFileSize(): number {
    return OpenAIVisionProvider.MAX_SIZE;
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
    const endpoint = this.getEndpoint(OpenAIVisionProvider.ENDPOINT);
    
    // Convert buffer to base64
    const base64 = buffer.toString('base64');
    const mimeType = options.mimeType || 'image/jpeg';
    const dataUrl = `data:${mimeType};base64,${base64}`;
    
    // Build prompt based on mode
    const prompt = this.buildPrompt(options.mode || 'full');
    
    // Build request
    const requestBody = {
      model: OpenAIVisionProvider.MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: dataUrl,
                detail: 'high',
              },
            },
          ],
        },
      ],
      max_tokens: options.maxLength || 2000,
    };
    
    // Make request
    const response = await this.fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
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
      
      if (lower.includes('text:') || lower.includes('transcription:')) {
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
    const content = raw.choices?.[0]?.message?.content || '';
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
        model: OpenAIVisionProvider.MODEL,
        processingTime,
        cached: false,
        originalSize: 0,
        truncated: false,
      },
    };
  }
}
