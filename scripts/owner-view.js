// Render a page as a logged-in user in headless Chrome and list buttons/errors.
// Usage: node scripts/owner-view.js <url> <jwt> [screenshot.png]   (env W=390 for phone width)
// Needs: npm i playwright-core (anywhere on NODE_PATH) + /usr/bin/google-chrome
const { chromium } = require('playwright-core');
(async () => {
  const [,, url, token, outPng] = process.argv;
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: Number(process.env.W||1200), height: 900 }, isMobile: !!process.env.W });
  await ctx.addInitScript((t) => { try { localStorage.setItem('carSocialToken', t); } catch {} }, token);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);
  const body = await page.evaluate(() => document.body.innerText);
  const btns = await page.$$eval('button, a.btn', els => els.map(e => e.innerText.trim()).filter(Boolean));
  console.log('BUTTONS:', JSON.stringify(btns.slice(0, 30)));
  console.log('HAS "Transfer":', /\bTransfer\b/.test(body), '| HAS "Edit":', /\bEdit\b/.test(body), '| HAS "Something went wrong":', body.includes('Something went wrong'));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  if (outPng) await page.screenshot({ path: outPng, fullPage: false });
  await browser.close();
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
