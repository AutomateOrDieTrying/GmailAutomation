/**
 * signup-direct.js
 *
 * Bypass choice screens, land on name form, fill it, and click “Next”
 * by matching the button’s text. Always emits artifacts/
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

(async () => {
  // artifacts directory
  const artifacts = path.resolve(__dirname, 'artifacts');
  if (!fs.existsSync(artifacts)) fs.mkdirSync(artifacts);

  const delay = ms => new Promise(r => setTimeout(r, ms));
  const dump = async (name, page) => {
    const safe = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const png  = path.join(artifacts, `${safe}.png`);
    const html = path.join(artifacts, `${safe}.html`);
    console.log(`[DUMP] ${name} → ${png}, ${html}`);
    try { await page.screenshot({ path: png, fullPage: true }); } catch {}
    try { fs.writeFileSync(html, await page.content()); } catch {}
  };

  // helper to click by visible text
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
    if (!clicked) throw new Error(`clickByText: "${text}" not found using ${selector}`);
  }

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  try {
    console.log('[STEP] Go direct to name form');
    await page.goto(
      'https://accounts.google.com/signup/v2' +
      '?service=mail&flowName=GlifWebSignIn&flowEntry=SignUp',
      { waitUntil: 'networkidle2' }
    );
    await delay(3000);
    await dump('01-name-form-load', page);

    console.log('[STEP] Fill name inputs');
    await page.type('input[name="firstName"]', 'Alice', { delay: 100 });
    await page.type('input[name="lastName"]',  'Example', { delay: 100 });
    await delay(500);
    await dump('02-name-filled', page);

    console.log('[STEP] Click "Next" by text');
    try {
      await clickByText(page, 'button, div[role="button"]', 'Next');
    } catch (err) {
      console.warn('[WARN]', err.message);
      // fallback: look for any element containing "Next"
      await clickByText(page, '*', 'Next');
    }
    await delay(3000);
    await dump('03-after-click-next', page);

    console.log('[STEP] Wait for username field');
    await page.waitForSelector('input[name="Username"]', { visible: true, timeout: 30000 })
      .catch(() => console.warn('[WARN] Username input did not appear'));
    await dump('04-username-form', page);

    console.log('✅ Reached username step');
  } catch (err) {
    console.error('[ERROR]', err);
    await dump('error', page);
  } finally {
    await browser.close();
  }
})();
