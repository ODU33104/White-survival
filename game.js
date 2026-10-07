(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = 540;
  const H = 960;
  const WORLD = { w: 860, h: 1440 };

  const $ = (id) => document.getElementById(id);
  const ui = {
    hud: $('hud'),
    title: $('titleScreen'),
    stages: $('stageScreen'),
    upgrades: $('upgradeScreen'),
    pause: $('pauseScreen'),
    complete: $('completeScreen'),
    stageGrid: $('stageGrid'),
    upgradeList: $('upgradeList'),
    stageTitle: $('stageTitle'),
    objective: $('objective'),
    coinHud: $('coinHud'),
    carryHud: $('carryHud'),
    goalBar: $('goalBar'),
    coinMenu: $('coinMenu'),
    coinUpgrade: $('coinUpgrade'),
    clearTitle: $('clearTitle'),
    resultText: $('resultText'),
    stars: $('stars'),
    toast: $('toast')
  };

  const SAVE_KEY = 'frostline_stage1_proto_v1';
  const DEFAULT_SAVE = {
    coins: 0,
    speedLv: 0,
    bagLv: 0,
    best: null,
    cleared: false
  };

  let save = loadSave();

  const Motion = window.PlayerMotion;
  if (!Motion) throw new Error('player-motion.js is missing');
  const playerAtlas = new Image();
  let atlasReady = false;
  let atlasGrid = null;
  playerAtlas.onload = () => {
    try {
      atlasGrid = Motion.spriteGrid(playerAtlas.naturalWidth, playerAtlas.naturalHeight, 8, 4);
      atlasReady = true;
    } catch (err) {
      toast('スプライトの形式が不正です');
      console.error(err);
    }
  };
  playerAtlas.onerror = () => {
    toast('キャラ画像を読み込めません');
  };
  playerAtlas.src = 'assets/player/atlas.webp?v=4';

  const state = {
    screen: 'title',
    playing: false,
    paused: false,
    finished: false,
    last: performance.now(),
    elapsed: 0,
    player: null,
    furnace: null,
    trees: [],
    particles: [],
    floaters: [],
    camera: { x: 0, y: 0 },
    shake: 0,
    nextDeposit: 0,
    fullBagToast: 0,
    input: {
      keys: new Set(),
      joy: { active: false, id: null, cx: 100, cy: 800, x: 0, y: 0, strength: 0 }
    }
  };

  function loadSave() {
    try {
      return { ...DEFAULT_SAVE, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') };
    } catch {
      return { ...DEFAULT_SAVE };
    }
  }

  function persist() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    refreshMenus();
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function showOnly(el) {
    [ui.title, ui.stages, ui.upgrades, ui.pause, ui.complete].forEach(x => x.classList.add('hidden'));
    if (el) el.classList.remove('hidden');
  }

  function toast(msg, ms = 1200) {
    ui.toast.textContent = msg;
    ui.toast.classList.remove('hidden');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => ui.toast.classList.add('hidden'), ms);
  }

  function stats() {
    return {
      speed: 245 * (1 + save.speedLv * 0.08),
      capacity: 8 + save.bagLv * 2
    };
  }

  function refreshMenus() {
    ui.coinMenu.textContent = save.coins;
    ui.coinUpgrade.textContent = save.coins;
    ui.stageGrid.innerHTML = '';

    const cards = [
      ['01', '火を絶やすな', '伐採 → 運搬 → 暖炉', 'HEAT', false],
      ['02', '氷上の食卓', '釣り → 加工 → 給食', 'FOOD', true],
      ['03', '雪を越えて', '除雪 → 建築', 'BUILD', true],
      ['04', '凍土の工場', '加工 → 販売', 'LINE', true],
      ['05', '白夜の襲撃', '防壁 → 戦闘', 'DEF', true],
      ['06', '最後の集落', '総合ステージ', 'CITY', true]
    ];

    cards.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'stage-card' + (c[4] ? ' locked' : '');
      b.disabled = c[4];
      b.innerHTML =
        '<div class="num">STAGE ' + c[0] + '</div>' +
        '<h3>' + c[1] + '</h3>' +
        '<p>' + c[2] + '</p>' +
        '<div class="best">' + (i === 0 && save.best ? 'BEST ' + save.best.toFixed(1) + 's' : (c[4] ? '準備中' : 'PLAY')) + '</div>' +
        '<div class="badge">' + c[3] + '</div>';
      if (!c[4]) b.onclick = startStage;
      ui.stageGrid.appendChild(b);
    });

    ui.upgradeList.innerHTML = '';
    const defs = [
      {
        title: 'SPD　移動速度',
        desc: '移動速度 +8%',
        lv: save.speedLv,
        cost: 30 + save.speedLv * 25,
        buy() { save.coins -= this.cost; save.speedLv++; persist(); renderUpgrade(); }
      },
      {
        title: 'BAG　運搬容量',
        desc: '最大所持数 +2',
        lv: save.bagLv,
        cost: 35 + save.bagLv * 30,
        buy() { save.coins -= this.cost; save.bagLv++; persist(); renderUpgrade(); }
      }
    ];

    defs.forEach(def => {
      const row = document.createElement('div');
      row.className = 'upgrade-row';
      row.innerHTML = '<div><h3>' + def.title + '　Lv.' + def.lv + '</h3><p>' + def.desc + '</p></div>';
      const btn = document.createElement('button');
      btn.textContent = '● ' + def.cost;
      btn.disabled = save.coins < def.cost || def.lv >= 6;
      btn.onclick = () => def.buy();
      row.appendChild(btn);
      ui.upgradeList.appendChild(row);
    });
  }

  function renderUpgrade() {
    refreshMenus();
  }

  function startStage() {
    showOnly(null);
    ui.hud.classList.remove('hidden');
    state.screen = 'game';
    state.playing = true;
    state.paused = false;
    state.finished = false;
    state.elapsed = 0;
    state.last = performance.now();
    state.particles.length = 0;
    state.floaters.length = 0;
    state.shake = 0;

    state.player = {
      x: 430,
      y: 760,
      dir: 'down',
      moving: false,
      frame: 0,
      anim: 0,
      stepDistance: 0,
      logs: 0,
      workCd: 0,
      action: 'idle'
    };

    state.furnace = {
      x: 430,
      y: 520,
      heat: 0,
      pulse: 0,
      glow: 0
    };

    state.trees = [
      tree(200, 690, 0),
      tree(665, 690, 1),
      tree(170, 930, 2),
      tree(690, 960, 3),
      tree(245, 1160, 4),
      tree(620, 1185, 5),
      tree(125, 430, 6),
      tree(735, 420, 7)
    ];

    state.camera.x = state.player.x - W / 2;
    state.camera.y = state.player.y - H * 0.58;

    ui.stageTitle.textContent = 'STAGE 1 — 火を絶やすな';
    ui.objective.textContent = '木を切り、薪を暖炉へ運ぶ';
    updateHud();
    toast('画面をドラッグして移動');
  }

  function tree(x, y, seed) {
    return {
      x, y,
      hp: 4,
      maxHp: 4,
      alive: true,
      respawn: 0,
      shake: 0,
      seed
    };
  }

  function update(dt) {
    if (!state.playing || state.paused || state.finished) return;

    state.elapsed += dt;
    state.fullBagToast -= dt;
    state.nextDeposit -= dt;

    const p = state.player;
    const st = stats();
    const input = Motion.compose(state.input.keys, state.input.joy);
    p.moving = input.strength > 0.05;
    if (p.moving) p.dir = Motion.direction(input.x, input.y, p.dir);

    let nearbyTree = null;
    let nearest = Infinity;
    for (const t of state.trees) {
      if (!t.alive) {
        t.respawn -= dt;
        if (t.respawn <= 0) {
          t.alive = true;
          t.hp = t.maxHp;
        }
        continue;
      }
      t.shake = Math.max(0, t.shake - dt * 8);
      const d = dist(p, t);
      if (d < 78 && d < nearest) {
        nearbyTree = t;
        nearest = d;
      }
    }

    const atFurnace = dist(p, state.furnace) < 92;

    if (nearbyTree && p.logs < st.capacity) {
      p.action = p.moving ? 'walk' : 'chop';
      if (!p.moving) faceToward(p, nearbyTree);
      p.workCd -= dt;
      if (p.workCd <= 0) {
        p.workCd = 0.30;
        nearbyTree.hp -= 1;
        nearbyTree.shake = 1;
        state.shake = 4;
        burst(nearbyTree.x, nearbyTree.y - 35, 7, '#e7c08d');
        popText(nearbyTree.x, nearbyTree.y - 85, 'CHOP');
        if (nearbyTree.hp <= 0) {
          nearbyTree.alive = false;
          nearbyTree.respawn = 4.8;
          p.logs = Math.min(st.capacity, p.logs + 3);
          burst(nearbyTree.x, nearbyTree.y - 10, 16, '#c99258');
          popText(nearbyTree.x, nearbyTree.y - 90, '+3');
          vibrate(22);
        }
      }
    } else {
      p.action = p.moving ? 'walk' : 'idle';
      p.workCd = Math.min(p.workCd, 0.12);
    }

    Motion.advance(p, input, dt, st.speed, {
      minX: 55, maxX: WORLD.w - 55,
      minY: 120, maxY: WORLD.h - 70
    });
    p.frame = p.moving ? Motion.walkingFrame(p.stepDistance, 27) : 0;

    if (atFurnace && p.logs > 0 && state.nextDeposit <= 0) {
      state.nextDeposit = 0.075;
      p.logs--;
      state.furnace.heat = Math.min(100, state.furnace.heat + 5);
      state.furnace.pulse = 1;
      state.furnace.glow = 1;
      state.shake = 2.5;
      spawnFlyingLog(p.x, p.y - 25, state.furnace.x, state.furnace.y);
      if (state.furnace.heat >= 100) finishStage();
    }

    if (p.logs >= st.capacity && state.fullBagToast <= 0) {
      state.fullBagToast = 2.5;
      toast('荷物がいっぱい。暖炉へ戻ろう');
    }

    state.furnace.pulse = Math.max(0, state.furnace.pulse - dt * 4);
    state.furnace.glow = Math.max(0, state.furnace.glow - dt * 1.7);

    updateEffects(dt);
    updateCamera(dt);
    updateHud();
  }

  function faceToward(p, target) {
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    if (Math.abs(dx) > Math.abs(dy)) p.dir = dx > 0 ? 'right' : 'left';
    else p.dir = dy > 0 ? 'down' : 'up';
  }

  function updateCamera(dt) {
    const targetX = state.player.x - W / 2;
    const targetY = state.player.y - H * 0.58;
    const maxX = WORLD.w - W;
    const maxY = WORLD.h - H;
    const k = 1 - Math.pow(0.001, dt);
    state.camera.x = lerp(state.camera.x, clamp(targetX, 0, maxX), k);
    state.camera.y = lerp(state.camera.y, clamp(targetY, 0, maxY), k);
    state.shake = Math.max(0, state.shake - dt * 22);
  }

  function burst(x, y, count, color) {
    for (let i = 0; i < count; i++) {
      state.particles.push({
        x, y,
        vx: rand(-85, 85),
        vy: rand(-130, -35),
        life: rand(0.35, 0.7),
        color,
        r: rand(2, 5)
      });
    }
  }

  function popText(x, y, text) {
    state.floaters.push({ x, y, text, life: 0.8 });
  }

  function spawnFlyingLog(x, y, tx, ty) {
    state.particles.push({
      kind: 'log',
      x, y,
      sx: x, sy: y,
      tx, ty,
      life: 0.26,
      maxLife: 0.26
    });
  }

  function updateEffects(dt) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const q = state.particles[i];
      q.life -= dt;
      if (q.kind === 'log') {
        const t = 1 - clamp(q.life / q.maxLife, 0, 1);
        const e = 1 - Math.pow(1 - t, 3);
        q.x = lerp(q.sx, q.tx, e);
        q.y = lerp(q.sy, q.ty, e) - Math.sin(t * Math.PI) * 70;
      } else {
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.vy += 260 * dt;
      }
      if (q.life <= 0) state.particles.splice(i, 1);
    }

    for (let i = state.floaters.length - 1; i >= 0; i--) {
      const f = state.floaters[i];
      f.life -= dt;
      f.y -= 35 * dt;
      if (f.life <= 0) state.floaters.splice(i, 1);
    }
  }

  function updateHud() {
    const st = stats();
    ui.coinHud.textContent = save.coins;
    ui.carryHud.textContent = state.player ? state.player.logs + '/' + st.capacity : '0/' + st.capacity;
    ui.goalBar.style.width = (state.furnace ? state.furnace.heat : 0) + '%';
    if (state.furnace) {
      ui.objective.textContent = '薪を暖炉へ運ぶ　熱量 ' + state.furnace.heat + '%';
    }
  }

  function finishStage() {
    if (state.finished) return;
    state.finished = true;
    state.playing = false;
    const time = state.elapsed;
    const stars = time < 45 ? 3 : time < 70 ? 2 : 1;
    const reward = 25 + stars * 10;
    save.coins += reward;
    save.best = save.best ? Math.min(save.best, time) : time;
    save.cleared = true;
    persist();

    ui.stars.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    ui.clearTitle.textContent = '火を絶やすな クリア！';
    ui.resultText.innerHTML = 'タイム <strong>' + time.toFixed(1) + '秒</strong><br>報酬 <strong>● ' + reward + '</strong>';
    ui.complete.classList.remove('hidden');
    vibrate(60);
  }

  function draw() {
    const s = state.shake;
    const sx = s ? rand(-s, s) : 0;
    const sy = s ? rand(-s * 0.5, s * 0.5) : 0;

    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.translate(sx, sy);

    drawBackground();

    if (state.screen === 'game' && state.player) {
      ctx.save();
      ctx.translate(-state.camera.x, -state.camera.y);

      drawCamp();
      drawFurnace();
      drawTrees();
      drawEffectsBelow();
      drawPlayer();
      drawEffectsAbove();

      ctx.restore();
      drawJoystick();
      drawHint();
    }

    ctx.restore();
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#d9eff7');
    g.addColorStop(1, '#edf8fb');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawCamp() {
    ctx.fillStyle = '#d8edf3';
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);

    const snow = '#f5fbfd';
    ctx.fillStyle = snow;
    for (let y = 120; y < WORLD.h; y += 115) {
      for (let x = 70; x < WORLD.w; x += 135) {
        const ox = ((y / 115) % 2) * 45;
        ctx.beginPath();
        ctx.ellipse(x + ox, y, 42, 16, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.fillStyle = '#b4d7e2';
    roundRect(285, 370, 290, 265, 34);
    ctx.fill();

    ctx.strokeStyle = '#96b8c3';
    ctx.lineWidth = 12;
    ctx.setLineDash([34, 15]);
    roundRect(250, 330, 360, 350, 38);
    ctx.stroke();
    ctx.setLineDash([]);

    drawTent(320, 420);
    drawTent(535, 420);

    ctx.fillStyle = '#809da8';
    ctx.font = '800 15px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('HEAT CAMP', 430, 356);
  }

  function drawTent(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#7e96a0';
    ctx.beginPath();
    ctx.moveTo(-48, 36);
    ctx.lineTo(0, -28);
    ctx.lineTo(48, 36);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ec7e45';
    ctx.beginPath();
    ctx.moveTo(-36, 35);
    ctx.lineTo(0, -18);
    ctx.lineTo(36, 35);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawFurnace() {
    const f = state.furnace;
    const pulse = f.pulse > 0 ? 1 + f.pulse * 0.06 : 1;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.scale(pulse, pulse);

    const glow = 35 + f.heat * 0.7;
    const grd = ctx.createRadialGradient(0, 5, 6, 0, 5, glow);
    grd.addColorStop(0, 'rgba(255,178,61,.5)');
    grd.addColorStop(1, 'rgba(255,178,61,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(0, 5, glow, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#344b56';
    roundRect(-55, -52, 110, 102, 20);
    ctx.fill();
    ctx.fillStyle = '#263a43';
    roundRect(-39, -32, 78, 68, 16);
    ctx.fill();

    const flame = 25 + f.heat * 0.23;
    ctx.fillStyle = '#ffb02e';
    ctx.beginPath();
    ctx.moveTo(0, 25);
    ctx.bezierCurveTo(-25, 4, -16, -18, -3, -flame);
    ctx.bezierCurveTo(12, -15, 30, 5, 0, 25);
    ctx.fill();

    ctx.fillStyle = '#ff6b2e';
    ctx.beginPath();
    ctx.moveTo(0, 24);
    ctx.bezierCurveTo(-13, 7, -7, -6, 2, -flame * 0.55);
    ctx.bezierCurveTo(13, -3, 14, 10, 0, 24);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = '900 15px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(f.heat + '%', 0, 77);
    ctx.restore();
  }

  function drawTrees() {
    for (const t of state.trees) {
      if (!t.alive) {
        drawStump(t.x, t.y);
        continue;
      }
      const sh = t.shake ? Math.sin(performance.now() * 0.07) * 6 * t.shake : 0;
      ctx.save();
      ctx.translate(t.x + sh, t.y);

      ctx.fillStyle = 'rgba(46,75,86,.16)';
      ctx.beginPath();
      ctx.ellipse(0, 30, 50, 18, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#77513a';
      roundRect(-12, -5, 24, 70, 8);
      ctx.fill();

      ctx.fillStyle = '#1c6a64';
      circle(0, -62, 56);
      circle(-35, -23, 42);
      circle(35, -22, 43);
      circle(0, -17, 48);

      ctx.fillStyle = 'rgba(255,255,255,.86)';
      ctx.beginPath();
      ctx.ellipse(-12, -85, 30, 10, -0.2, 0, Math.PI * 2);
      ctx.fill();

      if (t.hp < t.maxHp) {
        ctx.fillStyle = 'rgba(14,41,54,.18)';
        roundRect(-42, -136, 84, 8, 5);
        ctx.fill();
        ctx.fillStyle = '#ff8b42';
        roundRect(-42, -136, 84 * (t.hp / t.maxHp), 8, 5);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawStump(x, y) {
    ctx.save();
    ctx.translate(x, y + 28);
    ctx.fillStyle = '#855c3a';
    roundRect(-19, -2, 38, 28, 8);
    ctx.fill();
    ctx.fillStyle = '#c68d57';
    ctx.beginPath();
    ctx.ellipse(0, -2, 19, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer() {
    const p = state.player;
    const row = Motion.DIR_ROW[p.dir] ?? 0;
    const isChopping = p.action === 'chop';
    const carrying = p.logs > 0;
    const col = isChopping ? 6 + (Math.floor(state.elapsed / 0.18) % 2)
      : carrying ? (p.moving ? 4 + (Math.floor(p.stepDistance / 33) % 2) : 4)
      : p.frame;
    const size = carrying ? 178 : 168;

    if (p.logs > 6) drawLogStack(p);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(25,55,65,.18)';
    ctx.beginPath();
    ctx.ellipse(0, 32, 36, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    if (atlasReady && atlasGrid) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(
        playerAtlas,
        col * atlasGrid.cellWidth, row * atlasGrid.cellHeight,
        atlasGrid.cellWidth, atlasGrid.cellHeight,
        -size / 2, -size * 0.72, size, size
      );
    } else {
      ctx.fillStyle = '#8c2b30';
      roundRect(-49, -83, 98, 76, 13);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('素材未読込', 0, -40);
    }
    ctx.restore();
  }

  function drawVectorPlayer(p) {
    const walking = p.moving ? Math.sin(state.elapsed * 16) : 0;
    const bob = p.moving ? Math.abs(Math.sin(state.elapsed * 16)) * 3 : 0;
    const chopPhase = p.action === 'chop' ? (Math.sin(state.elapsed * 18) * 0.5 + 0.5) : 0;

    ctx.save();
    ctx.translate(0, -bob);

    let sx = 1;
    if (p.dir === 'left') sx = -1;
    ctx.scale(sx, 1);

    const side = p.dir === 'left' || p.dir === 'right';
    const back = p.dir === 'up';

    if (back || side) {
      ctx.fillStyle = '#6b4933';
      roundRect(side ? -24 : -28, -66, side ? 34 : 56, 58, 10);
      ctx.fill();
      ctx.fillStyle = '#916542';
      roundRect(side ? -21 : -23, -61, side ? 27 : 46, 48, 8);
      ctx.fill();
      ctx.strokeStyle = '#c09365';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(side ? -12 : -14, -58);
      ctx.lineTo(side ? -10 : -12, -20);
      ctx.moveTo(side ? 2 : 14, -58);
      ctx.lineTo(side ? 2 : 12, -20);
      ctx.stroke();
    }

    const legSwing = walking * 7;
    ctx.fillStyle = '#252b31';
    roundRect(-21 + (side ? legSwing * .25 : legSwing), -12, 17, 35, 8);
    ctx.fill();
    roundRect(5 - (side ? legSwing * .25 : legSwing), -12, 17, 35, 8);
    ctx.fill();

    ctx.fillStyle = '#5a3b2c';
    roundRect(-24 + (side ? legSwing * .25 : legSwing), 12, 21, 17, 7);
    ctx.fill();
    roundRect(4 - (side ? legSwing * .25 : legSwing), 12, 21, 17, 7);
    ctx.fill();
    ctx.fillStyle = '#eee7dc';
    ctx.fillRect(-21 + (side ? legSwing * .25 : legSwing), 7, 16, 6);
    ctx.fillRect(7 - (side ? legSwing * .25 : legSwing), 7, 16, 6);

    ctx.fillStyle = '#f07a2f';
    roundRect(-31, -61, 62, 59, 18);
    ctx.fill();
    ctx.fillStyle = '#d95f22';
    ctx.fillRect(-31, -34, 62, 6);

    if (!back) {
      ctx.fillStyle = '#2a2320';
      ctx.beginPath();
      ctx.arc(side ? 7 : 0, -69, 22, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f0c08f';
      ctx.beginPath();
      ctx.arc(side ? 10 : 0, -69, 13, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#232b31';
      roundRect(side ? 3 : -14, -64, side ? 23 : 28, 14, 7);
      ctx.fill();

      ctx.fillStyle = '#1f252a';
      if (side) {
        circle(14, -72, 2.5);
      } else {
        circle(-5, -72, 2.5);
        circle(5, -72, 2.5);
      }
    }

    ctx.strokeStyle = '#fff5e8';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(0, -64, 27, Math.PI * .1, Math.PI * .9, true);
    ctx.stroke();

    ctx.fillStyle = '#f07a2f';
    ctx.beginPath();
    ctx.arc(0, -70, 27, Math.PI, Math.PI * 2);
    ctx.lineTo(24, -61);
    ctx.lineTo(-24, -61);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#fff5e8';
    roundRect(-25, -63, 50, 9, 5);
    ctx.fill();

    ctx.fillStyle = '#2b2d31';
    const armSwing = p.moving ? walking * 7 : 0;
    if (p.action === 'chop') {
      ctx.save();
      ctx.translate(22, -35);
      ctx.rotate(-1.25 + chopPhase * 2.25);
      roundRect(-5, -8, 12, 37, 6);
      ctx.fill();
      ctx.fillStyle = '#7d5130';
      roundRect(1, -45, 7, 48, 4);
      ctx.fill();
      ctx.fillStyle = '#b7c3ca';
      ctx.beginPath();
      ctx.moveTo(-8, -50);
      ctx.lineTo(13, -55);
      ctx.lineTo(18, -40);
      ctx.lineTo(-4, -36);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#2b2d31';
      roundRect(-29, -44, 14, 34, 7);
      ctx.fill();
    } else {
      roundRect(-33, -46 + armSwing * .2, 14, 35, 7);
      ctx.fill();
      roundRect(19, -46 - armSwing * .2, 14, 35, 7);
      ctx.fill();

      ctx.fillStyle = '#7d5130';
      ctx.save();
      ctx.translate(30, -26);
      ctx.rotate(.35);
      roundRect(-3, -2, 7, 38, 4);
      ctx.fill();
      ctx.fillStyle = '#b7c3ca';
      ctx.beginPath();
      ctx.moveTo(-11, 30);
      ctx.lineTo(10, 27);
      ctx.lineTo(13, 42);
      ctx.lineTo(-8, 45);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = '#6b4933';
    roundRect(-21, -41, 42, 8, 4);
    ctx.fill();
    ctx.fillStyle = '#b68a55';
    roundRect(-5, -42, 10, 10, 3);
    ctx.fill();

    ctx.restore();
  }

  function drawLogStack(p) {
    if (!p.logs) return;
    const count = Math.min(p.logs, 10);
    const behind = p.dir === 'down' ? -28 : p.dir === 'up' ? 22 : 0;
    ctx.save();
    ctx.translate(p.x + (p.dir === 'left' ? 28 : p.dir === 'right' ? -28 : 0), p.y + behind);
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / 3);
      const col = i % 3;
      const x = (col - 1) * 14;
      const y = -54 - row * 13 + Math.sin(state.elapsed * 8 + i) * 1.5;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((col - 1) * 0.07);
      ctx.fillStyle = '#8c5633';
      roundRect(-17, -6, 34, 12, 6);
      ctx.fill();
      ctx.fillStyle = '#c78950';
      ctx.beginPath();
      ctx.arc(-14, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawAxeArc(row) {
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (row === 0) ctx.arc(10, -24, 55, -2.3, -0.3);
    else if (row === 3) ctx.arc(-4, -30, 52, 0.3, 2.2);
    else ctx.arc(0, -25, 50, -1.3, 0.6);
    ctx.stroke();
  }

  function drawEffectsBelow() {
    for (const q of state.particles) {
      if (q.kind === 'log') continue;
      ctx.globalAlpha = clamp(q.life * 2, 0, 1);
      ctx.fillStyle = q.color || '#fff';
      circle(q.x, q.y, q.r || 3);
      ctx.globalAlpha = 1;
    }
  }

  function drawEffectsAbove() {
    for (const q of state.particles) {
      if (q.kind !== 'log') continue;
      ctx.save();
      ctx.translate(q.x, q.y);
      ctx.rotate(-0.45);
      ctx.fillStyle = '#8d5633';
      roundRect(-18, -7, 36, 14, 6);
      ctx.fill();
      ctx.fillStyle = '#c78b54';
      circle(-14, 0, 5);
      ctx.restore();
    }

    for (const f of state.floaters) {
      ctx.globalAlpha = clamp(f.life * 2.3, 0, 1);
      ctx.fillStyle = '#173847';
      ctx.font = '900 17px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    }
  }

  function drawJoystick() {
    const j = state.input.joy;
    if (!j.active) return;

    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = '#153849';
    circle(j.cx, j.cy, 58);
    ctx.globalAlpha = 0.5;
    circle(j.cx + j.x * 38, j.cy + j.y * 38, 27);
    ctx.restore();
  }

  function drawHint() {
    if (state.elapsed > 5) return;
    ctx.save();
    ctx.fillStyle = 'rgba(16,43,56,.78)';
    roundRect(75, 830, 390, 54, 27);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '800 14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('ドラッグで移動　木の前で止まると自動伐採', 270, 863);
    ctx.restore();
  }

  function circle(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function pointerPos(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width * W,
      y: (e.clientY - r.top) / r.height * H
    };
  }

  function beginJoy(e) {
    if (state.screen !== 'game' || state.paused || state.finished) return;
    const p = pointerPos(e);
    if (p.y < 100) return;
    const j = state.input.joy;
    j.active = true;
    j.id = e.pointerId;
    j.cx = p.x;
    j.cy = p.y;
    j.x = 0;
    j.y = 0;
    j.strength = 0;
    try { canvas.setPointerCapture(e.pointerId); } catch {}
  }

  function moveJoy(e) {
    const j = state.input.joy;
    if (!j.active || e.pointerId !== j.id) return;
    e.preventDefault();
    const p = pointerPos(e);
    let dx = p.x - j.cx, dy = p.y - j.cy;
    const length = Math.hypot(dx, dy);
    if (length > 85) {
      const shift = length - 85;
      j.cx += dx / length * shift;
      j.cy += dy / length * shift;
      dx = p.x - j.cx;
      dy = p.y - j.cy;
    }
    const v = Motion.joystick(dx, dy, 10, 28);
    j.x = v.x; j.y = v.y; j.strength = v.strength;
  }

  function endJoy(e) {
    const j = state.input.joy;
    if (e.pointerId !== j.id) return;
    j.active = false;
    j.id = null;
    j.x = 0;
    j.y = 0;
    j.strength = 0;
  }

  function vibrate(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch {}
  }

  canvas.addEventListener('pointerdown', beginJoy);
  canvas.addEventListener('pointermove', moveJoy, { passive: false });
  canvas.addEventListener('pointerup', endJoy);
  canvas.addEventListener('pointercancel', endJoy);

  window.addEventListener('keydown', e => {
    state.input.keys.add(e.key.toLowerCase());
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
  });

  window.addEventListener('keyup', e => {
    state.input.keys.delete(e.key.toLowerCase());
  });

  $('startBtn').onclick = () => {
    state.screen = 'menu';
    showOnly(ui.stages);
    refreshMenus();
  };

  $('backTitleBtn').onclick = () => {
    state.screen = 'title';
    showOnly(ui.title);
  };

  $('upgradeBtn').onclick = () => {
    showOnly(ui.upgrades);
    renderUpgrade();
  };

  $('upgradeBackBtn').onclick = () => {
    showOnly(ui.stages);
    refreshMenus();
  };

  $('pauseBtn').onclick = () => {
    if (!state.playing) return;
    state.paused = true;
    ui.pause.classList.remove('hidden');
  };

  $('resumeBtn').onclick = () => {
    state.paused = false;
    state.last = performance.now();
    ui.pause.classList.add('hidden');
  };

  $('restartBtn').onclick = () => {
    ui.pause.classList.add('hidden');
    startStage();
  };

  $('quitBtn').onclick = () => {
    state.playing = false;
    state.paused = false;
    ui.hud.classList.add('hidden');
    showOnly(ui.stages);
    refreshMenus();
  };

  $('selectBtn').onclick = () => {
    ui.complete.classList.add('hidden');
    ui.hud.classList.add('hidden');
    state.screen = 'menu';
    showOnly(ui.stages);
    refreshMenus();
  };

  $('nextBtn').onclick = $('selectBtn').onclick;

  $('resetBtn').onclick = () => {
    if (!confirm('セーブデータを初期化しますか？')) return;
    save = { ...DEFAULT_SAVE };
    persist();
    toast('初期化しました');
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.playing && !state.finished) {
      state.paused = true;
      ui.pause.classList.remove('hidden');
    }
  });

  function loop(now) {
    const dt = Math.min(0.033, (now - state.last) / 1000);
    state.last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  refreshMenus();
  requestAnimationFrame(loop);
})();