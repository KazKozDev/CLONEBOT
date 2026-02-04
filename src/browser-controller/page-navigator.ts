/**
 * Page Navigator
 * Handles page navigation and lifecycle
 */

import { CDPClient } from './cdp-client';
import {
  NavigationResult,
  NavigateOptions,
  ReloadOptions,
  WaitForNavigationOptions,
  WaitUntil
} from './types';

/**
 * Navigation state
 */
interface NavigationState {
  url: string;
  title: string;
  loaderId?: string;
  frameId?: string;
}

/**
 * Page Navigator
 * Manages page navigation and waits for load events
 */
export class PageNavigator {
  private cdp: CDPClient;
  private targetId: string;
  private sessionId?: string;
  private currentState: NavigationState;
  private pendingNavigation: Promise<NavigationResult> | null = null;

  constructor(cdp: CDPClient, targetId: string, sessionId?: string) {
    this.cdp = cdp;
    this.targetId = targetId;
    this.sessionId = sessionId;
    this.currentState = {
      url: 'about:blank',
      title: ''
    };
  }

  /**
   * Enable Page domain
   */
  async enable(): Promise<void> {
    await this.cdp.send('Page.enable', undefined, this.sessionId);
  }

  /**
   * Navigate to URL
   */
  async navigate(url: string, options: NavigateOptions = {}): Promise<NavigationResult> {
    const {
      waitUntil = 'load',
      timeout = 30000,
      referer
    } = options;

    // Wait for any pending navigation
    if (this.pendingNavigation) {
      await this.pendingNavigation;
    }

    const navigationPromise = this.waitForNavigation({ waitUntil, timeout });
    this.pendingNavigation = navigationPromise;

    try {
      const params: any = { url };
      if (referer) {
        params.referrer = referer;
      }

      const result = await this.cdp.send('Page.navigate', params, this.sessionId);

      if (result.errorText) {
        throw new Error(`Navigation failed: ${result.errorText}`);
      }

      this.currentState.loaderId = result.loaderId;
      this.currentState.frameId = result.frameId;

      const navResult = await navigationPromise;
      return navResult;

    } finally {
      this.pendingNavigation = null;
    }
  }

  /**
   * Reload page
   */
  async reload(options: ReloadOptions = {}): Promise<NavigationResult> {
    const {
      ignoreCache = false,
      waitUntil = 'load',
      timeout = 30000
    } = options;

    const navigationPromise = this.waitForNavigation({ waitUntil, timeout });
    this.pendingNavigation = navigationPromise;

    try {
      await this.cdp.send('Page.reload', { ignoreCache }, this.sessionId);
      return await navigationPromise;
    } finally {
      this.pendingNavigation = null;
    }
  }

  /**
   * Go back in history
   */
  async goBack(): Promise<NavigationResult | null> {
    const history = await this.cdp.send('Page.getNavigationHistory', undefined, this.sessionId);
    
    if (history.currentIndex === 0) {
      return null; // Already at the beginning
    }

    const navigationPromise = this.waitForNavigation({ waitUntil: 'load' });
    this.pendingNavigation = navigationPromise;

    try {
      const targetEntry = history.entries[history.currentIndex - 1];
      await this.cdp.send('Page.navigateToHistoryEntry', {
        entryId: targetEntry.id
      }, this.sessionId);

      return await navigationPromise;
    } finally {
      this.pendingNavigation = null;
    }
  }

  /**
   * Go forward in history
   */
  async goForward(): Promise<NavigationResult | null> {
    const history = await this.cdp.send('Page.getNavigationHistory', undefined, this.sessionId);
    
    if (history.currentIndex >= history.entries.length - 1) {
      return null; // Already at the end
    }

    const navigationPromise = this.waitForNavigation({ waitUntil: 'load' });
    this.pendingNavigation = navigationPromise;

    try {
      const targetEntry = history.entries[history.currentIndex + 1];
      await this.cdp.send('Page.navigateToHistoryEntry', {
        entryId: targetEntry.id
      }, this.sessionId);

      return await navigationPromise;
    } finally {
      this.pendingNavigation = null;
    }
  }

  /**
   * Get current URL
   */
  getCurrentUrl(): string {
    return this.currentState.url;
  }

