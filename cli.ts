#!/usr/bin/env ts-node
/**
 * CLONEBOT CLI
 * 
 * Simple CLI to run the bot in different modes
 */

import { program } from 'commander';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function runScript(scriptPath: string, env: Record<string, string> = {}) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('ts-node', [scriptPath], {
      stdio: 'inherit',
      env: { ...process.env, ...env },
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Process exited with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

program
  .name('clonebot')
  .description('CLONEBOT - AI Agent Framework CLI')
  .version('1.0.0');

// Start command - production bot with all features
program
  .command('start')
  .description('Start production bot (Telegram + Skills + Browser)')
  .option('-t, --token <token>', 'Telegram bot token')
  .option('--gateway', 'Enable Gateway Server (Web UI)')
  .option('--port <port>', 'Gateway port (default: 3000)')
  .action(async (options) => {
    log('\n🚀 Starting CLONEBOT...\n', colors.bright);

    const token = options.token || process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      log('❌ Error: TELEGRAM_BOT_TOKEN not set\n', colors.red);
      log('Set it with:', colors.yellow);
      log('  export TELEGRAM_BOT_TOKEN="your_token"', colors.yellow);
      log('Or use:', colors.yellow);
      log('  clonebot start --token "your_token"\n', colors.yellow);
      process.exit(1);
    }

    try {
      const scriptPath = options.gateway
        ? join(__dirname, 'src/gateway-bot.ts')
        : join(__dirname, 'src/telegram-bot.ts');
      
      const env: Record<string, string> = { TELEGRAM_BOT_TOKEN: token };
      
      if (options.gateway && options.port) {
        env.GATEWAY_PORT = options.port;
      }

      await runScript(scriptPath, env);
    } catch (error) {
      log(`\n❌ Failed to start: ${error}\n`, colors.red);
      process.exit(1);
    }
  });

// Telegram bot command (legacy)
program
  .command('telegram')
  .description('Start Telegram bot (checkpoint/test mode)')
  .option('-t, --token <token>', 'Telegram bot token')
  .option('--webhook', 'Use webhook mode instead of polling')
  .action(async (options) => {
    log('\n🤖 Starting Telegram Bot (checkpoint mode)...\n', colors.bright);

    const token = options.token || process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      log('❌ Error: TELEGRAM_BOT_TOKEN not set\n', colors.red);
      log('Set it with:', colors.yellow);
      log('  export TELEGRAM_BOT_TOKEN="your_token"', colors.yellow);
      log('Or use:', colors.yellow);
      log('  clonebot telegram --token "your_token"\n', colors.yellow);
      process.exit(1);
    }

    try {
      await runScript(
        join(__dirname, 'src/telegram-checkpoint.ts'),
        { TELEGRAM_BOT_TOKEN: token }
      );
    } catch (error) {
      log(`\n❌ Failed to start bot: ${error}\n`, colors.red);
      process.exit(1);
    }
  });

// Gateway command - Web UI only
program
  .command('gateway')
  .description('Start Gateway Server only (Web UI)')
  .option('--port <port>', 'Server port (default: 3000)')
  .action(async (options) => {
    log('\n🌐 Starting Gateway Server...\n', colors.bright);

    try {
      const env: Record<string, string> = {};
      
      if (options.port) {
        env.GATEWAY_PORT = options.port;
      }

      await runScript(join(__dirname, 'src/gateway-bot.ts'), env);
    } catch (error) {
      log(`\n❌ Failed to start Gateway: ${error}\n`, colors.red);
      process.exit(1);
    }
  });

// Test command
program
  .command('test')
  .description('Run integration tests')
  .option('--browser', 'Test browser integration')
  .option('--skills', 'Test skill registry')
  .action(async (options) => {
    log('\n🧪 Running tests...\n', colors.bright);

    try {
      if (options.browser) {
        log('Testing browser integration...', colors.blue);
        await runScript(join(__dirname, 'src/browser-checkpoint.ts'));
      } else if (options.skills) {
        log('Testing skill registry...', colors.blue);
        await runScript(join(__dirname, 'src/skill-registry-test.ts'));
      } else {
        log('Running integration checkpoint...', colors.blue);
        await runScript(join(__dirname, 'src/integration-checkpoint.ts'));
      }

      log('\n✅ Tests passed!\n', colors.green);
    } catch (error) {
      log(`\n❌ Tests failed: ${error}\n`, colors.red);
      process.exit(1);
    }
  });

// Build command
program
  .command('build')
  .description('Build the project')
  .action(async () => {
    log('\n🔨 Building project...\n', colors.bright);

    try {
      await runScript(join(__dirname, 'node_modules/.bin/tsc'));
      log('\n✅ Build complete!\n', colors.green);
    } catch (error) {
      log(`\n❌ Build failed: ${error}\n`, colors.red);
      process.exit(1);
    }
  });

// Info command
program
  .command('info')
  .description('Show project information')
  .action(() => {
    log('\n╔════════════════════════════════════════════╗', colors.bright);
    log('║        CLONEBOT - AI Agent Framework      ║', colors.bright);
    log('╚════════════════════════════════════════════╝\n', colors.bright);

    log('📦 Modules:', colors.blue);
    log('  ✅ Message Bus - Event-driven communication');
    log('  ✅ Session Store - Conversation memory');
    log('  ✅ Context Assembler - Context management');
    log('  ✅ Model Adapter - AI model integration');
    log('  ✅ Tool Executor - Function calling');
    log('  ✅ Agent Loop - Main orchestrator');
    log('  ✅ Block Streamer - Markdown formatting');
    log('  ✅ Gateway Server - HTTP/WebSocket server');
    log('  ✅ Telegram Adapter - Telegram bot');
    log('  ✅ Browser Controller - Web automation');
    log('  ✅ Skill Registry - Dynamic capabilities\n');

    log('🚀 Quick Start:', colors.blue);
    log('  clonebot start                 # Start production bot');
    log('  clonebot start --gateway       # Start with Web UI');
    log('  clonebot gateway --port 3000   # Web UI only');
    log('  clonebot test                  # Run integration tests');
    log('  clonebot test --browser        # Test browser automation');
    log('  clonebot test --skills         # Test skill registry');
    log('  clonebot build                 # Build project\n');

    log('📚 Documentation:', colors.blue);
    log('  README.md                      # Main documentation');
    log('  PHASE-3-QUICKSTART.md          # Telegram setup guide');
    log('  src/skill-registry/README.md   # Skill system docs\n');
  });

// Parse arguments
program.parse();

// Show help if no command
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
