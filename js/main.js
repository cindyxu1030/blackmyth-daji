// 主循环：状态机(标题→登场→战斗→阶段过场→结算)、输入缓冲、锁定相机、伤害结算单一入口。
// 防翻车：dt 钳制、update try/catch 降级不白屏、失焦自动暂停、?selftest=1 自测模式。

window.__errCount = 0;
window.onerror = function (msg) { window.__errCount++; return false; };
window.addEventListener('unhandledrejection', function () { window.__errCount++; });

const UP_VEC = new THREE.Vector3(0, 1, 0);

window.Game = {
  state: 'BOOT',
  time: 0,          // 游戏时间（受 timeScale 影响）
  realTime: 0,      // 真实时间（震屏/顿帧计时用）
  timeScale: 1,
  hitStopUntil: 0,
  paused: false,
  god: false,
  degraded: false,
  _errStreak: 0,

  moveDir: new THREE.Vector3(),
  _fwd: new THREE.Vector3(),
  _right: new THREE.Vector3(),
  _tmp: new THREE.Vector3(),
  _camPos: new THREE.Vector3(0, 6, 17),
  _look: new THREE.Vector3(0, 2, 0),
  _desired: new THREE.Vector3(),
  _introFrom: new THREE.Vector3(),

  keys: {},
  buffer: { light: -9, heavy: -9, dodge: -9, charm: -9, ult: -9 },
  KEYMAP: { KeyJ: 'light', KeyK: 'heavy', Space: 'dodge', KeyL: 'charm', Semicolon: 'ult', KeyF: 'flask' },

  stats: { start: 0, hitsTaken: 0, dur: 0 },

  // ---------- 启动 ----------
  boot() {
    if (!window.THREE) { this.fatal(); return; }
    try {
      const canvas = document.getElementById('game');
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.PIXEL_RATIO_MAX));
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.outputEncoding = THREE.sRGBEncoding;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.1;
      if (CONFIG.SHADOWS) {
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      }
    } catch (e) { this.fatal(); return; }

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CONFIG.CAMERA.FOV, window.innerWidth / window.innerHeight, 0.1, 500);
    this.camera.position.copy(this._camPos);

    World.init(this.scene, this.renderer);
    VFX.init(this.scene);
    this.player = new Player(this.scene);
    this.boss = new Boss(this.scene);
    this.dog = new Dog(this.scene);
    this.clones = [0, 1, 2].map((i) => new FoxClone(this.scene, i));
    VFX.initGhosts(this.player.root, 4);
    UI.init();

    // 后期管线（bloom/颗粒/调色）；启用时 DOM 暗角交给 shader
    // ?nopost 强制关闭（A/B 对比调试用）
    const q0 = new URLSearchParams(location.search);
    this._closeup = q0.has('closeup'); // 绕玩家近景相机（截图调试用）
    if (window.Post && !q0.has('nopost')) {
      Post.init(this.renderer);
      this._syncVignette();
    }

    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    // 点击也能推进/重启（死亡后点了页面外面导致键盘失焦的兜底）
    window.addEventListener('mousedown', () => {
      try {
        AudioMan.unlock();
        if (this.paused) { this.paused = false; UI.showScreen(null); AudioMan.resume(); return; }
        if (this.state === 'TITLE') this.startIntro();
        else if (this.state === 'INTRO') this.startFight();
        else if (this.state === 'VICTORY' || this.state === 'DEFEAT') this.reset();
      } catch (err) { console.error('mousedown error', err); window.__errCount++; }
    });
    window.focus();
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      if (window.Post) Post.resize(window.innerWidth, window.innerHeight);
    });
    window.addEventListener('blur', () => {
      if (this.state === 'FIGHT' || this.state === 'CINEMATIC') {
        this.paused = true;
        UI.showScreen('pause');
        AudioMan.suspend();
      }
    });

    this.initSelftest();

    Assets.load(() => {
      Assets.probeWebGL(this.renderer);
      World.applySky();
      UI.applyAssets();
      this.toTitle();
    });

    this._last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  },

  fatal() {
    const f = document.getElementById('fatal');
    if (f) f.style.display = 'flex';
  },

  // ---------- 输入 ----------
  onKeyDown(e) {
    // 输入处理任何 throw 都不允许静默吞键
    try { this._handleKey(e); } catch (err) { console.error('input error', err); window.__errCount++; }
  },

  _handleKey(e) {
    if (e.code === 'Space') e.preventDefault();
    AudioMan.unlock();
    if (e.repeat) return;

    if (this.paused) {
      this.paused = false;
      UI.showScreen(null);
      AudioMan.resume();
      return;
    }

    switch (this.state) {
      case 'TITLE': this.startIntro(); return;
      case 'INTRO': this.startFight(); return;
      case 'VICTORY':
      case 'DEFEAT':
        // R / 回车 / 空格 都能重启（中文输入法/按键习惯兜底）
        if (e.code === 'KeyR' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') this.reset();
        return;
    }

    this.keys[e.code] = true;
    const act = this.KEYMAP[e.code];
    if (act) this.buffer[act] = this.realTime;

    if (e.code === 'KeyR' && this.state === 'FIGHT') { this.reset(); return; }
    if (CONFIG.DEBUG) {
      if (e.code === 'Digit1') { this.boss.hp = Math.min(this.boss.hp, CONFIG.BOSS.P2_HP - 1); this.checkBossPhase(); }
      if (e.code === 'Digit2') { this.boss.hp = Math.min(this.boss.hp, CONFIG.BOSS.P3_HP - 1); this.checkBossPhase(); }
      if (e.code === 'Digit0') { this.god = !this.god; UI.setGod(this.god); }
    }
  },

  consumePressed(name) {
    if (this.realTime - this.buffer[name] <= 0.2) {
      this.buffer[name] = -9;
      return true;
    }
    return false;
  },

  computeMove() {
    this.camera.getWorldDirection(this._fwd);
    this._fwd.y = 0;
    if (this._fwd.lengthSq() < 1e-4) this._fwd.set(0, 0, -1);
    this._fwd.normalize();
    this._right.crossVectors(this._fwd, UP_VEC);
    const x = (this.keys.KeyD ? 1 : 0) - (this.keys.KeyA ? 1 : 0);
    const z = (this.keys.KeyW ? 1 : 0) - (this.keys.KeyS ? 1 : 0);
    this.moveDir.set(0, 0, 0).addScaledVector(this._fwd, z).addScaledVector(this._right, x);
    if (this.moveDir.lengthSq() > 1) this.moveDir.normalize();
  },

  // ---------- 流程 ----------
  toTitle() {
    if (this.state !== 'BOOT') return;
    this.state = 'TITLE';
    UI.showScreen('title');
    UI.showHud(false);
    // ?selftest=1 自动回归；?demo=1 直接进战斗+无敌（截图/录屏用，站桩不死）
    if (new URLSearchParams(location.search).has('demo')) { this.god = true; this.startFight(); }
    else if (this.selftest) this.startFight();
  },

  startIntro() {
    this.state = 'INTRO';
    this.introT = 0;
    this._introPose = 0;
    UI.showScreen(null);
    AudioMan.ui();
    this._introFrom.set(this.boss.pos.x + 7, 8.5, this.boss.pos.z + 9);
    this.boss.setPose({ srx: -2.3, sry: 0.4, srz: 0.9, ty: 0.4, wx: 1.0 }, 3);
  },

  startFight() {
    UI.showBossCard(false);
    UI.reset();
    this.state = 'FIGHT';
    this.stats = { start: this.realTime, hitsTaken: 0, dur: 0 };
    UI.announce('破阵 · 起', '', 1.4);
    if (this.selftest && this.selftest.t0 === null) this.selftest.t0 = this.realTime;
  },

  startPhaseCinematic(n) {
    this.state = 'CINEMATIC';
    this.boss.cancelAttack();
    this.boss.state = 'cinematic';
    this._tmp.copy(this.boss.pos).sub(this.player.pos).setY(0);
    if (this._tmp.lengthSq() < 0.01) this._tmp.set(0, 0, -1);
    this._tmp.normalize().multiplyScalar(9).add(this.player.pos);
    const max = CONFIG.ARENA_RADIUS - 3;
    const r = Math.hypot(this._tmp.x, this._tmp.z);
    if (r > max) { this._tmp.x *= max / r; this._tmp.z *= max / r; }
    this.cin = { n, t: 0, from: this.boss.pos.clone(), to: this._tmp.clone() };
    UI.announce(
      n === 2 ? '第二阶段 · 天眼现世' : '最终阶段 · 真君之怒',
      n === 2 ? '当心焚世之光' : '哮天犬正在入场',
      2.2
    );
    AudioMan.roar();
    VFX.addTrauma(0.4);
  },

  finishCinematic() {
    const n = this.cin.n;
    this.boss.phase = n;
    this.boss.state = 'idle';
    this.boss.cooldown = 1.2;
    UI.setBossPhase(n);
    if (n === 3) {
      this.dog.spawn();
      UI.setPhaseTint(3);
      this.boss.eyeLight.intensity = 1.2;
    }
    this.state = 'FIGHT';
  },

  victory() {
    if (this.state !== 'FIGHT') return;
    this.state = 'VICTORY';
    this.endT = 0;
    this._resultShown = false;
    this.stats.dur = this.realTime - this.stats.start;
    this.dog.flee();
  },

  defeat() {
    if (this.state !== 'FIGHT') return;
    this.state = 'DEFEAT';
    this.endT = 0;
    this._resultShown = false;
    this.stats.dur = this.realTime - this.stats.start;
  },

  reset() {
    this.player.reset();
    this.boss.reset();
    this.dog.despawn();
    this.clones.forEach((c) => { c.alive = false; c.root.visible = false; });
    VFX.clear();
    UI.reset();
    UI.setGod(this.god);
    this.state = 'FIGHT';
    this.stats = { start: this.realTime, hitsTaken: 0, dur: 0 };
    UI.announce('再战 · 朱雀台', '', 1.4);
  },

  spawnClones() {
    this.clones.forEach((c) => c.spawn(this.player.pos, this.time + CONFIG.PLAYER.ULT.DURATION));
  },

  // ---------- 伤害结算（单一入口）----------
  applyDamageToPlayer(amount, sourcePos, opts = {}) {
    const p = this.player;
    if (this.state !== 'FIGHT' || !p.alive) return false;
    if (this.god || p.invuln) return false;
    p.hp -= amount;
    this.stats.hitsTaken++;
    p.invulnUntil = this.time + CONFIG.PLAYER.HURT_IFRAME;
    p.gainMeter(CONFIG.PLAYER.ULT.GAIN_HURT);
    UI.hurtFlash();
    VFX.addTrauma(0.55);
    AudioMan.playerHurt();
    this._tmp.copy(p.pos).setY(1.5);
    VFX.dmgNumber(this._tmp, '-' + amount, 'hurt');
    VFX.burst({ pos: this._tmp, count: 10, speed: [2, 5], spread: 1, up: 1, life: [0.3, 0.6], size: 0.3, sizeEnd: 0.05, color: 0xff5040, colorEnd: 0x661010 });
    this.hitStop(90);
    if (!opts.noStagger && p.state !== 'dodge' && p.state !== 'dead') { p.state = 'hurt'; p.st = 0; }
    if (p.hp <= 0) {
      p.hp = 0;
      p.die();
      this.defeat();
    }
    return true;
  },

  applyDamageToBoss(amount, hitPos, opts = {}) {
    const b = this.boss;
    if (this.state !== 'FIGHT' || !b.alive || b.invuln) return false;
    b.hp -= amount;
    b.flashT = 0.08;
    VFX.dmgNumber(hitPos, String(amount), opts.heavy ? 'heavy' : '');
    VFX.burst({
      pos: hitPos, count: opts.clone ? 4 : (opts.heavy ? 16 : 9),
      speed: [2, 6], spread: 1, up: 1, life: [0.25, 0.55],
      size: 0.32, sizeEnd: 0.05, color: CONFIG.COLORS.goldBright, colorEnd: 0xff4030,
    });
    if (!opts.clone) {
      this.hitStop(opts.heavy ? 110 : 50);
      VFX.addTrauma(opts.heavy ? 0.45 : 0.2);
    }
    if (opts.meter) this.player.gainMeter(opts.meter);
    if (b.hp <= 0) {
      b.hp = 0;
      b.die();
      this.victory();
      return true;
    }
    this.checkBossPhase();
    return true;
  },

  checkBossPhase() {
    const b = this.boss;
    if (this.state !== 'FIGHT' || !b.alive) return;
    if (b.phase === 1 && b.hp <= CONFIG.BOSS.P2_HP) this.startPhaseCinematic(2);
    else if (b.phase === 2 && b.hp <= CONFIG.BOSS.P3_HP) this.startPhaseCinematic(3);
  },

  applyDamageToDog(amount, hitPos, opts = {}) {
    const d = this.dog;
    if (this.state !== 'FIGHT' || !d.active || !d.alive) return false;
    d.hp -= amount;
    d.flashT = 0.08;
    VFX.dmgNumber(hitPos, String(amount), opts.heavy ? 'heavy' : '');
    VFX.burst({ pos: hitPos, count: 7, speed: [2, 5], spread: 1, up: 1, life: [0.25, 0.5], size: 0.3, sizeEnd: 0.05, color: CONFIG.COLORS.goldBright, colorEnd: 0x884444 });
    if (opts.knockback) {
      this._tmp.copy(d.pos).sub(this.player.pos).setY(0).normalize();
      d.knockVel.addScaledVector(this._tmp, opts.knockback);
    }
    if (d.hp <= 0) { d.hp = 0; d.die(); }
    return true;
  },

  hitStop(ms) {
    if (this.realTime < this.hitStopUntil) return;
    this.hitStopUntil = this.realTime + ms / 1000;
  },

  // ---------- 主循环 ----------
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const rdt = Math.min((now - this._last) / 1000, 1 / 30);
    this._last = now;
    if (this.paused) { this.renderFrame(); return; }
    this.realTime += rdt;
    this._fpsWatchdog(rdt);

    let base = 1;
    if (this.state === 'CINEMATIC') base = 0.15;
    else if ((this.state === 'VICTORY' || this.state === 'DEFEAT') && this.endT < 1.4) base = 0.22;
    this.timeScale = base * (this.realTime < this.hitStopUntil ? 0.05 : 1);
    const dt = rdt * this.timeScale;
    this.time += dt;

    this.computeMove();
    try {
      this.update(dt, rdt);
      this._errStreak = 0;
    } catch (e) {
      console.error(e);
      window.__errCount++;
      if (++this._errStreak > 3) this.degraded = true; // AI 冻结，画面保活
    }
    this.updateCamera(rdt);
    try {
      World.update(dt, this.time);
      VFX.update(dt, this.realTime, this.camera);
    } catch (e) { console.error(e); window.__errCount++; }
    this.runSelftest(rdt);
    this.renderFrame();
  },

  renderFrame() {
    // Post.init 没跑过（POST=false / ?nopost）时 Post._renderer 为空，必须走直渲
    if (window.Post && Post._renderer) Post.render(this.scene, this.camera, this.realTime);
    else this.renderer.render(this.scene, this.camera);
  },

  _syncVignette() {
    // 后期管线自带暗角；DOM 暗角只在管线关闭时显示
    const v = document.getElementById('vignette');
    if (v) v.style.display = window.Post && Post.enabled ? 'none' : '';
  },

  // FPS 看门狗：战斗中持续低于 40fps → 自动关后期管线（演示保险）
  _fpsAcc: 0, _fpsN: 0, _fpsDone: false,
  _fpsWatchdog(rdt) {
    if (this._fpsDone || !window.Post || !Post.enabled || this.state !== 'FIGHT') return;
    this._fpsAcc += rdt;
    this._fpsN++;
    if (this._fpsN >= 240) {
      const fps = this._fpsN / this._fpsAcc;
      if (fps < 40) {
        Post.setEnabled(false);
        this._syncVignette();
        console.warn('[Post] fps ' + fps.toFixed(1) + ' < 40，自动关闭后期管线');
      }
      this._fpsDone = true; // 只评估一次
    }
  },

  update(dt, rdt) {
    switch (this.state) {
      case 'BOOT':
      case 'TITLE':
        this.ambientOnly(dt);
        break;

      case 'INTRO': {
        this.introT += rdt;
        this.ambientOnly(dt);
        if (this._introPose === 0 && this.introT > 1.7) {
          this._introPose = 1;
          this.boss.setPose({ srx: -0.25, sry: 0, srz: 0.18, ty: 0, wx: 0 }, 4);
          UI.showBossCard(true);
          AudioMan.roar();
        }
        if (this.introT >= 4.2) this.startFight();
        break;
      }

      case 'FIGHT': {
        this.player.update(dt);
        if (!this.degraded) {
          this.boss.update(dt);
          this.dog.update(dt);
        }
        this.clones.forEach((c) => c.update(dt));
        UI.sync();
        break;
      }

      case 'CINEMATIC': {
        const c = this.cin;
        c.t += rdt;
        const k = U.clamp(c.t / 1.0, 0, 1);
        this.boss.pos.x = U.lerp(c.from.x, c.to.x, U.easeInOut(k));
        this.boss.pos.z = U.lerp(c.from.z, c.to.z, U.easeInOut(k));
        this.player.update(dt);
        this.boss.update(dt);
        this.dog.update(dt);
        this.clones.forEach((cl) => cl.update(dt));
        UI.sync();
        if (c.t >= 1.6) this.finishCinematic();
        break;
      }

      case 'VICTORY':
      case 'DEFEAT': {
        this.endT += rdt;
        this.player.update(dt);
        this.boss.update(dt);
        this.dog.update(dt);
        this.clones.forEach((c) => c.update(dt));
        if (!this._resultShown && this.endT >= 1.6) {
          this._resultShown = true;
          UI.showResult(this.state === 'VICTORY' ? 'victory' : 'defeat', this.stats);
          if (this.state === 'VICTORY') AudioMan.victory(); else AudioMan.defeat();
        }
        break;
      }
    }
  },

  ambientOnly(dt) {
    const p = this.player;
    p.anim.speedRatio = U.damp(p.anim.speedRatio, 0, 6, dt);
    dajiAnimate(p.fox, p.anim, dt, this.time);
    const b = this.boss;
    b._applyPose(dt);
    b._ambientAnim(dt, this.time);
    b._updateTrail(dt);
  },

  // ---------- 相机 ----------
  updateCamera(rdt) {
    const cam = this.camera;
    const p = this.player, b = this.boss;

    // 调试近景：绕玩家慢速环拍
    if (this._closeup && this.state === 'FIGHT') {
      const a = this.realTime * 0.25 + 2.5;
      cam.position.set(p.pos.x + Math.sin(a) * 4, 1.7, p.pos.z + Math.cos(a) * 4);
      cam.lookAt(p.pos.x, 1.1, p.pos.z);
      return;
    }

    if (this.state === 'TITLE' || this.state === 'BOOT') {
      const a = this.realTime * 0.07;
      this._desired.set(Math.sin(a) * 17, 6, Math.cos(a) * 17);
      this._camPos.x = U.damp(this._camPos.x, this._desired.x, 2, rdt);
      this._camPos.y = U.damp(this._camPos.y, this._desired.y, 2, rdt);
      this._camPos.z = U.damp(this._camPos.z, this._desired.z, 2, rdt);
      this._look.set(0, 2.2, 0);
    } else if (this.state === 'INTRO') {
      const k = U.easeInOut(Math.min(this.introT / 3.8, 1));
      // 终点 = 战斗相机位（电影感低机位过肩）
      const C0 = CONFIG.CAMERA;
      this._tmp.copy(p.pos).sub(b.pos).setY(0).normalize();
      this._desired.copy(p.pos).addScaledVector(this._tmp, C0.DIST);
      this._desired.x += this._tmp.z * C0.SIDE;
      this._desired.z += -this._tmp.x * C0.SIDE;
      this._desired.y += C0.HEIGHT;
      this._camPos.lerpVectors(this._introFrom, this._desired, k);
      this._look.copy(b.pos).setY(2.6).lerp(this._tmp.copy(p.pos).lerp(b.pos, 0.62).setY(C0.LOOK_H), k);
    } else {
      const C1 = CONFIG.CAMERA;
      const d = U.dist2D(p.pos, b.pos);
      this._tmp.copy(p.pos).sub(b.pos).setY(0);
      if (this._tmp.lengthSq() < 0.01) U.yawDir(p.yaw + Math.PI, this._tmp);
      this._tmp.normalize();
      const close = d < 3;
      this._desired.copy(p.pos).addScaledVector(this._tmp, close ? C1.CLOSE_DIST : C1.DIST);
      // 过肩横向偏移（垂直于玩家-Boss 轴）：玩家落在画面下三分之一中偏左
      this._desired.x += this._tmp.z * C1.SIDE;
      this._desired.z += -this._tmp.x * C1.SIDE;
      this._desired.y = p.pos.y + (close ? C1.CLOSE_H : C1.HEIGHT);
      this._camPos.x = U.damp(this._camPos.x, this._desired.x, 8, rdt);
      this._camPos.y = U.damp(this._camPos.y, this._desired.y, 8, rdt);
      this._camPos.z = U.damp(this._camPos.z, this._desired.z, 8, rdt);
      this._tmp.copy(p.pos).lerp(b.pos, b.alive ? 0.62 : 0.25);
      this._tmp.y += C1.LOOK_H;
      this._look.x = U.damp(this._look.x, this._tmp.x, 10, rdt);
      this._look.y = U.damp(this._look.y, this._tmp.y, 10, rdt);
      this._look.z = U.damp(this._look.z, this._tmp.z, 10, rdt);
    }

    const sh = VFX.computeShake(this.realTime);
    cam.position.set(this._camPos.x + sh.x, Math.max(this._camPos.y + sh.y, 1.4), this._camPos.z);
    cam.lookAt(this._look);
    cam.rotation.z += sh.roll;
  },

  // ---------- 自测模式（?selftest=1）----------
  selftest: null,
  initSelftest() {
    const q = new URLSearchParams(location.search);
    if (!q.has('selftest')) return;
    const G = this;
    const S = (at, label, fn) => ({ at, label, fn, done: false });
    this.selftest = {
      t0: null, t: 0, finished: false,
      steps: [
        S(0.5, 'hit-300', () => G.applyDamageToBoss(300, G.boss.pos, {})),
        S(1.2, 'to-phase2', () => G.applyDamageToBoss(60, G.boss.pos, {})),
        S(3.4, 'charm+ult', () => { G.boss.freeze(0.8); G.player.meter = 100; G.player.tryUlt(); }),
        S(5.0, 'to-phase3', () => G.applyDamageToBoss(330, G.boss.pos, {})),
        S(7.4, 'kill-boss', () => G.applyDamageToBoss(999, G.boss.pos, {})),
        S(10.0, 'reset', () => G.reset()),
        S(10.6, 'kill-player', () => G.applyDamageToPlayer(999, G.boss.pos, {})),
        // 真实走一遍键盘重启路径（回归「死亡后按 R 不能重启」）
        S(12.5, 'press-R', () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR' }))),
        S(13.1, 'assert-restart', () => { if (G.state !== 'FIGHT') throw new Error('R restart failed, state=' + G.state); }),
        S(13.6, 'finish', () => G.finishSelftest()),
      ],
    };
  },

  runSelftest(rdt) {
    const s = this.selftest;
    if (!s || s.finished || s.t0 === null) return;
    s.t += rdt;
    for (const step of s.steps) {
      if (!step.done && s.t >= step.at) {
        step.done = true;
        try {
          step.fn();
          console.log('[SELFTEST] step ok: ' + step.label + ' state=' + this.state);
        } catch (e) {
          console.log('[SELFTEST] step FAIL: ' + step.label + ' ' + e.message);
          window.__errCount++;
        }
      }
    }
  },

  finishSelftest() {
    const s = this.selftest;
    s.finished = true;
    const result = {
      pass: window.__errCount === 0 && this.state === 'FIGHT', // 终态 = R 重启后回到战斗
      errors: window.__errCount,
      state: this.state,
      drawCalls: this.renderer.info.render.calls,
      postEnabled: !!(window.Post && Post.enabled),
      bossPhaseReached: this.boss.phase,
    };
    console.log('[SELFTEST] RESULT ' + JSON.stringify(result));
    document.title = 'SELFTEST ' + (result.pass ? 'PASS' : 'FAIL');
    const div = document.getElementById('selftest-result');
    div.textContent = JSON.stringify(result);
    div.style.display = 'block';
  },
};

Game.boot();
