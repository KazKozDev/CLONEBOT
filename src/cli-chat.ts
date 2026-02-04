/**
 * CLI Chat - Interactive Console Chat
 * 
 * Запуск бота в консоли без Telegram (Real Modules Version)
 */

import { AgentLoop } from './agent-loop';
import type { AgentLoopDependencies } from './agent-loop/types';
import { SessionStore, RealFileSystem } from './session-store';
import { ContextAssembler } from './context-assembler';
import { ModelAdapter } from './model-adapter';
import { ToolExecutor, ExecutionContext, ToolResult } from './tool-executor';
import { SkillRegistry } from './skills/SkillRegistry';
import { basicTools } from './tools/basic-tools';
import { MessageBus } from './message-bus';
import { createSessionTools, createClawHubTools } from './tools';
import { ClawHubClient } from './skill-registry';
import * as readline from 'readline';

// Colors for console
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('');
  console.log(`${colors.bright}${colors.cyan}╔════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}║     CLONEBOT - Interactive CLI Chat       ║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}║        (Real Modules Mode)                ║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}╚════════════════════════════════════════════╝${colors.reset}`);
  console.log('');

  // Initialize real modules
  console.log(`${colors.dim}Initializing modules...${colors.reset}`);

  // 1. SessionStore
  const sessionStore = new SessionStore(new RealFileSystem(), {
    storageDir: './sessions',
  });
  await sessionStore.init();

  // 2. SkillRegistry
  const skillRegistry = new SkillRegistry('./skills');
  await skillRegistry.loadAll();
  const skillStats = skillRegistry.getStats();
  console.log(`${colors.dim}Loaded ${skillStats.total} skills${colors.reset}`);

  // 3. ToolExecutor
  const toolExecutor = new ToolExecutor();
  const bus = new MessageBus();

  // Register Session Tools
  const sessionTools = createSessionTools(sessionStore, bus);
  for (const tool of sessionTools) {
     toolExecutor.register({
         name: tool.name,
         description: tool.description,
         parameters: tool.inputSchema as any
     }, tool.handler as any);
  }

  // Register ClawHub Tools
  const clawHubClient = new ClawHubClient();
  const clawHubTools = createClawHubTools(clawHubClient, './skills');
  for (const tool of clawHubTools) {
     toolExecutor.register({
         name: tool.name,
         description: tool.description,
         parameters: tool.inputSchema as any
     }, tool.handler as any);
  }

  // Register browser tools (real browser controller)
  let browserToolsEnabled = false;
  try {
    // Clean up Chrome lock files to prevent startup crashes
    try {
      const { execSync } = require('child_process');
      // Remove all Singleton* files (Lock, Cookie, Socket)
      execSync('rm -f ./.browser-data/Singleton*', { stdio: 'ignore' });
      console.log(`${colors.dim}Cleaned up browser lock files.${colors.reset}`);
    } catch (e) {
      // Ignore cleanup errors
    }

    const { registerBrowserTools } = await import('./tool-executor/browser-tools');
    const headless = process.env.BROWSER_HEADLESS === 'true';
    // Product must be 'chrome' or 'firefox' for config type safety
    const productConfig = (process.env.BROWSER_PRODUCT === 'firefox') ? 'firefox' : 'chrome';
    const productDisplay = (process.env.BROWSER_PRODUCT === 'firefox') ? 'firefox' : 'chrome/chromium';
    const executablePath = process.env.BROWSER_EXECUTABLE_PATH;
    
    console.log(`${colors.cyan}Initializing Browser Tools (Product: ${productDisplay}, Headless: ${headless})...${colors.reset}`);
    if (executablePath) {
      console.log(`${colors.dim}Using custom executable: ${executablePath}${colors.reset}`);
    }
    
    // Explicitly higher timeout for browser tools in CLI
    const { cleanup } = registerBrowserTools(toolExecutor, {
      mode: 'openclaw',
      openclaw: { 
        product: productConfig,
        headless,
        userDataDir: './.browser-data',
        executablePath
      },
      timeouts: { navigation: 60000, action: 30000, idle: 60000 },
    });
    browserToolsEnabled = true;

  } catch (error) {
    console.warn(`${colors.yellow}⚠️  Browser tools unavailable: ${String((error as Error).message || error)}${colors.reset}`);
  }

  // Register basic tools
  for (const tool of basicTools) {
    toolExecutor.register(
      {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema as any,
      },
      async (params: Record<string, unknown>, _context: ExecutionContext): Promise<ToolResult> => {
        return await (tool.handler as any)(params);
      }
    );
  }

  // 4. ModelAdapter
  const modelAdapter = new ModelAdapter();
  await modelAdapter.initialize();

  // 5. ContextAssembler
  const contextAssembler = new ContextAssembler({
    sessionStore,
    toolExecutor,
    skillProvider: skillRegistry
  });

  // 6. AgentLoop
  const dependencies: AgentLoopDependencies = {
    sessionStore,
    contextAssembler,
    modelAdapter,
    toolExecutor,
  };

  const agent = new AgentLoop(dependencies, {
    concurrency: {
      maxConcurrentRuns: 1,
      maxConcurrentToolCalls: 1
    },
    limits: {
      maxTurns: 10,
      maxToolRounds: 5,
      maxToolCallsPerRound: 5,
      queueTimeout: 30000
    }
  });

  console.log(`${colors.green}✓ Ready${colors.reset}`);
  console.log('');
  console.log(`${colors.dim}Type your message and press Enter${colors.reset}`);
  console.log(`${colors.dim}Commands: /help, /clear, /skills, /exit${colors.reset}`);
  console.log('');

  // Session
  const sessionId = 'cli-session-' + Date.now();
  console.log(`${colors.dim}Session ID: ${sessionId}${colors.reset}`);
  console.log('');

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${colors.bright}${colors.blue}You>${colors.reset} `,
  });

  // Show prompt
  rl.prompt();

  // Handle input
  rl.on('line', async (input) => {
    const line = input.trim();

    // Commands
    if (line.startsWith('/')) {
      const cmd = line.toLowerCase();

      if (cmd === '/exit' || cmd === '/quit') {
        console.log(`${colors.dim}Goodbye!${colors.reset}`);
        rl.close();
        process.exit(0);
      }

      if (cmd === '/clear') {
        // Since we use real SessionStore, we assume we might want a new session or just clear screen?
        // SessionStore API might not have clear(), but we can just start a new session ID if needed.
        // For now, let's just say cleared locally.
        console.log(`${colors.dim}Starting new session...${colors.reset}`);
        // simplistic "clear"
        rl.prompt();
        return;
      }

      if (cmd === '/skills') {
        const skills = skillRegistry.getAllSkills();
        console.log(`${colors.bright}Active Skills:${colors.reset}`);
        skills.forEach(s => {
          console.log(`- ${s.title} (Priority: ${s.priority})`);
        });
        console.log('');
        rl.prompt();
        return;
      }

      if (cmd === '/help') {
        console.log('');
        console.log(`${colors.bright}Available commands:${colors.reset}`);
        console.log(`  ${colors.cyan}/help${colors.reset}   - Show this help`);
        console.log(`  ${colors.cyan}/skills${colors.reset} - List available skills`);
        console.log(`  ${colors.cyan}/exit${colors.reset}   - Exit the chat`);
        console.log('');
        rl.prompt();
        return;
      }

      console.log(`${colors.red}Unknown command: ${cmd}${colors.reset}`);
      rl.prompt();
      return;
    }

    // Empty input
    if (!line) {
      rl.prompt();
      return;
    }

    // Process message
    try {
      // Execute agent
      const handle = await agent.execute({
        message: line,
        sessionId,
      });

      // Stream response
      console.log('');
      process.stdout.write(`${colors.bright}${colors.green}Bot>${colors.reset} `);

      let fullResponse = '';

      for await (const event of handle.events) {
        if (event.type === 'model.delta') {
          process.stdout.write(event.delta);
          fullResponse += event.delta;
        }

        if (event.type === 'model.complete') {
          const tokens = event.response?.usage?.totalTokens || 0;
          // Don't log newline here, wait for run.completed
        }

        if (event.type === 'tool.start') {
          console.log('');
          console.log(`${colors.dim}🔧 Using tool: ${event.toolName}${colors.reset}`);
        }

        if (event.type === 'tool.complete') {
          console.log(`${colors.dim}  ✓ Tool done${colors.reset}`);
          if (event.result?.result !== undefined) {
            console.log(`${colors.dim}  ↳ Result: ${JSON.stringify(event.result.result, null, 2)}${colors.reset}`);
          }
          if (event.result?.error) {
            console.log(`${colors.dim}  ↳ Error: ${event.result.error}${colors.reset}`);
          }
          process.stdout.write(`${colors.bright}${colors.green}Bot>${colors.reset} `); // Re-prompt bot label
        }

        if (event.type === 'run.error') {
          console.log('');
          console.log(`${colors.red}Error: ${event.error}${colors.reset}`);
        }
      }

      console.log(''); // Final newline

    } catch (error: any) {
      console.log('');
      console.log(`${colors.red}Error: ${error.message}${colors.reset}`);
      console.log('');
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('');
    console.log(`${colors.dim}Goodbye!${colors.reset}`);
    process.exit(0);
  });
}

// ============================================================================
// Entry Point
// ============================================================================

main().catch((error) => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});
