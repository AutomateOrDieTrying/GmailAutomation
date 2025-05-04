/**
 * navigate-and-capture.js
 *
 * A super-verbose Puppeteer script to navigate the Gmail account creation flow,
 * capture screenshots at each step, and dump HTML on errors, with robust handling
 * for selector timeouts and retries using jsname attributes.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

(async () => {
  console.log('[INFO] Starting Puppeteer script...');

  let browser;
  let page;
  let step = 0;

  // Helper: capture screenshot with verbose logging
  async function captureScreenshot(description) {
    step += 1;
    const safeDesc = description.replace(/\s+/g, '-').toLowerCase();
    const filename = `${String(step).padStart(2, '0')}-${safeDesc}.png`;
    const filePath = path.join(artifactsDir, filename);
    console.log(`[INFO] Capturing screenshot (#${step}): ${filePath}`);
    await page.screenshot({ path: filePath, fullPage: true });
  }

  // Setup and execution
  try {
    console.log('[INFO] Launching browser...');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();
    page.setDefaultTimeout(60000);
    console.log('[INFO] Browser launched and new page created.');

    // Log page console messages
    page.on('console', msg => console.log(`[PAGE ${msg.type().toUpperCase()}] ${msg.text()}`));

    // Prepare artifacts directory
    const artifactsDir = path.resolve(__dirname, 'artifacts');
    console.log(`[INFO] Artifacts directory: ${artifactsDir}`);
    if (!fs.existsSync(artifactsDir)) {
      console.log('[INFO] Creating artifacts directory...');
      fs.mkdirSync(artifactsDir);
      console.log('[INFO] Artifacts directory created.');
    }

    // Step 1: Navigate to Gmail
    console.log('[STEP 1] Navigating to https://gmail.com...');
    await page.goto('https://gmail.com', { waitUntil: 'networkidle2' });
    console.log(`[INFO] Arrived at URL: ${page.url()}`);
    await captureScreenshot('gmail-home');

    // Step 2: Click "Create account" via jsname selectors
    console.log('[STEP 2] Attempting to click "Create account"...');
    const createAccountSelectors = [
      { type: 'css', value: 'span[jsname="V67aGc"]' },
      { type: 'xpath', value: `//span[@jsname="V67aGc" and text()="Create account"]` }
    ];
    let clicked = false;
    for (const { type, value } of createAccountSelectors) {
      try {
        console.log(`[INFO] Trying ${type.toUpperCase()} selector: ${value}`);
        if (type === 'css') {
          await page.waitForSelector(value, { timeout: 60000 });
          await page.click(value);
        } else if (type === 'xpath') {
          const [el] = await page.$x(value);
          if (!el) throw new Error('XPath element not found');
          await el.click();
        }
        console.log('[INFO] "Create account" click succeeded.');
        clicked = true;
        break;
      } catch (err) {
        console.warn(`[WARN] Selector failed (${type}): ${err.message}`);
      }
    }
    if (!clicked) throw new Error('Unable to click "Create account" after retries');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    console.log(`[INFO] After click, navigated to: ${page.url()}`);
    await captureScreenshot('clicked-create-account');

    // Step 3: Click "For my personal use" via jsname selectors
    console.log('[STEP 3] Attempting to click "For my personal use"...');
    const personalUseSelectors = [
      { type: 'css', value: 'span[jsname="K4r5Ff"]' },
      { type: 'xpath', value: `//span[@jsname="K4r5Ff" and text()="For my personal use"]` }
    ];
    clicked = false;
    for (const { type, value } of personalUseSelectors) {
      try {
        console.log(`[INFO] Trying ${type.toUpperCase()} selector: ${value}`);
        if (type === 'css') {
          await page.waitForSelector(value, { timeout: 60000 });
          await page.click(value);
        } else {
          const [el] = await page.$x(value);
          if (!el) throw new Error('XPath element not found');
          await el.click();
        }
        console.log('[INFO] "For my personal use" click succeeded.');
        clicked = true;
        break;
      } catch (err) {
        console.warn(`[WARN] Selector failed (${type}): ${err.message}`);
      }
    }
    if (!clicked) throw new Error('Unable to click "For my personal use" after retries');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    console.log(`[INFO] After click, navigated to: ${page.url()}`);
    await captureScreenshot('for-personal-use');

    console.log('[INFO] All steps completed successfully.');

  } catch (error) {
    console.error('[ERROR] Error encountered:', error);
    // Final error capture
    const errorBase = `error-step-${String(step).padStart(2, '0')}`;
    const screenshotPath = path.join(path.resolve(__dirname, 'artifacts'), `${errorBase}.png`);
    const htmlPath = path.join(path.resolve(__dirname, 'artifacts'), `${errorBase}.html`);
    try {
      console.log(`[ERROR] Capturing error screenshot: ${screenshotPath}`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log('[ERROR] Error screenshot captured.');

      const html = await page.content();
      console.log(`[ERROR] Writing error HTML to: ${htmlPath}`);
      fs.writeFileSync(htmlPath, html);
      console.log('[ERROR] Error HTML written.');
    } catch (captureErr) {
      console.error('[ERROR] Failed capturing final artifacts:', captureErr);
    }
    process.exit(1);
  } finally {
    if (browser) {
      console.log('[INFO] Closing browser...');
      await browser.close();
      console.log('[INFO] Browser closed.');
    }
    console.log('[INFO] Script finished.');
  }
})();
