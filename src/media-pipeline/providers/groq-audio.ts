/**
 * Groq Whisper Audio Provider
 * 
 * Uses Groq's Whisper API (OpenAI-compatible) for audio transcription
 * Generally faster than OpenAI Whisper
 */

import { BaseProvider } from './base';
import { ProcessingOptions, ProviderResult } from '../types';
import FormData from 'form-data';

// ============================================================================
// Groq Whisper Provider
// ============================================================================

export class GroqAudioProvider extends BaseProvider {
  private static readonly ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';
  private static readonly MODEL = 'whisper-large-v3';
  private static readonly MAX_SIZE = 25 * 1024 * 1024; // 25MB
  
  constructor() {
    super('groq-whisper', 'audio');
  }
  
  get supportedFormats(): string[] {
    return ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'ogg'];
  }
  
  get maxFileSize(): number {
    return GroqAudioProvider.MAX_SIZE;
  }
  
  get maxDuration(): number | undefined {
    return undefined;
  }
  
  get features(): string[] {
    return ['transcription', 'timestamps', 'language-detection', 'fast'];
  }
  
  protected hasCredentials(): boolean {
    return !!this.config.apiKey;
  }
  
  protected async doProcess(
    buffer: Buffer,
    options: ProcessingOptions
  ): Promise<any> {
    const apiKey = this.getApiKey();
    const endpoint = this.getEndpoint(GroqAudioProvider.ENDPOINT);
    
    // Create form data
    const form = new FormData();
    form.append('file', buffer, {
      filename: options.filename || 'audio.mp3',
      contentType: options.mimeType || 'audio/mpeg',
    });
    form.append('model', GroqAudioProvider.MODEL);
    
    // Response format
    const includeTimestamps = options.includeTimestamps ?? true;
    form.append('response_format', includeTimestamps ? 'verbose_json' : 'json');
    
    // Language (optional)
    if (options.language) {
      form.append('language', options.language);
    }
    
    // Temperature for better accuracy
    form.append('temperature', '0');
    
    // Make request
    const response = await this.fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...form.getHeaders(),
      },
      body: form,
      timeout: this.config.timeout || 300000,
    });
    
    await this.checkResponse(response);
    
    return await response.json();
  }
  
  protected formatResult(raw: any, processingTime: number): ProviderResult {
    return {
      success: true,
      type: 'audio',
      content: raw.text,
      data: {
        transcript: raw.text,
        duration: raw.duration,
        language: raw.language,
        segments: raw.segments?.map((seg: any) => ({
          start: seg.start,
          end: seg.end,
          text: seg.text.trim(),
        })),
      },
      metadata: {
        provider: this.name,
        model: GroqAudioProvider.MODEL,
        processingTime,
        cached: false,
        originalSize: 0,
        truncated: false,
      },
    };
  }
}
