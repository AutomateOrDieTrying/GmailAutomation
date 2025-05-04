/**
 * navigate-and-capture.js
 *
 * A verbose Puppeteer script to navigate the Gmail account creation flow,
 * capture screenshots at each step, fill in randomly generated names,
 * and dump HTML on errors, using general text-based selectors and a 5-second fixed wait.
 * Modified to continue motions without strict navigation waits after clicks.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// Lists of the 100 most popular first and last names (U.S. data)
const firstNames = [/* ...firstNames array as before... */];
const lastNames = [/* ...lastNames array as before... */];

// Helper: get a random element from an array
function getRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Custom helper: click an element matching selector whose text contains given substring
async function clickByText(page, selector, text, timeout = 60000, polling = 500) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const clicked = await page.evaluate((sel, txt) => {
      const elements = Array.from(document.querySelectorAll(sel));
      const target = elements.find(el => el.innerText.trim().includes(txt));
      if (target) {
        target.scrollIntoView();
        target.click();
        return true;
      }
      return false;
    }, selector, text);
    if (clicked) return;
    await new Promise(res => setTimeout(res, polling));
  }
  throw new Error(`Timeout clicking element '${selector}' containing text '${text}'`);
}

(async () => {
  console.log('[INFO] Starting Puppeteer script...');

  // Prepare artifacts directory
  const artifactsDir = path.resolve(__dirname, 'artifacts');
  if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir);

  let browser;
  let page;
  let step = 0;

  // Helper: capture screenshot
  async function captureScreenshot(desc) {
    step++;
    const safeDesc = desc.replace(/\s+/g, '-').toLowerCase();
    const filePath = path.join(artifactsDir, `${String(step).padStart(2,'0')}-${safeDesc}.png`);
    console.log(`[INFO] Capturing screenshot #${step}: ${filePath}`);
    if (page) await page.screenshot({ path: filePath, fullPage: true });
  }

  try {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage();
    page.setDefaultTimeout(60000);
    page.on('console', msg => console.log(`[PAGE ${msg.type().toUpperCase()}] ${msg.text()}`));

    // Step 1: Navigate to Gmail
    console.log('[STEP 1] Navigating to https://gmail.com...');
    await page.goto('https://gmail.com', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 5000));
    await captureScreenshot('gmail-home');

    // Step 2: Click "Create account" and continue without waiting for navigation
    console.log('[STEP 2] Clicking "Create account"...');
    await clickByText(page, 'a, button, span, div', 'Create account');
    console.log('[INFO] "Create account" clicked.');
    await new Promise(r => setTimeout(r, 5000));
    await captureScreenshot('click-create-account');

    // Step 3: Click "For my personal use"
    console.log('[STEP 3] Clicking "For my personal use"...');
    await clickByText(page, 'span, button, div', 'For my personal use');
    console.log('[INFO] "For my personal use" clicked.');
    await new Promise(r => setTimeout(r, 5000));
    await captureScreenshot('for-personal-use');

    // Step 4: Fill in name and Next
    const randomFirst = getRandom(firstNames);
    const randomLast = getRandom(lastNames);
    console.log(`[STEP 4] Filling first: ${randomFirst}, last: ${randomLast}`);
    await page.type('input[name="firstName"]', randomFirst, { delay: 100 });
    await page.type('input[name="lastName"]', randomLast, { delay: 100 });
    await captureScreenshot('filled-name');

    console.log('[STEP 5] Clicking "Next"...');
    await clickByText(page, 'span, button, div', 'Next');
    console.log('[INFO] "Next" clicked.');
    await new Promise(r => setTimeout(r, 5000));
    await captureScreenshot('after-next');

    console.log('[INFO] All steps completed.');
  } catch (err) {
    console.error('[ERROR]', err);
    const errBase = `error-${step.toString().padStart(2,'0')}`;
    const shot = path.join(artifactsDir, `${errBase}.png`);
    const htmlf = path.join(artifactsDir, `${errBase}.html`);
    if (page) {
      await page.screenshot({ path: shot, fullPage: true });
      fs.writeFileSync(htmlf, await page.content());
    }
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
