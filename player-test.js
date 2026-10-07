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
  const Motion = window.PlayerMotion;
  if (!Motion) throw new Error('player-motion.js failed to load');
  let spriteGrid = null;
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
      animClock: 0,
      stepDistance: 0
    },
    camera: { x: 0, y: 0 },
    input: {
      keys: new Set(),
      joy: { active: false, id: null, cx: 0, cy: 0, x: 0, y: 0, strength: 0 }
    },
    last: performance.now()
  };

  atlas.onload = () => {
    try {
      // Never hand-code a frame dimension: the actual original atlas is 704 x 352.
      spriteGrid = Motion.spriteGrid(atlas.naturalWidth, atlas.naturalHeight, 8, 4);
      atlasReady = true;
      atlasError = false;
      statusEl.textContent = '素材OK ' + atlas.naturalWidth + '×' + atlas.naturalHeight +
        ' / コマ ' + spriteGrid.cellWidth + '×' + spriteGrid.cellHeight;
      statusEl.classList.remove('error');
    } catch (error) {
      atlasReady = false;
      atlasError = true;
      statusEl.textContent = '素材のコマ分割に失敗: ' + error.message;
      statusEl.classList.add('error');
    }
  };

  atlas.onerror = () => {
    atlasError = true;
    statusEl.textContent = 'スプライト読み込み失敗';
    statusEl.classList.add('error');
  };

  atlas.src = 'assets/player/atlas.webp?v=4';

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
    state.player.stepDistance = 0;
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
    j.strength = 0;
    try { canvas.setPointerCapture(e.pointerId); } catch {}
  });

  canvas.addEventListener('pointermove', e => {
    const j = state.input.joy;
    if (!j.active || e.pointerId !== j.id) return;
    e.preventDefault();
    const p = pointerPos(e);
    let dx = p.x - j.cx;
    let dy = p.y - j.cy;
    const length = Math.hypot(dx, dy);
    // When a finger drifts far away, move the base with it.
    // Direction remains stable even when the thumb reaches the screen edge.
    const maxTravel = 85;
    if (length > maxTravel) {
      const overflow = length - maxTravel;
      j.cx += dx / length * overflow;
      j.cy += dy / length * overflow;
      dx = p.x - j.cx;
      dy = p.y - j.cy;
    }
    const value = Motion.joystick(dx, dy, 10, 28);
    j.x = value.x;
    j.y = value.y;
    j.strength = value.strength;
  }, { passive: false });

  function releasePointer(e) {
    const j = state.input.joy;
    if (e.pointerId !== j.id) return;
    j.active = false;
    j.id = null;
    j.x = 0;
    j.y = 0;
    j.strength = 0;
  }

  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);

  function getInput() {
    return Motion.compose(state.input.keys, state.input.joy);
  }

  function chooseDirection(x, y) {
    state.player.dir = Motion.direction(x, y, state.player.dir);
  }

  function update(dt) {
    const p = state.player;
    const input = getInput();
    chooseDirection(input.x, input.y);

    const chopping = state.mode === 'chop';
    const movement = chopping ? { x: 0, y: 0, strength: 0 } : input;
    const distance = Motion.advance(
      p, movement, dt, 255,
      { minX: 70, maxX: WORLD.w - 70, minY: 130, maxY: WORLD.h - 100 }
    );
    const moving = distance > 0.001;

    if (state.mode === 'normal') {
      p.frame = moving ? Motion.walkingFrame(p.stepDistance, 27) : 0;
    } else if (state.mode === 'carry') {
      p.frame = moving ? 4 + (Math.floor(p.stepDistance / 33) % 2) : 4;
    } else {
      p.animClock += dt;
      p.frame = 6 + (Math.floor(p.animClock / 0.18) % 2);
    }

    const tx = clamp(p.x - W / 2, 0, WORLD.w - W);
    const ty = clamp(p.y - H * 0.58, 0, WORLD.h - H);
    state.camera.x = Motion.camera(state.camera.x, tx, dt, 14);
    state.camera.y = Motion.camera(state.camera.y, ty, dt, 14);

    debugEl.textContent =
      '向き ' + p.dir + '　動作 ' + state.mode +
      '　コマ ' + p.frame + '/7' +
      '　速度 ' + Math.round(Math.hypot(p.vx, p.vy)) +
      '　素材 ' + (atlasReady ? 'OK' : atlasError ? 'ERROR' : 'LOAD');
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
      const size = state.mode === 'carry' ? 198 : 190;
      const bob = Math.hypot(p.vx, p.vy) > 1 && state.mode !== 'chop'
        ? Math.abs(Math.sin(p.stepDistance * Math.PI / 54)) * 3 : 0;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(
        atlas,
        col * spriteGrid.cellWidth, row * spriteGrid.cellHeight,
        spriteGrid.cellWidth, spriteGrid.cellHeight,
        -size / 2, -size * 0.72 - bob, size, size
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
    ctx.arc(j.cx, j.cy, 52, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.54;
    ctx.beginPath();
    ctx.arc(j.cx + j.x * j.strength * 34, j.cy + j.y * j.strength * 34, 23, 0, Math.PI * 2);
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