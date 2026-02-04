/**
 * Browser Controller
 * Main facade for browser automation via Chrome DevTools Protocol
 */

import { EventEmitter } from 'events';
import { homedir } from 'os';
import { join } from 'path';
import { CDPClient } from './cdp-client';
import { launchChromium, LaunchedBrowser } from './browser-launcher';
import { PageNavigator } from './page-navigator';
import { ElementScanner } from './element-scanner';
import { ActionExecutor } from './action-executor';
import { ScreenshotHandler } from './screenshot-handler';
import {
  BrowserControllerConfig,
  BrowserInfo,
  NavigationResult,
  NavigateOptions,
  ReloadOptions,
  PageSnapshot,
  SnapshotOptions,
  ActionTarget,
  ActionResult,
  ClickOptions,
  TypeOptions,
  KeyPressOptions,
  ScrollOptions,
  ScreenshotOptions,
  ScreenshotResult,
  PDFOptions,
  PDFResult,
  Cookie,
  WaitForSelectorOptions,
  WaitForNavigationOptions,
  Element,
  ClearDataOptions,
  BrowserEvent,
  BrowserEventHandler
} from './types';

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Partial<BrowserControllerConfig> = {
  mode: 'openclaw',
  openclaw: {
    userDataDir: join(homedir(), '.openclaw', 'browser-data'),
    headless: true,
    args: []
  },
  viewport: {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    isMobile: false
  },
  timeouts: {
    navigation: 30000,
    action: 5000,
    idle: 500
  },
  security: {
    allowedURLPatterns: ['*'],
    blockedURLPatterns: [],
    downloadBehavior: 'deny',
    maxPages: 5
  },
  screenshots: {
    format: 'png',
    quality: 80,
    maxWidth: 1920,
    annotate: true
  },
  elements: {
    maxElements: 100,
    includeHidden: false,
    customSelectors: []
  }
};

/**
 * Browser Controller
 * High-level API for browser automation
 */
export class BrowserController extends EventEmitter {
  private config: BrowserControllerConfig;
  private launchedBrowser?: LaunchedBrowser;
  private cdp?: CDPClient;
  private targetId?: string;
  private sessionId?: string;
  
  // Components
  private navigator?: PageNavigator;
  private scanner?: ElementScanner;
  private executor?: ActionExecutor;
  private screenshotHandler?: ScreenshotHandler;

