/**
 * Browser Controller Types
 * Core type definitions for Chrome DevTools Protocol interaction
 */

/**
 * Browser operation modes
 */
export type BrowserMode = 'openclaw' | 'chrome' | 'remote';

/**
 * Wait conditions for navigation
 */
export type WaitUntil = 'load' | 'domcontentloaded' | 'networkidle';

/**
 * Mouse buttons
 */
export type MouseButton = 'left' | 'right' | 'middle';

/**
 * Keyboard modifiers
 */
export type KeyModifier = 'Control' | 'Shift' | 'Alt' | 'Meta';

/**
 * Screenshot formats
 */
export type ScreenshotFormat = 'png' | 'jpeg' | 'webp';

/**
 * Screenshot encoding
 */
export type ScreenshotEncoding = 'base64' | 'binary';

/**
 * Download behaviors
 */
export type DownloadBehavior = 'deny' | 'allow' | 'prompt';

/**
 * Dialog types
 */
export type DialogType = 'alert' | 'confirm' | 'prompt' | 'beforeunload';

/**
 * Browser configuration
 */
export interface BrowserControllerConfig {
  /** Operating mode */
  mode: BrowserMode;

  /** OpenClaw mode configuration */
  openclaw?: {
    /** Browser product */
    product?: 'chrome' | 'firefox';
    /** Path to Chromium executable (auto-detect if null) */
    executablePath?: string | null;
    /** User data directory */
    userDataDir?: string;
    /** Run in headless mode */
    headless?: boolean;
    /** Additional Chrome arguments */
    args?: string[];
  };

  /** Chrome mode configuration */
  chrome?: {
    /** Chrome debugging port */
    debuggingPort?: number;
    /** Extension relay ID */
    extensionId?: string;
  };

  /** Remote mode configuration */
  remote?: {
    /** WebSocket endpoint URL */
    wsEndpoint: string;
    /** Authentication headers */
    headers?: Record<string, string>;
  };

  /** Viewport configuration */
  viewport?: {
    width?: number;
    height?: number;
    deviceScaleFactor?: number;
    isMobile?: boolean;
  };

  /** Timeout configuration (milliseconds) */
  timeouts?: {
    /** Navigation timeout */
    navigation?: number;
    /** Action timeout */
    action?: number;
    /** Network idle timeout */
    idle?: number;
  };

  /** Security configuration */
  security?: {
    /** Allowed URL patterns */
    allowedURLPatterns?: string[];
    /** Blocked URL patterns */
    blockedURLPatterns?: string[];
    /** Download behavior */
    downloadBehavior?: DownloadBehavior;
    /** Maximum number of pages */
    maxPages?: number;
  };

  /** Screenshot configuration */
  screenshots?: {
    /** Image format */
    format?: ScreenshotFormat;
    /** Quality (0-100, for jpeg/webp) */
    quality?: number;
    /** Maximum width */
    maxWidth?: number;
    /** Annotate elements */
    annotate?: boolean;
  };

  /** Element scanning configuration */
  elements?: {
    /** Maximum elements to scan */
    maxElements?: number;
    /** Include hidden elements */
    includeHidden?: boolean;
    /** Additional custom selectors */
    customSelectors?: string[];
  };
}

/**
 * Browser information
 */
export interface BrowserInfo {
  /** Operating mode */
  mode: BrowserMode;
  /** Browser version */
  version: string;
  /** User data directory */
  userDataDir?: string;
  /** Process ID */
  pid?: number;
  /** WebSocket endpoint */
  wsEndpoint?: string;
}

/**
 * Navigation result
 */
export interface NavigationResult {
  /** Final URL after navigation */
  url: string;
  /** Page title */
  title: string;
  /** HTTP status code */
  status?: number;
  /** Load timestamp */
  timestamp: number;
}

/**
 * Element bounds (position and size)
 */
export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Element states
 */
export interface ElementStates {
  /** Is visible */
  visible: boolean;
  /** Is enabled */
  enabled: boolean;
  /** Is focused */
  focused: boolean;
  /** Is checked (for checkboxes/radios) */
  checked?: boolean;
}

/**
 * Scanned page element
 */
export interface Element {
  /** Element index for reference */
  index: number;
  /** HTML tag name */
  tag: string;
  /** ARIA role */
  role?: string;
  /** Accessible name */
  name?: string;
  /** Visible text content (truncated) */
  text?: string;
  /** Element attributes */
  attributes: {
    id?: string;
    class?: string;
    href?: string;
    src?: string;
    placeholder?: string;
    value?: string;
    [key: string]: string | undefined;
  };
  /** Element bounds */
  bounds: ElementBounds;
  /** Element states */
  states: ElementStates;
  /** Can interact with this element */
  interactable: boolean;
  /** CSS selector */
  selector?: string;
}

/**
 * Page snapshot
 */
export interface PageSnapshot {
  /** Screenshot (base64 encoded) */
  screenshot?: string;
  /** Scanned elements */
  elements: Element[];
  /** Current URL */
  url: string;
  /** Page title */
  title: string;
  /** Snapshot timestamp */
  timestamp: number;
}

/**
 * Action target (element reference)
 */
export type ActionTarget = 
  | number                    // Element index
  | string                    // CSS selector
  | { x: number; y: number }; // Coordinates

/**
 * Click options
 */
export interface ClickOptions {
  /** Mouse button */
  button?: MouseButton;
  /** Number of clicks */
  clickCount?: number;
  /** Delay between clicks (ms) */
  delay?: number;
}

