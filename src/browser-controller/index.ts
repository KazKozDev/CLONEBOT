/**
 * Browser Controller Module
 * Chrome DevTools Protocol based browser automation
 */

export { BrowserController } from './BrowserController';
export { CDPClient } from './cdp-client';
export { 
  launchChromium, 
  findChromium, 
  getChromeVersion, 
  isChromeInstalled,
  type LaunchedBrowser,
  type LaunchOptions
} from './browser-launcher';
export { PageNavigator } from './page-navigator';
export { ElementScanner } from './element-scanner';
export { ActionExecutor } from './action-executor';
export { ScreenshotHandler } from './screenshot-handler';

export * from './types';

export type {
  CDPClientOptions
} from './cdp-client';

export type {
  ScanOptions
} from './element-scanner';
