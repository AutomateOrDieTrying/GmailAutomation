/**
 * navigate-signup-full-real.js
 *
 * End-to-end Gmail signup flow using puppeteer-real-browser.
 * If at any point a “confirm you're not a robot” challenge appears,
 * the script resets and retries from the beginning (up to MAX_RETRIES).
 * Dumps screenshots + HTML into ./artifacts/ at every step.
 */

const fs = require('fs');
const path = require('path');
const { connect } = require('puppeteer-real-browser');

const MAX_RETRIES = 3000;

(async () => {
  // — Prepare artifacts directory
  const artifacts = path.resolve(__dirname, 'artifacts');
  if (!fs.existsSync(artifacts)) fs.mkdirSync(artifacts);

  // — Helpers
  const delay = ms => new Promise(res => setTimeout(res, ms));
  const log = (tag, msg) => console.log(`[${new Date().toISOString()}] [${tag}] ${msg}`);
  async function dump(name, page) {
    const safe = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const png  = path.join(artifacts, `${safe}.png`);
    const html = path.join(artifacts, `${safe}.html`);
    log('DUMP', `${name} → ${png}, ${html}`);
    try { await page.screenshot({ path: png, fullPage: true }); } catch (e) { log('ERROR', e.message); }
    try { fs.writeFileSync(html, await page.content()); } catch (e) { log('ERROR', e.message); }
  }
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
  async function detectCaptcha(page) {
    // common recaptcha iframe or challenge text
    const url = page.url();
    if (/recaptcha|captcha|challenge/.test(url)) return true;
    const hasIframe = await page.$('iframe[src*="recaptcha"], iframe[src*="captcha"]');
    if (hasIframe) return true;
    const textPresent = await page.evaluate(() =>
      /error|sorry|confirm you're not a robot|verify|human/i.test(document.body.innerText)
    );
    return textPresent;
  }

  // Try the entire flow up to MAX_RETRIES
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    log('LAUNCH', `Attempt ${attempt}/${MAX_RETRIES}: connecting to real Chrome`);
    const { browser, page } = await connect({
      headless: false,
      args: ['--no-sandbox','--disable-setuid-sandbox'],
      protocolTimeout: 120000
    });
    page.setDefaultTimeout(60000);

    try {
      // Step 1: Go direct to signup
      log('STEP', 'Navigating to signup URL');
      await page.goto(
        'https://accounts.google.com/signup/v2?service=mail&flowName=GlifWebSignIn&flowEntry=SignUp',
        { waitUntil: 'networkidle2' }
      );
      await delay(2000);
      await dump('01-name-form', page);
      if (await detectCaptcha(page)) throw new Error('Captcha detected');

      // Step 2: Fill name
      log('STEP', 'Filling name');
      await page.type('input[name="firstName"]', 'Alice', { delay: 100 });
      await page.type('input[name="lastName"]',  'Example', { delay: 100 });
      await delay(500);
      await dump('02-name-filled', page);
      await clickByText(page, 'button, div[role="button"]', 'Next');
      await delay(2000);
      await dump('03-after-name-next', page);
      if (await detectCaptcha(page)) throw new Error('Captcha detected');

      // Step 3: Birthday/Gender
      log('STEP', 'Filling birthday & gender');
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
      if (await detectCaptcha(page)) throw new Error('Captcha detected');

      // Step 4: Username suggestion
      log('STEP', 'Selecting first username suggestion');
      await page.waitForSelector('div[role="radio"]', { visible: true, timeout: 20000 });
      await page.evaluate(() => document.querySelectorAll('div[role="radio"]')[0].click());
      await delay(500);
      await dump('06-username-selected', page);
      await clickByText(page, 'button, div[role="button"]', 'Next');
      await delay(2000);
      await dump('07-after-username-next', page);
      if (await detectCaptcha(page)) throw new Error('Captcha detected');

      // Step 5: Password
      log('STEP', 'Filling password');
      await page.waitForSelector('input[name="Passwd"]', { visible: true, timeout: 20000 });
      await page.type('input[name="Passwd"]','SuperSecret123!',{delay:50});
      await page.type('input[name="PasswdAgain"]','SuperSecret123!',{delay:50});
      await delay(500);
      await dump('08-password-filled', page);
      await clickByText(page, 'button, div[role="button"]', 'Next');
      await delay(2000);
      await dump('09-after-password-next', page);
      if (await detectCaptcha(page)) throw new Error('Captcha detected');

      log('END', 'Flow completed without captcha');
      await browser.close();
      return; // success
    } catch (err) {
      log('WARN', `Attempt ${attempt} failed: ${err.message}`);
      await dump(`error-attempt-${attempt}`, page);
      await browser.close();
      if (attempt < MAX_RETRIES) {
        log('INFO', 'Retrying from start...');
      } else {
        log('ERROR', 'Max retries reached; exiting');
        process.exit(1);
      }
    }
  }
})();
