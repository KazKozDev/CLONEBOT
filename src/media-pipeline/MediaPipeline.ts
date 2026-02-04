/**
 * Media Pipeline
 * 
 * Main facade for media processing system
 */

import {
  MediaInput,
  MediaResult,
  MediaCategory,
  ProcessingOptions,
  MediaPipelineConfig,
  ProviderInfo,
  FormatInfo,
  MediaTypeInfo,
  ValidationResult,
  CacheStats,
  ProgressUpdate,
} from './types';

import { MediaTypeDetector } from './detector';
import { MediaValidator } from './validator';
import { FormatConverter } from './converter';
import { ProviderChain } from './provider-chain';
import { ResultCache } from './cache';

import { OpenAIAudioProvider } from './providers/openai-audio';
import { GroqAudioProvider } from './providers/groq-audio';
import { CLIAudioProvider } from './providers/cli-audio';
import { OpenAIVisionProvider } from './providers/openai-vision';
import { AnthropicVisionProvider } from './providers/anthropic-vision';
import { OllamaVisionProvider } from './providers/ollama-vision';
import { DocumentProvider } from './providers/document';

import { promises as fs } from 'fs';

// ============================================================================
// Media Pipeline
// ============================================================================

export class MediaPipeline {
  private detector: MediaTypeDetector;
  private validator: MediaValidator;
  private converter: FormatConverter;
  private cache: ResultCache;
  
  private chains: Map<MediaCategory, ProviderChain> = new Map();
  private config: MediaPipelineConfig;
  
  constructor(config: Partial<MediaPipelineConfig> = {}) {
    this.config = this.mergeConfig(config);
    
    this.detector = new MediaTypeDetector();
    this.validator = new MediaValidator(this.config.limits);
    this.converter = new FormatConverter();
    
    this.cache = new ResultCache(
      this.config.cache.maxSize,
      this.config.cache.ttl
    );
    
    // Initialize providers
    this.initializeProviders();
  }
  
  /**
   * Merge config with defaults
   */
  private mergeConfig(config: Partial<MediaPipelineConfig>): MediaPipelineConfig {
    return {
      providers: config.providers || {},
      priorities: {
        audio: config.priorities?.audio || ['openai', 'groq', 'cli'],
        image: config.priorities?.image || ['ollama-vision', 'openai', 'anthropic'],
        video: config.priorities?.video || [],
        document: config.priorities?.document || ['builtin'],
      },
      limits: {
        maxImageSize: 20 * 1024 * 1024,
        maxAudioSize: 25 * 1024 * 1024,
        maxVideoSize: 100 * 1024 * 1024,
        maxDocumentSize: 50 * 1024 * 1024,
        maxAudioDuration: 14400,
        maxVideoDuration: 600,
        ...config.limits,
      },
      processing: {
        defaultLanguage: undefined,
        imageMaxDimension: 4096,
        includeTimestamps: true,
        includeDiarization: false,
        ...config.processing,
      },
      cache: {
        enabled: true,
        maxSize: 500 * 1024 * 1024,
        ttl: 86400000,
        persistent: false,
        ...config.cache,
      },
      cli: {
        enabled: true,
        ...config.cli,
      },
      timeouts: {
        upload: 60000,
        processing: 300000,
        total: 600000,
        ...config.timeouts,
      },
    };
  }
  
