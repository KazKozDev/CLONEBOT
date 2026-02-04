/**
 * Browser Controller + Agent Loop Integration Example
 * 
 * Shows how to use browser automation within an agent conversation
 */

import { AgentLoop } from '../agent-loop/AgentLoop.js';
import { ToolExecutor } from '../tool-executor/ToolExecutor.js';
import { registerBrowserTools } from '../tool-executor/browser-tools.js';
import { SessionStore } from '../session-store/SessionStore.js';
import { MessageBus } from '../message-bus/MessageBus.js';
import { ContextAssembler } from '../context-assembler/ContextAssembler.js';
import { ModelAdapter } from '../model-adapter/ModelAdapter.js';

async function main() {
  console.log('=== Browser + Agent Loop Integration ===\n');
  
  // ============================================================================
  // 1. Initialize Core Components
  // ============================================================================
  
  const messageBus = new MessageBus();
  const sessionStore = new SessionStore();
  const toolExecutor = new ToolExecutor();
  
  // Register browser tools
  const { cleanup: cleanupBrowser } = registerBrowserTools(toolExecutor, {
    mode: 'chrome', // Use existing Chrome instance
    headless: false // Show browser for demo
  });
  
  console.log('✓ Browser tools registered');
  
  // Create model adapter
  const modelAdapter = new ModelAdapter({
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    apiKey: process.env.ANTHROPIC_API_KEY!,
  });
  
  // Create context assembler
  const contextAssembler = new ContextAssembler({
    systemPrompt: `You are a helpful assistant with web browsing capabilities.
    
You can:
- Navigate to URLs with browser.navigate
- Scan pages for interactive elements with browser.scan
- Click on elements with browser.click
- Type text with browser.type
- Fill forms with browser.fill
- Take screenshots with browser.screenshot
- Execute JavaScript with browser.evaluate

When asked to browse a website:
1. Navigate to the URL
2. Scan the page to see what elements are available
3. Interact with elements using their index numbers
4. Take screenshots if needed to show results

Always explain what you're doing and what you found.`,
    toolCollector: async () => toolExecutor.getForModel()
  });
  
  // Create agent loop
  const agentLoop = new AgentLoop({
    modelAdapter,
    toolExecutor,
    contextAssembler,
    messageBus,
    config: {
      maxTurns: 10,
      streamingEnabled: true
    }
  });
  
  console.log('✓ Agent loop initialized\n');
  
  // ============================================================================
  // 2. Listen to Agent Events
  // ============================================================================
  
  messageBus.on('model.delta', (event) => {
    if (event.delta.type === 'text') {
      process.stdout.write(event.delta.text);
    }
  });
  
  messageBus.on('tool.start', (event) => {
    console.log(`\n🔧 Using tool: ${event.toolName}`);
    console.log(`   Arguments: ${JSON.stringify(event.arguments, null, 2)}`);
  });
  
  messageBus.on('tool.complete', (event) => {
    console.log(`✓ Tool completed: ${event.toolName}`);
    if (event.result.success) {
      console.log(`   Result: ${JSON.stringify(event.result.output, null, 2).slice(0, 200)}...`);
    } else {
      console.log(`   Error: ${event.result.error}`);
    }
  });
  
  messageBus.on('run.completed', (event) => {
    console.log('\n✓ Agent run completed\n');
  });
  
  messageBus.on('run.error', (event) => {
    console.error('\n❌ Agent error:', event.error);
  });
  
  // ============================================================================
  // 3. Example Interactions
  // ============================================================================
  
  try {
    // Example 1: Simple navigation and scan
    console.log('--- Example 1: Navigate and scan ---\n');
    
    const sessionId1 = sessionStore.createSession({
      userId: 'user-1',
      channelId: 'demo',
      channelType: 'cli'
    });
    
    await agentLoop.processMessage({
      sessionId: sessionId1,
      input: 'Please navigate to https://example.com and tell me what you see on the page',
      context: {}
    });
    
    console.log('\n' + '='.repeat(80) + '\n');
    
    // Example 2: Search interaction
    console.log('--- Example 2: Search on a website ---\n');
    
    const sessionId2 = sessionStore.createSession({
      userId: 'user-2',
      channelId: 'demo',
      channelType: 'cli'
    });
    
    await agentLoop.processMessage({
      sessionId: sessionId2,
      input: 'Go to https://www.google.com, search for "OpenAI GPT-4", and take a screenshot of the results',
      context: {}
    });
    
    console.log('\n' + '='.repeat(80) + '\n');
    
    // Example 3: Form filling
    console.log('--- Example 3: Fill a form ---\n');
    
    const sessionId3 = sessionStore.createSession({
      userId: 'user-3',
      channelId: 'demo',
      channelType: 'cli'
    });
    
    await agentLoop.processMessage({
      sessionId: sessionId3,
      input: 'Navigate to https://httpbin.org/forms/post and fill out the form with name "John Doe" and email "john@example.com"',
      context: {}
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Cleanup
    await cleanupBrowser();
    console.log('\n✓ Browser closed');
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main };
