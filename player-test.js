(() => {
  'use strict';

  const canvas = document.getElementById('testCanvas');
  const ctx = canvas.getContext('2d');
  const statusEl = document.getElementById('status');
  const debugEl = document.getElementById('debug');
  const resetBtn = document.getElementById('resetPos');
  const modeButtons = [...document.querySelectorAll('.mode')];

  const W = canvas.width;
  const H = canvas.height;
  const WORLD = { w: 900, h: 1450 };
  const CELL = 88;
  const ROW = { down: 0, right: 1, left: 2, up: 3 };

  const atlas = new Image();
  atlas.decoding = 'async';
  let atlasReady = false;
  let atlasError = false;

  const state = {
    mode: 'normal',
    player: {
      x: WORLD.w / 2,
      y: WORLD.h * 0.58,
      vx: 0,
      vy: 0,
      dir: 'down',
      frame: 0,
      animClock: 0
    },
    camera: { x: 0, y: 0 },
    input: {
      keys: new Set(),
      joy: { active: false, id: null, cx: 0, cy: 0, x: 0, y: 0 }
    },
    last: performance.now()
  };

  atlas.onload = () => {
    atlasReady = true;
    statusEl.textContent = '透過スプライト読み込み OK';
    statusEl.classList.remove('error');
  };

  atlas.onerror = () => {
    atlasError = true;
    statusEl.textContent = 'スプライト読み込み失敗';
    statusEl.classList.add('error');
  };

  atlas.src = 'assets/player/atlas.webp?v=1';

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function setMode(mode) {
    state.mode = mode;
    state.player.animClock = 0;
    state.player.frame = 0;
    modeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
  }

  function resetPosition() {
    state.player.x = WORLD.w / 2;
    state.player.y = WORLD.h * 0.58;
    state.player.vx = 0;
    state.player.vy = 0;
    state.camera.x = clamp(state.player.x - W / 2, 0, WORLD.w - W);
    state.camera.y = clamp(state.player.y - H * 0.58, 0, WORLD.h - H);
  }

  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });
  resetBtn.addEventListener('click', resetPosition);

  window.addEventListener('keydown', e => {
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','w','a','s','d','W','A','S','D'].includes(e.key)) {
      e.preventDefault();
      state.input.keys.add(e.key.toLowerCase());
    }
  }, { passive: false });

  window.addEventListener('keyup', e => {
    state.input.keys.delete(e.key.toLowerCase());
  });

  function pointerPos(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width * W,
      y: (e.clientY - r.top) / r.height * H
    };
  }

  canvas.addEventListener('pointerdown', e => {
    const p = pointerPos(e);
    const j = state.input.joy;
    j.active = true;
    j.id = e.pointerId;
    j.cx = p.x;
    j.cy = p.y;
    j.x = 0;
    j.y = 0;
    try { canvas.setPointerCapture(e.pointerId); } catch {}
  });

  canvas.addEventListener('pointermove', e => {
    const j = state.input.joy;
    if (!j.active || e.pointerId !== j.id) return;

    const p = pointerPos(e);
    let dx = p.x - j.cx;
    let dy = p.y - j.cy;
    const radius = 66;
    const len = Math.hypot(dx, dy);

    if (len > radius) {
      dx = dx / len * radius;
      dy = dy / len * radius;
    }

    let nx = dx / radius;
    let ny = dy / radius;
    const dead = 0.11;
    const m = Math.hypot(nx, ny);

    if (m < dead) {
      nx = 0;
      ny = 0;
    } else {
      const scaled = (m - dead) / (1 - dead);
      nx = nx / m * scaled;
      ny = ny / m * scaled;
    }

    j.x = nx;
    j.y = ny;
  });

  function releasePointer(e) {
    const j = state.input.joy;
    if (e.pointerId !== j.id) return;
    j.active = false;
    j.id = null;
    j.x = 0;
    j.y = 0;
  }

  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);

  function getInput() {
    let x = 0;
    let y = 0;
    const keys = state.input.keys;

    if (keys.has('a') || keys.has('arrowleft')) x -= 1;
    if (keys.has('d') || keys.has('arrowright')) x += 1;
    if (keys.has('w') || keys.has('arrowup')) y -= 1;
    if (keys.has('s') || keys.has('arrowdown')) y += 1;

    x += state.input.joy.x;
    y += state.input.joy.y;

    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }

    return { x, y, mag: Math.min(1, m) };
  }

  function chooseDirection(x, y) {
    if (Math.abs(x) < 0.05 && Math.abs(y) < 0.05) return;
    if (Math.abs(x) > Math.abs(y)) {
      state.player.dir = x > 0 ? 'right' : 'left';
    } else {
      state.player.dir = y > 0 ? 'down' : 'up';
    }
  }

  function update(dt) {
    const p = state.player;
    const input = getInput();
    chooseDirection(input.x, input.y);

    const chopping = state.mode === 'chop';
    const targetSpeed = chopping ? 0 : 270;
    const targetVx = input.x * targetSpeed;
    const targetVy = input.y * targetSpeed;

    const accel = 1 - Math.exp(-13 * dt);
    const brake = 1 - Math.exp(-17 * dt);

    p.vx = lerp(p.vx, targetVx, input.mag > 0.01 ? accel : brake);
    p.vy = lerp(p.vy, targetVy, input.mag > 0.01 ? accel : brake);

    if (Math.abs(p.vx) < 0.25) p.vx = 0;
    if (Math.abs(p.vy) < 0.25) p.vy = 0;

    p.x = clamp(p.x + p.vx * dt, 70, WORLD.w - 70);
    p.y = clamp(p.y + p.vy * dt, 130, WORLD.h - 100);

    const moving = Math.hypot(p.vx, p.vy) > 12;

    if (state.mode === 'normal') {
      if (moving) {
        p.animClock += dt;
        const frames = [1, 2, 3, 2];
        p.frame = frames[Math.floor(p.animClock / 0.115) % frames.length];
      } else {
        p.animClock = 0;
        p.frame = 0;
      }
    } else if (state.mode === 'carry') {
      p.animClock += dt;
      p.frame = moving ? 4 + (Math.floor(p.animClock / 0.16) % 2) : 4;
    } else {
      p.animClock += dt;
      p.frame = 6 + (Math.floor(p.animClock / 0.135) % 2);
    }

    const targetCamX = clamp(p.x - W / 2, 0, WORLD.w - W);
    const targetCamY = clamp(p.y - H * 0.58, 0, WORLD.h - H);
    const camEase = 1 - Math.exp(-8 * dt);
    state.camera.x = lerp(state.camera.x, targetCamX, camEase);
    state.camera.y = lerp(state.camera.y, targetCamY, camEase);

    debugEl.textContent =
      'dir ' + p.dir +
      '  mode ' + state.mode +
      '  frame ' + p.frame +
      '  speed ' + Math.round(Math.hypot(p.vx, p.vy)) +
      '  asset ' + (atlasReady ? 'READY' : atlasError ? 'ERROR' : 'LOAD');
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function drawWorld() {
    ctx.fillStyle = '#d9eef5';
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);

    ctx.fillStyle = '#f7fbfc';
    for (let y = 80; y < WORLD.h; y += 110) {
      for (let x = 70; x < WORLD.w; x += 125) {
        const ox = ((Math.floor(y / 110) & 1) ? 48 : 0);
        ctx.beginPath();
        ctx.ellipse(x + ox, y, 32, 11, -0.08, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.strokeStyle = 'rgba(54,98,118,.18)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 14]);
    roundRect(120, 230, WORLD.w - 240, WORLD.h - 430, 46);
    ctx.stroke();
    ctx.setLineDash([]);

    const markers = [
      [180, 340, 'UP'],
      [WORLD.w - 180, 340, 'RIGHT'],
      [180, WORLD.h - 260, 'LEFT'],
      [WORLD.w - 180, WORLD.h - 260, 'DOWN']
    ];

    for (const [x, y, label] of markers) {
      ctx.fillStyle = 'rgba(79,126,148,.14)';
      ctx.beginPath();
      ctx.arc(x, y, 54, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#668ea0';
      ctx.font = '800 12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, y + 4);
    }
  }

  function drawPlayer() {
    const p = state.player;
    const row = ROW[p.dir];
    const col = p.frame;

    ctx.save();
    ctx.translate(p.x, p.y);

    ctx.fillStyle = 'rgba(30,62,76,.16)';
    ctx.beginPath();
    ctx.ellipse(0, 42, 44, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    if (atlasReady) {
      const size = state.mode === 'carry' ? 184 : 174;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(
        atlas,
        col * CELL, row * CELL, CELL, CELL,
        -size / 2, -size * 0.72, size, size
      );
    } else {
      ctx.fillStyle = '#7d2323';
      roundRect(-66, -92, 132, 92, 18);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '900 14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('ASSET ERROR', 0, -40);
    }

    ctx.restore();
  }

  function drawJoystick() {
    const j = state.input.joy;
    if (!j.active) return;

    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = '#173b4c';
    ctx.beginPath();
    ctx.arc(j.cx, j.cy, 66, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.54;
    ctx.beginPath();
    ctx.arc(j.cx + j.x * 43, j.cy + j.y * 43, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(-state.camera.x, -state.camera.y);
    drawWorld();
    drawPlayer();
    ctx.restore();
    drawJoystick();
  }

  function loop(now) {
    const dt = Math.min(0.033, (now - state.last) / 1000);
    state.last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  resetPosition();
  requestAnimationFrame(loop);
})();