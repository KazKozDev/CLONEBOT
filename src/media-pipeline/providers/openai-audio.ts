/**
 * OpenAI Whisper Audio Provider
 * 
 * Uses OpenAI Whisper API for audio transcription
 */

import { BaseProvider } from './base';
import { ProcessingOptions, ProviderResult } from '../types';
import FormData from 'form-data';

// ============================================================================
// OpenAI Whisper Response Types
// ============================================================================

interface WhisperSegment {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
}

interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

interface WhisperResponse {
  task: string;
  language: string;
  duration: number;
  text: string;
  segments?: WhisperSegment[];
  words?: WhisperWord[];
}

// ============================================================================
// OpenAI Audio Provider
// ============================================================================

export class OpenAIAudioProvider extends BaseProvider {
  private static readonly ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
  private static readonly MODEL = 'whisper-1';
  private static readonly MAX_SIZE = 25 * 1024 * 1024; // 25MB
  
  constructor() {
    super('openai-whisper', 'audio');
  }
  
  get supportedFormats(): string[] {
    return ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'];
  }
  
  get maxFileSize(): number {
    return OpenAIAudioProvider.MAX_SIZE;
  }
  
  get maxDuration(): number | undefined {
    return undefined; // No specific duration limit
  }
  
  get features(): string[] {
    return ['transcription', 'timestamps', 'word-level', 'language-detection'];
  }
  
  protected hasCredentials(): boolean {
    return !!this.config.apiKey;
  }
  
  protected async doProcess(
    buffer: Buffer,
    options: ProcessingOptions
  ): Promise<WhisperResponse> {
    const apiKey = this.getApiKey();
    const endpoint = this.getEndpoint(OpenAIAudioProvider.ENDPOINT);
    
    // Create form data
    const form = new FormData();
    form.append('file', buffer, {
      filename: options.filename || 'audio.mp3',
      contentType: options.mimeType || 'audio/mpeg',
    });
    form.append('model', OpenAIAudioProvider.MODEL);
    
    // Response format
    const includeTimestamps = options.includeTimestamps ?? true;
    if (includeTimestamps) {
      form.append('response_format', 'verbose_json');
      form.append('timestamp_granularities[]', 'segment');
      form.append('timestamp_granularities[]', 'word');
    } else {
      form.append('response_format', 'json');
    }
    
    // Language (optional)
    if (options.language) {
      form.append('language', options.language);
    }
    
    // Make request
    const response = await this.fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...form.getHeaders(),
      },
      body: form,
      timeout: this.config.timeout || 300000, // 5 minutes default
    });
    
    await this.checkResponse(response);
    
    const result = await response.json() as WhisperResponse;
    return result;
  }
  
  protected formatResult(raw: WhisperResponse, processingTime: number): ProviderResult {
    return {
      success: true,
      type: 'audio',
      content: raw.text,
      data: {
        transcript: raw.text,
        duration: raw.duration,
        language: raw.language,
        segments: raw.segments?.map(seg => ({
          start: seg.start,
          end: seg.end,
          text: seg.text.trim(),
        })),
      },
      metadata: {
        provider: this.name,
        model: OpenAIAudioProvider.MODEL,
        processingTime,
        cached: false,
        originalSize: 0,
        truncated: false,
      },
    };
  }
}
