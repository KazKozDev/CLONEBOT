/**
 * Screenshot Handler
 * Captures and processes screenshots
 */

import { CDPClient } from './cdp-client';
import { ScreenshotOptions, ScreenshotResult, PDFOptions, PDFResult, Element } from './types';

/**
 * Screenshot Handler
 * Captures page screenshots and PDFs
 */
export class ScreenshotHandler {
  private cdp: CDPClient;
  private sessionId?: string;

  constructor(cdp: CDPClient, sessionId?: string) {
    this.cdp = cdp;
    this.sessionId = sessionId;
  }

  /**
   * Capture screenshot
   */
  async capture(options: ScreenshotOptions = {}): Promise<ScreenshotResult> {
    const {
      fullPage = false,
      clip,
      format = 'png',
      quality = 80,
      encoding = 'base64'
    } = options;

    let params: any = {
      format,
      captureBeyondViewport: fullPage
    };

    if (format === 'jpeg' || format === 'webp') {
      params.quality = quality;
    }

    if (clip) {
      params.clip = clip;
    } else if (fullPage) {
      // Get full page dimensions
      const metrics = await this.cdp.send('Page.getLayoutMetrics', undefined, this.sessionId);
      
      params.clip = {
        x: 0,
        y: 0,
        width: metrics.contentSize.width,
        height: metrics.contentSize.height,
        scale: 1
      };
    }

    const result = await this.cdp.send('Page.captureScreenshot', params, this.sessionId);

    return {
      data: encoding === 'base64' ? result.data : Buffer.from(result.data, 'base64'),
      width: clip?.width ?? params.clip?.width ?? 0,
      height: clip?.height ?? params.clip?.height ?? 0,
      format
    };
  }

  /**
   * Capture element screenshot
   */
  async captureElement(element: Element, options: ScreenshotOptions = {}): Promise<ScreenshotResult> {
    const clip = {
      x: element.bounds.x,
      y: element.bounds.y,
      width: element.bounds.width,
      height: element.bounds.height,
      scale: 1
    };

    return this.capture({
      ...options,
      clip
    });
  }

  /**
   * Annotate screenshot with element numbers
   */
  async annotate(screenshot: string, elements: Element[]): Promise<string> {
    // This would require image processing library (sharp, jimp, etc.)
    // For now, return original screenshot
    // In production, this would:
    // 1. Decode base64 screenshot
    // 2. Draw element numbers and boxes
    // 3. Re-encode to base64
    
    return screenshot;
  }

  /**
   * Generate PDF
   */
  async generatePDF(options: PDFOptions = {}): Promise<PDFResult> {
    const {
      format,
      landscape = false,
      printBackground = false,
      margin,
      paperWidth,
      paperHeight,
      pageRanges,
      scale = 1
    } = options;

    const params: any = {
      landscape,
      printBackground,
      scale
    };

    // Paper format or dimensions
    if (format) {
      const formats: Record<string, { width: number; height: number }> = {
        'A4': { width: 8.27, height: 11.69 },
        'Letter': { width: 8.5, height: 11 },
        'Legal': { width: 8.5, height: 14 },
        'Tabloid': { width: 11, height: 17 }
      };

      if (formats[format]) {
        params.paperWidth = formats[format].width;
        params.paperHeight = formats[format].height;
      }
    }

    if (paperWidth !== undefined) {
      params.paperWidth = paperWidth;
    }

    if (paperHeight !== undefined) {
      params.paperHeight = paperHeight;
    }

    // Margins
    if (margin) {
      params.marginTop = margin.top || '0';
      params.marginRight = margin.right || '0';
      params.marginBottom = margin.bottom || '0';
      params.marginLeft = margin.left || '0';
    }

    // Page ranges
    if (pageRanges) {
      params.pageRanges = pageRanges;
    }

    const result = await this.cdp.send('Page.printToPDF', params, this.sessionId);

    return {
      data: result.data,
      pages: this.countPDFPages(result.data)
    };
  }

  /**
   * Count PDF pages (simplified)
   */
  private countPDFPages(pdfData: string): number {
    // Decode base64
    const buffer = Buffer.from(pdfData, 'base64');
    const text = buffer.toString('binary');
    
    // Count /Page occurrences (simplified, not 100% accurate)
    const matches = text.match(/\/Type\s*\/Page[^s]/g);
    return matches ? matches.length : 1;
  }

  /**
   * Set viewport size (for consistent screenshots)
   */
  async setViewport(width: number, height: number, deviceScaleFactor: number = 1): Promise<void> {
    await this.cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor,
      mobile: false
    }, this.sessionId);
  }

  /**
   * Clear viewport override
   */
  async clearViewport(): Promise<void> {
    await this.cdp.send('Emulation.clearDeviceMetricsOverride', undefined, this.sessionId);
  }
}
