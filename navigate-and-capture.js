/**
 * navigate-and-capture.js
 *
 * A verbose Puppeteer script to navigate the Gmail account creation flow,
 * capture screenshots at each step, fill in randomly generated names,
 * and dump HTML on errors, using general text-based selectors and a 5-second fixed wait.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// Lists of the 100 most popular first and last names (U.S. data)
const firstNames = [
  'James','Mary','John','Patricia','Robert','Jennifer','Michael','Linda','William','Elizabeth',
  'David','Barbara','Richard','Susan','Joseph','Jessica','Thomas','Sarah','Charles','Karen',
  'Christopher','Nancy','Daniel','Lisa','Matthew','Betty','Anthony','Dorothy','Donald','Sandra',
  'Mark','Ashley','Paul','Kimberly','Steven','Emily','Andrew','Donna','Kenneth','Michelle',
  'George','Carol','Joshua','Amanda','Kevin','Melissa','Brian','Deborah','Edward','Stephanie',
  'Ronald','Rebecca','Timothy','Sharon','Jason','Laura','Jeffrey','Cynthia','Ryan','Kathleen',
  'Jacob','Amy','Gary','Shirley','Nicholas','Angela','Eric','Helen','Jonathan','Anna',
  'Stephen','Brenda','Larry','Pamela','Justin','Nicole','Scott','Emma','Brandon','Samantha',
  'Benjamin','Katherine','Samuel','Christine','Frank','Debra','Gregory','Rachel','Raymond','Catherine',
  'Alexander','Carolyn','Patrick','Janet','Jack','Ruth','Dennis','Maria','Jerry','Heather'
];

const lastNames = [
  'Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez',
  'Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin',
  'Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson',
  'Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores',
  'Green','Adams','Nelson','Baker','Hall','Rivera','Campbell','Mitchell','Carter','Roberts',
  'Gomez','Phillips','Evans','Turner','Diaz','Parker','Cruz','Edwards','Collins','Reyes',
  'Stewart','Morris','Morales','Murphy','Cook','Rogers','Gutierrez','Ortiz','Morgan','Cooper',
  'Peterson','Bailey','Reed','Kelly','Howard','Ramos','Kim','Cox','Ward','Richardson',
  'Watson','Brooks','Chavez','Wood','James','Bennett','Gray','Mendoza','Ruiz','Hughes',
  'Price','Alvarez','Castillo','Sanders','Patel','Myers','Long','Ross','Foster','Jimenez'
];

// Helper: get a random element from an array
function getRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Custom helper: click an element matching selector whose text contains given substring
async function clickByText(page, selector, text, timeout = 60000, polling = 500) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const clicked = await page.evaluate((sel, txt) => {
      const elements = Array.from(document.querySelectorAll(sel));
      const target = elements.find(el => el.innerText.trim().includes(txt));
      if (target) {
        target.scrollIntoView();
        target.click();
        return true;
      }
      return false;
    }, selector, text);
    if (clicked) return;
    await new Promise(res => setTimeout(res, polling));
  }
  throw new Error(`Timeout clicking element '${selector}' containing text '${text}'`);
}

(async () => {
  console.log('[INFO] Starting Puppeteer script...');

  // Prepare artifacts directory
  const artifactsDir = path.resolve(__dirname, 'artifacts');
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir);
  }

  let browser;
  let page;
  let step = 0;

  // Helper: capture screenshot with verbose logging
  async function captureScreenshot(description) {
    step++;
    const safeDesc = description.replace(/\s+/g, '-').toLowerCase();
    const filename = `${String(step).padStart(2, '0')}-${safeDesc}.png`;
    const filePath = path.join(artifactsDir, filename);
    console.log(`[INFO] Capturing screenshot (#${step}): ${filePath}`);
    if (page) await page.screenshot({ path: filePath, fullPage: true });
  }

  try {
    console.log('[INFO] Launching browser...');
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage();
    page.setDefaultTimeout(60000);
    console.log('[INFO] Browser and page initialized.');

    // Log page console messages
    page.on('console', msg => console.log(`[PAGE ${msg.type().toUpperCase()}] ${msg.text()}`));

    // Step 1: Navigate to Gmail
    console.log('[STEP 1] Navigating to https://gmail.com...');
    await page.goto('https://gmail.com', { waitUntil: 'networkidle2', timeout: 60000 });
    console.log(`[INFO] Arrived at URL: ${page.url()}`);
    await new Promise(res => setTimeout(res, 5000));
    await captureScreenshot('gmail-home');

    // Step 2: Click "Create account"
    console.log('[STEP 2] Attempting to click "Create account"...');
    await clickByText(page, 'a, button, span, div', 'Create account');
    console.log('[INFO] "Create account" clicked.');
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 });
    console.log(`[INFO] Navigated to: ${page.url()}`);
    await new Promise(res => setTimeout(res, 5000));
    await captureScreenshot('clicked-create-account');

    // Step 3: Click "For my personal use"
    console.log('[STEP 3] Attempting to click "For my personal use"...');
    await clickByText(page, 'span, button, div', 'For my personal use');
    console.log('[INFO] "For my personal use" clicked.');
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 });
    console.log(`[INFO] Navigated to: ${page.url()}`);
    await new Promise(res => setTimeout(res, 5000));
    await captureScreenshot('for-personal-use');

    // Step 4: Fill in randomly generated first and last name
    const randomFirst = getRandom(firstNames);
    const randomLast = getRandom(lastNames);
    console.log(`[STEP 4] Filling first name: ${randomFirst}, last name: ${randomLast}`);
    await page.type('input[name="firstName"]', randomFirst, { delay: 100 });
    await page.type('input[name="lastName"]', randomLast, { delay: 100 });
    await captureScreenshot('filled-name');

    // Step 5: Click "Next" to proceed
    console.log('[STEP 5] Attempting to click "Next"...');
    await clickByText(page, 'span, button, div', 'Next');
    console.log('[INFO] "Next" clicked.');
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 });
    console.log(`[INFO] Navigated to: ${page.url()}`);
    await new Promise(res => setTimeout(res, 5000));
    await captureScreenshot('after-next');

    console.log('[INFO] All steps completed successfully.');
  } catch (error) {
    console.error('[ERROR] Error encountered:', error);
    const errorBase = `error-step-${String(step).padStart(2, '0')}`;
    const screenshotPath = path.join(artifactsDir, `${errorBase}.png`);
    const htmlPath = path.join(artifactsDir, `${errorBase}.html`);
    if (page) {
      console.log(`[ERROR] Capturing final screenshot: ${screenshotPath}`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log('[ERROR] Error screenshot captured.');
      const html = await page.content();
      console.log(`[ERROR] Writing error HTML to: ${htmlPath}`);
      fs.writeFileSync(htmlPath, html);
      console.log('[ERROR] Error HTML written.');
    }
    process.exit(1);
  } finally {
    if (browser) {
      console.log('[INFO] Closing browser...');
      await browser.close();
      console.log('[INFO] Browser closed.');
    }
    console.log('[INFO] Script finished.');
  }
})();
