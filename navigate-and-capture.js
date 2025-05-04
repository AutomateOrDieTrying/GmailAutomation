/**
 * navigate-and-capture.js
 *
 * A super-verbose Puppeteer script to navigate the Gmail account creation flow,
 * capture screenshots at each step, and dump HTML on errors, with robust handling
 * for selector timeouts and retries.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

(async () => {
  console.log('[INFO] Starting Puppeteer script...');

  let browser;
  let page;
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
    if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir);

    let step = 0;
    async function captureScreenshot(description) {
      step += 1;
      const safeDesc = description.replace(/\s+/g, '-');
      const base = `${String(step).padStart(2, '0')}-${safeDesc}`;
      const filePath = path.join(artifactsDir, `${base}.png`);
      console.log(`[INFO] Capturing screenshot (#${step}): ${filePath}`);
      await page.screenshot({ path: filePath, fullPage: true });
    }

    // Step 1: Navigate to Gmail
    console.log('[STEP 1] Navigating to https://gmail.com...');
    await page.goto('https://gmail.com', { waitUntil: 'networkidle2' });
    console.log(`[INFO] Arrived at ${page.url()}`);
    await captureScreenshot('gmail-home');

    // Step 2: Click "Create account" with fallback and retry
    console.log('[STEP 2] Clicking "Create account"...');
    const selectors = ['a[href*="CreateAccount"]', 'text="Create account"', '//a[contains(@href, "CreateAccount")]'];
    let clicked = false;
    for (const sel of selectors) {
      try {
        console.log(`[INFO] Trying selector: ${sel}`);
        if (sel.startsWith('//')) {
          const [el] = await page.$x(sel);
          if (!el) throw new Error('XPath not found');
          await el.click();
        } else {
          await page.waitForSelector(sel, { timeout: 60000 });
          await page.click(sel);
        }
        clicked = true;
        console.log('[INFO] Click succeeded.');
        break;
      } catch (err) {
        console.warn(`[WARN] Selector failed (${sel}): ${err.message}`);
      }
    }
    if (!clicked) throw new Error('Unable to click "Create account" after multiple attempts');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    console.log(`[INFO] Navigated to ${page.url()}`);
    await captureScreenshot('clicked-create-account');

    // Step 3: Click "For my personal use"
    console.log('[STEP 3] Clicking "For my personal use"...');
    try {
      await page.waitForSelector('div[jsname="K4r5Ff"]', { timeout: 60000 });
      await page.click('div[jsname="K4r5Ff"]');
    } catch (err) {
      console.warn('[WARN] Selector "For my personal use" failed, retrying navigation and selector');
      await page.reload({ waitUntil: 'networkidle2' });
      await page.waitForSelector('div[jsname="K4r5Ff"]', { timeout: 60000 });
      await page.click('div[jsname="K4r5Ff"]');
    }
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    console.log(`[INFO] Navigated to ${page.url()}`);
    await captureScreenshot('for-personal-use');

    console.log('[INFO] All steps completed successfully.');

  } catch (err) {
    console.error('[ERROR] Error encountered:', err);
    // Capture error screenshot & HTML
    const errorBase = `error-step-${String(step).padStart(2, '0')}`;
    const shotPath = path.join(path.resolve(__dirname, 'artifacts'), `${errorBase}.png`);
    const htmlPath = path.join(path.resolve(__dirname, 'artifacts'), `${errorBase}.html`);
    try {
      console.log(`[ERROR] Capturing final screenshot: ${shotPath}`);
      await page.screenshot({ path: shotPath, fullPage: true });
      console.log('[ERROR] Screenshot saved.');

      const html = await page.content();
      console.log(`[ERROR] Writing HTML to: ${htmlPath}`);
      fs.writeFileSync(htmlPath, html);
      console.log('[ERROR] HTML saved.');
    } catch (captureErr) {
      console.error('[ERROR] Failed to capture artifacts:', captureErr);
    }
    process.exit(1);
  } finally {
    if (browser) await browser.close();
    console.log('[INFO] Browser closed, script ends.');
  }
})();
