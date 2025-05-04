/**
 * signup-full.js
 *
 * Complete Puppeteer script to:
 * 1. Bypass choice screens by using Google’s direct signup URL
 * 2. Fill the “What’s your name?” form
 * 3. Click “Next”
 * 4. Wait for and fill the birthday & gender form
 * 5. Click “Next” to land on the username suggestions page
 * 6. Select the first suggested address
 * 7. Click “Next” to finalize that choice
 * 8. Capture screenshots + HTML at every step into ./artifacts/
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

;(async () => {
  // — Prepare artifacts directory
  const artifacts = path.resolve(__dirname, 'artifacts');
  if (!fs.existsSync(artifacts)) fs.mkdirSync(artifacts);

  // — Helpers
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const log = (tag, msg) => console.log(`[${new Date().toISOString()}] [${tag}] ${msg}`);
  const dump = async (name, page) => {
    const safe = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const png  = path.join(artifacts, `${safe}.png`);
    const html = path.join(artifacts, `${safe}.html`);
    log('DUMP', `${name} → ${png}, ${html}`);
    try { await page.screenshot({ path: png, fullPage: true }); } catch (e) { log('ERROR', e.message) }
    try { fs.writeFileSync(html, await page.content()); } catch (e) { log('ERROR', e.message) }
  };
  async function clickByText(page, selector, text) {
    const ok = await page.evaluate((sel, txt) => {
      for (const el of document.querySelectorAll(sel)) {
        if (el.innerText.trim() === txt) {
          el.scrollIntoView();
          el.click();
          return true;
        }
      }
      return false;
    }, selector, text);
    if (!ok) throw new Error(`clickByText("${text}") failed`);
  }

  // — Launch browser
  log('LAUNCH', 'Starting Puppeteer');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
    timeout: 60000,
    protocolTimeout: 120000
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  try {
    // Step 1: Go direct to name form
    log('STEP', 'Navigating to Google signup URL');
    await page.goto(
      'https://accounts.google.com/signup/v2?service=mail&flowName=GlifWebSignIn&flowEntry=SignUp',
      { waitUntil: 'networkidle2' }
    );
    await delay(2000);
    await dump('01-name-form-load', page);

    // Step 2: Fill “What’s your name?”
    log('STEP', 'Filling first & last name');
    await page.waitForSelector('input[name="firstName"]', { visible: true });
    await page.type('input[name="firstName"]', 'Alice', { delay: 100 });
    await page.type('input[name="lastName"]',  'Example', { delay: 100 });
    await delay(500);
    await dump('02-name-filled', page);

    // Step 3: Click “Next” on name form
    log('STEP', 'Clicking Next on name form');
    await clickByText(page, 'button, div[role="button"]', 'Next');
    await delay(2000);
    await dump('03-after-name-next', page);

    // Step 4: Wait for birthday form
    log('STEP', 'Waiting for birthday form (#month)');
    await page.waitForSelector('#month', { visible: true, timeout: 20000 });
    await delay(500);
    await dump('04-birthday-form-load', page);

    // Step 5: Fill birthday & gender
    log('STEP', 'Filling month/day/year/gender');
    await page.select('#month', '1');            // January
    await page.type('#day',  '01', { delay: 50 });
    await page.type('#year', '2000', { delay: 50 });
    await page.select('#gender', '1');           // Male
    await delay(500);
    await dump('05-birthday-filled', page);

    // Step 6: Click “Next” on birthday form
    log('STEP', 'Clicking Next on birthday form');
    await page.click('#birthdaygenderNext');
    await delay(2000);
    await dump('06-after-birthday-next', page);

    // Step 7: Wait for username suggestions
    log('STEP', 'Waiting for username suggestions (radio items)');
    // Google renders the options as <div role="radio"> elements:
    await page.waitForSelector('div[role="radio"]', { visible: true, timeout: 20000 });
    await delay(500);
    await dump('07-username-options-loaded', page);

    // Step 8: Select the first suggested address
    log('STEP', 'Selecting the first suggested email');
    await page.evaluate(() => {
      const radios = Array.from(document.querySelectorAll('div[role="radio"]'));
      if (!radios.length) throw new Error('No suggestion radios found');
      radios[0].scrollIntoView();
      radios[0].click();
    });
    await delay(500);
    await dump('08-first-suggestion-selected', page);

    // Step 9: Click “Next” on username form
    log('STEP', 'Clicking Next to confirm username');
    await clickByText(page, 'button, div[role="button"]', 'Next');
    await delay(2000);
    await dump('09-after-username-next', page);

    log('END', 'Reached confirmation step successfully');
  } catch (err) {
    log('ERROR', err.stack || err.message);
    await dump('error-state', page);
  } finally {
    await browser.close();
  }
})();
