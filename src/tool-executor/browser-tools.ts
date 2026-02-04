/**
 * Browser Controller Tools
 * 
 * Integration between BrowserController and ToolExecutor
 */

import { BrowserController } from '../browser-controller/BrowserController';
import type { BrowserControllerConfig } from '../browser-controller/types';
import type { ToolDefinition, ToolHandler, ExecutionContext, ToolResult } from './types';

// ============================================================================
// Browser Tool Definitions
// ============================================================================

/**
 * Navigate to URL
 */
export const navigateTool: ToolDefinition = {
  name: 'browser.navigate',
  description: 'Navigate to a URL in the browser and wait for page load',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to navigate to (must start with http:// or https://)'
      },
      waitUntil: {
        type: 'string',
        enum: ['load', 'domcontentloaded', 'networkidle'],
        description: 'Wait until this event occurs (default: load)',
        default: 'load'
      },
      timeout: {
        type: 'number',
        description: 'Maximum time to wait in milliseconds (default: 30000)',
        default: 30000
      }
    },
    required: ['url']
  },
  metadata: {
    category: 'browser',
    permissions: ['network'],
    dangerous: false,
    timeout: 120000 // 2 minutes for launch/navigation
  }
};

/**
 * Take a screenshot
 */
export const screenshotTool: ToolDefinition = {
  name: 'browser.screenshot',
  description: 'Capture a screenshot of the current page or a specific element',
  parameters: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['png', 'jpeg', 'webp'],
        description: 'Image format (default: png)',
        default: 'png'
      },
      quality: {
        type: 'number',
        minimum: 0,
        maximum: 100,
        description: 'JPEG/WebP quality 0-100 (default: 80)',
        default: 80
      },
      fullPage: {
        type: 'boolean',
        description: 'Capture full scrollable page (default: false)',
        default: false
      },
      elementIndex: {
        type: 'number',
        description: 'Index of element to screenshot (from snapshot)'
      }
    },
    required: []
  },
  metadata: {
    category: 'browser',
    permissions: [],
    dangerous: false
  }
};

/**
 * Scan page elements
 */
export const scanTool: ToolDefinition = {
  name: 'browser.scan',
  description: 'Scan the current page and return interactive elements with their positions',
  parameters: {
    type: 'object',
    properties: {
      includeScreenshot: {
        type: 'boolean',
        description: 'Include screenshot in the result (default: false)',
        default: false
      }
    },
    required: []
  },
  metadata: {
    category: 'browser',
    permissions: [],
    dangerous: false
  }
};

/**
 * Click on element
 */
export const clickTool: ToolDefinition = {
  name: 'browser.click',
  description: 'Click on an element by index, selector, or coordinates',
  parameters: {
    type: 'object',
    properties: {
      index: {
        type: 'number',
        description: 'Element index from scan result (1-based)'
      },
      selector: {
        type: 'string',
        description: 'CSS selector'
      },
      x: {
        type: 'number',
        description: 'X coordinate (requires y)'
      },
      y: {
        type: 'number',
        description: 'Y coordinate (requires x)'
      },
      button: {
        type: 'string',
        enum: ['left', 'right', 'middle'],
        description: 'Mouse button (default: left)',
        default: 'left'
      },
      clickCount: {
        type: 'number',
        description: 'Number of clicks (default: 1)',
        default: 1
      }
    },
    required: []
  },
  metadata: {
    category: 'browser',
    permissions: [],
    dangerous: false
  }
};

/**
 * Type text into element
 */
export const typeTool: ToolDefinition = {
  name: 'browser.type',
  description: 'Type text into an input field or element',
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text to type'
      },
      index: {
        type: 'number',
        description: 'Element index from scan result (1-based)'
      },
      selector: {
        type: 'string',
        description: 'CSS selector'
      },
      delay: {
        type: 'number',
        description: 'Delay between keystrokes in ms (default: 0)',
        default: 0
      }
    },
    required: ['text']
  },
  metadata: {
    category: 'browser',
    permissions: [],
    dangerous: false
  }
};

/**
 * Fill form field
 */
