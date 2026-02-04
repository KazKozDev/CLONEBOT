/**
 * Action Executor
 * Executes actions on page elements
 */

import { CDPClient } from './cdp-client';
import { ElementScanner } from './element-scanner';
import {
  ActionTarget,
  ActionResult,
  ClickOptions,
  TypeOptions,
  KeyPressOptions,
  ScrollOptions,
  Element
} from './types';

/**
 * Resolved target (element with coordinates)
 */
interface ResolvedTarget {
  element?: Element;
  x: number;
  y: number;
}

/**
 * Action Executor
 * Executes user actions on page elements
 */
export class ActionExecutor {
  private cdp: CDPClient;
  private scanner: ElementScanner;
  private sessionId?: string;

  constructor(cdp: CDPClient, scanner: ElementScanner, sessionId?: string) {
    this.cdp = cdp;
    this.scanner = scanner;
    this.sessionId = sessionId;
  }

  /**
   * Click on target
   */
  async click(target: ActionTarget, options: ClickOptions = {}): Promise<ActionResult> {
    const {
      button = 'left',
      clickCount = 1,
      delay = 0
    } = options;

    const resolved = await this.resolveTarget(target);

    // Move mouse to position
    await this.cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: resolved.x,
      y: resolved.y
    }, this.sessionId);

    // Press and release
    const buttonMap = { left: 'left', right: 'right', middle: 'middle' };
    
    for (let i = 0; i < clickCount; i++) {
      await this.cdp.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: resolved.x,
        y: resolved.y,
        button: buttonMap[button],
        clickCount: i + 1
      }, this.sessionId);

      if (delay > 0) {
        await this.sleep(delay);
      }

      await this.cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: resolved.x,
        y: resolved.y,
        button: buttonMap[button],
        clickCount: i + 1
      }, this.sessionId);

      if (i < clickCount - 1 && delay > 0) {
        await this.sleep(delay);
      }
    }

    return {
      success: true,
      element: resolved.element,
      message: `Clicked at (${resolved.x}, ${resolved.y})`
    };
  }

  /**
   * Double-click on target
   */
  async doubleClick(target: ActionTarget): Promise<ActionResult> {
    return this.click(target, { clickCount: 2 });
  }

  /**
   * Right-click on target
   */
  async rightClick(target: ActionTarget): Promise<ActionResult> {
    return this.click(target, { button: 'right' });
  }

  /**
   * Type text
   */
  async type(text: string, options: TypeOptions = {}): Promise<ActionResult> {
    const { delay = 0, clear = false } = options;

    // Clear field if requested
    if (clear) {
      await this.pressKey('a', { modifiers: ['Control'] });
      await this.pressKey('Backspace');
    }

    // Type each character
    for (const char of text) {
      await this.cdp.send('Input.dispatchKeyEvent', {
        type: 'char',
        text: char
      }, this.sessionId);

      if (delay > 0) {
        await this.sleep(delay);
      }
    }

    return {
      success: true,
      message: `Typed: ${text}`
    };
  }

  /**
   * Fill input field
   */
  async fill(target: ActionTarget, value: string): Promise<ActionResult> {
    const resolved = await this.resolveTarget(target);

    // Click to focus
    await this.click(target);

    // Clear existing value
    await this.pressKey('a', { modifiers: ['Control'] });
    await this.pressKey('Backspace');

    // Insert text
    await this.cdp.send('Input.insertText', {
      text: value
    }, this.sessionId);

    return {
      success: true,
      element: resolved.element,
      message: `Filled: ${value}`
    };
  }

  /**
   * Select option(s) in dropdown
   */
  async select(target: ActionTarget, values: string | string[]): Promise<ActionResult> {
    const resolved = await this.resolveTarget(target);
    const valueArray = Array.isArray(values) ? values : [values];

    // Execute selection in page context
    const selector = await this.getSelector(target);
    
    const result = await this.cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const select = document.querySelector(${JSON.stringify(selector)});
          if (!select || select.tagName !== 'SELECT') {
            return { success: false, error: 'Not a select element' };
          }
          
          const values = ${JSON.stringify(valueArray)};
          const selected = [];
          
          for (const option of select.options) {
            if (values.includes(option.value) || values.includes(option.text)) {
              option.selected = true;
              selected.push(option.value);
            } else {
              option.selected = false;
            }
          }
          
          // Trigger change event
          select.dispatchEvent(new Event('change', { bubbles: true }));
          
          return { success: true, selected };
        })()
      `,
      returnByValue: true
    }, this.sessionId);

    const selectResult = result.result.value;

    if (!selectResult.success) {
      throw new Error(selectResult.error);
    }

    return {
      success: true,
      element: resolved.element,
      message: `Selected: ${selectResult.selected.join(', ')}`
    };
  }

  /**
   * Hover over target
   */
  async hover(target: ActionTarget): Promise<ActionResult> {
    const resolved = await this.resolveTarget(target);

    await this.cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: resolved.x,
      y: resolved.y
    }, this.sessionId);

    return {
      success: true,
      element: resolved.element,
      message: `Hovered at (${resolved.x}, ${resolved.y})`
    };
  }

  /**
   * Focus on target
   */
  async focus(target: ActionTarget): Promise<ActionResult> {
    const selector = await this.getSelector(target);

    await this.cdp.send('Runtime.evaluate', {
      expression: `document.querySelector(${JSON.stringify(selector)})?.focus()`,
      returnByValue: true
    }, this.sessionId);

    return {
      success: true,
      message: 'Focused'
    };
  }

  /**
   * Press keyboard key
   */
  async pressKey(key: string, options: KeyPressOptions = {}): Promise<ActionResult> {
    const { modifiers = [] } = options;

    // Press modifiers
    for (const modifier of modifiers) {
      await this.cdp.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: modifier,
        code: modifier,
        modifiers: this.getModifierBits(modifiers)
      }, this.sessionId);
    }

    // Press key
    await this.cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code: key,
      modifiers: this.getModifierBits(modifiers)
    }, this.sessionId);

    // Release key
    await this.cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code: key,
      modifiers: this.getModifierBits(modifiers)
    }, this.sessionId);

    // Release modifiers
    for (const modifier of modifiers.reverse()) {
      await this.cdp.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: modifier,
        code: modifier,
        modifiers: this.getModifierBits(modifiers)
      }, this.sessionId);
    }

    return {
      success: true,
      message: `Pressed: ${key}`
    };
  }

  /**
   * Scroll page or element
   */
  async scroll(options: ScrollOptions): Promise<ActionResult> {
    const {
      target,
      direction = 'down',
      amount = 100
    } = options;

    if (target) {
      const resolved = await this.resolveTarget(target);
      
      // Scroll to element
      await this.cdp.send('Runtime.evaluate', {
        expression: `window.scrollTo(${resolved.x}, ${resolved.y})`,
        returnByValue: true
      }, this.sessionId);
    } else {
      // Scroll page
      const delta = direction === 'down' || direction === 'right' ? amount : -amount;
      const axis = direction === 'up' || direction === 'down' ? 'y' : 'x';

      await this.cdp.send('Runtime.evaluate', {
        expression: `window.scrollBy(${axis === 'x' ? delta : 0}, ${axis === 'y' ? delta : 0})`,
        returnByValue: true
      }, this.sessionId);
    }

    return {
      success: true,
      message: `Scrolled ${direction} by ${amount}px`
    };
  }

  /**
   * Upload file(s)
   */
  async upload(target: ActionTarget, files: string[]): Promise<ActionResult> {
    const selector = await this.getSelector(target);

    // Get node ID
    const doc = await this.cdp.send('DOM.getDocument', undefined, this.sessionId);
    const node = await this.cdp.send('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector
    }, this.sessionId);

    if (!node.nodeId) {
      throw new Error('Element not found');
    }

    // Set files
    await this.cdp.send('DOM.setFileInputFiles', {
      files,
      nodeId: node.nodeId
    }, this.sessionId);

    return {
      success: true,
      message: `Uploaded ${files.length} file(s)`
    };
  }

  /**
   * Check checkbox or radio
   */
  async check(target: ActionTarget): Promise<ActionResult> {
    const selector = await this.getSelector(target);

    const result = await this.cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const elem = document.querySelector(${JSON.stringify(selector)});
          if (!elem || (elem.type !== 'checkbox' && elem.type !== 'radio')) {
            return false;
          }
          elem.checked = true;
          elem.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        })()
      `,
      returnByValue: true
    }, this.sessionId);

    if (!result.result.value) {
      throw new Error('Not a checkbox or radio button');
    }

    return {
      success: true,
      message: 'Checked'
    };
  }

  /**
   * Uncheck checkbox
   */
  async uncheck(target: ActionTarget): Promise<ActionResult> {
    const selector = await this.getSelector(target);

    const result = await this.cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const elem = document.querySelector(${JSON.stringify(selector)});
          if (!elem || elem.type !== 'checkbox') {
            return false;
          }
          elem.checked = false;
          elem.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        })()
      `,
      returnByValue: true
    }, this.sessionId);

    if (!result.result.value) {
      throw new Error('Not a checkbox');
    }

    return {
      success: true,
      message: 'Unchecked'
    };
  }

  /**
   * Resolve target to coordinates
   */
  private async resolveTarget(target: ActionTarget): Promise<ResolvedTarget> {
    // Coordinates
    if (typeof target === 'object' && 'x' in target) {
      return { x: target.x, y: target.y };
    }

    // Element index
    if (typeof target === 'number') {
      if (target === 0) {
        throw new Error('Invalid element index 0. Element indices are 1-based (start from 1). Please check the output of browser.scan.');
      }
      const element = this.scanner.getElement(target);
      if (!element) {
        throw new Error(`Element ${target} not found`);
      }

      return {
        element,
        x: element.bounds.x + element.bounds.width / 2,
        y: element.bounds.y + element.bounds.height / 2
      };
    }

    // CSS selector
    const element = await this.scanner.findElement(target);
    if (!element) {
      throw new Error(`Element not found: ${target}`);
    }

    return {
      element,
      x: element.bounds.x + element.bounds.width / 2,
      y: element.bounds.y + element.bounds.height / 2
    };
  }

  /**
   * Get selector for target
   */
  private async getSelector(target: ActionTarget): Promise<string> {
    if (typeof target === 'string') {
      return target;
    }

    if (typeof target === 'number') {
      const element = this.scanner.getElement(target);
      if (!element) {
        throw new Error(`Element ${target} not found`);
      }
      return await this.scanner.getElementSelector(element);
    }

    throw new Error('Cannot get selector for coordinates');
  }

  /**
   * Get modifier bits
   */
  private getModifierBits(modifiers: string[]): number {
    let bits = 0;
    if (modifiers.includes('Alt')) bits |= 1;
    if (modifiers.includes('Control')) bits |= 2;
    if (modifiers.includes('Meta')) bits |= 4;
    if (modifiers.includes('Shift')) bits |= 8;
    return bits;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
