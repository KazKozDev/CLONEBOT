/**
 * Element Scanner
 * Scans page for interactable elements and assigns indices
 */

import { CDPClient } from './cdp-client';
import { Element, ElementBounds, ElementStates } from './types';

/**
 * Scanner options
 */
export interface ScanOptions {
  /** Maximum elements to return */
  maxElements?: number;
  /** Include hidden elements */
  includeHidden?: boolean;
  /** Custom selectors to include */
  customSelectors?: string[];
}

/**
 * Default selectors for interactable elements
 */
const DEFAULT_SELECTORS = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'textarea',
  'select',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[onclick]',
  '[contenteditable="true"]',
  'label[for]',
  'summary'
];

/**
 * Scanning script to run in page context
 */
const SCAN_SCRIPT = `
(function(selectors, includeHidden, maxElements) {
  const elements = [];
  const seen = new Set();

  // Get all matching elements
  const selectorList = selectors.join(',');
  const candidates = document.querySelectorAll(selectorList);

  for (const elem of candidates) {
    // Skip duplicates
    if (seen.has(elem)) continue;
    seen.add(elem);

    // Skip if hidden (unless includeHidden)
    if (!includeHidden) {
      const style = window.getComputedStyle(elem);
      if (style.display === 'none' || 
          style.visibility === 'hidden' ||
          style.opacity === '0') {
        continue;
      }
    }

    // Get bounding box
    const rect = elem.getBoundingClientRect();
    
    // Skip elements with no size
    if (rect.width === 0 && rect.height === 0) {
      continue;
    }

    // Extract element info
    const info = {
      tag: elem.tagName.toLowerCase(),
      role: elem.getAttribute('role') || '',
      name: elem.getAttribute('aria-label') || elem.getAttribute('name') || '',
      text: elem.textContent?.trim().substring(0, 100) || '',
      attributes: {
        id: elem.id || undefined,
        class: elem.className || undefined,
        href: elem.getAttribute('href') || undefined,
        src: elem.getAttribute('src') || undefined,
        placeholder: elem.getAttribute('placeholder') || undefined,
        value: elem.value || undefined,
        type: elem.getAttribute('type') || undefined
      },
      bounds: {
        x: rect.left + window.scrollX,
        y: rect.top + window.scrollY,
        width: rect.width,
        height: rect.height
      },
      states: {
        visible: rect.width > 0 && rect.height > 0,
        enabled: !elem.disabled,
        focused: document.activeElement === elem,
        checked: elem.checked || undefined
      }
    };

    elements.push(info);

    // Limit elements
    if (maxElements && elements.length >= maxElements) {
      break;
    }
  }

  // Sort by position (top to bottom, left to right)
  elements.sort((a, b) => {
    const yDiff = a.bounds.y - b.bounds.y;
    if (Math.abs(yDiff) > 10) {
      return yDiff;
    }
    return a.bounds.x - b.bounds.x;
  });

  return elements;
})
`;

/**
 * Element Scanner
 * Scans page for interactable elements
 */
export class ElementScanner {
  private cdp: CDPClient;
  private sessionId?: string;
  private scannedElements: Element[] = [];
  private lastScanTime = 0;

  constructor(cdp: CDPClient, sessionId?: string) {
    this.cdp = cdp;
    this.sessionId = sessionId;
  }

  /**
   * Scan page for elements
   */
  async scanElements(options: ScanOptions = {}): Promise<Element[]> {
    const {
      maxElements = 100,
      includeHidden = false,
      customSelectors = []
    } = options;

    // Combine selectors
    const selectors = [...DEFAULT_SELECTORS, ...customSelectors];

    // Execute scan script
    const result = await this.cdp.send('Runtime.evaluate', {
      expression: `(${SCAN_SCRIPT})(${JSON.stringify(selectors)}, ${includeHidden}, ${maxElements})`,
      returnByValue: true,
      awaitPromise: false
    }, this.sessionId);

    if (result.exceptionDetails) {
      throw new Error(`Element scan failed: ${result.exceptionDetails.text}`);
    }

    const rawElements = result.result.value || [];

    // Assign indices and create Element objects
    this.scannedElements = rawElements.map((elem: any, index: number) => ({
      index: index + 1, // 1-based indexing
      tag: elem.tag,
      role: elem.role,
      name: elem.name,
      text: elem.text,
      attributes: elem.attributes,
      bounds: elem.bounds,
      states: elem.states,
      interactable: this.isInteractable(elem)
    }));

    this.lastScanTime = Date.now();

    return this.scannedElements;
  }