export const fillTool: ToolDefinition = {
  name: 'browser.fill',
  description: 'Fill a form field with text (faster than type, clears existing content)',
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text to fill'
      },
      index: {
        type: 'number',
        description: 'Element index from scan result (1-based)'
      },
      selector: {
        type: 'string',
        description: 'CSS selector'
      }
    },
    required: ['text']
  },
  metadata: {
    category: 'browser',
    permissions: [],
    dangerous: false
  }
};

/**
 * Execute JavaScript
 */
export const evaluateTool: ToolDefinition = {
  name: 'browser.evaluate',
  description: 'Execute JavaScript code in the browser context',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'JavaScript expression to evaluate'
      }
    },
    required: ['expression']
  },
  metadata: {
    category: 'browser',
    permissions: ['execute'],
    dangerous: true
  }
};

/**
 * Read page text content
 */
export const readTool: ToolDefinition = {
  name: 'browser.read',
  description: 'Read the text content of the current page',
  parameters: {
    type: 'object',
    properties: {
      maxLength: {
        type: 'number',
        description: 'Maximum number of characters to return (default: 10000)',
        default: 10000
      }
    },
    required: []
  },
  metadata: {
    category: 'browser',
    permissions: [],
    dangerous: false
  }
};

/**
 * Get page cookies
 */
export const getCookiesTool: ToolDefinition = {
  name: 'browser.getCookies',
  description: 'Get cookies for the current page or all cookies',
  parameters: {
    type: 'object',
    properties: {
      urls: {
        type: 'array',
        items: { type: 'string' },
        description: 'URLs to get cookies for (omit for all cookies)'
      }
    },
    required: []
  },
  metadata: {
    category: 'browser',
    permissions: [],
    dangerous: false
  }
};

/**
 * Wait for navigation
 */
export const waitForNavigationTool: ToolDefinition = {
  name: 'browser.waitForNavigation',
  description: 'Wait for navigation to complete after an action',
  parameters: {
    type: 'object',
    properties: {
      timeout: {
        type: 'number',
        description: 'Maximum time to wait in milliseconds (default: 30000)',
        default: 30000
      },
      waitUntil: {
        type: 'string',
        enum: ['load', 'domcontentloaded', 'networkidle'],
        description: 'Wait until this event (default: load)',
        default: 'load'
      }
    },
    required: []
  },
  metadata: {
    category: 'browser',
    permissions: [],
    dangerous: false
  }
};

// ============================================================================
// Browser Tool Handlers
// ============================================================================

/**
 * Create browser tool handlers with a shared BrowserController instance
 */
