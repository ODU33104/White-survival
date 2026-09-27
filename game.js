(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = 960, H = 540;

  const $ = (id) => document.getElementById(id);
  const ui = {
    hud: $('hud'), titleScreen: $('titleScreen'), stageScreen: $('stageScreen'), upgradeScreen: $('upgradeScreen'),
    pauseScreen: $('pauseScreen'), completeScreen: $('completeScreen'), stageGrid: $('stageGrid'), upgradeList: $('upgradeList'),
    stageTitle: $('stageTitle'), objective: $('objective'), coinHud: $('coinHud'), carryHud: $('carryHud'), goalBar: $('goalBar'),
    coinMenu: $('coinMenu'), coinUpgrade: $('coinUpgrade'), clearTitle: $('clearTitle'), resultText: $('resultText'), stars: $('stars'), toast: $('toast')
  };

  const SAVE_KEY = 'frostline_frontier_save_v1';
  const DEFAULT_SAVE = { coins: 0, unlocked: 1, bestStars: {}, upgrades: { speed:0, capacity:0, harvest:0, combat:0 } };
  let save = loadSave();

  const UPGRADES = {
    speed: { name:'移動速度', icon:'🥾', desc:'移動速度 +8%', base:35, max:8 },
    capacity: { name:'運搬容量', icon:'🎒', desc:'最大所持数 +2', base:45, max:8 },
    harvest: { name:'採取力', icon:'🪓', desc:'採取・作業速度 +12%', base:50, max:8 },
    combat: { name:'戦闘力', icon:'⚔️', desc:'攻撃力 +18%', base:55, max:8 }
  };

  const stageDefs = [
    { id:1, title:'火を絶やすな', emoji:'🪵🔥', desc:'木を切り、薪を運び、凍える住民を救う。', objective:'薪を暖炉へ運び、熱量を100%にする', type:'furnace' },
    { id:2, title:'氷上の食卓', emoji:'🐟🍲', desc:'魚を獲り、調理し、飢えた住民へ届ける。', objective:'住民に10食を配る', type:'food' },
    { id:3, title:'雪を越えて', emoji:'❄️🏠', desc:'雪を除け、木材を集め、小屋と防壁を建てる。', objective:'雪を3か所除去し、小屋を完成させる', type:'build' },
    { id:4, title:'凍土の工場', emoji:'⚙️📦', desc:'原料を加工ラインへ流し、製品を売って区域を拡張。', objective:'加工品を12個売る', type:'factory' },
    { id:5, title:'白夜の襲撃', emoji:'🐻🛡️', desc:'武器と壁を強化し、野生動物の襲撃を耐え抜く。', objective:'襲撃を75秒間生き延びる', type:'defense' },
    { id:6, title:'最後の集落', emoji:'🏘️🌌', desc:'採取・加工・建築・防衛を一つの集落で回す。', objective:'集落スコアを100にする', type:'finale' }
  ];

  const state = {
    mode:'title', running:false, paused:false, last:performance.now(), elapsed:0,
    stage:null, stageStart:0, player:null, nodes:[], stations:[], enemies:[], particles:[], floaters:[], helpers:[],
    progress:0, completed:false, screenShake:0, input:{keys:new Set(), joy:{active:false,id:null,cx:90,cy:H-90,x:0,y:0}},
    stageData:{}, nextSpawn:0
  };

  const COLORS = { wood:'#8b5a36', fish:'#4aa0ca', food:'#e28b38', ore:'#657687', goods:'#f4bd58' };

  function loadSave(){
    try {
      const parsed = JSON.parse(localStorage.getItem(SAVE_KEY)||'{}');
      return { ...DEFAULT_SAVE, ...parsed, upgrades:{...DEFAULT_SAVE.upgrades,...(parsed.upgrades||{})} };
    } catch { return structuredClone(DEFAULT_SAVE); }
  }
  function persist(){ localStorage.setItem(SAVE_KEY, JSON.stringify(save)); refreshMenus(); }
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function dist(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }
  function rand(a,b){ return a+Math.random()*(b-a); }

  function playerStats(){
    return {
      speed: 180 * (1 + save.upgrades.speed*.08),
      capacity: 8 + save.upgrades.capacity*2,
      harvest: 1 + save.upgrades.harvest*.12,
      damage: 18 * (1 + save.upgrades.combat*.18)
    };
  }

  function showOnly(screen){
    [ui.titleScreen,ui.stageScreen,ui.upgradeScreen,ui.pauseScreen,ui.completeScreen].forEach(s=>s.classList.add('hidden'));
    if(screen) screen.classList.remove('hidden');
  }
  function toast(msg,ms=1500){ ui.toast.textContent=msg; ui.toast.classList.remove('hidden'); clearTimeout(toast.t); toast.t=setTimeout(()=>ui.toast.classList.add('hidden'),ms); }

  function refreshMenus(){
    ui.coinMenu.textContent = save.coins;
    ui.coinUpgrade.textContent = save.coins;
    ui.stageGrid.innerHTML='';
    stageDefs.forEach(def=>{
      const locked = def.id>save.unlocked;
      const card=document.createElement('button');
      card.className='stage-card'+(locked?' locked':'');
      card.disabled=locked;
      const stars=save.bestStars[def.id]||0;
      card.innerHTML=`<div class="num">STAGE ${String(def.id).padStart(2,'0')}</div><h3>${locked?'？？？':def.title}</h3><p>${locked?'前のステージをクリアすると開放':def.desc}</p><div class="best">${stars?'★'.repeat(stars):'未クリア'}</div><div class="emoji">${locked?'🔒':def.emoji}</div>`;
      card.addEventListener('click',()=>startStage(def.id));
      ui.stageGrid.appendChild(card);
    });

    ui.upgradeList.innerHTML='';
    Object.entries(UPGRADES).forEach(([key,def])=>{
      const lv=save.upgrades[key], cost=Math.floor(def.base*Math.pow(1.55,lv));
      const row=document.createElement('div'); row.className='upgrade-row';
      row.innerHTML=`<div><h3>${def.icon} ${def.name}　Lv.${lv}/${def.max}</h3><p>${def.desc}</p></div>`;
      const btn=document.createElement('button');
      btn.textContent=lv>=def.max?'MAX':`🪙 ${cost}`;
      btn.disabled=lv>=def.max || save.coins<cost;
      btn.addEventListener('click',()=>{ if(save.coins>=cost&&lv<def.max){save.coins-=cost;save.upgrades[key]++;persist();renderUpgrades();toast(`${def.name} Lv.${lv+1}`);} });
      row.appendChild(btn); ui.upgradeList.appendChild(row);
    });
  }
  function renderUpgrades(){ refreshMenus(); }

  function startStage(id){
    const def=stageDefs[id-1];
    showOnly(null); ui.hud.classList.remove('hidden');
    state.mode='game'; state.running=true; state.paused=false; state.completed=false; state.stage=def; state.stageStart=performance.now(); state.elapsed=0;
    state.nodes=[];state.stations=[];state.enemies=[];state.particles=[];state.floaters=[];state.helpers=[];state.progress=0;state.nextSpawn=0;
    state.player={x:W/2,y:H/2+90,r:18,dir:1,inv:{},hp:100,maxHp:100,attackCd:0,workCd:0};
    state.stageData={score:0,delivered:0,heated:0,meals:0,cleared:0,built:0,sold:0,survive:0,baseHp:100,night:0};
    ui.stageTitle.textContent=`STAGE ${id} — ${def.title}`; ui.objective.textContent=def.objective;
    buildStage(id); updateHud(); toast('近づくと自動で作業します',1800);
  }

  function buildStage(id){
    if(id===1){
      addStation('furnace',W/2,H/2-40,'暖炉','wood',20);
      addNode('tree',170,170,5); addNode('tree',250,340,5); addNode('tree',760,190,5); addNode('tree',720,390,5); addNode('tree',110,420,5);
      state.stageData.survivors=[{x:430,y:130,warm:false},{x:520,y:135,warm:false},{x:610,y:145,warm:false}];
    } else if(id===2){
      addNode('fish',160,170,4); addNode('fish',185,350,4); addNode('fish',770,165,4); addNode('fish',780,370,4);
      addStation('cook',W/2-100,H/2,'調理台','fish',1);
      addStation('feed',W/2+150,H/2,'食堂','food',10);
      state.helpers.push({x:470,y:360,t:0});
    } else if(id===3){
      addNode('snow',190,160,12); addNode('snow',760,160,12); addNode('snow',200,390,12);
      addNode('tree',770,390,5); addNode('tree',630,360,5); addNode('tree',350,410,5);
      addStation('build',W/2,H/2,'小屋','wood',16);
    } else if(id===4){
      addNode('tree',135,175,5); addNode('ore',140,380,5); addNode('tree',800,170,5); addNode('ore',815,385,5);
      addStation('sawmill',340,220,'製材機','wood',1);
      addStation('forge',340,360,'鍛造機','ore',1);
      addStation('factory',555,290,'組立機','part',1);
      addStation('sell',735,290,'交易所','goods',12);
    } else if(id===5){
      addNode('ore',145,150,4); addNode('ore',165,390,4); addNode('tree',800,150,4); addNode('tree',790,390,4);
      addStation('wall',W/2-90,H/2,'防壁','wood',15);
      addStation('weapon',W/2+120,H/2,'武器台','ore',10);
      state.stageData.survive=0; state.stageData.wave=0; state.player.hp=100;
    } else if(id===6){
      addNode('tree',120,150,5); addNode('fish',120,390,4); addNode('ore',830,150,5); addNode('tree',835,390,5);
      addStation('furnace',345,180,'暖炉','wood',12);
      addStation('cook',345,360,'調理台','fish',1);
      addStation('factory',590,180,'工房','part',1);
      addStation('build',590,360,'集会所','wood',12);
      state.stageData.score=0;
    }
  }

  function addNode(type,x,y,maxHp){ state.nodes.push({type,x,y,r:type==='tree'?28:24,hp:maxHp,maxHp,alive:true,respawn:0,pulse:Math.random()*6}); }
  function addStation(type,x,y,label,accept,goal){ state.stations.push({type,x,y,w:100,h:74,label,accept,goal,progress:0,pulse:0}); }

  function invCount(){ return Object.values(state.player?.inv||{}).reduce((a,b)=>a+b,0); }
  function addInv(type,n=1){ const p=state.player,s=playerStats(); let added=0; while(n-->0 && invCount()<s.capacity){ p.inv[type]=(p.inv[type]||0)+1;added++; } return added; }
  function removeInv(type,n=1){ const have=state.player.inv[type]||0, take=Math.min(have,n); state.player.inv[type]=have-take; if(state.player.inv[type]<=0) delete state.player.inv[type]; return take; }
  function popText(x,y,text){ state.floaters.push({x,y,text,life:1}); }
  function burst(x,y,n=8){ for(let i=0;i<n;i++) state.particles.push({x,y,vx:rand(-65,65),vy:rand(-90,-20),life:rand(.4,.8),r:rand(2,5)}); }

  function update(dt){
    if(!state.running || state.paused || state.completed) return;
    state.elapsed += dt;
    const p=state.player, stats=playerStats();

    let dx=0,dy=0;
    if(state.input.keys.has('ArrowLeft')||state.input.keys.has('a')) dx--;
    if(state.input.keys.has('ArrowRight')||state.input.keys.has('d')) dx++;
    if(state.input.keys.has('ArrowUp')||state.input.keys.has('w')) dy--;
    if(state.input.keys.has('ArrowDown')||state.input.keys.has('s')) dy++;
    if(state.input.joy.active){ dx+=state.input.joy.x; dy+=state.input.joy.y; }
    const mag=Math.hypot(dx,dy)||1; if(Math.abs(dx)+Math.abs(dy)>0){dx/=mag;dy/=mag;p.dir=dx<-.1?-1:dx>.1?1:p.dir;}
    p.x=clamp(p.x+dx*stats.speed*dt,36,W-36); p.y=clamp(p.y+dy*stats.speed*dt,82,H-36);
    p.workCd-=dt; p.attackCd-=dt;

    for(const node of state.nodes){
      node.pulse+=dt;
      if(!node.alive){ node.respawn-=dt; if(node.respawn<=0 && node.type!=='snow'){node.alive=true;node.hp=node.maxHp;} continue; }
      if(dist(p,node)<62 && p.workCd<=0){
        const rate=.52/stats.harvest; p.workCd=rate;
        if(node.type==='snow'){
          node.hp-=Math.max(1,stats.harvest*.72); burst(node.x,node.y,4); popText(node.x,node.y-24,'❄️');
          if(node.hp<=0){ node.alive=false; state.stageData.cleared++; addCoins(2); state.screenShake=5; toast(`除雪 ${state.stageData.cleared}/3`); }
        } else if(invCount()<stats.capacity){
          node.hp-=1; const resource=node.type==='tree'?'wood':node.type;
          if(addInv(resource,1)){ burst(node.x,node.y,5); popText(node.x,node.y-28,resource==='wood'?'+🪵':resource==='fish'?'+🐟':'+⛏'); }
          if(node.hp<=0){node.alive=false;node.respawn=3.5;state.screenShake=4;}
        }
      }
    }

    for(const s of state.stations){
      s.pulse=Math.max(0,s.pulse-dt);
      if(dist(p,s)<78) operateStation(s);
    }

    updateHelpers(dt); updateEnemies(dt); updateStage(dt); updateEffects(dt); updateHud();
  }

  function operateStation(s){
    const type=s.type;
    if(type==='cook'){
      if((state.player.inv.fish||0)>0 && state.player.workCd<=0){ removeInv('fish',1); addInv('food',1); state.player.workCd=.22; s.pulse=.25; burst(s.x,s.y,6); popText(s.x,s.y-45,'🍲 +1'); if(state.stage.id===6) state.stageData.score+=2; }
      return;
    }
    if(type==='sawmill' || type==='forge'){
      const input=type==='sawmill'?'wood':'ore';
      if((state.player.inv[input]||0)>0 && state.player.workCd<=0){ removeInv(input,1); addInv('part',1); state.player.workCd=.18;s.pulse=.2;burst(s.x,s.y,5);popText(s.x,s.y-45,'⚙️ +1'); }
      return;
    }
    if(type==='factory'){
      if((state.player.inv.part||0)>0 && state.player.workCd<=0){ removeInv('part',1);addInv('goods',1);state.player.workCd=.2;s.pulse=.2;burst(s.x,s.y,7);popText(s.x,s.y-45,'📦 +1'); if(state.stage.id===6) state.stageData.score+=3; }
      return;
    }
    if(type==='sell'){
      if((state.player.inv.goods||0)>0 && state.player.workCd<=0){removeInv('goods',1);state.stageData.sold++;addCoins(3);state.player.workCd=.12;s.pulse=.2;popText(s.x,s.y-45,'🪙 +3');burst(s.x,s.y,5);}
      return;
    }

    const accept=s.accept;
    if((state.player.inv[accept]||0)>0 && s.progress<s.goal && state.player.workCd<=0){
      removeInv(accept,1); s.progress++; state.player.workCd=.12; s.pulse=.2; burst(s.x,s.y,5);
      if(type==='furnace') { state.stageData.heated=s.progress; popText(s.x,s.y-45,'🔥 +'); if(state.stage.id===6) state.stageData.score+=4; }
      if(type==='feed') { state.stageData.meals=s.progress; popText(s.x,s.y-45,'🍽️ +1'); addCoins(1); }
      if(type==='build') { state.stageData.built=s.progress; popText(s.x,s.y-45,'🔨 +1'); if(state.stage.id===6) state.stageData.score+=4; }
      if(type==='wall') { state.stageData.baseHp=Math.min(100,state.stageData.baseHp+5); popText(s.x,s.y-45,'🛡️ +5'); }
      if(type==='weapon') { state.stageData.weapon=(state.stageData.weapon||0)+1; popText(s.x,s.y-45,'⚔️ UP'); }
    }
  }

  function updateHelpers(dt){
    if(state.stage?.id!==2) return;
    for(const h of state.helpers){ h.t-=dt; if(h.t<=0){h.t=4.2; const feed=state.stations.find(s=>s.type==='feed'); if(feed && state.stageData.meals<10){ state.stageData.meals=Math.min(10,state.stageData.meals+1); feed.progress=state.stageData.meals; popText(h.x,h.y-20,'助手 +1食'); } } }
  }

  function spawnEnemy(kind='wolf'){
    const side=Math.floor(Math.random()*4); let x,y;
    if(side===0){x=20;y=rand(100,H-30)} else if(side===1){x=W-20;y=rand(100,H-30)} else if(side===2){x=rand(30,W-30);y=85} else {x=rand(30,W-30);y=H-20}
    const boss=kind==='bear'; state.enemies.push({kind,x,y,r:boss?28:16,hp:boss?150:42,maxHp:boss?150:42,speed:boss?42:70,hitCd:0});
  }

  function updateEnemies(dt){
    const p=state.player;
    if(state.stage?.id===5){
      state.nextSpawn-=dt;
      if(state.nextSpawn<=0){ state.nextSpawn=Math.max(1.1,3.0-state.elapsed/45); spawnEnemy(state.elapsed>48&&Math.random()<.22?'bear':'wolf'); }
    }
    if(state.stage?.id===6 && state.elapsed>18){ state.nextSpawn-=dt; if(state.nextSpawn<=0){state.nextSpawn=5;spawnEnemy(Math.random()<.12?'bear':'wolf');} }

    for(let i=state.enemies.length-1;i>=0;i--){
      const e=state.enemies[i]; e.hitCd-=dt;
      const target={x:W/2,y:H/2}; const dPlayer=dist(e,p); const targetObj=dPlayer<120?p:target; const dx=targetObj.x-e.x,dy=targetObj.y-e.y,m=Math.hypot(dx,dy)||1;
      e.x+=dx/m*e.speed*dt;e.y+=dy/m*e.speed*dt;
      if(dPlayer<70 && p.attackCd<=0){
        const dmg=playerStats().damage*(1+(state.stageData.weapon||0)*.08);e.hp-=dmg;p.attackCd=.42;burst(e.x,e.y,6);popText(e.x,e.y-30,`-${Math.round(dmg)}`);state.screenShake=3;
      }
      if(dPlayer<36 && e.hitCd<=0){e.hitCd=.8;p.hp-=e.kind==='bear'?15:7;state.screenShake=7;popText(p.x,p.y-35,'痛！');if(p.hp<=0){failStage('力尽きた…');return;}}
      if(dist(e,target)<48 && dPlayer>=120 && e.hitCd<=0){e.hitCd=1;state.stageData.baseHp-=e.kind==='bear'?14:6;state.screenShake=6;if(state.stageData.baseHp<=0){failStage('防衛線が崩壊した');return;}}
      if(e.hp<=0){ addCoins(e.kind==='bear'?12:2); burst(e.x,e.y,12); state.enemies.splice(i,1); if(state.stage?.id===6)state.stageData.score+=e.kind==='bear'?10:3; }
    }
  }

  function updateStage(dt){
    const d=state.stageData, id=state.stage.id;
    if(id===1){ state.progress=d.heated/20; if(d.heated>=20) completeStage(); }
    if(id===2){ state.progress=d.meals/10; if(d.meals>=10) completeStage(); }
    if(id===3){ state.progress=Math.min(1,(d.cleared/3)*.45+(d.built/16)*.55); if(d.cleared>=3&&d.built>=16) completeStage(); }
    if(id===4){ state.progress=d.sold/12; if(d.sold>=12) completeStage(); }
    if(id===5){ d.survive+=dt; state.progress=d.survive/75; if(d.survive>=75) completeStage(); }
    if(id===6){ state.progress=d.score/100; if(d.score>=100) completeStage(); }
  }

  function addCoins(n){ save.coins+=n; }
  function failStage(reason){
    state.paused=true; toast(reason,2200); setTimeout(()=>{state.paused=false;startStage(state.stage.id);},1800);
  }

  function completeStage(){
    if(state.completed)return; state.completed=true; state.running=false;
    const time=(performance.now()-state.stageStart)/1000; const target=[0,52,58,70,80,75,110][state.stage.id]; const stars=time<target*.75?3:time<target*1.2?2:1;
    const reward=20+state.stage.id*8+stars*5; save.coins+=reward; save.unlocked=Math.max(save.unlocked,Math.min(6,state.stage.id+1)); save.bestStars[state.stage.id]=Math.max(save.bestStars[state.stage.id]||0,stars); persist();
    ui.stars.textContent='★'.repeat(stars)+'☆'.repeat(3-stars); ui.clearTitle.textContent=`${state.stage.title} クリア！`; ui.resultText.innerHTML=`タイム <strong>${time.toFixed(1)}秒</strong><br/>報酬 <strong>🪙 ${reward}</strong>`;
    ui.completeScreen.classList.remove('hidden');
  }

  function updateEffects(dt){
    state.screenShake=Math.max(0,state.screenShake-30*dt);
    for(let i=state.particles.length-1;i>=0;i--){const q=state.particles[i];q.life-=dt;q.x+=q.vx*dt;q.y+=q.vy*dt;q.vy+=180*dt;if(q.life<=0)state.particles.splice(i,1);}
    for(let i=state.floaters.length-1;i>=0;i--){const f=state.floaters[i];f.life-=dt;f.y-=28*dt;if(f.life<=0)state.floaters.splice(i,1);}
  }

  function updateHud(){
    if(!state.player)return; ui.coinHud.textContent=save.coins; ui.carryHud.textContent=`${invCount()}/${playerStats().capacity}`; ui.goalBar.style.width=`${clamp(state.progress,0,1)*100}%`;
    if(state.stage?.id===5) ui.objective.textContent=`襲撃を生き延びる ${Math.floor(state.stageData.survive)}/75秒　防壁 ${Math.max(0,Math.floor(state.stageData.baseHp))}%　HP ${Math.max(0,Math.floor(state.player.hp))}`;
    if(state.stage?.id===6) ui.objective.textContent=`集落スコア ${Math.floor(state.stageData.score)}/100　防壁 ${Math.max(0,Math.floor(state.stageData.baseHp))}%`;
  }

  function draw(){
    const shake=state.screenShake?rand(-state.screenShake,state.screenShake):0;
    ctx.save();ctx.setTransform(1,0,0,1,shake,shake*.35);
    drawWorld();
    if(state.mode==='game') drawGame();
    ctx.restore();
  }

  function drawWorld(){
    const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#c9ecfb');g.addColorStop(1,'#edfaff');ctx.fillStyle=g;ctx.fillRect(-10,-10,W+20,H+20);
    ctx.fillStyle='rgba(255,255,255,.7)'; for(let y=100;y<H;y+=72) for(let x=0;x<W;x+=92){ctx.beginPath();ctx.ellipse(x+((y/72)%2)*30,y,40,13,0,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='rgba(82,142,171,.13)';ctx.fillRect(0,72,W,3);
  }

  function drawGame(){
    for(const s of state.stations) drawStation(s);
    for(const n of state.nodes) if(n.alive) drawNode(n);
    if(state.stage.id===1) drawSurvivors();
    for(const h of state.helpers) drawHelper(h);
    for(const e of state.enemies) drawEnemy(e);
    drawPlayer();
    for(const q of state.particles){ctx.globalAlpha=clamp(q.life*1.5,0,1);ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(q.x,q.y,q.r,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
    for(const f of state.floaters){ctx.globalAlpha=clamp(f.life*1.8,0,1);ctx.fillStyle='#17384a';ctx.font='900 16px system-ui';ctx.textAlign='center';ctx.fillText(f.text,f.x,f.y);ctx.globalAlpha=1;}
    if(matchMedia('(pointer: coarse)').matches || state.input.joy.active) drawJoystick();
    if(state.stage.id===5||state.stage.id===6) drawBaseHealth();
  }

  function drawNode(n){
    ctx.save();ctx.translate(n.x,n.y); const bob=Math.sin(n.pulse*2)*2;ctx.translate(0,bob);
    if(n.type==='tree'){
      ctx.fillStyle='#755039';ctx.fillRect(-7,8,14,34);ctx.fillStyle='#1e6e68';for(const [x,y,r] of [[0,-8,27],[-16,7,20],[16,7,20]]){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();} ctx.fillStyle='rgba(255,255,255,.8)';ctx.beginPath();ctx.ellipse(-7,-19,12,5,-.3,0,Math.PI*2);ctx.fill();
    } else if(n.type==='fish'){
      ctx.fillStyle='#9bdcf3';ctx.beginPath();ctx.ellipse(0,8,34,18,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=4;ctx.stroke();ctx.font='28px system-ui';ctx.textAlign='center';ctx.fillText('🐟',0,5);
    } else if(n.type==='snow'){
      ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(0,12,30,Math.PI,0);ctx.fill();ctx.fillRect(-30,12,60,16);ctx.font='25px system-ui';ctx.textAlign='center';ctx.fillText('❄️',0,6);
    } else { ctx.fillStyle='#8998a5';ctx.beginPath();ctx.arc(0,10,25,0,Math.PI*2);ctx.fill();ctx.font='24px system-ui';ctx.textAlign='center';ctx.fillText('⛏️',0,6); }
    if(n.hp<n.maxHp){ctx.fillStyle='rgba(15,38,52,.15)';ctx.fillRect(-28,-42,56,5);ctx.fillStyle='#ff9948';ctx.fillRect(-28,-42,56*(n.hp/n.maxHp),5);}
    ctx.restore();
  }

  function drawStation(s){
    ctx.save();ctx.translate(s.x,s.y);const pulse=s.pulse>0?1.05:1;ctx.scale(pulse,pulse);
    ctx.fillStyle='rgba(21,65,88,.15)';roundRect(-s.w/2+3,-s.h/2+8,s.w,s.h,18);ctx.fill();
    ctx.fillStyle=s.type==='furnace'?'#445b68':s.type==='sell'?'#7a5f3e':s.type==='feed'?'#d6a266':'#7c8d99';roundRect(-s.w/2,-s.h/2,s.w,s.h,18);ctx.fill();
    const icon={furnace:'🔥',cook:'🍲',feed:'🍽️',build:'🏠',sawmill:'🪚',forge:'⚒️',factory:'⚙️',sell:'🪙',wall:'🛡️',weapon:'⚔️'}[s.type]||'📦';
    ctx.font='30px system-ui';ctx.textAlign='center';ctx.fillText(icon,0,3);ctx.font='800 13px system-ui';ctx.fillStyle='#fff';ctx.fillText(s.label,0,28);
    if(s.goal>1){ctx.fillStyle='rgba(255,255,255,.28)';roundRect(-40,37,80,7,4);ctx.fill();ctx.fillStyle='#ffd65a';roundRect(-40,37,80*clamp(s.progress/s.goal,0,1),7,4);ctx.fill();}
    ctx.restore();
  }

  function drawPlayer(){
    const p=state.player;if(!p)return;ctx.save();
    const stack=[];for(const [type,count] of Object.entries(p.inv)) for(let i=0;i<count;i++)stack.push(type);
    stack.forEach((type,i)=>{const col=i%3,row=Math.floor(i/3);const x=p.x-p.dir*(24+col*10),y=p.y-10-row*8+Math.sin(state.elapsed*5+i)*1.5;ctx.fillStyle=type==='wood'?COLORS.wood:type==='fish'?COLORS.fish:type==='food'?COLORS.food:type==='ore'?COLORS.ore:type==='part'?'#8497a8':COLORS.goods;ctx.fillRect(x-7,y-5,14,10);});
    ctx.translate(p.x,p.y);ctx.fillStyle='rgba(25,56,70,.16)';ctx.beginPath();ctx.ellipse(0,17,20,8,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#24526b';ctx.beginPath();ctx.arc(0,-2,p.r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f2c59d';ctx.beginPath();ctx.arc(4*p.dir,-10,9,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f47d42';roundRect(-15,-2,30,24,8);ctx.fill();
    ctx.fillStyle='#17384a';ctx.fillRect(1*p.dir,-13,10*p.dir,3);ctx.font='18px system-ui';ctx.textAlign='center';ctx.fillText(state.stage?.id===5?'⚔️':'🪓',20*p.dir,4);
    ctx.restore();
  }

  function drawEnemy(e){ctx.save();ctx.translate(e.x,e.y);ctx.font=`${e.kind==='bear'?42:30}px system-ui`;ctx.textAlign='center';ctx.fillText(e.kind==='bear'?'🐻':'🐺',0,8);ctx.fillStyle='rgba(44,31,31,.18)';ctx.fillRect(-24,-31,48,5);ctx.fillStyle='#dd5b54';ctx.fillRect(-24,-31,48*(e.hp/e.maxHp),5);ctx.restore();}
  function drawHelper(h){ctx.font='26px system-ui';ctx.textAlign='center';ctx.fillText('🧑‍🍳',h.x,h.y);}
  function drawSurvivors(){for(const s of state.stageData.survivors||[]){ctx.font='28px system-ui';ctx.textAlign='center';ctx.fillText(state.stageData.heated>=20?'😊':'🥶',s.x,s.y);}}
  function drawBaseHealth(){ctx.fillStyle='rgba(20,52,68,.18)';roundRect(W/2-90,88,180,10,5);ctx.fill();ctx.fillStyle='#4b9b83';roundRect(W/2-90,88,180*clamp(state.stageData.baseHp/100,0,1),10,5);ctx.fill();}

  function drawJoystick(){
    const j=state.input.joy;const cx=j.active?j.cx:85,cy=j.active?j.cy:H-85;ctx.save();ctx.globalAlpha=.35;ctx.fillStyle='#17384a';ctx.beginPath();ctx.arc(cx,cy,48,0,Math.PI*2);ctx.fill();ctx.globalAlpha=.55;ctx.beginPath();ctx.arc(cx+j.x*28,cy+j.y*28,22,0,Math.PI*2);ctx.fill();ctx.restore();
  }

  function roundRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}

  function loop(now){ const dt=Math.min(.033,(now-state.last)/1000);state.last=now;update(dt);draw();requestAnimationFrame(loop); }

  function pointerPos(e){ const r=canvas.getBoundingClientRect(); return {x:(e.clientX-r.left)/r.width*W,y:(e.clientY-r.top)/r.height*H}; }
  canvas.addEventListener('pointerdown',e=>{ if(state.mode!=='game'||state.paused||state.completed)return;const p=pointerPos(e);if(p.y>H*.48){state.input.joy.active=true;state.input.joy.id=e.pointerId;state.input.joy.cx=p.x;state.input.joy.cy=p.y;state.input.joy.x=0;state.input.joy.y=0;canvas.setPointerCapture(e.pointerId);} });
  canvas.addEventListener('pointermove',e=>{const j=state.input.joy;if(!j.active||e.pointerId!==j.id)return;const p=pointerPos(e);let dx=p.x-j.cx,dy=p.y-j.cy,m=Math.hypot(dx,dy);if(m>48){dx=dx/m*48;dy=dy/m*48;}j.x=dx/48;j.y=dy/48;});
  canvas.addEventListener('pointerup',e=>{const j=state.input.joy;if(e.pointerId===j.id){j.active=false;j.id=null;j.x=j.y=0;}});
  window.addEventListener('keydown',e=>{const k=e.key.length===1?e.key.toLowerCase():e.key;state.input.keys.add(k);if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();});
  window.addEventListener('keyup',e=>state.input.keys.delete(e.key.length===1?e.key.toLowerCase():e.key));

  $('startBtn').onclick=()=>{state.mode='menu';showOnly(ui.stageScreen);refreshMenus();};
  $('backTitleBtn').onclick=()=>{state.mode='title';showOnly(ui.titleScreen);};
  $('upgradeBtn').onclick=()=>{showOnly(ui.upgradeScreen);renderUpgrades();};
  $('upgradeBackBtn').onclick=()=>{showOnly(ui.stageScreen);refreshMenus();};
  $('pauseBtn').onclick=()=>{if(state.mode==='game'&&!state.completed){state.paused=true;ui.pauseScreen.classList.remove('hidden');}};
  $('resumeBtn').onclick=()=>{state.paused=false;ui.pauseScreen.classList.add('hidden');state.last=performance.now();};
  $('restartBtn').onclick=()=>{ui.pauseScreen.classList.add('hidden');startStage(state.stage.id);};
  $('quitBtn').onclick=()=>{state.running=false;state.paused=false;ui.hud.classList.add('hidden');showOnly(ui.stageScreen);refreshMenus();};
  $('selectBtn').onclick=()=>{ui.completeScreen.classList.add('hidden');ui.hud.classList.add('hidden');showOnly(ui.stageScreen);refreshMenus();};
  $('nextBtn').onclick=()=>{const next=Math.min(6,state.stage.id+1);ui.completeScreen.classList.add('hidden');if(state.stage.id===6){ui.hud.classList.add('hidden');showOnly(ui.stageScreen);refreshMenus();}else startStage(next);};
  $('resetBtn').onclick=()=>{if(confirm('セーブデータを初期化しますか？')){save=structuredClone(DEFAULT_SAVE);persist();toast('初期化しました');}};
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.mode==='game'&&!state.completed){state.paused=true;ui.pauseScreen.classList.remove('hidden');}});

  refreshMenus(); requestAnimationFrame(loop);
})();