/**
 * navigate-signup-full.js
 *
 * Full Puppeteer script for Gmail signup flow:
 * 1. Directly load the name entry page (bypassing choice screens).
 * 2. Fill first/last name and click “Next”.
 * 3. Fill birthday & gender and click “Next”.
 * 4. Select the first username suggestion and click “Next”.
 * 5. Fill password and confirm then click “Next”.
 *
 * Screenshots + HTML dumps at every step are saved to ./artifacts/.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

;(async () => {
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
    if (!clicked) throw new Error(`clickByText("\${txt}") failed on \${sel}`);
  }

  // Launch Puppeteer
  log('LAUNCH', 'Starting browser');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  try {
    // 1) Name entry
    log('STEP', 'Navigate to name entry page');
    await page.goto(
      'https://accounts.google.com/signup/v2?service=mail&flowName=GlifWebSignIn&flowEntry=SignUp',
      { waitUntil: 'networkidle2' }
    );
    await delay(2000);
    await dump('name-form-loaded', page);

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

    // 2) Birthday & Gender
    log('STEP', 'Wait for birthday form');
    await page.waitForSelector('#month', { visible: true, timeout: 20000 });
    await delay(500);
    await dump('birthday-form-loaded', page);

    log('STEP', 'Fill birthday & gender');
    await page.select('#month', '1');    // January
    await page.type('#day',  '01', { delay: 50 });
    await page.type('#year', '2000', { delay: 50 });
    await page.select('#gender', '1');   // Male
    await delay(500);
    await dump('birthday-gender-filled', page);

    log('STEP', 'Click Next on birthday form');
    await page.click('#birthdaygenderNext');
    await delay(2000);
    await dump('after-birthday-next', page);

    // 3) Username suggestion
    log('STEP', 'Wait for username suggestions');
    await page.waitForSelector('div[role="radio"]', { visible: true, timeout: 20000 });
    await delay(500);
    await dump('username-options', page);

    log('STEP', 'Select first username suggestion');
    await page.evaluate(() => {
      const radios = Array.from(document.querySelectorAll('div[role="radio"]'));
      radios[0].scrollIntoView();
      radios[0].click();
    });
    await delay(500);
    await dump('first-suggestion-selected', page);

    log('STEP', 'Click Next on username form');
    await clickByText(page, 'button[role="button"], button[jsname]', 'Next');
    await delay(2000);
    await dump('after-username-next', page);

    // 4) Password entry
    log('STEP', 'Wait for password form');
    await page.waitForSelector('input[name="Passwd"]', { visible: true, timeout: 20000 });
    await delay(500);
    await dump('password-form-loaded', page);

    log('STEP', 'Fill password');
    await page.type('input[name="Passwd"]',      'SuperSecret123!', { delay: 50 });  // citeturn5file0
    await page.type('input[name="PasswdAgain"]', 'SuperSecret123!', { delay: 50 });  // citeturn5file0
    await delay(500);
    await dump('password-filled', page);

    log('STEP', 'Click Next on password form');
    await page.click('#createpasswordNext');  // citeturn5file8
    await delay(2000);
    await dump('after-password-next', page);

    log('END', 'Signup flow reached post-password step');
  } catch (err) {
    log('ERROR', err.stack || err.message);
    await dump('error-state', page);
  } finally {
    await browser.close();
    log('CLOSE', 'Browser closed');
  }
})();
