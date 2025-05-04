/**
 * navigate-and-click-debug.js
 *
 * Puppeteer script to exhaustively try every way to click the
 * “For my personal use” button on the Gmail “Create account” flow.
 * Now with longer timeouts and explicit error-handling on launch.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

(async () => {
  // --- Prepare artifacts directory
  const artifacts = path.resolve(__dirname, 'debug-artifacts');
  if (!fs.existsSync(artifacts)) fs.mkdirSync(artifacts);

  // --- Helpers
  const delay = ms => new Promise(res => setTimeout(res, ms));
  function log(tag, msg) {
    console.log(`[${new Date().toISOString()}] [${tag}] ${msg}`);
  }
  async function dump(step, page) {
    const safe = step.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const png  = path.join(artifacts, `${safe}.png`);
    const html = path.join(artifacts, `${safe}.html`);
    log('DUMP', `${step} → ${png}, ${html}`);
    try { await page.screenshot({ path: png, fullPage: true }); }
    catch (e) { log('ERROR', `Screenshot failed: ${e.message}`); }
    fs.writeFileSync(html, await page.content());
  }

  // --- Launch Puppeteer with extended timeouts
  let browser;
  log('LAUNCH', 'Launching browser with extended timeouts...');
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox'],
      timeout: 60000,           // 60 s to establish the browser process
      protocolTimeout: 120000,  // 120 s for CDP protocol commands
    });
  } catch (err) {
    log('ERROR', `Browser launch failed: ${err.message}`);
    process.exit(1);
  }

  const page = await browser.newPage();
  page.setDefaultTimeout(30000); // 30 s for all page.* calls
  page.on('console', msg => log('PAGE', msg.text()));

  try {
    // Step 1: Navigate to Gmail
    log('STEP', 'Navigating to https://gmail.com');
    await page.goto('https://gmail.com', { waitUntil: 'networkidle2' });
    await delay(3000);
    await dump('gmail-home', page);

    // Step 2: Click "Create account"
    log('STEP', 'Clicking "Create account"');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('a,button,div,span'))
        .find(el => /create account/i.test(el.innerText));
      if (!btn) throw new Error('"Create account" not found');
      btn.scrollIntoView();
      btn.click();
    });
    await delay(4000);
    await dump('after-create-account', page);

    // Step 3: Wait for the choice container
    log('STEP', 'Waiting for choice container to appear');
    await page.waitForSelector('div[data-button-type="multipleChoiceIdentifier"]', { visible: true });
    await delay(1000);
    await dump('choice-container', page);

    // Enumerate the options rendered
    const candidates = await page.$$eval(
      'div[data-button-type="multipleChoiceIdentifier"]',
      els => els.map((el,i) => ({
        index: i,
        text: el.innerText.trim(),
        snippet: el.outerHTML.slice(0,200).replace(/\s+/g,' ')
      }))
    );
    log('CANDIDATES', JSON.stringify(candidates, null, 2));

    // Step 4: Define click strategies
    const attempts = [
      {
        name: 'inner-text-click',
        fn: async () => {
          const succeeded = await page.evaluate(() => {
            const els = Array.from(document.querySelectorAll('div[data-button-type="multipleChoiceIdentifier"]'));
            const t = els.find(el => /for my personal use/i.test(el.innerText));
            if (!t) return false;
            t.scrollIntoView();
            t.click();
            return true;
          });
          if (!succeeded) throw new Error('No matching element by inner-text');
        }
      },
      {
        name: 'css-attribute-click',
        fn: async () => {
          await page.click('div[data-button-type="multipleChoiceIdentifier"][data-value="For my personal use"]');
        }
      },
      {
        name: 'attribute-contains-click',
        fn: async () => {
          const ok = await page.evaluate(() => {
            const els = Array.from(document.querySelectorAll('div[data-button-type]'));
            const t = els.find(e => e.getAttribute('data-value')?.includes('personal use'));
            if (!t) return false;
            t.scrollIntoView();
            t.click();
            return true;
          });
          if (!ok) throw new Error('No matching element by attribute-contains');
        }
      },
      {
        name: 'xpath-click',
        fn: async () => {
          const handles = await page.$x(
            "//div[@data-button-type='multipleChoiceIdentifier' and contains(normalize-space(.),'For my personal use')]"
          );
          if (!handles.length) throw new Error('XPath matched 0 nodes');
          await handles[0].evaluate(el => el.scrollIntoView());
          await handles[0].click();
        }
      },
      {
        name: 'mouse-event-click',
        fn: async () => {
          const ok = await page.evaluate(() => {
            const el = Array.from(document.querySelectorAll('div[data-button-type]'))
              .find(e => /for my personal use/i.test(e.innerText));
            if (!el) return false;
            const r = el.getBoundingClientRect();
            ['mousedown','mouseup','click'].forEach(type =>
              el.dispatchEvent(new MouseEvent(type, {
                bubbles: true,
                clientX: r.left + 5,
                clientY: r.top + 5
              }))
            );
            return true;
          });
          if (!ok) throw new Error('MouseEvent dispatch failed');
        }
      },
      {
        name: 'nth-child-click',
        fn: async () => {
          const els = await page.$$('div[data-button-type="multipleChoiceIdentifier"]');
          if (els.length < 2) throw new Error('Not enough elements for nth-child');
          await els[1].click();
        }
      },
      {
        name: 'keyboard-nav-enter',
        fn: async () => {
          await page.keyboard.press('Tab');
          await page.keyboard.press('Tab');
          await page.keyboard.press('Enter');
        }
      },
      {
        name: 'shadow-dom-click',
        fn: async () => {
          const host = await page.$('c-wiz');
          if (!host) throw new Error('No <c-wiz> host found');
          const shadow = await host.evaluateHandle(h => h.shadowRoot);
          const btn = await shadow.asElement().$('div[data-button-type="multipleChoiceIdentifier"] >> text="For my personal use"');
          if (!btn) throw new Error('Shadow DOM button not found');
          await btn.click();
        }
      },
    ];

    // Step 5: Run each strategy
    const results = [];
    for (const attempt of attempts) {
      log('TRY', attempt.name);
      try {
        await attempt.fn();
        await delay(2000);
        await dump(`after-${attempt.name}`, page);
        log('SUCCESS', `${attempt.name} worked → URL: ${page.url()}`);
        results.push({ name: attempt.name, success: true });
        break;
      } catch (err) {
        log('FAIL', `${attempt.name} failed: ${err.message}`);
        await dump(`fail-${attempt.name}`, page);
        results.push({ name: attempt.name, success: false, error: err.message });
      }
    }

    // Step 6: Summary
    log('SUMMARY', 'Click strategy outcomes:');
    for (const r of results) {
      if (r.success) log('RESULT', `✅ ${r.name}`);
      else           log('RESULT', `❌ ${r.name}: ${r.error}`);
    }

    // Final artifact
    await dump('final-state', page);
  } catch (err) {
    log('ERROR', `Uncaught exception: ${err.stack || err.message}`);
    await dump('uncaught-error', page);
  } finally {
    await browser.close();
    log('END', 'Browser closed');
  }
})();
