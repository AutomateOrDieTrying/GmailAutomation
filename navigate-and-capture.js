/**
 * signup-direct.js
 *
 * Bypass the choice screens entirely by using Google’s direct signup URL.
 * Fills in first/last name and clicks “Next”.
 */

const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  // 1) Go straight to the “What’s your name?” step
  await page.goto(
    'https://accounts.google.com/signup/v2' +
    '?service=mail&flowName=GlifWebSignIn&flowEntry=SignUp',
    { waitUntil: 'networkidle2' }
  );

  // 2) Wait for the name inputs to load
  await page.waitForSelector('input[name="firstName"]', { visible: true });

  // 3) Fill in your name (change these as needed)
  await page.type('input[name="firstName"]', 'Alice', { delay: 100 });
  await page.type('input[name="lastName"]', 'Example', { delay: 100 });

  // 4) Capture a screenshot of the filled form
  await page.screenshot({ path: '01-name-form.png', fullPage: true });

  // 5) Click the “Next” button
  //    The Next button on this form has the ID "accountDetailsNext"
  await page.click('#accountDetailsNext');

  // 6) Wait for the username field to appear (next step)
  await page.waitForSelector('input[name="Username"]', { visible: true });
  await page.screenshot({ path: '02-username-form.png', fullPage: true });

  console.log('✅ Arrived at username step');
  await browser.close();
})();
