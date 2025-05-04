/**
 * navigate-signup-full-real.js
 *
 * End-to-end Gmail signup flow using puppeteer-real-browser’s connect() API.
 * Replaces the invalid launch() call with connect(), which returns { browser, page }.
 * Dumps screenshots + HTML into ./artifacts/ at every step.
 */

const fs = require('fs');
const path = require('path');
// Use the connect() API instead of launch()
const { connect } = require('puppeteer-real-browser');

;(async () => {
  // — Prepare artifacts directory
  const artifactsDir = path.resolve(__dirname, 'artifacts');
  if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir);

  // — Helpers
  const delay = ms => new Promise(res => setTimeout(res, ms));
  const log = (tag, msg) => console.log(`[${new Date().toISOString()}] [${tag}] ${msg}`);
  const dump = async (name, page) => {
    const safe = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const png  = path.join(artifactsDir, `${safe}.png`);
    const html = path.join(artifactsDir, `${safe}.html`);
    log('DUMP', `${name} → ${png}, ${html}`);
    try { await page.screenshot({ path: png, fullPage: true }); } catch (e) { log('ERROR', e.message); }
    try { fs.writeFileSync(html, await page.content()); } catch (e) { log('ERROR', e.message); }
  };
  async function clickByText(page, selector, text) {
    const clicked = await page.evaluate((sel, txt) => {
      for (const el of document.querySelectorAll(sel)) {
        if (el.innerText.trim() === txt) {
          el.scrollIntoView();
          el.click();
          return true;
        }
      }
      return false;
    }, selector, text);
    if (!clicked) throw new Error(`clickByText("${text}") failed`);
  }

  // --- Connect to a real Chrome instance
  log('LAUNCH', 'Connecting via puppeteer-real-browser');
  const { browser, page } = await connect({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    protocolTimeout: 120000,
    // you can also pass fingerprint: true, turnstile: true, etc.
  }); // :contentReference[oaicite:0]{index=0}

  try {
    // 1) Direct to signup
    log('STEP', 'Goto signup URL');
    await page.goto(
      'https://accounts.google.com/signup/v2?service=mail&flowName=GlifWebSignIn&flowEntry=SignUp',
      { waitUntil: 'networkidle2' }
    );
    await delay(2000);
    await dump('01-name-form', page);

    // 2) Name
    log('STEP', 'Fill name');
    await page.waitForSelector('input[name="firstName"]', { visible: true });
    await page.type('input[name="firstName"]', 'Alice', { delay: 100 });
    await page.type('input[name="lastName"]',  'Example', { delay: 100 });
    await delay(500);
    await dump('02-name-filled', page);
    await clickByText(page, 'button, div[role="button"]', 'Next');
    await delay(2000);
    await dump('03-after-name-next', page);

    // 3) Birthday/Gender
    log('STEP', 'Fill birthday & gender');
    await page.waitForSelector('#month', { visible: true, timeout: 20000 });
    await page.select('#month', '1');
    await page.type('#day', '01', { delay: 50 });
    await page.type('#year','2000', { delay: 50 });
    await page.select('#gender', '1');
    await delay(500);
    await dump('04-birthday-filled', page);
    await clickByText(page, 'button, div[role="button"]', 'Next');
    await delay(2000);
    await dump('05-after-birthday-next', page);

    // 4) Username suggestion
    log('STEP', 'Choose first username suggestion');
    await page.waitForSelector('div[role="radio"]', { visible: true, timeout: 20000 });
    await page.evaluate(() => document.querySelectorAll('div[role="radio"]')[0].click());
    await delay(500);
    await dump('06-username-selected', page);
    await clickByText(page, 'button, div[role="button"]', 'Next');
    await delay(2000);
    await dump('07-after-username-next', page);

    // 5) Password
    log('STEP', 'Fill password');
    await page.waitForSelector('input[name="Passwd"]', { visible: true, timeout: 20000 });
    await page.type('input[name="Passwd"]', 'SuperSecret123!', { delay: 50 });
    await page.type('input[name="PasswdAgain"]', 'SuperSecret123!', { delay: 50 });
    await delay(500);
    await dump('08-password-filled', page);
    // Next button id=createpasswordNext :contentReference[oaicite:2]{index=2}
    await clickByText(page, 'button, div[role="button"]', 'Next');
    await delay(2000);
    await dump('09-after-password-next', page);

    log('END', 'Signup flow complete up to password step');
  } catch (err) {
    log('ERROR', err.stack || err.message);
    await dump('error', page);
  } finally {
    await browser.close();
  }
})();
