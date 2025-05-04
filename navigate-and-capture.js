/**
 * navigate-and-click-debug.js (patched)
 *
 * Now waits for the literal text "For my personal use" anywhere in the DOM,
 * then exhaustively tries to click it via multiple strategies.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

(async () => {
  // Prepare artifacts dir
  const artifacts = path.resolve(__dirname, 'debug-artifacts');
  if (!fs.existsSync(artifacts)) fs.mkdirSync(artifacts);

  const delay = ms => new Promise(res => setTimeout(res, ms));
  function log(tag, msg) {
    console.log(`[${new Date().toISOString()}] [${tag}] ${msg}`);
  }
  async function dump(name, page) {
    const safe = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const png  = path.join(artifacts, `${safe}.png`);
    const html = path.join(artifacts, `${safe}.html`);
    log('DUMP', `${name} → ${png}, ${html}`);
    try { await page.screenshot({ path: png, fullPage: true }); }
    catch (e) { log('ERROR', `screenshot failed: ${e.message}`); }
    fs.writeFileSync(html, await page.content());
  }

  // Launch with extended timeouts
  log('LAUNCH', 'Starting browser...');
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
    // 1) Go to Gmail
    log('STEP', 'Navigating to https://gmail.com');
    await page.goto('https://gmail.com', { waitUntil: 'networkidle2' });
    await delay(3000);
    await dump('gmail-home', page);

    // 2) Click "Create account"
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

    // 3) Wait for any element containing the text "For my personal use"
    log('STEP', 'Waiting for text "For my personal use" to appear');
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('*'))
                .some(el => el.innerText && el.innerText.includes('For my personal use')),
      { timeout: 60000 }
    );
    await dump('for-personal-use-visible', page);

    // 4) Enumerate all elements containing that text
    const candidates = await page.$$eval('*', els =>
      els
        .filter(el => el.innerText && el.innerText.includes('For my personal use'))
        .map((el, i) => ({
          index: i,
          tag: el.tagName,
          text: el.innerText.trim(),
          html: el.outerHTML.slice(0,200).replace(/\s+/g,' ')
        }))
    );
    log('CANDIDATES', JSON.stringify(candidates, null, 2));

    // 5) Define click strategies
    const attempts = [
      {
        name: 'direct-text-click',
        fn: async () => {
          const clicked = await page.evaluate(() => {
            const el = Array.from(document.querySelectorAll('*'))
              .find(e => e.innerText && e.innerText.includes('For my personal use'));
            if (!el) return false;
            el.scrollIntoView();
            el.click();
            return true;
          });
          if (!clicked) throw new Error('direct-text-click: element not found');
        }
      },
      {
        name: 'xpath-click',
        fn: async () => {
          const [el] = await page.$x("//*[contains(normalize-space(.),'For my personal use')]");
          if (!el) throw new Error('xpath-click: no nodes');
          await el.evaluate(e => e.scrollIntoView());
          await el.click();
        }
      },
      {
        name: 'mouse-event-click',
        fn: async () => {
          const succeeded = await page.evaluate(() => {
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
          if (!succeeded) throw new Error('mouse-event-click failed');
        }
      },
      {
        name: 'nth-instance-click',
        fn: async () => {
          const els = await page.$$('*');
          const matches = [];
          for (const el of els) {
            const text = await (await el.getProperty('innerText')).jsonValue();
            if (text && text.includes('For my personal use')) matches.push(el);
          }
          if (!matches.length) throw new Error('nth-instance-click: none found');
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
          if (!host) throw new Error('shadow-dom-click: no <c-wiz>');
          const root = await host.evaluateHandle(h => h.shadowRoot);
          const btn = await root.asElement().$('//*[contains(text(),"For my personal use")]');
          if (!btn) throw new Error('shadow-dom-click: not found');
          await btn.click();
        }
      }
    ];

    // 6) Try each strategy until one works
    const results = [];
    for (const {name, fn} of attempts) {
      log('TRY', name);
      try {
        await fn();
        await delay(2000);
        await dump(`after-${name}`, page);
        log('SUCCESS', `${name} succeeded → URL: ${page.url()}`);
        results.push({name, success: true});
        break;
      } catch (err) {
        log('FAIL', `${name} failed: ${err.message}`);
        await dump(`fail-${name}`, page);
        results.push({name, success: false, error: err.message});
      }
    }

    // 7) Summary
    log('SUMMARY', 'Results:');
    results.forEach(r => {
      log('RESULT', `${r.success ? '✅' : '❌'} ${r.name}` + (r.error ? ` (${r.error})` : ''));
    });

    await dump('final-state', page);
  } catch (err) {
    log('ERROR', `Unhandled exception: ${err.stack || err.message}`);
    await dump('uncaught-error', page);
  } finally {
    await browser.close();
    log('END', 'Browser closed');
  }
})();