export function createBrowserToolHandlers(config?: BrowserControllerConfig) {
  let browser: BrowserController | null = null;
  
  // Initialize browser on first use
  async function getBrowser(): Promise<BrowserController> {
    if (!browser) {
      browser = new BrowserController(config || { mode: 'chrome' });
      await browser.launch();
    }
    return browser;
  }
  
  // Navigate handler
  const navigateHandler: ToolHandler = async (args: any, context: ExecutionContext): Promise<ToolResult> => {
    try {
      const controller = await getBrowser();
      const result = await controller.navigate(args.url, {
        waitUntil: args.waitUntil,
        timeout: args.timeout
      });
      
      return {
        success: true,
        content: `Navigated to ${result.url} - ${result.title}`,
        data: {
          url: result.url,
          title: result.title,
          status: result.status
        }
      };
    } catch (error: any) {
      return {
        success: false,
        content: `Navigation failed: ${error.message}`,
        error: {
          code: 'NAVIGATION_ERROR',
          message: error.message
        }
      };
    }
  };
  
  // Screenshot handler
  const screenshotHandler: ToolHandler = async (args: any, context: ExecutionContext): Promise<ToolResult> => {
    try {
      const controller = await getBrowser();
      const result = await controller.screenshot({
        format: args.format || 'png',
        quality: args.quality,
        fullPage: args.fullPage
      });
      
      return {
        success: true,
        content: `Screenshot captured (${result.width}x${result.height})`,
        data: {
          format: result.format,
          width: result.width,
          height: result.height,
          data: result.data.toString('base64')
        }
      };
    } catch (error: any) {
      return {
        success: false,
        content: `Screenshot failed: ${error.message}`,
        error: {
          code: 'SCREENSHOT_ERROR',
          message: error.message
        }
      };
    }
  };
  
  // Scan handler
  const scanHandler: ToolHandler = async (args: any, context: ExecutionContext): Promise<ToolResult> => {
    try {
      const controller = await getBrowser();
      const result = await controller.snapshot({
        includeScreenshot: args.includeScreenshot
      });
      
      const elementSummary = result.elements
        .slice(0, 50)
        .map(e => `[${e.index}] <${e.tag}> ${e.text ? e.text.substring(0, 50).replace(/\n/g, ' ') : ''}`)
        .join('\n');

      return {
        success: true,
        content: `Scanned page: "${result.title}" (${result.url})\nFound ${result.elements.length} elements. Top 50 interactive elements:\n${elementSummary}`,
        data: {
          url: result.url,
          title: result.title,
          elements: result.elements,
          elementCount: result.elements.length,
          screenshot: result.screenshot // Already base64 encoded string
        }
      };
    } catch (error: any) {
      return {
        success: false,
        content: `Scan failed: ${error.message}`,
        error: {
          code: 'SCAN_ERROR',
          message: error.message
        }
      };
    }
  };
  
  // Click handler
  const clickHandler: ToolHandler = async (args: any, context: ExecutionContext): Promise<ToolResult> => {
    try {
      const controller = await getBrowser();
      
      let target: any;
      if (args.index !== undefined) {
        target = args.index;
      } else if (args.selector) {
        target = args.selector;
      } else if (args.x !== undefined && args.y !== undefined) {
        target = { x: args.x, y: args.y };
      } else {
        return {
          success: false,
          content: 'Click target not specified',
          error: {
            code: 'INVALID_TARGET',
            message: 'Must provide index, selector, or x/y coordinates'
          }
        };
      }
      
      await controller.click(target, {
        button: args.button,
        clickCount: args.clickCount
      });
      
      return {
        success: true,
        content: `Clicked element ${args.selector}[${args.index || 0}]`,
        data: { clicked: true }
      };
    } catch (error: any) {
      return {
        success: false,
        content: `Click failed: ${error.message}`,
        error: {
          code: 'CLICK_ERROR',
          message: error.message
        }
      };
    }
  };
  
  // Type handler
  const typeHandler: ToolHandler = async (args: any, context: ExecutionContext): Promise<ToolResult> => {
    try {
      const controller = await getBrowser();
      
      // If target provided, click first to focus
      if (args.index !== undefined || args.selector) {
        let target: any;
        if (args.index !== undefined) target = args.index;
        else target = args.selector;
        
        await controller.click(target);
      }
      
      await controller.type(args.text, { delay: args.delay });
      
      return {
        success: true,
        content: `Typed ${args.text.length} characters`,
        data: { typed: args.text.length + ' characters' }
      };
    } catch (error: any) {
      return {
        success: false,
        content: `Type failed: ${error.message}`,
        error: {
          code: 'TYPE_ERROR',
          message: error.message
        }
      };
    }
  };
  
  // Fill handler
  const fillHandler: ToolHandler = async (args: any, context: ExecutionContext): Promise<ToolResult> => {
    try {
      const controller = await getBrowser();
      
      let target: any;
      if (args.index !== undefined) {
        target = args.index;
      } else if (args.selector) {
        target = args.selector;
      } else {
        return { 
             success: false, 
             content: 'Target required', 
             error: { code: 'INVALID_TARGET', message: 'Index or selector required' } 
        };
      }
      
      await controller.fill(target, args.text);
      
      return {
        success: true,
        content: `Filled ${args.text.length} characters`,
        data: { filled: args.text.length + ' characters' }
      };
    } catch (error: any) {
      return {
        success: false,
        content: `Fill failed: ${error.message}`,
        error: {
          code: 'FILL_ERROR',
          message: error.message
        }
      };
    }
  };
  
  // Evaluate handler
  const evaluateHandler: ToolHandler = async (args: any, context: ExecutionContext): Promise<ToolResult> => {
    try {
      const controller = await getBrowser();
      const result = await controller.evaluate(args.expression);
      
      return {
        success: true,        content: `JavaScript evaluated successfully`,        data: result
      };
    } catch (error: any) {
      return {
        success: false,
        content: `Evaluate failed: ${error.message}`,
        error: {
          code: 'EVALUATE_ERROR',
          message: error.message
        }
      };
    }
  };

  // Read handler
  const readHandler: ToolHandler = async (args: any, context: ExecutionContext): Promise<ToolResult> => {
    try {
      const controller = await getBrowser();
      const result = await controller.evaluate('document.body.innerText');
      const text = String(result || '');
      const maxLength = args.maxLength || 10000;
      
      return {
        success: true,
        content: `Read ${text.length} characters (truncated to ${maxLength})`,
        data: { 
          text: text.substring(0, maxLength),
          totalLength: text.length,
          truncated: text.length > maxLength
        }
      };
    } catch (error: any) {
      return {
        success: false,
        content: `Read failed: ${error.message}`,
        error: {
          code: 'READ_ERROR',
          message: error.message
        }
      };
    }
  };
  
  // Get cookies handler
  const getCookiesHandler: ToolHandler = async (args: any, context: ExecutionContext): Promise<ToolResult> => {
    try {
      const controller = await getBrowser();
      const cookies = await controller.getCookies(args.urls);
      
      return {
        success: true,
        content: `Retrieved ${cookies.length} cookies`,
        data: { cookies }
      };
    } catch (error: any) {
      return {
        success: false,
        content: `Get cookies failed: ${error.message}`,
        error: {
          code: 'COOKIES_ERROR',
          message: error.message
        }
      };
    }
  };
  
  // Wait for navigation handler
  const waitForNavigationHandler: ToolHandler = async (args: any, context: ExecutionContext): Promise<ToolResult> => {
    try {
      const controller = await getBrowser();
      await controller.waitForNavigation({
        timeout: args.timeout,
        waitUntil: args.waitUntil
      });
      
      return {
        success: true,
        content: `Navigation completed successfully`,
        data: { completed: true }
      };
    } catch (error: any) {
      return {
        success: false,
        content: `Wait for navigation failed: ${error.message}`,
        error: {
          code: 'WAIT_NAV_ERROR',
          message: error.message
        }
      };
    }
  };
  
  // Cleanup function
  const cleanup = async () => {
    if (browser) {
      await browser.close();
      browser = null;
    }
  };
  
  return {
    handlers: {
      [navigateTool.name]: navigateHandler,
      [screenshotTool.name]: screenshotHandler,
      [scanTool.name]: scanHandler,
      [clickTool.name]: clickHandler,
      [typeTool.name]: typeHandler,
      [fillTool.name]: fillHandler,
      [evaluateTool.name]: evaluateHandler,
      [readTool.name]: readHandler,
      [getCookiesTool.name]: getCookiesHandler,
      [waitForNavigationTool.name]: waitForNavigationHandler
    },
    cleanup
  };
}

// ============================================================================
// Registration Helper
// ============================================================================

/**
 * Register all browser tools with a ToolExecutor
 */
export function registerBrowserTools(
  registry: { register: (def: ToolDefinition, handler: ToolHandler) => void },
  config?: BrowserControllerConfig
) {
  const { handlers, cleanup } = createBrowserToolHandlers(config);
  
  registry.register(navigateTool, handlers[navigateTool.name]);
  registry.register(screenshotTool, handlers[screenshotTool.name]);
  registry.register(scanTool, handlers[scanTool.name]);
  registry.register(clickTool, handlers[clickTool.name]);
  registry.register(typeTool, handlers[typeTool.name]);
  registry.register(fillTool, handlers[fillTool.name]);
  registry.register(evaluateTool, handlers[evaluateTool.name]);
  registry.register(readTool, handlers[readTool.name]);
  registry.register(getCookiesTool, handlers[getCookiesTool.name]);
  registry.register(waitForNavigationTool, handlers[waitForNavigationTool.name]);
  
  return { cleanup };
}