  /**
   * Get element by index
   */
  getElement(index: number): Element | null {
    return this.scannedElements.find(e => e.index === index) || null;
  }

  /**
   * Find element by selector
   */
  async findElement(selector: string): Promise<Element | null> {
    try {
      const result = await this.cdp.send('Runtime.evaluate', {
        expression: `
          (function() {
            const elem = document.querySelector(${JSON.stringify(selector)});
            if (!elem) return null;
            
            const rect = elem.getBoundingClientRect();
            return {
              tag: elem.tagName.toLowerCase(),
              role: elem.getAttribute('role') || '',
              name: elem.getAttribute('aria-label') || elem.getAttribute('name') || '',
              text: elem.textContent?.trim().substring(0, 100) || '',
              attributes: {
                id: elem.id || undefined,
                class: elem.className || undefined,
                href: elem.getAttribute('href') || undefined,
                src: elem.getAttribute('src') || undefined
              },
              bounds: {
                x: rect.left + window.scrollX,
                y: rect.top + window.scrollY,
                width: rect.width,
                height: rect.height
              },
              states: {
                visible: rect.width > 0 && rect.height > 0,
                enabled: !elem.disabled,
                focused: document.activeElement === elem,
                checked: elem.checked
              }
            };
          })()
        `,
        returnByValue: true
      }, this.sessionId);

      if (!result.result.value) {
        return null;
      }

      const elem = result.result.value;
      
      return {
        index: 0, // Not indexed
        tag: elem.tag,
        role: elem.role,
        name: elem.name,
        text: elem.text,
        attributes: elem.attributes,
        bounds: elem.bounds,
        states: elem.states,
        interactable: this.isInteractable(elem),
        selector
      };

    } catch {
      return null;
    }
  }

  /**
   * Get all scanned elements
   */
  getAllElements(): Element[] {
    return [...this.scannedElements];
  }

  /**
   * Get scan timestamp
   */
  getLastScanTime(): number {
    return this.lastScanTime;
  }

  /**
   * Clear scanned elements
   */
  clear(): void {
    this.scannedElements = [];
    this.lastScanTime = 0;
  }

  /**
   * Check if element is interactable
   */
  private isInteractable(elem: any): boolean {
    // Must be visible
    if (!elem.states.visible) {
      return false;
    }

    // Must be enabled (for form elements)
    if ('enabled' in elem.states && !elem.states.enabled) {
      return false;
    }

    // Must have reasonable size
    if (elem.bounds.width < 1 || elem.bounds.height < 1) {
      return false;
    }

    return true;
  }

  /**
   * Get element CSS selector
   */
  async getElementSelector(element: Element): Promise<string> {
    // Try to build a selector
    const parts: string[] = [element.tag];

    if (element.attributes.id) {
      return `#${element.attributes.id}`;
    }

    if (element.attributes.class) {
      const classes = element.attributes.class.trim().split(/\s+/).slice(0, 2);
      parts.push(...classes.map(c => `.${c}`));
    }

    if (element.attributes.href) {
      parts.push(`[href="${element.attributes.href}"]`);
    }

    return parts.join('');
  }

  /**
   * Highlight element (for debugging)
   */
  async highlightElement(index: number): Promise<void> {
    const element = this.getElement(index);
    if (!element) {
      throw new Error(`Element ${index} not found`);
    }

    await this.cdp.send('Overlay.highlightRect', {
      x: element.bounds.x,
      y: element.bounds.y,
      width: element.bounds.width,
      height: element.bounds.height,
      color: { r: 255, g: 0, b: 0, a: 0.5 },
      outlineColor: { r: 255, g: 0, b: 0, a: 1 }
    }, this.sessionId);
  }

  /**
   * Clear highlight
   */
  async clearHighlight(): Promise<void> {
    await this.cdp.send('Overlay.hideHighlight', undefined, this.sessionId);
  }
}