/**
 * Type options
 */
export interface TypeOptions {
  /** Delay between keystrokes (ms) */
  delay?: number;
  /** Clear field before typing */
  clear?: boolean;
}

/**
 * Key press options
 */
export interface KeyPressOptions {
  /** Modifier keys */
  modifiers?: KeyModifier[];
}

/**
 * Scroll options
 */
export interface ScrollOptions {
  /** Target element or coordinates */
  target?: ActionTarget;
  /** Scroll direction */
  direction?: 'up' | 'down' | 'left' | 'right';
  /** Scroll amount (pixels) */
  amount?: number;
}

/**
 * Action result
 */
export interface ActionResult {
  /** Action completed successfully */
  success: boolean;
  /** Target element (if applicable) */
  element?: Element;
  /** Result message */
  message?: string;
}

/**
 * Screenshot options
 */
export interface ScreenshotOptions {
  /** Capture full page */
  fullPage?: boolean;
  /** Clip region */
  clip?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Image format */
  format?: ScreenshotFormat;
  /** Quality (0-100) */
  quality?: number;
  /** Encoding */
  encoding?: ScreenshotEncoding;
}

/**
 * Screenshot result
 */
export interface ScreenshotResult {
  /** Image data (base64 or binary) */
  data: string | Buffer;
  /** Image width */
  width: number;
  /** Image height */
  height: number;
  /** Image format */
  format: ScreenshotFormat;
}

/**
 * PDF options
 */
export interface PDFOptions {
  /** Page format */
  format?: 'A4' | 'Letter' | 'Legal' | 'Tabloid';
  /** Landscape orientation */
  landscape?: boolean;
  /** Print background graphics */
  printBackground?: boolean;
  /** Page margins */
  margin?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
  /** Paper width */
  paperWidth?: number;
  /** Paper height */
  paperHeight?: number;
  /** Page ranges (e.g., '1-5, 8') */
  pageRanges?: string;
  /** Scale (0.1 - 2) */
  scale?: number;
}

/**
 * PDF result
 */
export interface PDFResult {
  /** PDF data (base64) */
  data: string;
  /** Number of pages */
  pages: number;
}

/**
 * Cookie
 */
export interface Cookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

/**
 * Wait for selector options
 */
export interface WaitForSelectorOptions {
  /** Wait for visible */
  visible?: boolean;
  /** Wait for hidden */
  hidden?: boolean;
  /** Timeout (ms) */
  timeout?: number;
}

/**
 * Wait for navigation options
 */
export interface WaitForNavigationOptions {
  /** Wait until condition */
  waitUntil?: WaitUntil;
  /** Timeout (ms) */
  timeout?: number;
}

/**
 * Navigate options
 */
export interface NavigateOptions {
  /** Wait until condition */
  waitUntil?: WaitUntil;
  /** Timeout (ms) */
  timeout?: number;
  /** Referer header */
  referer?: string;
}

/**
 * Reload options
 */
export interface ReloadOptions {
  /** Ignore cache */
  ignoreCache?: boolean;
  /** Wait until condition */
  waitUntil?: WaitUntil;
  /** Timeout (ms) */
  timeout?: number;
}

/**
 * Snapshot options
 */
export interface SnapshotOptions {
  /** Include screenshot */
  includeScreenshot?: boolean;
  /** Maximum number of elements */
  maxElements?: number;
  /** Element types to include */
  elementTypes?: string[];
  /** Annotate elements on screenshot */
  annotateElements?: boolean;
}

/**
 * Clear data options
 */
export interface ClearDataOptions {
  /** Clear cookies */
  cookies?: boolean;
  /** Clear cache */
  cache?: boolean;
  /** Clear localStorage */
  localStorage?: boolean;
}

/**
 * Browser event types
 */
export type BrowserEvent = 
  | 'navigated'
  | 'dialog'
  | 'download'
  | 'console'
  | 'error'
  | 'disconnected';

/**
 * Browser event handler
 */
export type BrowserEventHandler<T = any> = (data: T) => void | Promise<void>;

/**
 * Dialog data
 */
export interface DialogData {
  type: DialogType;
  message: string;
  defaultValue?: string;
}

/**
 * Console message data
 */
export interface ConsoleMessageData {
  type: 'log' | 'info' | 'warn' | 'error' | 'debug';
  text: string;
  args: any[];
  location?: {
    url: string;
    lineNumber: number;
    columnNumber: number;
  };
}

/**
 * Download data
 */
export interface DownloadData {
  url: string;
  suggestedFilename: string;
  guid: string;
}

/**
 * CDP message types
 */
export interface CDPRequest {
  id: number;
  method: string;
  params?: any;
  sessionId?: string;
}

export interface CDPResponse {
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface CDPEvent {
  method: string;
  params: any;
  sessionId?: string;
}

/**
 * CDP message
 */
export type CDPMessage = CDPRequest | CDPResponse | CDPEvent;

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
 * Browser session
 */
export interface BrowserSession {
  /** Session ID */
  id: string;
  /** Browser context ID */
  contextId?: string;
  /** Page target ID */
  targetId?: string;
  /** Created at timestamp */
  createdAt: number;
  /** Last activity timestamp */
  lastActivity: number;
}

/**
 * Session info
 */
export interface SessionInfo {
  id: string;
  createdAt: number;
  lastActivity: number;
  url?: string;
  title?: string;
}
