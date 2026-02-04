/**
 * Agent Loop Integration for Block Streamer
 * 
 * Connects BlockStreamer to Agent Loop model output
 */

import { createBlockStreamer } from './BlockStreamer';
import type { BlockStreamer } from './BlockStreamer';
import type { Block, ChannelProfileName, StreamingMode } from './types';

/**
 * Create BlockStreamer for an Agent Loop run
 */
export function createForRun(
  runId: string,
  channelProfile: ChannelProfileName = 'web',
  onBlock?: (block: Block) => void
): BlockStreamer {
  return createBlockStreamer({
    profile: channelProfile,
    mode: 'block',
    onBlock: (block) => {
      // Add run context to block
      const enrichedBlock = {
        ...block,
        metadata: {
          ...block.metadata,
          runId,
        },
      };
      
      if (onBlock) {
        onBlock(enrichedBlock);
      }
    },
  });
}

/**
 * Connect BlockStreamer to Agent Loop model delta stream
 * 
 * @example
 * ```typescript
 * const agentLoop = new AgentLoop(dependencies);
 * const handle = await agentLoop.execute({ message: 'Hello' });
 * 
 * const streamer = createForRun(handle.runId, 'telegram');
 * 
 * for await (const event of handle.events) {
 *   if (event.type === 'model.delta') {
 *     streamer.push(event.delta);
 *   }
 *   
 *   if (event.type === 'model.complete') {
 *     streamer.complete();
 *   }
 * }
 * ```
 */
export async function connectToModelStream(
  streamer: BlockStreamer,
  modelStream: AsyncIterable<any>
): Promise<void> {
  for await (const event of modelStream) {
    if (event.type === 'model.delta' || event.type === 'content') {
      streamer.push(event.delta || event.content || '');
    }
    
    if (event.type === 'model.complete' || event.type === 'run.completed') {
      streamer.complete();
      break;
    }
    
    if (event.type === 'run.cancelled' || event.type === 'run.error') {
      streamer.abort();
      break;
    }
  }
}

/**
 * Create streamer that emits blocks as Agent Loop events
 * 
 * This allows blocks to appear in the run event stream
 */
export function createWithEventEmission(
  runId: string,
  channelProfile: ChannelProfileName,
  eventEmitter: (event: any) => void
): BlockStreamer {
  return createBlockStreamer({
    profile: channelProfile,
    mode: 'block',
    onBlock: (block) => {
      eventEmitter({
        type: 'block.ready',
        runId,
        block,
      });
    },
    onComplete: (summary) => {
      eventEmitter({
        type: 'block.complete',
        runId,
        summary,
      });
    },
  });
}

/**
 * Multi-channel streaming
 * 
 * Stream to multiple channels simultaneously with different profiles
 */
export function createMultiChannel(
  runId: string,
  channels: Array<{
    name: ChannelProfileName;
    onBlock: (block: Block) => void;
  }>
): BlockStreamer[] {
  return channels.map(channel =>
    createForRun(runId, channel.name, channel.onBlock)
  );
}

/**
 * Stream model output to multiple channels
 */
export async function streamToChannels(
  modelStream: AsyncIterable<any>,
  channels: Array<{
    profile: ChannelProfileName;
    onBlock: (block: Block) => void;
  }>
): Promise<void> {
  const streamers = channels.map(channel =>
    createBlockStreamer({
      profile: channel.profile,
      mode: 'block',
      onBlock: channel.onBlock,
    })
  );
  
  for await (const event of modelStream) {
    if (event.type === 'model.delta') {
      streamers.forEach(s => s.push(event.delta));
    }
    
    if (event.type === 'model.complete') {
      streamers.forEach(s => s.complete());
      break;
    }
  }
}
