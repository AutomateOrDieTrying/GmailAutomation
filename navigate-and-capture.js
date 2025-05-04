/**
 * navigate-and-debug-verbose.js
 *
 * Ultra-verbose Puppeteer flow to nail down why “For my personal use” isn’t clicking.
 * Tries 10+ different strategies, timestamps everything, logs candidate details,
 * and dumps screenshots + HTML after each attempt.
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

  // --- Utility: screenshot + HTML dump
  async function dump(step) {
    const safeStep = step.replace(/[^a-z0-9\-]/gi, '-').toLowerCase();
    const png = path.join(artifacts, `${safeStep}.png`);
    const html = path.join(artifacts, `${safeStep}.html`);
    log('DUMP', `${step} → ${png}, ${html}`);
    await page.screenshot({ path: png, fullPage: true }).catch(e => log('ERROR', `screenshot failed: ${e.message}`));
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
    await page.waitForTimeout(3000);
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
    await page.waitForTimeout(4000);
    await dump('after-create-account');

    // 3) Wait for choice container
    log('STEP', 'Waiting for choice container selector');
    await page.waitForSelector('div[data-button-type="multipleChoiceIdentifier"]', { visible: true });
    await page.waitForTimeout(1000);
    await dump('choice-container');

    // 4) Enumerate all candidate options
    const candidates = await page.$$eval(
      'div[data-button-type="multipleChoiceIdentifier"]',
      els => els.map((el, i) => ({
        index: i,
        text: el.innerText.trim(),
        html: el.outerHTML.slice(0,200).replace(/\s+/g,' '), // snippet
      }))
    );
    log('CANDIDATES', JSON.stringify(candidates, null, 2));

    // 5) Define click attempts
    const attempts = [
      // A: basic innerText scan
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
      // B: clickByText helper
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
      // C: direct CSS selector (if any unique data-value)
      {
        name: 'data-value-click',
        fn: async () => {
          log('TRY', 'data-value-click');
          // assume data-value attribute might equal the visible text
          await page.click('div[data-button-type="multipleChoiceIdentifier"][data-value="For my personal use"]');
        }
      },
      // D: attribute contains click
      {
        name: 'attribute-contains-click',
        fn: async () => {
          log('TRY', 'attribute-contains-click');
          await page.evaluate(() => {
            const els = Array.from(document.querySelectorAll('div[data-button-type]'));
            const t = els.find(e => e.getAttribute('data-value')?.includes('personal use'));
            if (!t) throw new Error('attribute-contains-click no match');
            t.scrollIntoView();
            t.click();
          });
        }
      },
      // E: XPath approach
      {
        name: 'xpath-click',
        fn: async () => {
          log('TRY', 'xpath-click');
          const handles = await page.$x("//div[@data-button-type='multipleChoiceIdentifier' and contains(normalize-space(.),'For my personal use')]");
          if (!handles.length) throw new Error('xpath-click no nodes');
          const el = handles[0];
          await el.evaluate(e => e.scrollIntoView());
          await el.click();
        }
      },
      // F: puppeteer page.$eval
      {
        name: 'puppeteer-$eval',
        fn: async () => {
          log('TRY', 'puppeteer-$eval');
          await page.$eval('div[data-button-type="multipleChoiceIdentifier"]', (els) => {
            // this will use the first match; add filter
            throw new Error('puppeteer-$eval placeholder');
          });
        }
      },
      // G: keyboard navigation + Enter
      {
        name: 'keyboard-nav-enter',
        fn: async () => {
          log('TRY', 'keyboard-nav-enter');
          await page.keyboard.press('Tab'); // lots of Tabs may be needed
          await page.keyboard.press('Tab');
          await page.keyboard.press('Tab');
          await page.keyboard.press('Enter');
        }
      },
      // H: dispatch raw MouseEvent
      {
        name: 'raw-mouseevent',
        fn: async () => {
          log('TRY', 'raw-mouseevent');
          await page.evaluate(() => {
            const els = Array.from(document.querySelectorAll('div[data-button-type]'));
            const t = els.find(e => /personal use/i.test(e.innerText));
            if (!t) throw new Error('raw-mouseevent target missing');
            const rect = t.getBoundingClientRect();
            t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: rect.left+5, clientY: rect.top+5 }));
            t.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, clientX: rect.left+5, clientY: rect.top+5 }));
            t.dispatchEvent(new MouseEvent('click',     { bubbles: true, clientX: rect.left+5, clientY: rect.top+5 }));
          });
        }
      },
      // I: nth-child brute
      {
        name: 'nth-child-click',
        fn: async () => {
          log('TRY', 'nth-child-click');
          const els = await page.$$('div[data-button-type="multipleChoiceIdentifier"]');
          if (els.length < 2) throw new Error('not enough options for nth-child');
          await els[1].click();
        }
      },
      // J: shadowRoot exploration
      {
        name: 'shadow-root-click',
        fn: async () => {
          log('TRY', 'shadow-root-click');
          const host = await page.$('c-wiz');
          if (!host) throw new Error('no c-wiz host');
          const shadow = await host.evaluateHandle(h => h.shadowRoot);
          const btn = await shadow.asElement().$('div[data-button-type="multipleChoiceIdentifier"] >> text="For my personal use"');
          if (!btn) throw new Error('shadow-root no button');
          await btn.click();
        }
      },
    ];

    // 6) Run attempts in sequence
    for (const { name, fn } of attempts) {
      try {
        await fn();
        await page.waitForTimeout(2000);
        await dump(`after-${name}`);
        log('SUCCESS', `${name} worked! Current URL: ${page.url()}`);
        break;
      } catch (err) {
        log('FAIL', `${name}: ${err.message}`);
        await dump(`fail-${name}`);
      }
    }

    // 7) Final state
    log('FINAL', `Done. Page URL: ${page.url()}`);
    await dump('final-state');

  } catch (outerErr) {
    log('ERROR', `Uncaught exception: ${outerErr.stack || outerErr.message}`);
    await dump('uncaught-error');
  } finally {
    await browser.close();
    log('END', 'Browser closed');
  }
})();