  constructor(config: BrowserControllerConfig) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config } as BrowserControllerConfig;
  }

  /**
   * Launch browser and connect
   */
  async launch(): Promise<void> {
    if (this.isConnected()) {
      throw new Error('Browser already launched');
    }

    try {
      // Launch based on mode
      switch (this.config.mode) {
        case 'openclaw':
          await this.launchOpenClaw();
          break;
        
        case 'chrome':
          await this.connectToChrome();
          break;
        
        case 'remote':
          await this.connectToRemote();
          break;
        
        default:
          throw new Error(`Unknown browser mode: ${this.config.mode}`);
      }

      // Create page
      await this.createPage();

      // Initialize components
      this.navigator = new PageNavigator(this.cdp!, this.targetId!, this.sessionId);
      this.scanner = new ElementScanner(this.cdp!, this.sessionId);
      this.executor = new ActionExecutor(this.cdp!, this.scanner, this.sessionId);
      this.screenshotHandler = new ScreenshotHandler(this.cdp!, this.sessionId);

      // Enable domains
      await this.navigator.enable();
      await this.cdp!.send('Network.enable', undefined, this.sessionId);
      await this.cdp!.send('DOM.enable', undefined, this.sessionId);
      await this.cdp!.send('Runtime.enable', undefined, this.sessionId);

      // Set viewport
      if (this.config.viewport) {
        const { width, height, deviceScaleFactor, isMobile } = this.config.viewport;
        await this.cdp!.send('Emulation.setDeviceMetricsOverride', {
          width: width ?? 1280,
          height: height ?? 720,
          deviceScaleFactor: deviceScaleFactor ?? 1,
          mobile: isMobile ?? false
        }, this.sessionId);
      }

      this.emit('launched');

    } catch (error) {
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Close browser
   */
  async close(): Promise<void> {
    await this.cleanup();
    this.emit('closed');
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.cdp?.isConnected() ?? false;
  }

  /**
   * Get browser info
   */
  getInfo(): BrowserInfo {
    return {
      mode: this.config.mode,
      version: 'unknown', // Would need to query from browser
      userDataDir: this.config.openclaw?.userDataDir,
      pid: this.launchedBrowser?.pid,
      wsEndpoint: this.launchedBrowser?.wsEndpoint || this.config.remote?.wsEndpoint
    };
  }

  // ===== Navigation =====

  async navigate(url: string, options?: NavigateOptions): Promise<NavigationResult> {
    this.ensureConnected();
    const result = await this.navigator!.navigate(url, options);
    this.emit('navigated', result);
    return result;
  }

  async reload(options?: ReloadOptions): Promise<NavigationResult> {
    this.ensureConnected();
    return await this.navigator!.reload(options);
  }

  async goBack(): Promise<NavigationResult | null> {
    this.ensureConnected();
    return await this.navigator!.goBack();
  }

  async goForward(): Promise<NavigationResult | null> {
    this.ensureConnected();
    return await this.navigator!.goForward();
  }

  async getCurrentUrl(): Promise<string> {
    this.ensureConnected();
    return this.navigator!.getCurrentUrl();
  }

  async getTitle(): Promise<string> {
    this.ensureConnected();
    return await this.navigator!.getTitle();
  }

  // ===== Snapshots =====

  async snapshot(options?: SnapshotOptions): Promise<PageSnapshot> {
    this.ensureConnected();

    const {
      includeScreenshot = true,
      maxElements = this.config.elements?.maxElements ?? 100,
      annotateElements = this.config.screenshots?.annotate ?? true
    } = options ?? {};

    // Scan elements
    const elements = await this.scanner!.scanElements({ maxElements });

    // Take screenshot
    let screenshot: string | undefined;
    if (includeScreenshot) {
      const result = await this.screenshotHandler!.capture({
        format: this.config.screenshots?.format,
        quality: this.config.screenshots?.quality
      });
      screenshot = typeof result.data === 'string' ? result.data : result.data.toString('base64');

      // Annotate if requested
      if (annotateElements && elements.length > 0) {
        screenshot = await this.screenshotHandler!.annotate(screenshot, elements);
      }
    }

    return {
      screenshot,
      elements,
      url: await this.getCurrentUrl(),
      title: await this.getTitle(),
      timestamp: Date.now()
    };
  }

  async screenshot(options?: ScreenshotOptions): Promise<ScreenshotResult> {
    this.ensureConnected();
    return await this.screenshotHandler!.capture(options);
  }

  async pdf(options?: PDFOptions): Promise<PDFResult> {
    this.ensureConnected();
    return await this.screenshotHandler!.generatePDF(options);
  }

  // ===== Actions =====

  async click(target: ActionTarget, options?: ClickOptions): Promise<ActionResult> {
    this.ensureConnected();
    return await this.executor!.click(target, options);
  }

  async type(text: string, options?: TypeOptions): Promise<ActionResult> {
    this.ensureConnected();
    return await this.executor!.type(text, options);
  }

  async fill(target: ActionTarget, value: string): Promise<ActionResult> {
    this.ensureConnected();
    return await this.executor!.fill(target, value);
  }

  async select(target: ActionTarget, values: string | string[]): Promise<ActionResult> {
    this.ensureConnected();
    return await this.executor!.select(target, values);
  }

  async hover(target: ActionTarget): Promise<ActionResult> {
    this.ensureConnected();
    return await this.executor!.hover(target);
  }

  async upload(target: ActionTarget, files: string[]): Promise<ActionResult> {
    this.ensureConnected();
    return await this.executor!.upload(target, files);
  }

  async pressKey(key: string, options?: KeyPressOptions): Promise<ActionResult> {
    this.ensureConnected();
    return await this.executor!.pressKey(key, options);
  }

  async scroll(options: ScrollOptions): Promise<ActionResult> {
    this.ensureConnected();
    return await this.executor!.scroll(options);
  }

  // ===== Content =====

  async evaluate<T = any>(script: string | Function, ...args: any[]): Promise<T> {
    this.ensureConnected();
    
    const expression = typeof script === 'function' 
      ? `(${script.toString()})(${args.map(a => JSON.stringify(a)).join(',')})`
      : script;

    const result = await this.cdp!.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    }, this.sessionId);

    if (result.exceptionDetails) {
      throw new Error(`Evaluation failed: ${result.exceptionDetails.text}`);
    }

    return result.result.value;
  }

  async getHTML(selector?: string): Promise<string> {
    return await this.evaluate(`
      (function(sel) {
        const elem = sel ? document.querySelector(sel) : document.documentElement;
        return elem ? elem.outerHTML : '';
      })("${selector || 'html'}")
    `);
  }

  async getText(selector?: string): Promise<string> {
    return await this.evaluate(`
      (function(sel) {
        const elem = sel ? document.querySelector(sel) : document.body;
        return elem ? elem.textContent.trim() : '';
      })("${selector || 'body'}")
    `);
  }

  // ===== Waits =====

  async waitForSelector(selector: string, options?: WaitForSelectorOptions): Promise<Element | null> {
    this.ensureConnected();
    
    const { visible = true, hidden = false, timeout = 30000 } = options ?? {};

    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const element = await this.scanner!.findElement(selector);
      
      if (element) {
        if ((visible && element.states.visible) || (hidden && !element.states.visible) || (!visible && !hidden)) {
          return element;
        }
      } else if (hidden) {
        return null;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error(`Wait for selector timeout: ${selector}`);
  }

  async waitForNavigation(options?: WaitForNavigationOptions): Promise<NavigationResult> {
    this.ensureConnected();
    return await this.navigator!.waitForNavigation(options);
  }

  // ===== State =====

  async getCookies(urls?: string[]): Promise<Cookie[]> {
    this.ensureConnected();
    
    const result = await this.cdp!.send('Network.getCookies', 
      urls ? { urls } : undefined, 
      this.sessionId
    );

    return result.cookies;
  }

  async setCookie(cookie: Cookie): Promise<void> {
    this.ensureConnected();
    await this.cdp!.send('Network.setCookie', cookie, this.sessionId);
  }

  async clearData(options?: ClearDataOptions): Promise<void> {
    this.ensureConnected();

    const { cookies = true, cache = true, localStorage = true } = options ?? {};

    if (cookies) {
      await this.cdp!.send('Network.clearBrowserCookies', undefined, this.sessionId);
    }

    if (cache) {
      await this.cdp!.send('Network.clearBrowserCache', undefined, this.sessionId);
    }

    if (localStorage) {
      await this.evaluate(`
        (function() {
          if (typeof localStorage !== 'undefined') {
            localStorage.clear();
            sessionStorage.clear();
          }
        })()
      `);
    }
  }

  // ===== Configuration =====

  configure(config: Partial<BrowserControllerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  async setViewport(width: number, height: number): Promise<void> {
    this.ensureConnected();
    await this.screenshotHandler!.setViewport(width, height);
  }

  // ===== Private methods =====

  private async launchOpenClaw(): Promise<void> {
    this.launchedBrowser = await launchChromium({
      product: this.config.openclaw?.product,
      executablePath: this.config.openclaw?.executablePath ?? undefined,
      userDataDir: this.config.openclaw?.userDataDir,
      headless: this.config.openclaw?.headless ?? true,
      args: this.config.openclaw?.args,
      timeout: this.config.timeouts?.navigation
    });

    this.cdp = new CDPClient({
      url: this.launchedBrowser.wsEndpoint,
      timeout: this.config.timeouts?.navigation,
      autoReconnect: false
    });

    await this.cdp.connect();
  }

  private async connectToChrome(): Promise<void> {
    const port = this.config.chrome?.debuggingPort ?? 9222;
    const url = `ws://localhost:${port}/devtools/browser`;

    this.cdp = new CDPClient({ url });
    await this.cdp.connect();
  }

  private async connectToRemote(): Promise<void> {
    if (!this.config.remote?.wsEndpoint) {
      throw new Error('Remote wsEndpoint not configured');
    }

    this.cdp = new CDPClient({
      url: this.config.remote.wsEndpoint
    });

    await this.cdp.connect();
  }

  private async createPage(): Promise<void> {
    const result = await this.cdp!.send('Target.createTarget', {
      url: 'about:blank'
    });

    this.targetId = result.targetId;

    // Attach to target to get session
    const session = await this.cdp!.send('Target.attachToTarget', {
      targetId: this.targetId,
      flatten: true
    });

    this.sessionId = session.sessionId;
  }

  private async cleanup(): Promise<void> {
    if (this.cdp) {
      await this.cdp.disconnect();
      this.cdp = undefined;
    }

    if (this.launchedBrowser) {
      await this.launchedBrowser.close();
      this.launchedBrowser = undefined;
    }

    this.navigator = undefined;
    this.scanner = undefined;
    this.executor = undefined;
    this.screenshotHandler = undefined;
  }

  private ensureConnected(): void {
    if (!this.isConnected()) {
      throw new Error('Browser not connected. Call launch() first.');
    }
  }
}
