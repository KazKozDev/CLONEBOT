/**
 * Browser Launcher
 * Launches and manages Chromium browser processes
 */

import { spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { platform, homedir } from 'os';

/**
 * Launched browser process
 */
export interface LaunchedBrowser {
  /** Process ID */
  pid: number;
  /** WebSocket endpoint URL */
  wsEndpoint: string;
  /** Close browser */
  close: () => Promise<void>;
  /** Browser process */
  process?: any;
}

/**
 * Launch options
 */
export interface LaunchOptions {
  /** Browser product ('chrome' or 'firefox') */
  product?: 'chrome' | 'firefox';
  /** Path to browser executable */
  executablePath?: string;
  /** User data directory */
  userDataDir?: string;
  /** Run in headless mode */
  headless?: boolean;
  /** Additional Chrome arguments */
  args?: string[];
  /** Launch timeout (ms) */
  timeout?: number;
  /** Debugging port (0 = random) */
  debuggingPort?: number;
  /** Environment variables */
  env?: Record<string, string>;
}

/**
 * Find Chromium executable on the system
 */
export function findChromium(): string | null {
  const paths: string[] = [];

  switch (platform()) {
    case 'darwin': // macOS
      paths.push(
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
        join(homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
      );
      break;

    case 'linux':
      paths.push(
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome-beta',
        '/usr/bin/google-chrome-dev'
      );
      break;

    case 'win32': // Windows
      paths.push(
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
        join(process.env.PROGRAMFILES || '', 'Google\\Chrome\\Application\\chrome.exe'),
        join(process.env['PROGRAMFILES(X86)'] || '', 'Google\\Chrome\\Application\\chrome.exe')
      );
      break;
  }

  // Check bundled Chromium (from puppeteer, playwright, etc.)
  const bundledPaths = [
    join(process.cwd(), 'node_modules', 'puppeteer', '.local-chromium'),
    join(process.cwd(), 'node_modules', 'playwright-core', '.local-browsers')
  ];

  for (const bundledPath of bundledPaths) {
    if (existsSync(bundledPath)) {
      // This is simplified - real implementation would search for actual binary
      paths.push(bundledPath);
    }
  }

  // Find first existing path
  for (const path of paths) {
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}

/**
 * Find Firefox executable
 */
export function findFirefox(): string | null {
  const paths: string[] = [];

  switch (platform()) {
    case 'darwin':
      paths.push(
        '/Applications/Firefox.app/Contents/MacOS/firefox',
        join(homedir(), 'Applications/Firefox.app/Contents/MacOS/firefox')
      );
      break;
    case 'linux':
      paths.push('/usr/bin/firefox');
      break;
    case 'win32':
      paths.push(
        'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
        'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe'
      );
      break;
  }

  for (const path of paths) {
    if (existsSync(path)) return path;
  }
  return null;
}

/**
 * Get default Browser arguments
 */
function getDefaultArgs(options: LaunchOptions): string[] {
  if (options.product === 'firefox') {
    const args: string[] = [
      `--remote-debugging-port=${options.debuggingPort ?? 0}`
    ];
    
    // Headless
    if (options.headless !== false) {
      args.push('--headless');
    }
    
    // User data (profile)
    if (options.userDataDir) {
      args.push('--profile', options.userDataDir);
    }

    // Custom args
    if (options.args) {
      args.push(...options.args);
    }
    
    return args;
  }

  const args: string[] = [
    // Disable various Chrome features that aren't needed
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-sync',
    '--disable-translate',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-breakpad',
    '--disable-client-side-phishing-detection',
    '--disable-component-extensions-with-background-pages',
    '--disable-default-apps',
    '--disable-dev-shm-usage',
    '--disable-features=TranslateUI',
    '--disable-hang-monitor',
    '--disable-ipc-flooding-protection',
    '--disable-popup-blocking',
    '--disable-prompt-on-repost',
    '--disable-renderer-backgrounding',
    '--disable-sync',
    '--force-color-profile=srgb',
    '--metrics-recording-only',
    '--no-first-run',
    '--enable-automation',
    '--password-store=basic',
    '--use-mock-keychain',
    
    // Remote debugging
    `--remote-debugging-port=${options.debuggingPort ?? 0}`
  ];

  // Headless mode
  if (options.headless !== false) {
    args.push('--headless=new');
  }

  // User data directory
  if (options.userDataDir) {
    args.push(`--user-data-dir=${options.userDataDir}`);
  }

  // Custom args
  if (options.args) {
    args.push(...options.args);
  }

  return args;
}

/**
 * Extract WebSocket endpoint from Chrome output
 */
function extractWebSocketUrl(output: string): string | null {
  const match = output.match(/DevTools listening on (ws:\/\/.+)/);
  return match ? match[1] : null;
}

/**
 * Launch Browser
 */
export async function launchChromium(options: LaunchOptions = {}): Promise<LaunchedBrowser> {
  const product = options.product || 'chrome';
  
  // Find executable
  const executablePath = options.executablePath || (product === 'firefox' ? findFirefox() : findChromium());
  
  if (!executablePath) {
    throw new Error(`${product} executable not found. Please install it or specify executablePath.`);
  }

  if (!existsSync(executablePath)) {
    throw new Error(`Browser executable not found at: ${executablePath}`);
  }

  // Prepare arguments
  const args = getDefaultArgs(options);

  // Prepare environment
  const env = {
    ...process.env,
    ...options.env
  };

  return new Promise((resolve, reject) => {
    let browserProcess: ChildProcess;
    let wsEndpoint: string | null = null;
    let stderr = '';
    
    const timeout = setTimeout(() => {
      if (browserProcess) {
        browserProcess.kill();
      }
      reject(new Error(`Browser launch timeout after ${options.timeout ?? 30000}ms`));
    }, options.timeout ?? 30000);

    try {
      // Spawn browser process
      browserProcess = spawn(executablePath, args, {
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Collect stderr for WebSocket URL
      browserProcess.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
        
        // Try to extract WebSocket URL
        if (!wsEndpoint) {
          wsEndpoint = extractWebSocketUrl(stderr);
          
          if (wsEndpoint) {
            clearTimeout(timeout);
            
            resolve({
              pid: browserProcess.pid!,
              wsEndpoint,
              process: browserProcess,
              close: async () => {
                return new Promise((resolveClose) => {
                  if (!browserProcess || browserProcess.killed) {
                    resolveClose();
                    return;
                  }

                  browserProcess.once('exit', () => {
                    resolveClose();
                  });

                  browserProcess.kill('SIGTERM');

                  // Force kill after 5 seconds
                  setTimeout(() => {
                    if (!browserProcess.killed) {
                      browserProcess.kill('SIGKILL');
                    }
                  }, 5000);
                });
              }
            });
          }
        }
      });

      // Handle process errors
      browserProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to launch browser: ${error.message}`));
      });

      // Handle unexpected exit
      browserProcess.on('exit', (code, signal) => {
        clearTimeout(timeout);
        
        if (!wsEndpoint) {
          reject(new Error(
            `Browser process exited unexpectedly (code: ${code}, signal: ${signal})\nStderr: ${stderr}`
          ));
        }
      });

    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

/**
 * Kill browser process
 */
export async function killBrowser(browser: LaunchedBrowser): Promise<void> {
  return browser.close();
}

/**
 * Check if Chrome is installed
 */
export function isChromeInstalled(): boolean {
  return findChromium() !== null;
}

/**
 * Get Chrome version
 */
export async function getChromeVersion(executablePath?: string): Promise<string | null> {
  const path = executablePath || findChromium();
  
  if (!path) {
    return null;
  }

  return new Promise((resolve) => {
    const versionProcess = spawn(path, ['--version']);
    let output = '';

    versionProcess.stdout.on('data', (data: Buffer) => {
      output += data.toString();
    });

    versionProcess.on('close', () => {
      const match = output.match(/(\d+\.\d+\.\d+\.\d+)/);
      resolve(match ? match[1] : null);
    });

    versionProcess.on('error', () => {
      resolve(null);
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      versionProcess.kill();
      resolve(null);
    }, 5000);
  });
}
