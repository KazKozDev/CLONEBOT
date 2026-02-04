/**
 * Block Streamer Types
 * 
 * Type definitions for the Block Streamer module
 */

// ============================================================================
// Break Point Types
// ============================================================================

export type BreakPointType = 
  | 'paragraph'  // Priority 1: \n\n
  | 'sentence'   // Priority 2: [.!?] + space
  | 'line'       // Priority 3: \n
  | 'clause'     // Priority 4: [,;:] + space
  | 'word'       // Priority 5: space
  | 'hard';      // Priority 6: forced by limit

export interface BreakPoint {
  position: number;
  type: BreakPointType;
  priority: number;
}

// ============================================================================
// Code Fence Types
// ============================================================================

export interface CodeFenceInfo {
  language?: string;
  startIndex: number;
  marker: '```' | '~~~';
}

export interface FenceTracker {
  update(text: string): void;
  isInFence(): boolean;
  getFenceInfo(): CodeFenceInfo | null;
  reset(): void;
}

// ============================================================================
// Channel Profile Types
// ============================================================================

export type StreamingMode = 'block' | 'streaming' | 'batch';

export interface ChannelProfile {
  maxChars: number | null;
  maxLines: number | null;
  minChars: number;
  supportsEdit: boolean;
  supportsMarkdown: boolean;
  coalesceGap: number;
  defaultMode: StreamingMode;
}

export type ChannelProfileName = 
  | 'telegram'
  | 'whatsapp'
  | 'discord'
  | 'slack'
  | 'web'
  | 'console';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ============================================================================
// Chunk Types
// ============================================================================

export interface Chunk {
  content: string;
  breakType: BreakPointType;
  containsCodeFence: boolean;
  isPartial: boolean;
}

export interface CoalescedChunk {
  content: string;
  parts: Chunk[];
  coalesced: boolean;
}

// ============================================================================
// Block Types
// ============================================================================

export interface Block {
  content: string;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  isContinuation?: boolean;
  breakType: BreakPointType;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface StreamingUpdate {
  fullContent: string;
  delta: string;
  index: number;
}

export interface CompleteSummary {
  totalBlocks: number;
  totalChars: number;
  duration: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface ChunkerConfig {
  minChars: number;
  maxChars: number;
  protectCodeFences: boolean;
}

export interface CoalescerConfig {
  minCoalesceSize: number;
  maxCoalesceSize: number;
  gapMs: number;
}

export interface StreamingHandlerConfig {
  throttleMs: number;
  immediate: boolean;
}

export interface BlockStreamerOptions {
  profile?: ChannelProfileName | ChannelProfile;
  mode?: StreamingMode;
  onBlock?: (block: Block) => void;
  onUpdate?: (update: StreamingUpdate) => void;
  onComplete?: (summary: CompleteSummary) => void;
  onError?: (error: Error) => void;
  
  // Advanced options
  protectCodeFences?: boolean;
  protectMarkdown?: boolean;
  autoCloseConstructs?: boolean;
  enableCoalescing?: boolean;
  customMinChars?: number;
  customMaxChars?: number;
}

export interface BlockStreamerConfig {
  // Defaults
  defaultProfile: ChannelProfileName;
  defaultMode: StreamingMode;
  
  // Chunking
  defaultMinChars: number;
  defaultMaxChars: number;
  
  // Code fence
  protectCodeFences: boolean;
  maxCodeFenceSize: number;
  
  // Coalescing
  enableCoalescing: boolean;
  defaultCoalesceGap: number;
  
  // Markdown
  protectMarkdown: boolean;
  autoCloseConstructs: boolean;
  
  // Performance
  bufferImplementation: 'string' | 'rope';
}

// ============================================================================
// State Types
// ============================================================================

export interface StreamerState {
  bufferedChars: number;
  emittedBlocks: number;
  mode: StreamingMode;
  isInCodeFence: boolean;
  isComplete: boolean;
  isAborted: boolean;
}

export interface StreamerStats {
  totalInputChars: number;
  totalOutputBlocks: number;
  totalOutputChars: number;
  avgBlockSize: number;
  duration: number;
  startTime: number | null;
  endTime: number | null;
}

// ============================================================================
// Event Types
// ============================================================================

export type BlockStreamerEventType = 'block' | 'update' | 'complete' | 'error';

export interface BlockStreamerEvent {
  type: BlockStreamerEventType;
  data: Block | StreamingUpdate | CompleteSummary | Error;
}

// ============================================================================
// Text Buffer Interface
// ============================================================================

export interface TextBuffer {
  append(text: string): void;
  length(): number;
  slice(start: number, end?: number): string;
  clear(): void;
  consume(length: number): string;
  peek(length?: number): string;
  toString(): string;
}

// ============================================================================
// Break Point Finder Interface
// ============================================================================

export interface BreakPointFinder {
  findBreakPoint(text: string, minPos: number, maxPos: number): BreakPoint | null;
}

// ============================================================================
// Chunker Interface
// ============================================================================

export interface Chunker {
  push(text: string): Chunk[];
  flush(): Chunk | null;
  getBufferedLength(): number;
}

// ============================================================================
// Coalescer Interface
// ============================================================================

export interface Coalescer {
  push(chunk: Chunk): CoalescedChunk | null;
  flush(): CoalescedChunk | null;
}

// ============================================================================
// Mode Handler Interfaces
// ============================================================================

export interface StreamingHandler {
  push(delta: string): StreamingUpdate | null;
  complete(): StreamingUpdate;
}

export interface BatchHandler {
  push(text: string): void;
  complete(): Block[];
}

export interface BlockHandler {
  push(text: string): Block[];
  flush(): Block | null;
  complete(): Block | null;
}

// ============================================================================
// Markdown Safety Interface
// ============================================================================

export interface MarkdownSafety {
  isInMarkdownConstruct(text: string, position: number): boolean;
  findSafeBreakPoint(text: string, minPos: number, maxPos: number): number;
  closeOpenConstructs(text: string): string;
  reopenConstructs(text: string): string;
}

// ============================================================================
// Line Counter Interface
// ============================================================================

export interface LineCounter {
  countLines(text: string): number;
  countLinesWithWrap(text: string, maxWidth: number): number;
  findLineBreakPosition(text: string, maxLines: number): number;
}
