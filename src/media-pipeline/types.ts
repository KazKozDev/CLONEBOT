/**
 * Media Pipeline Types
 * 
 * Type definitions for media processing system
 */

// ============================================================================
// Media Categories and Formats
// ============================================================================

export type MediaCategory = 'image' | 'audio' | 'video' | 'document' | 'unknown';

export interface MediaTypeInfo {
  category: MediaCategory;
  format: string;          // jpeg, png, mp3, pdf, etc.
  mimeType: string;
  confidence: number;      // 0-1
}

// ============================================================================
// Input Types
// ============================================================================

export type MediaInput = 
  | { type: 'buffer'; data: Buffer; filename?: string; mimeType?: string }
  | { type: 'path'; path: string }
  | { type: 'url'; url: string }
  | { type: 'stream'; stream: NodeJS.ReadableStream; filename?: string; mimeType?: string };

// ============================================================================
// Validation
// ============================================================================

export type ValidationErrorCode = 
  | 'TOO_LARGE' 
  | 'UNSUPPORTED_FORMAT' 
  | 'CORRUPTED' 
  | 'TOO_LONG'
  | 'EMPTY'
  | 'INVALID_MIME';

export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  limit?: number;
  actual?: number;
}

export interface ValidationWarning {
  code: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  metadata: {
    size: number;
    format: string;
    duration?: number;
    dimensions?: { width: number; height: number };
  };
}

// ============================================================================
// Provider Types
// ============================================================================

export interface ProviderConfig {
  apiKey?: string;
  endpoint?: string;
  timeout?: number;
  [key: string]: any;
}

export interface ProviderInfo {
  name: string;
  type: MediaCategory;
  enabled: boolean;
  hasCredentials: boolean;
  supportedFormats: string[];
  limits: {
    maxFileSize: number;
    maxDuration?: number;
  };
  features: string[];
}

export interface ProviderResult {
  success: boolean;
  type: MediaCategory;
  content: string;
  data: any;
  metadata: {
    provider: string;
    model?: string;
    processingTime: number;
    cached: boolean;
    originalSize: number;
    truncated: boolean;
  };
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface MediaProvider {
  name: string;
  type: MediaCategory;
  
  // Capabilities
  supportedFormats: string[];
  maxFileSize: number;
  maxDuration?: number;
  features: string[];
  
  // Lifecycle
  initialize(config: ProviderConfig): Promise<void>;
  isAvailable(): boolean;
  
  // Processing
  process(input: Buffer, options: ProcessingOptions): Promise<ProviderResult>;
  
  // Optional streaming
  processStream?(input: Buffer, options: ProcessingOptions): AsyncIterable<ProviderChunk>;
}

export interface ProviderChunk {
  type: 'progress' | 'partial' | 'final';
  content?: string;
  progress?: number;
}

// ============================================================================
// Processing Options
// ============================================================================

export type ProcessingMode = 'full' | 'summary' | 'ocr';

export interface ProcessingOptions {
  // Type hints
  type?: MediaCategory;
  mimeType?: string;
  filename?: string;
  
  // Processing mode
  mode?: ProcessingMode;
  language?: string;          // For transcription
  
  // Provider selection
  provider?: string;          // Force specific provider
  
  // Output control
  maxLength?: number;
  includeTimestamps?: boolean;
  includeDiarization?: boolean;
  
  // Performance
  timeout?: number;
  onProgress?: (progress: ProgressUpdate) => void;
}

export interface ProgressUpdate {
  stage: string;
  percent: number;
  message?: string;
  eta?: number;
}

// ============================================================================
// Results
// ============================================================================

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export interface DetectedObject {
  name: string;
  confidence: number;
  bbox?: { x: number; y: number; width: number; height: number };
}

export interface FrameDescription {
  timestamp: number;
  description: string;
}

export interface Table {
  page?: number;
  rows: string[][];
  headers?: string[];
}

export interface DocumentMetadata {
  title?: string;
  author?: string;
  pages?: number;
  createdAt?: Date;
  modifiedAt?: Date;
}

export interface AudioData {
  transcript: string;
  duration?: number;
  language?: string;
  segments?: TranscriptSegment[];
}

export interface ImageData {
  description?: string;
  ocrText?: string;
  objects?: DetectedObject[];
}

export interface VideoData {
  description?: string;
  transcript?: string;
  duration?: number;
  frames?: FrameDescription[];
}

export interface DocumentData {
  text: string;
  pages?: number;
  tables?: Table[];
  metadata?: DocumentMetadata;
}

export interface MediaResult {
  success: boolean;
  type: MediaCategory;
  
  // Main result
  content: string;
  
  // Structured data (depends on type)
  data: AudioData | ImageData | VideoData | DocumentData;
  
  // Metadata
  metadata: {
    provider: string;
    model?: string;
    processingTime: number;
    cached: boolean;
    originalSize: number;
    truncated: boolean;
  };
  
  // Error info (if success: false)
  error?: {
    code: string;
    message: string;
    provider?: string;
    retryable: boolean;
  };
}

// ============================================================================
// Cache
// ============================================================================

export interface CachedResult {
  result: MediaResult;
  timestamp: number;
  hits: number;
}

export interface CacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  evictions: number;
}

// ============================================================================
// Configuration
// ============================================================================

export interface MediaLimits {
  maxImageSize: number;
  maxAudioSize: number;
  maxVideoSize: number;
  maxDocumentSize: number;
  maxAudioDuration: number;
  maxVideoDuration: number;
}

export interface ProcessingConfig {
  defaultLanguage?: string;
  imageMaxDimension: number;
  includeTimestamps: boolean;
  includeDiarization: boolean;
}

export interface CacheConfig {
  enabled: boolean;
  maxSize: number;
  ttl: number;
  persistent: boolean;
  persistPath?: string;
}

export interface CLIConfig {
  enabled: boolean;
  whisperPath?: string;
  ffmpegPath?: string;
}

export interface TimeoutConfig {
  upload: number;
  processing: number;
  total: number;
}

export interface MediaPipelineConfig {
  providers: {
    [providerName: string]: ProviderConfig;
  };
  
  priorities: {
    audio: string[];
    image: string[];
    video: string[];
    document: string[];
  };
  
  limits: MediaLimits;
  processing: ProcessingConfig;
  cache: CacheConfig;
  cli: CLIConfig;
  timeouts: TimeoutConfig;
}

// ============================================================================
// Cost Estimation
// ============================================================================

export interface CostEstimate {
  provider: string;
  estimated: number;
  currency: string;
  breakdown: {
    input: number;
    processing: number;
  };
}

// ============================================================================
// Format Info
// ============================================================================

export interface FormatInfo {
  category: MediaCategory;
  formats: {
    format: string;
    extensions: string[];
    mimeTypes: string[];
    maxSize: number;
    maxDuration?: number;
    providers: string[];
  }[];
}
