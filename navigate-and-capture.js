/**
 * navigate-and-debug-verbose.js
 *
 * Ultra-verbose Puppeteer flow to nail down why “For my personal use” isn’t clicking.
 * Now uses a simple delay() helper instead of page.waitForTimeout().
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

(async () => {
  // --- Setup artifacts dir
  const artifacts = path.resolve(__dirname, 'debug-artifacts');
  if (!fs.existsSync(artifacts)) fs.mkdirSync(artifacts);

  // --- Utility: timestamped logging
  function log(tag, msg) {
    const time = new Date().toISOString();
    console.log(`[${time}] [${tag}] ${msg}`);
  }

  // --- Utility: delay
  const delay = ms => new Promise(res => setTimeout(res, ms));

  // --- Utility: screenshot + HTML dump
  async function dump(step) {
    const safeStep = step.replace(/[^a-z0-9\-]/gi, '-').toLowerCase();
    const png = path.join(artifacts, `${safeStep}.png`);
    const html = path.join(artifacts, `${safeStep}.html`);
    log('DUMP', `${step} → ${png}, ${html}`);
    try {
      await page.screenshot({ path: png, fullPage: true });
    } catch (e) {
      log('ERROR', `screenshot failed: ${e.message}`);
    }
    fs.writeFileSync(html, await page.content());
  }

  // --- Launch
  log('START', 'Launching Puppeteer');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  page.on('console', msg => log('PAGE', msg.text()));

  try {
    // 1) Go to Gmail
    log('STEP', 'Navigating to https://gmail.com');
    await page.goto('https://gmail.com', { waitUntil: 'networkidle2' });
    await delay(3000);
    await dump('gmail-home');

    // 2) Click "Create account"
    log('STEP', 'Clicking “Create account”');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('a, button, div, span'))
        .find(el => /create account/i.test(el.innerText));
      if (!btn) throw new Error('Create account not found');
      btn.scrollIntoView();
      btn.click();
    });
    await delay(4000);
    await dump('after-create-account');

    // 3) Wait for choice container
    log('STEP', 'Waiting for choice container selector');
    await page.waitForSelector('div[data-button-type="multipleChoiceIdentifier"]', { visible: true });
    await delay(1000);
    await dump('choice-container');

    // 4) Enumerate all candidate options
    const candidates = await page.$$eval(
      'div[data-button-type="multipleChoiceIdentifier"]',
      els => els.map((el, i) => ({
        index: i,
        text: el.innerText.trim(),
        html: el.outerHTML.slice(0,200).replace(/\s+/g,' ')
      }))
    );
    log('CANDIDATES', JSON.stringify(candidates, null, 2));

    // 5) Define click attempts
    const attempts = [
      {
        name: 'innerText-click',
        fn: async () => {
          log('TRY', 'innerText-click');
          await page.evaluate(() => {
            const els = Array.from(document.querySelectorAll('div[data-button-type="multipleChoiceIdentifier"]'));
            const tgt = els.find(el => /for my personal use/i.test(el.innerText));
            if (!tgt) throw new Error('not found by innerText-click');
            tgt.scrollIntoView();
            tgt.click();
          });
        }
      },
      {
        name: 'clickByText-helper',
        fn: async () => {
          log('TRY', 'clickByText-helper');
          await page.evaluate(() => {
            const clickByText = (sel, re) => {
              const els = Array.from(document.querySelectorAll(sel));
              const t = els.find(e => re.test(e.innerText));
              if (!t) throw new Error('helper no match');
              t.scrollIntoView();
              t.click();
            };
            clickByText('div[data-button-type="multipleChoiceIdentifier"]', /for my personal use/i);
          });
        }
      },
      {
        name: 'data-value-click',
        fn: async () => {
          log('TRY', 'data-value-click');
          await page.click('div[data-button-type="multipleChoiceIdentifier"][data-value="For my personal use"]');
        }
      },
      {
        name: 'attribute-contains-click',
        fn: async () => {
          log('TRY', 'attribute-contains-click');
          await page.evaluate(() => {
            const els = Array.from(document.querySelectorAll('div[data-button-type]()
