/**
 * navigate-and-capture.js
 *
 * A verbose Puppeteer script to navigate the Gmail account creation flow,
 * capture screenshots at each step, and dump HTML on errors, with simplified,
 * general selectors and a 5-second fixed wait after each navigation.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

(async () => {
  console.log('[INFO] Starting Puppeteer script...');

  // Prepare artifacts directory
  const artifactsDir = path.resolve(__dirname, 'artifacts');
  console.log(`[INFO] Artifacts directory: ${artifactsDir}`);
  if (!fs.existsSync(artifactsDir)) {
    console.log('[INFO] Creating artifacts directory...');
    fs.mkdirSync(artifactsDir);
    console.log('[INFO] Artifacts directory created.');
  }

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
    if (page) {
      await page.screenshot({ path: filePath, fullPage: true });
      console.log('[INFO] Screenshot captured.');
    }
  }

  try {
    console.log('[INFO] Launching browser with default settings...');
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    console.log('[INFO] Browser launched.');

    page = await browser.newPage();
    page.setDefaultTimeout(60000);
    console.log('[INFO] New page created with default timeout set to 60000ms.');

    // Log page console messages
    page.on('console', msg => console.log(`[PAGE ${msg.type().toUpperCase()}] ${msg.text()}`));

    // Step 1: Navigate to Gmail
    console.log('[STEP 1] Navigating to https://gmail.com...');
    await page.goto('https://gmail.com', { waitUntil: 'networkidle2', timeout: 60000 });
    console.log(`[INFO] Arrived at URL: ${page.url()}`);
    // Fixed wait to allow page to fully load
    console.log('[INFO] Waiting for 5 seconds to ensure complete load...');
    await new Promise(res => setTimeout(res, 5000));
    await captureScreenshot('gmail-home');

    // Step 2: Click "Create account"
    console.log('[STEP 2] Attempting to click "Create account"...');
    const createAccountXPath = `//a[contains(text(), 'Create account')]`;
    const screenshotPath = path.join(artifactsDir, `${errorBase}.png`);
    const htmlPath = path.join(artifactsDir, `${errorBase}.html`);
    if (page) {
      console.log(`[ERROR] Capturing final screenshot: ${screenshotPath}`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log('[ERROR] Error screenshot captured.');

      const html = await page.content();
      console.log(`[ERROR] Writing error HTML to: ${htmlPath}`);
      fs.writeFileSync(htmlPath, html);
      console.log('[ERROR] Error HTML written.');
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
