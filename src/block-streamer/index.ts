/**
 * Block Streamer Module
 * 
 * Transforms continuous token stream from model into discrete text blocks
 * optimized for different channels (Telegram, WhatsApp, Discord, Web)
 */

// Main exports
export { BlockStreamer, createBlockStreamer } from './BlockStreamer';

// Types
export type {
  // Config types
  BlockStreamerOptions,
  BlockStreamerConfig,
  ChannelProfile,
  ChannelProfileName,
  StreamingMode,
  
  // Block types
  Block,
  StreamingUpdate,
  CompleteSummary,
  
  // State types
  StreamerState,
  StreamerStats,
  
  // Component types
  Chunk,
  CoalescedChunk,
  BreakPoint,
  BreakPointType,
  CodeFenceInfo,
} from './types';

// Channel profiles
export {
  getProfile,
  registerProfile,
  listProfiles,
  validateProfile,
} from './channel-profiles';

// Agent Loop integration
export {
  createForRun,
  connectToModelStream,
  createWithEventEmission,
  createMultiChannel,
  streamToChannels,
} from './agent-loop-integration';

// Components (for advanced usage)
export { createTextBuffer } from './text-buffer';
export { createFenceTracker } from './code-fence-tracker';
export { createBreakPointFinder } from './break-point-finder';
export { createChunker } from './chunker';
export { createCoalescer } from './coalescer';
export { createLineCounter } from './line-counter';
export { createMarkdownSafety } from './markdown-safety';
export { createStreamingHandler } from './streaming-handler';
export { createBatchHandler } from './batch-handler';
export { createBlockHandler } from './block-handler';
