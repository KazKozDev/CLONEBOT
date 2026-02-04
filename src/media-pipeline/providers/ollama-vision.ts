/**
 * Ollama Vision Provider
 *
 * Uses Ollama local models for image understanding
 * Supports multimodal models like LLaVA, bakllava, etc.
 */

import { BaseProvider } from './base';
import { ProcessingOptions, ProviderResult, ProcessingMode } from '../types';

// ============================================================================
// Ollama Vision Provider
// ============================================================================

export class OllamaVisionProvider extends BaseProvider {
  private baseUrl: string = 'http://localhost:11434';
  private model: string = 'qwen3-vl:4b';
  private static readonly MAX_SIZE = 20 * 1024 * 1024; // 20MB

  constructor() {
    super('ollama-vision', 'image');
  }

  get supportedFormats(): string[] {
    return ['jpeg', 'jpg', 'png', 'gif', 'webp'];
  }

  get maxFileSize(): number {
    return OllamaVisionProvider.MAX_SIZE;
  }

  get maxDuration(): number | undefined {
    return undefined;
  }

  get features(): string[] {
    return ['description', 'ocr', 'scene-understanding'];
  }

  protected hasCredentials(): boolean {
    // Ollama is local, no API key needed — just check that baseUrl is set
    return true;
  }

  protected async onInitialize(config: any): Promise<void> {
    this.baseUrl = config.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.model = config.visionModel || process.env.OLLAMA_VISION_MODEL || 'qwen3-vl:4b';
  }

  isAvailable(): boolean {
    // Always report as available — actual connectivity checked at request time
    return this.initialized;
  }

  protected async doProcess(
    buffer: Buffer,
    options: ProcessingOptions
  ): Promise<any> {
    // Convert buffer to base64
    const base64 = buffer.toString('base64');

    // Build prompt based on mode
    const prompt = this.buildPrompt(options.mode || 'full');

    // Ollama /api/chat with images
    const requestBody = {
      model: this.model,
      messages: [
        {
          role: 'user',
          content: prompt,
          images: [base64],
        },
      ],
      stream: false,
    };

    const response = await this.fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      timeout: options.timeout || 120000, // vision models can be slow locally
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
    // Ollama /api/chat returns { message: { role, content } }
    const content = raw.message?.content || '';
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
        model: this.model,
        processingTime,
        cached: false,
        originalSize: 0,
        truncated: false,
      },
    };
  }
}
