const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  // Ensure output directory
  const outDir = path.resolve(__dirname, 'artifacts');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  let step = 0;
  async function capture(name) {
    step += 1;
    const fileBase = `${step.toString().padStart(2, '0')}-${name}`;
    await page.screenshot({ path: path.join(outDir, `${fileBase}.png`), fullPage: true });  // full-page screenshot :contentReference[oaicite:2]{index=2}
  }

  try {
    await page.goto('https://gmail.com');  // initial navigation
    await page.waitForSelector('a[href*="CreateAccount"]');  // wait for link :contentReference[oaicite:3]{index=3}
    await capture('gmail-home');

    // Click "Create account"
    await page.click('a[href*="CreateAccount"]');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    await capture('clicked-create-account');

    // Click "For my personal use"
    await page.waitForSelector('div[jsname="V67aGc"]');  // selector for Create account :contentReference[oaicite:4]{index=4}
    await page.click('div[jsname="V67aGc"]');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    await capture('for-personal-use');

    // Continue with additional steps here...
    // e.g., fill form fields, etc.

    console.log('Script completed successfully.');
  } catch (err) {
    console.error('Error encountered:', err);
    // Final snapshot & HTML dump
    const errorBase = `error-step-${step.toString().padStart(2, '0')}`;
    await page.screenshot({ path: path.join(outDir, `${errorBase}.png`), fullPage: true });
    const html = await page.content();  // get full HTML :contentReference[oaicite:5]{index=5}
    fs.writeFileSync(path.join(outDir, `${errorBase}.html`), html);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
