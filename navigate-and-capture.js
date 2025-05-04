/**
 * navigate-signup-full-real.js
 *
 * End-to-end signup flow using puppeteer-real-browser (connects to your local Chrome).
 * Steps:
 * 1. Launch real Chrome with remote debugging
 * 2. Directly load the name entry page
 * 3. Fill name, click Next
 * 4. Fill birthday & gender, click Next
 * 5. Select first username suggestion, click Next
 * 6. Fill password, click Next
 *
 * Screenshots + HTML dumps at every step under ./artifacts/
 */

const fs = require('fs');
const path = require('path');
// Use puppeteer-real-browser instead of bundled Puppeteer
const puppeteer = require('puppeteer-real-browser');

;(async () => {
  // Prepare artifacts directory
  const artifacts = path.resolve(__dirname, 'artifacts');
  if (!fs.existsSync(artifacts)) fs.mkdirSync(artifacts);

  // Helpers
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const log   = (tag, msg) => console.log(`[${new Date().toISOString()}] [${tag}] ${msg}`);
  async function dump(name, page) {
    const safe = name.replace(/[^a-z0-9]+/gi,'-').toLowerCase();
    const png  = path.join(artifacts, `${safe}.png`);
    const html = path.join(artifacts, `${safe}.html`);
    log('DUMP', `${name} → ${png}, ${html}`);
    try { await page.screenshot({ path: png, fullPage: true }); } catch {};
    try { fs.writeFileSync(html, await page.content()); } catch {};
  }
  async function clickByText(page, sel, txt) {
    const clicked = await page.evaluate((sel, txt) => {
      const els = document.querySelectorAll(sel);
      for (let el of els) {
        if (el.innerText.trim() === txt) { el.scrollIntoView(); el.click(); return true; }
      }
      return false;
    }, sel, txt);
    if (!clicked) throw new Error(`clickByText("${txt}") failed on ${sel}`);
  }

  // Launch using real installed Chrome
  log('LAUNCH', 'Connecting to real Chrome via puppeteer-real-browser');
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-infobars',
      '--remote-debugging-port=9222'
    ],
    executablePath: puppeteer.executablePath() // uses local Chrome
  });
  const page = (await browser.pages())[0] || await browser.newPage();
  page.setDefaultTimeout(60000);

  try {
    // 1) Name entry
    log('STEP', 'Go to name entry URL');
    await page.goto(
      'https://accounts.google.com/signup/v2?service=mail&flowName=GlifWebSignIn&flowEntry=SignUp',
      { waitUntil: 'networkidle2' }
    );
    await delay(2000);
    await dump('name-form-loaded', page);

    // 2) Fill name
    log('STEP', 'Fill first/last name');
    await page.waitForSelector('input[name="firstName"]', { visible: true });
    await page.type('input[name="firstName"]', 'Alice', { delay: 100 });
    await page.type('input[name="lastName"]',  'Example', { delay: 100 });
    await delay(500);
    await dump('name-filled', page);

    log('STEP', 'Click Next on name form');
    await clickByText(page, 'button[role="button"], button[jsname]', 'Next');
    await delay(2000);
    await dump('after-name-next', page);

    // 3) Birthday & Gender
    log('STEP', 'Wait for birthday form');
    await page.waitForSelector('#month', { visible: true, timeout: 20000 });
    await dump('birthday-form-loaded', page);

    log('STEP', 'Fill birthday & gender');
    await page.select('#month', '1');
    await page.type('#day',  '01', { delay: 50 });
    await page.type('#year', '2000', { delay: 50 });
    await page.select('#gender', '1');
    await delay(500);
    await dump('birthday-gender-filled', page);

    log('STEP', 'Click Next on birthday');
    await page.click('#birthdaygenderNext');
    await delay(2000);
    await dump('after-birthday-next', page);

    // 4) Username selection
    log('STEP', 'Wait for username suggestions');
    await page.waitForSelector('div[role="radio"]', { visible: true, timeout: 20000 });
    await dump('username-options', page);

    log('STEP', 'Select first suggestion');
    await page.evaluate(() => {
      document.querySelectorAll('div[role="radio"]')[0].click();
    });
    await delay(500);
    await dump('first-suggestion', page);

    log('STEP', 'Click Next on username');
    await clickByText(page, 'button[role="button"], button[jsname]', 'Next');
    await delay(2000);
    await dump('after-username-next', page);

    // 5) Password entry
    log('STEP', 'Wait for password form');
    await page.waitForSelector('input[name="Passwd"]', { visible: true, timeout: 20000 });
    await dump('password-form-loaded', page);

    log('STEP', 'Fill password');
    await page.type('input[name="Passwd"]',      'SuperSecret123!', { delay: 50 });
    await page.type('input[name="PasswdAgain"]', 'SuperSecret123!', { delay: 50 });
    await delay(500);
    await dump('password-filled', page);

    log('STEP', 'Click Next on password');
    await page.click('#createpasswordNext');
    await delay(2000);
    await dump('after-password-next', page);

    log('END', 'Flow complete');
  } catch (err) {
    log('ERROR', err.stack || err.message);
    await dump('error', page);
  } finally {
    await browser.close();
    log('CLOSE', 'Browser closed');
  }
})();