  /**
   * Get page title
   */
  async getTitle(): Promise<string> {
    const result = await this.cdp.send('Runtime.evaluate', {
      expression: 'document.title',
      returnByValue: true
    }, this.sessionId);

    return result.result?.value || '';
  }

  /**
   * Wait for navigation to complete
   */
  async waitForNavigation(options: WaitForNavigationOptions = {}): Promise<NavigationResult> {
    const {
      waitUntil = 'load',
      timeout = 30000
    } = options;

    return new Promise((resolve, reject) => {
      let loadFired = false;
      let domContentFired = false;
      let networkIdle = false;
      let frameNavigated = false;
      let lastUrl = '';
      let lastTitle = '';

      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Navigation timeout after ${timeout}ms`));
      }, timeout);

      // Cleanup listeners
      const cleanup = () => {
        clearTimeout(timeoutId);
        if (networkIdleTimer) {
          clearTimeout(networkIdleTimer);
        }
        this.cdp.off('event:Page.loadEventFired', onLoad);
        this.cdp.off('event:Page.domContentEventFired', onDomContent);
        this.cdp.off('event:Page.frameNavigated', onFrameNavigated);
        this.cdp.off('event:Network.requestWillBeSent', onRequest);
        this.cdp.off('event:Network.loadingFinished', onLoadingFinished);
        this.cdp.off('event:Network.loadingFailed', onLoadingFailed);
      };

      // Check if navigation is complete
      const checkComplete = () => {
        let complete = false;

        switch (waitUntil) {
          case 'load':
            complete = loadFired && frameNavigated;
            break;
          case 'domcontentloaded':
            complete = domContentFired && frameNavigated;
            break;
          case 'networkidle':
            complete = networkIdle && frameNavigated;
            break;
        }

        if (complete) {
          cleanup();
          
          this.currentState.url = lastUrl;
          this.currentState.title = lastTitle;

          resolve({
            url: lastUrl,
            title: lastTitle,
            timestamp: Date.now()
          });
        }
      };

      // Event handlers
      const onLoad = () => {
        loadFired = true;
        checkComplete();
      };

      const onDomContent = () => {
        domContentFired = true;
        checkComplete();
      };

      const onFrameNavigated = async (params: any) => {
        // Only handle main frame
        if (params.frame.parentId) {
          return;
        }

        frameNavigated = true;
        lastUrl = params.frame.url;
        
        // Get title
        try {
          lastTitle = await this.getTitle();
        } catch {
          lastTitle = '';
        }

        checkComplete();
      };

      // Network idle detection
      let activeRequests = 0;
      let networkIdleTimer: NodeJS.Timeout | null = null;

      const onRequest = () => {
        activeRequests++;
        if (networkIdleTimer) {
          clearTimeout(networkIdleTimer);
          networkIdleTimer = null;
        }
      };

      const onLoadingFinished = () => {
        activeRequests--;
        checkNetworkIdle();
      };

      const onLoadingFailed = () => {
        activeRequests--;
        checkNetworkIdle();
      };

      const checkNetworkIdle = () => {
        if (activeRequests === 0) {
          if (networkIdleTimer) {
            clearTimeout(networkIdleTimer);
          }
          networkIdleTimer = setTimeout(() => {
            networkIdle = true;
            checkComplete();
          }, 500);
        }
      };

      // Subscribe to events
      this.cdp.on('event:Page.loadEventFired', onLoad);
      this.cdp.on('event:Page.domContentEventFired', onDomContent);
      this.cdp.on('event:Page.frameNavigated', onFrameNavigated);

      if (waitUntil === 'networkidle') {
        this.cdp.on('event:Network.requestWillBeSent', onRequest);
        this.cdp.on('event:Network.loadingFinished', onLoadingFinished);
        this.cdp.on('event:Network.loadingFailed', onLoadingFailed);
      }
    });
  }

  /**
   * Get frame tree
   */
  async getFrameTree(): Promise<any> {
    const result = await this.cdp.send('Page.getFrameTree', undefined, this.sessionId);
    return result.frameTree;
  }

  /**
   * Stop page loading
   */
  async stopLoading(): Promise<void> {
    await this.cdp.send('Page.stopLoading', undefined, this.sessionId);
  }
}
