/**
 * navigate-and-click-debug.js
 *
 * Puppeteer script to exhaustively try every way to click the
 * “For my personal use” button on the Gmail “Create account” flow.
 * - Never aborts early on timeouts
 * - Always writes artifacts/PNG+HTML for every step & attempt
 * - Handles wrong redirects (e.g. landing on sign-in page) as failures
 * - Summarizes exactly which strategies worked or failed
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
  const log = (tag, msg) => console.log(`[${new Date().toISOString()}] [${tag}] ${msg}`);
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

  // --- Launch browser
  log('LAUNCH', 'Starting Puppeteer (timeout=60s, protocolTimeout=120s)...');
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

  // --- Step 1: Navigate to Gmail home
  log('STEP', 'Navigating to https://gmail.com');
  await page.goto('https://gmail.com', { waitUntil: 'networkidle2' }).catch(e => log('ERROR', `Goto failed: ${e.message}`));
  await delay(3000);
  await dump('gmail-home', page);

  // --- Step 2: Click "Create account" via multiple strategies
  const createAccountResults = [];
  const createAccountStrategies = [
    {
      name: 'inner-text',
      fn: async () => {
        await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('a,button,div,span'))
            .find(el => /create account/i.test(el.innerText));
          if (!btn) throw new Error('not found');
          btn.scrollIntoView();
          btn.click();
        });
      }
    },
    {
      name: 'css-href-signup',
      fn: async () => {
        await page.click('a[href*="signup"], button[jsname*="signup"]');
      }
    },
    {
      name: 'xpath',
      fn: async () => {
        const [el] = await page.$x("//a[contains(.,'Create account') or contains(.,'create account')]");
        if (!el) throw new Error('xpath no node');
        await el.evaluate(e => e.scrollIntoView());
        await el.click();
      }
    },
    {
      name: 'mouse-event',
      fn: async () => {
        await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('a,button,div,span'))
            .find(el => /create account/i.test(el.innerText));
          if (!btn) throw new Error('not found');
          const r = btn.getBoundingClientRect();
          ['mousedown','mouseup','click'].forEach(type =>
            btn.dispatchEvent(new MouseEvent(type, {
              bubbles: true, clientX: r.left+5, clientY: r.top+5
            }))
          );
        });
      }
    },
  ];

  let createAccountSucceeded = false;
  for (const strat of createAccountStrategies) {
    log('TRY', `CreateAccount:${strat.name}`);
    try {
      await strat.fn();
      await delay(4000);
      await dump(`after-createAccount-${strat.name}`, page);
      // detect if we’re on the choice screen: presence of any "For my personal use" text
      const hasChoice = await page.evaluate(() =>
        Array.from(document.querySelectorAll('*'))
          .some(el => el.innerText && el.innerText.includes('For my personal use'))
      );
      if (!hasChoice) throw new Error(`no choice screen (URL=${page.url()})`);
      log('SUCCESS', `CreateAccount:${strat.name} led to choice screen`);
      createAccountResults.push({ name: strat.name, success: true });
      createAccountSucceeded = true;
      break;
    } catch (err) {
      log('FAIL', `CreateAccount:${strat.name} failed: ${err.message}`);
      createAccountResults.push({ name: strat.name, success: false, error: err.message });
      // reload home for next strategy
      await page.goto('https://gmail.com', { waitUntil: 'networkidle2' }).catch(() => {});
      await delay(3000);
    }
  }
  if (!createAccountSucceeded) {
    log('WARN', 'All CreateAccount strategies failed; proceeding anyway');
  }

  // Always dump post-create-account state
  await dump('post-create-account', page);

  // --- Step 3: Click "For my personal use" via multiple strategies
  const personalUseResults = [];
  const personalUseStrategies = [
    {
      name: 'inner-text',
      fn: async () => {
        const ok = await page.evaluate(() => {
          const el = Array.from(document.querySelectorAll('*'))
            .find(e => e.innerText && e.innerText.includes('For my personal use'));
          if (!el) return false;
          el.scrollIntoView();
          el.click();
          return true;
        });
        if (!ok) throw new Error('not found');
      }
    },
    {
      name: 'css-attribute',
      fn: async () => {
        await page.click('div[data-button-type="multipleChoiceIdentifier"][data-value="For my personal use"]');
      }
    },
    {
      name: 'xpath',
      fn: async () => {
        const [el] = await page.$x("//*[contains(normalize-space(.),'For my personal use')]");
        if (!el) throw new Error('xpath no node');
        await el.evaluate(e => e.scrollIntoView());
        await el.click();
      }
    },
    {
      name: 'mouse-event',
      fn: async () => {
        await page.evaluate(() => {
          const el = Array.from(document.querySelectorAll('*'))
            .find(e => e.innerText && e.innerText.includes('For my personal use'));
          if (!el) throw new Error('not found');
          const r = el.getBoundingClientRect();
          ['mousedown','mouseup','click'].forEach(type =>
            el.dispatchEvent(new MouseEvent(type, {
              bubbles: true, clientX: r.left+5, clientY: r.top+5
            }))
          );
        });
      }
    },
    {
      name: 'shadow-dom',
      fn: async () => {
        const host = await page.$('c-wiz');
        if (!host) throw new Error('c-wiz not found');
        const root = await host.evaluateHandle(h => h.shadowRoot);
        const btn = await root.asElement().$$eval(
          'div', divs => divs.find(d => d.innerText.includes('For my personal use'))
        );
        if (!btn) throw new Error('shadow button not found');
        // Need a handle to click
        const handle = await root.asElement().$('div');
        await handle.evaluate(e => e.scrollIntoView());
        await handle.click();
      }
    },
  ];

  let personalUseSucceeded = false;
  for (const strat of personalUseStrategies) {
    log('TRY', `PersonalUse:${strat.name}`);
    try {
      await strat.fn();
      await delay(3000);
      await dump(`after-personalUse-${strat.name}`, page);
      // if we land on sign-in page, that’s a failure
      if (/signin\/identifier/.test(page.url())) {
        throw new Error(`redirected to sign-in (${page.url()})`);
      }
      log('SUCCESS', `PersonalUse:${strat.name} clicked correctly → URL=${page.url()}`);
      personalUseResults.push({ name: strat.name, success: true });
      personalUseSucceeded = true;
      break;
    } catch (err) {
      log('FAIL', `PersonalUse:${strat.name} failed: ${err.message}`);
      personalUseResults.push({ name: strat.name, success: false, error: err.message });
      // back to choice screen if needed
      if (createAccountSucceeded) {
        await dump('recover-to-choice-before-next', page);
      }
    }
  }

  // --- Final state dump & summary
  await dump('final-state', page);
  log('SUMMARY', 'CreateAccount strategies:');
  createAccountResults.forEach(r =>
    log('RESULT', `${r.success ? '✅' : '❌'} ${r.name}${r.error ? ` (${r.error})` : ''}`)
  );
  log('SUMMARY', 'PersonalUse strategies:');
  personalUseResults.forEach(r =>
    log('RESULT', `${r.success ? '✅' : '❌'} ${r.name}${r.error ? ` (${r.error})` : ''}`)
  );

  await browser.close();
  log('END', 'Browser closed');
})();
