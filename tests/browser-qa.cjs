'use strict';

const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const root = path.resolve(__dirname, '..');
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.webp':'image/webp' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); return res.end('Not found');
  }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

async function main() {
  const output = path.join(root, 'qa', 'screenshots');
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const errors = [];
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    args: ['--no-sandbox']
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      isMobile: true, hasTouch: true
    });
    page.on('pageerror', e => errors.push(e.message));
    const response = await page.goto('http://127.0.0.1:' + port + '/player-test.html');
    assert.equal(response.status(), 200);
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('88×88'));
    await page.screenshot({ path: path.join(output, '01-idle.png'), fullPage: true });

    await page.keyboard.down('KeyW');
    await page.waitForTimeout(250);
    let debug = await page.locator('#debug').innerText();
    assert.match(debug, /向き up/);
    assert.match(debug, /素材 OK/);
    await page.screenshot({ path: path.join(output, '02-walk-up.png'), fullPage: true });
    await page.keyboard.up('KeyW');

    await page.keyboard.down('KeyD');
    await page.waitForTimeout(300);
    debug = await page.locator('#debug').innerText();
    assert.match(debug, /向き right/);
    await page.keyboard.up('KeyD');
    await page.waitForTimeout(80);
    debug = await page.locator('#debug').innerText();
    assert.match(debug, /速度 0/);
    await page.screenshot({ path: path.join(output, '03-stopped.png'), fullPage: true });

    await page.locator('[data-mode="carry"]').click();
    await page.waitForTimeout(80);
    debug = await page.locator('#debug').innerText();
    assert.match(debug, /動作 carry/);
    assert.match(debug, /コマ 4\/7/);
    await page.screenshot({ path: path.join(output, '04-carry.png'), fullPage: true });

    await page.locator('[data-mode="chop"]').click();
    await page.waitForTimeout(250);
    debug = await page.locator('#debug').innerText();
    assert.match(debug, /動作 chop/);
    await page.screenshot({ path: path.join(output, '05-chop.png'), fullPage: true });

    await page.locator('[data-mode="normal"]').click();
    const box = await page.locator('#testCanvas').boundingBox();
    const px = box.x + box.width / 2, py = box.y + box.height * 0.65;
    await page.mouse.move(px, py);
    await page.mouse.down();
    await page.mouse.move(px + 64, py + 2, { steps: 3 });
    await page.waitForTimeout(180);
    debug = await page.locator('#debug').innerText();
    assert.match(debug, /速度 (2[0-9][0-9]|255)/);
    await page.screenshot({ path: path.join(output, '06-dragging.png'), fullPage: true });
    await page.mouse.up();
    await page.waitForTimeout(90);
    debug = await page.locator('#debug').innerText();
    assert.match(debug, /速度 0/);

    // End-to-end playability: actual game, walking, proximity harvesting,
    // carrying logs, and delivering them into the furnace.
    const gamePage = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      isMobile: true, hasTouch: true
    });
    gamePage.on('pageerror', e => errors.push('game: ' + e.message));
    const gameResponse = await gamePage.goto('http://127.0.0.1:' + port + '/index.html');
    assert.equal(gameResponse.status(), 200);
    await gamePage.locator('#startBtn').click();
    await gamePage.locator('.stage-card').first().click();
    await gamePage.locator('#hud:not(.hidden)').waitFor();
    await gamePage.screenshot({ path: path.join(output, '07-main-stage-idle.png'), fullPage: true });
    const assetOK = await gamePage.evaluate(async () => {
      const r = await fetch('assets/player/atlas.webp?v=4');
      return r.ok && r.headers.get('content-type')?.includes('image/');
    });
    assert.ok(assetOK, 'the main game should serve its original sprite atlas');

    await gamePage.keyboard.down('KeyA');
    await gamePage.waitForTimeout(950);
    await gamePage.keyboard.up('KeyA');
    await gamePage.keyboard.down('KeyW');
    await gamePage.waitForTimeout(190);
    await gamePage.keyboard.up('KeyW');
    await gamePage.waitForTimeout(1550);
    await gamePage.screenshot({ path: path.join(output, '08-main-harvest.png'), fullPage: true });
    let loadText = await gamePage.locator('#carryHud').innerText();
    assert.ok(Number(loadText.split('/')[0]) > 0, 'player must collect physical logs when close to trees');

    await gamePage.keyboard.down('KeyD');
    await gamePage.waitForTimeout(880);
    await gamePage.keyboard.up('KeyD');
    await gamePage.keyboard.down('KeyW');
    await gamePage.waitForTimeout(700);
    await gamePage.keyboard.up('KeyW');
    await gamePage.waitForTimeout(550);
    await gamePage.screenshot({ path: path.join(output, '09-main-delivery.png'), fullPage: true });
    const heat = parseFloat(await gamePage.locator('#goalBar').evaluate(el => el.style.width));
    assert.ok(heat > 0, 'furnace must receive logs and increase heat');
    console.log('MAIN STAGE QA PASSED: walk, auto-harvest, carried logs, furnace delivery; heat=' + heat);

    assert.deepEqual(errors, [], 'browser console errors');
    console.log('BROWSER QA PASSED: sprite 88px, 4-way keys, idle, walking, carry, chop, drag, release');
    console.log('Screenshots:', output);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(err => {
  console.error(err);
  server.close();
  process.exitCode = 1;
});