  /**
   * Initialize providers
   */
  private async initializeProviders(): Promise<void> {
    // Audio providers
    const audioProviders = [];
    
    if (this.config.providers.openai?.apiKey) {
      const openai = new OpenAIAudioProvider();
      await openai.initialize(this.config.providers.openai);
      audioProviders.push(openai);
    }
    
    if (this.config.providers.groq?.apiKey) {
      const groq = new GroqAudioProvider();
      await groq.initialize(this.config.providers.groq);
      audioProviders.push(groq);
    }
    
    if (this.config.cli.enabled) {
      const cli = new CLIAudioProvider();
      await cli.initialize(this.config.cli);
      if (cli.isAvailable()) {
        audioProviders.push(cli);
      }
    }
    
    // Sort by priority
    const sortedAudio = this.sortByPriority(audioProviders, this.config.priorities.audio);
    this.chains.set('audio', new ProviderChain('audio', sortedAudio));
    
    // Image providers
    const imageProviders = [];

    if (this.config.providers.ollama) {
      const ollama = new OllamaVisionProvider();
      await ollama.initialize(this.config.providers.ollama);
      imageProviders.push(ollama);
    }

    if (this.config.providers.openai?.apiKey) {
      const openai = new OpenAIVisionProvider();
      await openai.initialize(this.config.providers.openai);
      imageProviders.push(openai);
    }

    if (this.config.providers.anthropic?.apiKey) {
      const anthropic = new AnthropicVisionProvider();
      await anthropic.initialize(this.config.providers.anthropic);
      imageProviders.push(anthropic);
    }
    
    const sortedImage = this.sortByPriority(imageProviders, this.config.priorities.image);
    this.chains.set('image', new ProviderChain('image', sortedImage));
    
    // Document providers
    const docProvider = new DocumentProvider();
    await docProvider.initialize({});
    this.chains.set('document', new ProviderChain('document', [docProvider]));
  }
  
  /**
   * Sort providers by priority
   */
  private sortByPriority(providers: any[], priorities: string[]): any[] {
    return providers.sort((a, b) => {
      const aIndex = priorities.indexOf(a.name);
      const bIndex = priorities.indexOf(b.name);
      
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      
      return aIndex - bIndex;
    });
  }
  
  // ==========================================================================
  // Main Processing
  // ==========================================================================
  
