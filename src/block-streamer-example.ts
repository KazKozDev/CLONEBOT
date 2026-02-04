/**
 * Block Streamer Example
 * 
 * Demonstrates real-world usage of Block Streamer with Agent Loop
 */

import { AgentLoop } from './agent-loop';
import { createBlockStreamer } from './block-streamer';
import type { Block } from './block-streamer';

// Mock dependencies for demonstration
const mockDependencies = {
  sessionStore: {} as any,
  contextAssembler: {
    assemble: async () => ({
      systemPrompt: 'You are helpful',
      messages: [],
      tools: [],
      model: 'gpt-4',
      parameters: { modelId: 'gpt-4', temperature: 0.7, maxTokens: 2000 },
      metadata: { tokens: { total: 100 }, counts: {}, truncated: false, compacted: false },
    }),
  } as any,
  modelAdapter: {
    async *stream() {
      const response = `Here's a comprehensive explanation with code:

First paragraph explaining the concept.

Second paragraph with more details.

\`\`\`python
def example_function():
    print("Hello World")
    return 42
\`\`\`

Third paragraph after the code. This includes **bold text** and *italic text* to demonstrate markdown safety.

Final paragraph wrapping up the explanation.`;

      // Simulate streaming tokens
      for (const char of response) {
        await new Promise(resolve => setTimeout(resolve, 10));
        yield { type: 'content', delta: char };
      }

      yield {
        type: 'response',
        id: 'resp-1',
        content: response,
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      };
    },
  } as any,
  toolExecutor: {} as any,
};

// Example 1: Basic Block Mode for Discord
async function discordExample() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📱 DISCORD EXAMPLE (Block Mode)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const agent = new AgentLoop(mockDependencies);
  const handle = await agent.execute({ message: 'Explain this', sessionId: 'discord-user' });

  const streamer = createBlockStreamer({
    profile: 'discord', // maxChars: 2000, maxLines: 17
    mode: 'block',
    onBlock: (block: Block) => {
      console.log(`\n📤 SENDING BLOCK ${block.index}:`);
      console.log('─'.repeat(50));
      console.log(block.content);
      console.log('─'.repeat(50));
      console.log(`   Type: ${block.breakType} | First: ${block.isFirst} | Last: ${block.isLast}`);
      console.log(`   Length: ${block.content.length} chars\n`);
      
      // In real app: await discordChannel.send(block.content)
    },
    onComplete: (summary) => {
      console.log('\n✅ STREAMING COMPLETE');
      console.log(`   Total blocks: ${summary.totalBlocks}`);
      console.log(`   Total chars: ${summary.totalChars}`);
      console.log(`   Duration: ${summary.duration}ms\n`);
    },
  });

  for await (const event of handle.events) {
    if (event.type === 'model.delta') {
      streamer.push(event.delta);
    } else if (event.type === 'model.complete') {
      streamer.complete();
    }
  }
}

// Example 2: Streaming Mode for Telegram
async function telegramExample() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💬 TELEGRAM EXAMPLE (Streaming Mode)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const agent = new AgentLoop(mockDependencies);
  const handle = await agent.execute({ message: 'Explain this', sessionId: 'telegram-user' });

  let messageId: string | null = null;
  let updateCount = 0;

  const streamer = createBlockStreamer({
    profile: 'telegram', // maxChars: 4096, supports edit
    mode: 'streaming',
    onUpdate: (update) => {
      updateCount++;
      
      if (!messageId) {
        console.log('\n📤 INITIAL MESSAGE:');
        console.log('─'.repeat(50));
        console.log(update.fullContent);
        console.log('─'.repeat(50));
        messageId = 'msg-123'; // In real app: messageId = await telegram.sendMessage()
      } else if (updateCount % 10 === 0) { // Throttle updates for demo
        console.log(`\n🔄 UPDATE ${updateCount}:`);
        console.log('─'.repeat(50));
        console.log(update.fullContent.slice(-100)); // Show last 100 chars
        console.log('─'.repeat(50));
        // In real app: await telegram.editMessage(messageId, update.fullContent)
      }
    },
    onComplete: (summary) => {
      console.log('\n✅ FINAL UPDATE');
      console.log(`   Total updates: ${updateCount}`);
      console.log(`   Duration: ${summary.duration}ms\n`);
    },
  });

  for await (const event of handle.events) {
    if (event.type === 'model.delta') {
      streamer.push(event.delta);
    } else if (event.type === 'model.complete') {
      streamer.complete();
    }
  }
}

// Example 3: Multi-Channel Streaming
async function multiChannelExample() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🌐 MULTI-CHANNEL EXAMPLE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const agent = new AgentLoop(mockDependencies);
  const handle = await agent.execute({ message: 'Explain this', sessionId: 'multi-user' });

  // Create streamers for different channels
  const discordStreamer = createBlockStreamer({
    profile: 'discord',
    mode: 'block',
    onBlock: (block) => console.log(`📱 Discord Block ${block.index}: ${block.content.length} chars`),
  });

  const telegramStreamer = createBlockStreamer({
    profile: 'telegram',
    mode: 'streaming',
    onUpdate: (update) => console.log(`💬 Telegram Update: ${update.fullContent.length} chars`),
  });

  const webStreamer = createBlockStreamer({
    profile: 'web',
    mode: 'streaming',
    onUpdate: (update) => console.log(`🌐 Web Update: ${update.fullContent.length} chars`),
  });

  // Stream to all channels simultaneously
  for await (const event of handle.events) {
    if (event.type === 'model.delta') {
      discordStreamer.push(event.delta);
      telegramStreamer.push(event.delta);
      webStreamer.push(event.delta);
    } else if (event.type === 'model.complete') {
      discordStreamer.complete();
      telegramStreamer.complete();
      webStreamer.complete();
      
      console.log('\n✅ All channels updated!\n');
    }
  }
}

// Example 4: Code Fence Protection Demo
async function codeFenceExample() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💻 CODE FENCE PROTECTION DEMO');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const streamer = createBlockStreamer({
    profile: 'discord', // Small limit for demo
    mode: 'block',
    onBlock: (block) => {
      console.log(`\n📦 Block ${block.index}:`);
      console.log(block.content);
      console.log(`   Contains fence: ${block.content.includes('```')}`);
    },
  });

  const textWithCode = `
Here's a code example:

\`\`\`typescript
function example() {
  console.log("This should not be broken");
  return "Code fence protected!";
}
\`\`\`

Text after the code continues here.
`;

  for (const char of textWithCode) {
    streamer.push(char);
  }
  
  streamer.complete();
  console.log('\n✅ Code fence remained intact!\n');
}

// Run examples
async function main() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   BLOCK STREAMER EXAMPLES             ║');
  console.log('╚════════════════════════════════════════╝');

  await discordExample();
  await new Promise(resolve => setTimeout(resolve, 500));
  
  await telegramExample();
  await new Promise(resolve => setTimeout(resolve, 500));
  
  await multiChannelExample();
  await new Promise(resolve => setTimeout(resolve, 500));
  
  await codeFenceExample();

  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   ALL EXAMPLES COMPLETE ✅            ║');
  console.log('╚════════════════════════════════════════╝\n');
}

if (require.main === module) {
  main().catch(console.error);
}

export { discordExample, telegramExample, multiChannelExample, codeFenceExample };
