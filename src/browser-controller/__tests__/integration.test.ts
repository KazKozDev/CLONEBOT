/**
 * Browser Controller Integration Test
 * Tests full browser automation workflow
 */

import { BrowserController } from '../BrowserController';
import { findChromium } from '../browser-launcher';

describe('Browser Controller Integration', () => {
  let browser: BrowserController;
  const chromePath = findChromium();

  beforeAll(() => {
    if (!chromePath) {
      console.log('Chrome not found - skipping integration tests');
    }
  });

  beforeEach(() => {
    if (!chromePath) return;

    browser = new BrowserController({
      mode: 'openclaw',
      openclaw: {
        executablePath: chromePath,
        headless: true
      },
      timeouts: {
        navigation: 10000,
        action: 5000
      }
    });
  });

  afterEach(async () => {
    if (browser && browser.isConnected()) {
      await browser.close();
    }
  });

  it('should launch browser and navigate', async () => {
    if (!chromePath) return;

    await browser.launch();
    expect(browser.isConnected()).toBe(true);

    const result = await browser.navigate('https://example.com');
    expect(result.url).toContain('example.com');
    expect(result.title).toBeTruthy();

    await browser.close();
    expect(browser.isConnected()).toBe(false);
  }, 30000);

  it('should take snapshot with elements', async () => {
    if (!chromePath) return;

    await browser.launch();
    await browser.navigate('https://example.com');

    const snapshot = await browser.snapshot({
      includeScreenshot: true,
      maxElements: 50
    });

    expect(snapshot.screenshot).toBeTruthy();
    expect(snapshot.elements.length).toBeGreaterThan(0);
    expect(snapshot.url).toContain('example.com');
    expect(snapshot.title).toBeTruthy();

    // Check element structure
    const firstElement = snapshot.elements[0];
    expect(firstElement.index).toBe(1);
    expect(firstElement.tag).toBeTruthy();
    expect(firstElement.bounds).toBeDefined();
    expect(firstElement.states).toBeDefined();
  }, 30000);

  it('should execute JavaScript', async () => {
    if (!chromePath) return;

    await browser.launch();
    await browser.navigate('https://example.com');

    const title = await browser.evaluate('document.title');
    expect(typeof title).toBe('string');

    const links = await browser.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).length;
    });
    expect(typeof links).toBe('number');
    expect(links).toBeGreaterThanOrEqual(0);
  }, 30000);

  it('should capture screenshot', async () => {
    if (!chromePath) return;

    await browser.launch();
    await browser.navigate('https://example.com');

    const screenshot = await browser.screenshot({
      format: 'png',
      fullPage: false
    });

    expect(screenshot.data).toBeTruthy();
    expect(screenshot.format).toBe('png');
    expect(screenshot.width).toBeGreaterThan(0);
    expect(screenshot.height).toBeGreaterThan(0);
  }, 30000);

  it('should manage cookies', async () => {
    if (!chromePath) return;

    await browser.launch();
    await browser.navigate('https://example.com');

    await browser.setCookie({
      name: 'test',
      value: 'value123',
      domain: 'example.com',
      path: '/'
    });

    const cookies = await browser.getCookies();
    const testCookie = cookies.find(c => c.name === 'test');
    
    expect(testCookie).toBeDefined();
    expect(testCookie?.value).toBe('value123');

    await browser.clearData({ cookies: true });
  }, 30000);

  it('should navigate back and forward', async () => {
    if (!chromePath) return;

    await browser.launch();
    
    await browser.navigate('https://example.com');
    const url1 = await browser.getCurrentUrl();

    await browser.navigate('https://www.iana.org');
    const url2 = await browser.getCurrentUrl();

    expect(url1).not.toBe(url2);

    const backResult = await browser.goBack();
    expect(backResult).toBeTruthy();
    expect(backResult?.url).toContain('example.com');

    const forwardResult = await browser.goForward();
    expect(forwardResult).toBeTruthy();
    expect(forwardResult?.url).toContain('iana.org');
  }, 45000);

  it('should emit events', async () => {
    if (!chromePath) return;

    await browser.launch();

    const navigatedSpy = jest.fn();
    browser.on('navigated', navigatedSpy);

    await browser.navigate('https://example.com');

    expect(navigatedSpy).toHaveBeenCalled();
    expect(navigatedSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining('example.com')
      })
    );
  }, 30000);
});