  /**
   * Process media
   */
  async process(input: MediaInput, options: ProcessingOptions = {}): Promise<MediaResult> {
    const startTime = Date.now();
    
    try {
      // Report progress
      this.reportProgress(options, 'detecting', 0, 'Detecting media type...');
      
      // Get buffer
      const buffer = await this.getBuffer(input);
      
      // Detect type
      const typeInfo = this.detector.detect(input);
      const category = options.type || typeInfo.category;
      
      if (category === 'unknown') {
        return this.createErrorResult('UNKNOWN_TYPE', 'Could not determine media type');
      }
      
      // Validate
      this.reportProgress(options, 'validating', 10, 'Validating media...');
      
      const validation = await this.validator.validate(input, category);
      if (!validation.valid) {
        const errorMsg = validation.errors.map(e => e.message).join('; ');
        return this.createErrorResult('VALIDATION_FAILED', errorMsg);
      }
      
      // Check cache
      if (this.config.cache.enabled) {
        this.reportProgress(options, 'cache-check', 20, 'Checking cache...');
        
        const chain = this.chains.get(category);
        if (chain) {
          const providers = chain.getProviders();
          const provider = providers[0];
          if (provider) {
            const cacheKey = this.cache.generateKey(buffer, provider.name, options);
            const cached = this.cache.get(cacheKey);
            
            if (cached) {
              return cached;
            }
          }
        }
      }
      
      // Convert format if needed
      let processBuffer = buffer;
      const chain = this.chains.get(category);
      
      if (!chain) {
        return this.createErrorResult('NO_PROVIDER', `No provider available for ${category}`);
      }
      
      const providers = chain.getProviders();
      if (providers.length > 0) {
        const provider = providers[0];
        
        if (this.converter.needsConversion(typeInfo.format, category, provider.name)) {
          this.reportProgress(options, 'converting', 30, 'Converting format...');
          
          const targetFormat = this.getTargetFormat(category, provider);
          const converted = await this.converter.convert(
            buffer,
            typeInfo.format,
            targetFormat,
            category,
            { maxDimension: this.config.processing.imageMaxDimension }
          );
          processBuffer = converted.buffer;
        }
      }
      
      // Process
      this.reportProgress(options, 'processing', 50, 'Processing media...');
      
      const result = await chain.process(processBuffer, {
        ...options,
        includeTimestamps: options.includeTimestamps ?? this.config.processing.includeTimestamps,
        language: options.language || this.config.processing.defaultLanguage,
      });
      
      if (!result.success) {
        return result;
      }
      
      // Update metadata
      result.metadata.originalSize = buffer.length;
      result.metadata.cached = false;
      
      // Cache result
      if (this.config.cache.enabled && providers.length > 0) {
        const cacheKey = this.cache.generateKey(buffer, providers[0].name, options);
        this.cache.set(cacheKey, result);
      }
      
      // Report complete
      this.reportProgress(options, 'complete', 100, 'Complete');
      
      return result;
      
    } catch (error) {
      return this.createErrorResult(
        'PROCESSING_ERROR',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }
  
  /**
   * Get target format for provider
   */
  private getTargetFormat(category: MediaCategory, provider: any): string {
    const formats = provider.supportedFormats;
    
    if (category === 'image') {
      return formats.includes('jpeg') ? 'jpeg' : formats[0];
    } else if (category === 'audio') {
      return formats.includes('mp3') ? 'mp3' : formats[0];
    } else if (category === 'video') {
      return formats.includes('mp4') ? 'mp4' : formats[0];
    }
    
    return formats[0];
  }
  
  // ==========================================================================
  // Type-Specific Shortcuts
  // ==========================================================================
  
  /**
   * Transcribe audio
   */
  async transcribe(input: MediaInput, options: ProcessingOptions = {}): Promise<MediaResult> {
    return this.process(input, { ...options, type: 'audio' });
  }
  
  /**
   * Describe image
   */
  async describeImage(input: MediaInput, options: ProcessingOptions = {}): Promise<MediaResult> {
    return this.process(input, { ...options, type: 'image', mode: 'full' });
  }
  
  /**
   * Extract text from document
   */
  async extractText(input: MediaInput, options: ProcessingOptions = {}): Promise<MediaResult> {
    return this.process(input, { ...options, type: 'document' });
  }
  
  // ==========================================================================
  // Utilities
  // ==========================================================================
  
  /**
   * Detect media type
   */
  detectType(input: MediaInput): MediaTypeInfo {
    return this.detector.detect(input);
  }
  
  /**
   * Validate media
   */
  async validate(input: MediaInput, type?: MediaCategory): Promise<ValidationResult> {
    return this.validator.validate(input, type);
  }
  
  /**
   * Get supported formats
   */
  getSupportedFormats(): FormatInfo[] {
    // TODO: Build from providers
    return [];
  }
  
  /**
   * Get providers for category
   */
  getProviders(type: MediaCategory): ProviderInfo[] {
    const chain = this.chains.get(type);
    if (!chain) return [];
    
    return chain.getProviders().map(p => ({
      name: p.name,
      type: p.type,
      enabled: p.isAvailable(),
      hasCredentials: p.isAvailable(),
      supportedFormats: p.supportedFormats,
      limits: {
        maxFileSize: p.maxFileSize,
        maxDuration: p.maxDuration,
      },
      features: p.features,
    }));
  }
  
  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
  
  /**
   * Get cache stats
   */
  getCacheStats(): CacheStats {
    return this.cache.getStats();
  }
  
  // ==========================================================================
  // Helper Methods
  // ==========================================================================
  
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
        const response = await fetch(input.url);
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      
      case 'stream':
        return await this.streamToBuffer(input.stream);
    }
  }
  
  /**
   * Convert stream to buffer
   */
  private streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', chunk => chunks.push(Buffer.from(chunk)));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }
  
  /**
   * Report progress
   */
  private reportProgress(
    options: ProcessingOptions,
    stage: string,
    percent: number,
    message: string
  ): void {
    if (options.onProgress) {
      options.onProgress({ stage, percent, message });
    }
  }
  
  /**
   * Create error result
   */
  private createErrorResult(code: string, message: string): MediaResult {
    return {
      success: false,
      type: 'unknown',
      content: '',
      data: {},
      metadata: {
        provider: 'pipeline',
        processingTime: 0,
        cached: false,
        originalSize: 0,
        truncated: false,
      },
      error: {
        code,
        message,
        retryable: false,
      },
    };
  }
}
