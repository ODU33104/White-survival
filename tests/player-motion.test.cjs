'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Motion = require('../player-motion.js');

function webpDimensions(file) {
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  assert.equal(bytes.toString('ascii', 12, 16), 'VP8X');
  return {
    width: bytes.readUIntLE(24, 3) + 1,
    height: bytes.readUIntLE(27, 3) + 1
  };
}

test('real player atlas: 8x4 frames and 88x88 crop', () => {
  const atlas = webpDimensions(path.resolve(__dirname, '../assets/player/atlas.webp'));
  assert.deepEqual(atlas, { width: 704, height: 352 });
  const grid = Motion.spriteGrid(atlas.width, atlas.height, 8, 4);
  assert.equal(grid.cellWidth, 88);
  assert.equal(grid.cellHeight, 88);
});

test('impossible atlas dimensions are rejected', () => {
  assert.throws(() => Motion.spriteGrid(705, 352), /Invalid sprite grid/);
  assert.throws(() => Motion.spriteGrid(704, 353), /Invalid sprite grid/);
  assert.throws(() => Motion.spriteGrid(0, 352), /Invalid sprite grid/);
});

test('all 4 directions are mapped to the correct atlas row', () => {
  assert.deepEqual(Motion.DIR_ROW, { down: 0, right: 1, left: 2, up: 3 });
  for (const [vec, facing] of [
    [[0, 1], 'down'], [[0, -1], 'up'], [[-1, 0], 'left'], [[1, 0], 'right']
  ]) assert.equal(Motion.direction(...vec), facing);
});

test('10px thumb dead zone rejects accidental motion', () => {
  assert.deepEqual(Motion.joystick(4, 4, 10, 28), { x: 0, y: 0, strength: 0 });
});

test('a 28px thumb drag reaches full speed', () => {
  const j = Motion.joystick(35, 0, 10, 28);
  assert.equal(j.strength, 1);
  assert.equal(j.x, 1);
  assert.equal(j.y, 0);
});

test('diagonal thumb drag is normalized to avoid fast diagonal travel', () => {
  const j = Motion.joystick(35, 35, 10, 28);
  const input = Motion.compose(new Set(), j);
  assert.ok(Math.abs(Math.hypot(input.x, input.y) - 1) < 1e-10);
  assert.equal(input.strength, 1);
});

test('immediate directional changes do not preserve stale momentum', () => {
  const p = { x: 300, y: 300, vx: 0, vy: 0, stepDistance: 0 };
  const bounds = { minX: 0, maxX: 900, minY: 0, maxY: 1450 };
  Motion.advance(p, { x: 1, y: 0, strength: 1 }, 1/60, 255, bounds);
  assert.equal(p.vx, 255);
  Motion.advance(p, { x: -1, y: 0, strength: 1 }, 1/60, 255, bounds);
  assert.equal(p.vx, -255);
  Motion.advance(p, { x: 0, y: 0, strength: 0 }, 1/60, 255, bounds);
  assert.equal(p.vx, 0);
  assert.equal(p.vy, 0);
});

test('walking frame uses real distance and cycles through distinct poses', () => {
  const frames = [0, 27, 54, 81, 108].map(d => Motion.walkingFrame(d, 27));
  assert.deepEqual(frames, [0, 1, 2, 3, 0]);
});

test('stop freezes footsteps and returns idle frame', () => {
  const p = { x: 300, y: 300, vx: 0, vy: 0, stepDistance: 70 };
  const bounds = { minX: 0, maxX: 900, minY: 0, maxY: 1450 };
  const traveled = Motion.advance(p, { x: 0, y: 0, strength: 0 }, 1/60, 255, bounds);
  assert.equal(traveled, 0);
  assert.equal(p.stepDistance, 0);
  assert.equal(Motion.walkingFrame(p.stepDistance), 0);
});

test('player never exits world bounds', () => {
  const p = { x: 895, y: 1445, vx: 0, vy: 0, stepDistance: 0 };
  const bounds = { minX: 70, maxX: 830, minY: 130, maxY: 1350 };
  Motion.advance(p, { x: 1, y: 1, strength: 1 }, 1, 255, bounds);
  assert.equal(p.x, 830);
  assert.equal(p.y, 1350);
});

test('player test actually imports motion core and uses discovered sprite width', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../player-test.html'), 'utf8');
  const js = fs.readFileSync(path.resolve(__dirname, '../player-test.js'), 'utf8');
  assert.match(html, /src="player-motion.js"/);
  assert.ok(html.indexOf('player-motion.js') < html.indexOf('player-test.js'));
  assert.match(js, /Motion\.spriteGrid\(atlas\.naturalWidth, atlas\.naturalHeight, 8, 4\)/);
  assert.match(js, /spriteGrid\.cellWidth/);
  assert.doesNotMatch(js, /const CELL\s*=\s*160/);
});
