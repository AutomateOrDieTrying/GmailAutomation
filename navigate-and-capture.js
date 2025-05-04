/**
 * navigate-and-click-debug.js
 *
 * Puppeteer script to exhaustively try every way to click the
 * “For my personal use” button on the Gmail “Create account” flow.
 * Always emits artifacts into `artifacts/`, never aborts early on wait failures.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

(async () => {
  // --- Prepare artifacts directory
  const artifactsDir = path.resolve(__dirname, 'artifacts');
  if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir);

  // --- Helpers
  const delay = ms => new Promise(res => setTimeout(res, ms));
  function log(tag, msg) {
    console.log(`[${new Date().toISOString()}] [${tag}] ${msg}`);
  }
  async function dump(step, page) {
    const safe = step.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const png  = path.join(artifactsDir, `${safe}.png`);
    const html = path.join(artifactsDir, `${safe}.html`);
    log('DUMP', `${step} → ${png}, ${html}`);
    try { await page.screenshot({ path: png, fullPage: true }); }
    catch (e) { log('ERROR', `Screenshot failed: ${e.message}`); }
    try { fs.writeFileSync(html, await page.content()); }
    catch (e) { log('ERROR', `HTML dump failed: ${e.message}`); }
  }

  // --- Launch with extended timeouts
  log('LAUNCH', 'Starting browser (timeout=60s, protocolTimeout=120s)...');
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox'],
      timeout: 60000,
      protocolTimeout: 120000,
    });
  } catch (err) {
    log('ERROR', `Browser launch failed: ${err.message}`);
    process.exit(1);
  }

  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  page.on('console', msg => log('PAGE', msg.text()));

  try {
    // Step 1: Navigate to Gmail
    log('STEP', 'Navigating to https://gmail.com');
    await page.goto('https://gmail.com', { waitUntil: 'networkidle2' });
    await delay(3000);
    await dump('gmail-home', page);

    // Step 2: Click "Create account"
    log('STEP', 'Clicking "Create account"');
    try {
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('a,button,div,span'))
          .find(el => /create account/i.test(el.innerText));
        if (!btn) throw new Error('"Create account" not found');
        btn.scrollIntoView();
        btn.click();
      });
    } catch (err) {
      log('ERROR', `Clicking "Create account" failed: ${err.message}`);
    }
    await delay(4000);
    await dump('after-create-account', page);

    // Step 3: Wait for text "For my personal use" (but don't abort on failure)
    log('STEP', 'Waiting up to 60s for text "For my personal use" to appear');
    let sawText = false;
    try {
      await page.waitForFunction(
        () => Array.from(document.querySelectorAll('*'))
                  .some(el => el.innerText && el.innerText.includes('For my personal use')),
        { timeout: 60000 }
      );
      sawText = true;
      log('OK', 'Text "For my personal use" detected');
    } catch (err) {
      log('WARN', `Timed out waiting for text: ${err.message}`);
    }
    await dump('for-personal-use-visible', page);

    // Step 4: Enumerate all elements containing that text
    const candidates = await page.$$eval('*', els =>
      els
        .filter(el => el.innerText && el.innerText.includes('For my personal use'))
        .map((el, i) => ({
          index: i,
          tag: el.tagName,
          text: el.innerText.trim(),
          snippet: el.outerHTML.slice(0,200).replace(/\s+/g,' ')
        }))
    );
    log('CANDIDATES', JSON.stringify(candidates, null, 2));

    // Step 5: Define click strategies
    const attempts = [
      {
        name: 'direct-text-click',
        fn: async () => {
          const ok = await page.evaluate(() => {
            const el = Array.from(document.querySelectorAll('*'))
              .find(e => e.innerText && e.innerText.includes('For my personal use'));
            if (!el) return false;
            el.scrollIntoView();
            el.click();
            return true;
          });
          if (!ok) throw new Error('No element found by direct-text-click');
        }
      },
      {
        name: 'xpath-click',
        fn: async () => {
          const [el] = await page.$x("//*[contains(normalize-space(.),'For my personal use')]");
          if (!el) throw new Error('XPath matched 0 nodes');
          await el.evaluate(e => e.scrollIntoView());
          await el.click();
        }
      },
      {
        name: 'mouse-event-click',
        fn: async () => {
          const ok = await page.evaluate(() => {
            const el = Array.from(document.querySelectorAll('*'))
              .find(e => e.innerText && e.innerText.includes('For my personal use'));
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
        name: 'nth-instance-click',
        fn: async () => {
          const els = await page.$$('body *');
          const matches = [];
          for (const el of els) {
            const txt = await (await el.getProperty('innerText')).jsonValue();
            if (txt && txt.includes('For my personal use')) matches.push(el);
          }
          if (!matches.length) throw new Error('No matching elements for nth-instance-click');
          await matches[0].evaluate(e => e.scrollIntoView());
          await matches[0].click();
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
          if (!host) throw new Error('No <c-wiz> host');
          const root = await host.evaluateHandle(h => h.shadowRoot);
          // Use querySelectorAll inside shadow root
          const btn = await root.asElement().$$eval('div', divs =>
            divs.find(d => d.innerText && d.innerText.includes('For my personal use'))
          );
          if (!btn) throw new Error('Shadow DOM button not found');
          // We need a handle to that element, so refetch it
          const handle = await root.asElement().$('div');
          await handle.evaluate(e => e.scrollIntoView());
          await handle.click();
        }
      },
    ];

    // Step 6: Try each strategy
    const results = [];
    for (const { name, fn } of attempts) {
      log('TRY', name);
      try {
        await fn();
        await delay(2000);
        await dump(`after-${name}`, page);
        log('SUCCESS', `${name} succeeded → URL: ${page.url()}`);
        results.push({ name, success: true });
        break;
      } catch (err) {
        log('FAIL', `${name} failed: ${err.message}`);
        await dump(`fail-${name}`, page);
        results.push({ name, success: false, error: err.message });
      }
    }

    // Step 7: Summary
    log('SUMMARY', 'Strategy results:');
    results.forEach(r => {
      log('RESULT', `${r.success ? '✅' : '❌'} ${r.name}` + (r.error ? ` (${r.error})` : ''));
    });

    // Final dump
    await dump('final-state', page);
  } catch (outerErr) {
    log('ERROR', `Unhandled exception: ${outerErr.stack || outerErr.message}`);
    await dump('uncaught-error', page);
  } finally {
    await browser.close();
    log('END', 'Browser closed');
  }
})();
