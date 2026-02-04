/**
 * Browser Controller Checkpoint
 * Quick validation of browser automation functionality
 */

import { BrowserController } from './browser-controller';
import { findChromium, isChromeInstalled } from './browser-controller/browser-launcher';

interface CheckResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const results: CheckResult[] = [];

function check(name: string, passed: boolean, error?: string, details?: any) {
  results.push({ name, passed, error, details });
  const icon = passed ? '✓' : '✗';
  const color = passed ? '\x1b[32m' : '\x1b[31m';
  console.log(`${color}${icon}\x1b[0m ${name}`);
  if (error) {
    console.log(`  Error: ${error}`);
  }
  if (details) {
    console.log(`  Details:`, details);
  }
}

async function runChecks() {
  console.log('\n🔍 Browser Controller Checkpoint\n');
  console.log('═'.repeat(50));

  // Check 1: Chrome Installation
  console.log('\n📦 Chrome Installation');
  const chromePath = findChromium();
  const chromeInstalled = isChromeInstalled();
  
  check(
    'Chrome/Chromium detected',
    Boolean(chromeInstalled),
    chromeInstalled ? undefined : 'Chrome not found in standard locations',
    { path: chromePath }
  );

  if (!chromeInstalled) {
    console.log('\n❌ Cannot proceed without Chrome. Please install Chrome or Chromium.');
    return;
  }

  // Check 2: Browser Launch
  console.log('\n🚀 Browser Launch');
  let browser: BrowserController | null = null;

  try {
    browser = new BrowserController({
      mode: 'openclaw',
      openclaw: {
        executablePath: chromePath!,
        headless: true
      },
      timeouts: {
        navigation: 15000
      }
    });

    await browser.launch();
    
    check(
      'Browser launched successfully',
      browser.isConnected(),
      undefined,
      browser.getInfo()
    );

  } catch (error: any) {
    check('Browser launch', false, error.message);
    return;
  }

  // Check 3: Navigation
  console.log('\n🌐 Navigation');
  try {
    const result = await browser.navigate('https://example.com', {
      waitUntil: 'load',
      timeout: 10000
    });

    check(
      'Navigate to URL',
      result.url.includes('example.com'),
      undefined,
      { url: result.url, title: result.title }
    );

    const currentUrl = await browser.getCurrentUrl();
    check(
      'Get current URL',
      currentUrl.includes('example.com'),
      undefined,
      { url: currentUrl }
    );

    const title = await browser.getTitle();
    check(
      'Get page title',
      title.length > 0,
      undefined,
      { title }
    );

  } catch (error: any) {
    check('Navigation', false, error.message);
  }

  // Check 4: Element Scanning
  console.log('\n🔍 Element Scanning');
  try {
    const snapshot = await browser.snapshot({
      includeScreenshot: false,
      maxElements: 50
    });

    check(
      'Scan page elements',
      snapshot.elements.length > 0,
      undefined,
      { 
        elementCount: snapshot.elements.length,
        firstElement: snapshot.elements[0] 
      }
    );

    const hasRequiredFields = snapshot.elements.every(e => 
      typeof e.index === 'number' &&
      typeof e.tag === 'string' &&
      typeof e.bounds === 'object' &&
      typeof e.states === 'object'
    );

    check(
      'Element structure validation',
      hasRequiredFields
    );

  } catch (error: any) {
    check('Element scanning', false, error.message);
  }

  // Check 5: Screenshots
  console.log('\n📸 Screenshots');
  try {
    const screenshot = await browser.screenshot({
      format: 'png',
      fullPage: false
    });

    const hasValidScreenshot = 
      Boolean(screenshot.data) &&
      screenshot.width > 0 &&
      screenshot.height > 0 &&
      screenshot.format === 'png';

    check(
      'Capture screenshot',
      hasValidScreenshot,
      undefined,
      {
        format: screenshot.format,
        width: screenshot.width,
        height: screenshot.height,
        dataLength: typeof screenshot.data === 'string' 
          ? screenshot.data.length 
          : screenshot.data.byteLength
      }
    );

  } catch (error: any) {
    check('Screenshot', false, error.message);
  }

  // Check 6: JavaScript Execution
  console.log('\n⚙️ JavaScript Execution');
  try {
    const jsTitle = await browser.evaluate('document.title');
    
    check(
      'Execute JavaScript',
      typeof jsTitle === 'string' && jsTitle.length > 0,
      undefined,
      { result: jsTitle }
    );

    const links = await browser.evaluate(`
      (function() {
        return Array.from(document.querySelectorAll('a')).map(function(a) {
          return {
            text: a.textContent ? a.textContent.trim() : '',
            href: a.href
          };
        });
      })()
    `);

    check(
      'Execute complex JavaScript',
      Array.isArray(links) && links.length > 0,
      undefined,
      { linkCount: links.length, firstLink: links[0] }
    );

  } catch (error: any) {
    check('JavaScript execution', false, error.message);
  }

  // Check 7: State Management
  console.log('\n🍪 State Management');
  try {
    await browser.setCookie({
      name: 'test_cookie',
      value: 'checkpoint_value',
      domain: 'example.com',
      path: '/'
    });

    const cookies = await browser.getCookies();
    const testCookie = cookies.find(c => c.name === 'test_cookie');

    check(
      'Set and get cookies',
      testCookie?.value === 'checkpoint_value',
      undefined,
      { cookieCount: cookies.length, testCookie }
    );

  } catch (error: any) {
    check('Cookie management', false, error.message);
  }

  // Check 8: Full Snapshot
  console.log('\n📊 Full Snapshot');
  try {
    const fullSnapshot = await browser.snapshot({
      includeScreenshot: true,
      maxElements: 100,
      annotateElements: false
    });

    const isValid = 
      Boolean(fullSnapshot.screenshot) &&
      fullSnapshot.elements.length > 0 &&
      Boolean(fullSnapshot.url) &&
      Boolean(fullSnapshot.title) &&
      fullSnapshot.timestamp > 0;

    check(
      'Full page snapshot',
      isValid,
      undefined,
      {
        url: fullSnapshot.url,
        title: fullSnapshot.title,
        elementCount: fullSnapshot.elements.length,
        hasScreenshot: !!fullSnapshot.screenshot
      }
    );

  } catch (error: any) {
    check('Full snapshot', false, error.message);
  }

  // Cleanup
  console.log('\n🧹 Cleanup');
  try {
    await browser.close();
    
    check(
      'Browser closed',
      Boolean(!browser.isConnected())
    );

  } catch (error: any) {
    check('Cleanup', false, error.message);
  }

  // Summary
  console.log('\n' + '═'.repeat(50));
  console.log('\n📈 Summary\n');

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const percentage = Math.round((passed / total) * 100);

  console.log(`Passed: ${passed}/${total} (${percentage}%)`);

  if (passed === total) {
    console.log('\n✅ All checks passed! Browser Controller is working correctly.\n');
  } else {
    console.log('\n❌ Some checks failed. Review errors above.\n');
    process.exit(1);
  }
}

// Run checks
runChecks().catch(error => {
  console.error('\n❌ Checkpoint failed:', error);
  process.exit(1);
});
