/**
 * Browser Launcher Tests
 */

import { findChromium, launchChromium, getChromeVersion, isChromeInstalled } from '../browser-launcher';

describe('Browser Launcher', () => {
  describe('findChromium', () => {
    it('should find Chromium executable', () => {
      const path = findChromium();
      // May be null on systems without Chrome installed
      if (path !== null) {
        expect(typeof path).toBe('string');
        expect(path.length).toBeGreaterThan(0);
      }
    });

    it('should check if Chrome is installed', () => {
      const installed = isChromeInstalled();
      expect(typeof installed).toBe('boolean');
    });
  });

  describe('getChromeVersion', () => {
    it('should get Chrome version', async () => {
      const chromePath = findChromium();
      
      if (chromePath) {
        const version = await getChromeVersion(chromePath);
        
        if (version) {
          expect(version).toMatch(/\d+\.\d+\.\d+\.\d+/);
        }
      } else {
        // Skip test if Chrome not installed
        expect(true).toBe(true);
      }
    });

    it('should return null for invalid path', async () => {
      const version = await getChromeVersion('/invalid/path/to/chrome');
      expect(version).toBeNull();
    });
  });

  describe('launchChromium', () => {
    // Note: These tests require Chrome to be installed
    // They may be skipped in CI environments
    
    it('should launch browser and get WebSocket endpoint', async () => {
      const chromePath = findChromium();
      
      if (!chromePath) {
        console.log('Skipping test: Chrome not found');
        return;
      }

      const browser = await launchChromium({
        executablePath: chromePath,
        headless: true,
        timeout: 10000
      });

      expect(browser).toBeDefined();
      expect(browser.pid).toBeGreaterThan(0);
      expect(browser.wsEndpoint).toMatch(/^ws:\/\//);
      expect(typeof browser.close).toBe('function');

      await browser.close();
    }, 15000);

    it('should reject with invalid executable path', async () => {
      await expect(
        launchChromium({
          executablePath: '/invalid/path/chrome',
          timeout: 1000
        })
      ).rejects.toThrow('not found');
    });

    it('should launch with custom args', async () => {
      const chromePath = findChromium();
      
      if (!chromePath) {
        return;
      }

      const browser = await launchChromium({
        executablePath: chromePath,
        headless: true,
        args: [
          '--window-size=1920,1080',
          '--disable-gpu'
        ],
        timeout: 10000
      });

      expect(browser).toBeDefined();
      await browser.close();
    }, 15000);
  });
});
