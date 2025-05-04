const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    protocolTimeout: 120000 // increase protocol timeout to avoid Page.enable errors
  });
  const page = await browser.newPage();

  try {
    // STEP: Go to Gmail home
    console.log('[STEP] Navigating to Gmail');
    await page.goto('https://gmail.com', { timeout: 60000, waitUntil: 'networkidle2' });
    await dump('gmail-home');

    // STEP: Click "Create account"
    console.log('[STEP] Clicking "Create account"');
    await clickSelector(page, 'a[href*="/signup"]');
    await dump('after-create-account');

    // STEP: Fill birthday & gender form
    console.log('[STEP] Waiting for birthday form');
    await page.waitForSelector('input[name="day"]', { visible: true, timeout: 60000 });
    console.log('[RESULT] Birthday form visible');
    await page.type('input[name="day"]', '01', { delay: 50 });
    await page.type('input[name="month"]', 'Jan', { delay: 50 });
    await page.type('input[name="year"]', '1990', { delay: 50 });
    await page.select('select[id="genderpronoun"]', '1');
    await dump('after-birthday-gender');
    await clickSelector(page, '#birthdaygenderNext');
    await dump('after-birthdaygender-next');

    // STEP: Choose first username option
    console.log('[STEP] Waiting for username options');
    await page.waitForSelector('div[data-button-type="multipleChoiceIdentifier"]', { visible: true, timeout: 60000 });
    const options = await page.$$('div[data-button-type="multipleChoiceIdentifier"]');
    if (options.length === 0) throw new Error('No username options found');
    await options[0].click();
    console.log('[RESULT] Selected first username option');
    await dump('after-username-choice');
    await clickSelector(page, 'button[jsname="LgbsSe"]');

    // STEP: Fill passwords
    console.log('[STEP] Waiting for password form');
    await page.waitForSelector('input[name="Passwd"]', { visible: true, timeout: 60000 }); // password field name=Passwd citeturn5file0
    console.log('[RESULT] Password form visible');
    await page.type('input[name="Passwd"]', 'SuperSecret123!', { delay: 50 });
    console.log('[RESULT] Password entered into Passwd field');
    await page.type('input[name="PasswdAgain"]', 'SuperSecret123!', { delay: 50 });
    console.log('[RESULT] Password entered into PasswdAgain field');
    await dump('password-form-filled');

    // STEP: Click "Next" on password page
    console.log('[STEP] Clicking "Next" on password page');
    await clickSelector(page, '#createpasswordNext'); // Next button id=createpasswordNext citeturn5file8
    await dump('after-password-next');
  } catch (err) {
    console.error('[ERROR]', err);
    await dump('uncaught-error');
  } finally {
    console.log('[END] Closing browser');
    await browser.close();
  }

  // Helper to click and log
  async function clickSelector(page, selector) {
    try {
      await page.waitForSelector(selector, { visible: true, timeout: 30000 });
      await page.click(selector);
      console.log(`[SUCCESS] Clicked ${selector}`);
    } catch (err) {
      console.error(`[FAIL] Failed to click ${selector}:`, err);
      await dump(`fail-click-${selector.replace(/[^a-zA-Z0-9]/g, '_')}`);
      throw err;
    }
  }

  // Helper to capture screenshot & HTML
  async function dump(name) {
    await page.screenshot({ path: `artifacts/${name}.png`, fullPage: true });
    const html = await page.content();
    require('fs').writeFileSync(`artifacts/${name}.html`, html);
    console.log(`[DUMP] ${name}`);
  }
})();
