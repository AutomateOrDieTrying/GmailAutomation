/**
 * navigate-and-capture.js
 *
 * A verbose Puppeteer script that navigates the Gmail account creation flow,
 * captures screenshots at each step, fills in randomly generated names from
 * popular lists, and dumps HTML on errors. Uses general click helpers and fixed
 * 5-second waits between actions. Now handles Shadow DOM for the "For my personal use" step.
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

// Helper: click an element by CSS selector containing specific text
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
  if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir);

  let browser;
  let page;
  let step = 0;

  // Helper: capture screenshot
  async function captureScreenshot(desc) {
    step++;
    const safeDesc = desc.replace(/\s+/g, '-').toLowerCase();
    const filePath = path.join(artifactsDir, `${String(step).padStart(2, '0')}-${safeDesc}.png`);
    console.log(`[INFO] Capturing screenshot #${step}: ${filePath}`);
    if (page) await page.screenshot({ path: filePath, fullPage: true });
  }

  try {
    // Launch browser
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage();
    page.setDefaultTimeout(60000);
    page.on('console', msg => console.log(`[PAGE ${msg.type().toUpperCase()}] ${msg.text()}`));

    // Step 1: Navigate to Gmail
    console.log('[STEP 1] Navigate to Gmail home');
    await page.goto(
      'https://accounts.google.com/lifecycle/steps/signup/name?continue=https://mail.google.com/mail/&dsh=S469810587:1746362153014205&ec=asw-gmail-hero-create&flowEntry=SignUp&flowName=GlifWebSignIn&service=mail&theme=glif&TL=AArrULToupj0BCz6KalCVuNuXqMJL4lNTLAhxJBFdyGM71IjAbvipH4yecNH8yfl', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(res => setTimeout(res, 5000));
    await captureScreenshot('gmail-home');

        

        // Step 2: Fill in randomly generated names
    const first = getRandom(firstNames);
    const last = getRandom(lastNames);
    console.log(`[STEP 2] Fill names: ${first} ${last}`);
    await page.type('input[name="firstName"]', first, { delay: 100 });
    await page.type('input[name="lastName"]', last, { delay: 100 });
    await captureScreenshot('filled-name');

    // Step 5: Click "Next"
    console.log('[STEP 5] Click "Next"');
    await clickByText(page, 'a, button, span, div', 'Next');
    console.log('[INFO] "Next" clicked');
    await new Promise(res => setTimeout(res, 5000));
    await captureScreenshot('after-next');

    console.log('[INFO] Script completed successfully');
  } catch (err) {
    console.error('[ERROR]', err);
    const base = `error-${String(step).padStart(2, '0')}`;
    const shot = path.join(artifactsDir, `${base}.png`);
    const htmlf = path.join(artifactsDir, `${base}.html`);
    if (page) {
      await page.screenshot({ path: shot, fullPage: true });
      fs.writeFileSync(htmlf, page.content());
    }
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
