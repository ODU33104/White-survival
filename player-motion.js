(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlayerMotion = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DIR_ROW = Object.freeze({ down: 0, right: 1, left: 2, up: 3 });
  const WALK_FRAMES = Object.freeze([0, 1, 2, 3]);

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function spriteGrid(width, height, columns = 8, rows = 4) {
    if (![width, height, columns, rows].every(Number.isFinite) ||
        !Number.isInteger(width) || !Number.isInteger(height) ||
        !Number.isInteger(columns) || !Number.isInteger(rows) ||
        width <= 0 || height <= 0 || columns <= 0 || rows <= 0 ||
        width % columns !== 0 || height % rows !== 0) {
      throw new Error('Invalid sprite grid: ' + width + 'x' + height +
        ' cannot be sliced as ' + columns + 'x' + rows);
    }
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    if (cellWidth < 32 || cellHeight < 32)
      throw new Error('Sprite cells are too small');
    return { columns, rows, cellWidth, cellHeight };
  }

  function joystick(dx, dy, deadZone = 11, fullSpeedDistance = 30) {
    const length = Math.hypot(dx, dy);
    if (length <= deadZone) return { x: 0, y: 0, strength: 0 };
    const strength = clamp((length - deadZone) / Math.max(1, fullSpeedDistance - deadZone), 0, 1);
    return { x: dx / length, y: dy / length, strength };
  }

  function compose(keys, joy) {
    const pressed = (name) => keys.has(name);
    let x = Number(pressed('d') || pressed('arrowright')) -
      Number(pressed('a') || pressed('arrowleft'));
    let y = Number(pressed('s') || pressed('arrowdown')) -
      Number(pressed('w') || pressed('arrowup'));
    const keyboard = Math.hypot(x, y) > 0;
    if (!keyboard && joy) {
      x = joy.x * joy.strength;
      y = joy.y * joy.strength;
    }
    const magnitude = Math.hypot(x, y);
    if (magnitude < 0.001) return { x: 0, y: 0, strength: 0 };
    return { x: x / magnitude, y: y / magnitude, strength: clamp(magnitude, 0, 1) };
  }

  function direction(x, y, previous = 'down') {
    if (Math.hypot(x, y) <= 0.001) return previous;
    if (Math.abs(x) >= Math.abs(y)) return x >= 0 ? 'right' : 'left';
    return y >= 0 ? 'down' : 'up';
  }

  function walkingFrame(distance, pixelsPerFrame = 26) {
    if (!Number.isFinite(distance) || distance <= 0) return 0;
    return WALK_FRAMES[Math.floor(distance / pixelsPerFrame) % WALK_FRAMES.length];
  }

  function advance(player, input, dt, speed, bounds) {
    const velocity = speed * input.strength;
    player.vx = input.x * velocity;
    player.vy = input.y * velocity;
    const oldX = player.x, oldY = player.y;
    player.x = clamp(player.x + player.vx * dt, bounds.minX, bounds.maxX);
    player.y = clamp(player.y + player.vy * dt, bounds.minY, bounds.maxY);
    const traveled = Math.hypot(player.x - oldX, player.y - oldY);
    player.stepDistance = traveled > 0.001 ? player.stepDistance + traveled : 0;
    return traveled;
  }

  function camera(current, target, dt, rate = 12) {
    return current + (target - current) * (1 - Math.exp(-rate * dt));
  }

  return Object.freeze({
    DIR_ROW, spriteGrid, joystick, compose, direction,
    walkingFrame, advance, camera, clamp
  });
});