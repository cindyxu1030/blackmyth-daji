// 特效系统：粒子池(硬上限)、斩击弧光、冲击波、预警贴花、魅惑符阵、残影、伤害数字、震屏。
// 全部画布纹理在页面内生成（file:// 下不会被 taint），全部对象预分配复用。
window.VFX = (() => {
  let scene = null;
  const tex = {}; // 生成的画布纹理

  // ---------- 画布纹理 ----------
  function makeTex(name, size, draw) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    tex[name] = t;
    return t;
  }

  function buildTextures() {
    makeTex('dot', 64, (g, s) => {
      const grad = g.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.fillRect(0, 0, s, s);
    });
    makeTex('ember', 32, (g, s) => {
      const grad = g.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.4)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.fillRect(0, 0, s, s);
    });
    makeTex('ring', 128, (g, s) => {
      g.strokeStyle = 'rgba(255,255,255,1)';
      g.lineWidth = 6;
      g.shadowColor = 'rgba(255,255,255,0.8)'; g.shadowBlur = 10;
      g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 12, 0, Math.PI * 2); g.stroke();
    });
    makeTex('slash', 128, (g, s) => {
      g.strokeStyle = 'rgba(255,255,255,0.95)';
      g.lineCap = 'round';
      g.lineWidth = 14;
      g.shadowColor = 'rgba(255,255,255,0.9)'; g.shadowBlur = 14;
      g.beginPath(); g.arc(s / 2, s / 2 + 20, 52, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
      g.lineWidth = 5;
      g.beginPath(); g.arc(s / 2, s / 2 + 20, 64, Math.PI * 1.25, Math.PI * 1.75); g.stroke();
    });
    makeTex('rune', 256, (g, s) => {
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 3;
      g.beginPath(); g.arc(s / 2, s / 2, 118, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(s / 2, s / 2, 96, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.font = '64px KaiTi, STKaiti, serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('魅', s / 2, s / 2);
      g.font = '22px KaiTi, STKaiti, serif';
      const chars = ['狐', '影', '惑', '心', '定', '神', '九', '尾'];
      chars.forEach((ch, i) => {
        const a = (i / chars.length) * Math.PI * 2;
        g.fillText(ch, s / 2 + Math.cos(a) * 107, s / 2 + Math.sin(a) * 107);
      });
    });
  }

  // ---------- 粒子池 ----------
  const POOL = 400;
  const particles = [];
  const _c0 = new THREE.Color(), _c1 = new THREE.Color();

  function buildParticles() {
    for (let i = 0; i < POOL; i++) {
      const m = new THREE.SpriteMaterial({
        map: tex.dot, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0,
      });
      const sp = new THREE.Sprite(m);
      sp.visible = false;
      scene.add(sp);
      particles.push({
        sprite: sp, alive: false, t: 0, life: 1,
        vel: new THREE.Vector3(), gravity: 0,
        size0: 1, size1: 1,
        c0: new THREE.Color(), c1: new THREE.Color(),
      });
    }
  }

  let cursor = 0;
  function spawnOne(o) {
    if (!particles.length) return; // init 之前的调用直接忽略
    // 池满时覆盖最老的 —— 性能永远不会失控
    let p = null;
    for (let i = 0; i < POOL; i++) {
      const cand = particles[(cursor + i) % POOL];
      if (!cand.alive) { p = cand; cursor = (cursor + i + 1) % POOL; break; }
    }
    if (!p) { p = particles[cursor]; cursor = (cursor + 1) % POOL; }
    p.alive = true; p.t = 0;
    p.life = o.life;
    p.sprite.visible = true;
    p.sprite.position.copy(o.pos);
    p.vel.copy(o.vel);
    p.gravity = o.gravity || 0;
    p.size0 = o.size; p.size1 = (o.sizeEnd !== undefined ? o.sizeEnd : o.size);
    p.c0.set(o.color); p.c1.set(o.colorEnd !== undefined ? o.colorEnd : o.color);
    p.sprite.material.map = tex[o.tex] || tex.dot;
    p.sprite.material.color.copy(p.c0);
    p.sprite.material.opacity = 1;
    p.sprite.scale.setScalar(o.size);
  }

  const _v = new THREE.Vector3(), _dir = new THREE.Vector3();
  function burst(o) {
    const n = o.count || 8;
    for (let i = 0; i < n; i++) {
      _dir.set(U.rand(-1, 1), U.rand(-1, 1), U.rand(-1, 1)).normalize();
      if (o.dir) {
        _dir.multiplyScalar(o.spread !== undefined ? o.spread : 0.5).add(o.dir).normalize();
      }
      const sp = U.rand(o.speed[0], o.speed[1]);
      _v.copy(_dir).multiplyScalar(sp);
      if (o.up) _v.y += o.up * U.rand(0.5, 1);
      spawnOne({
        pos: o.pos, vel: _v, gravity: o.gravity,
        life: U.rand(o.life[0], o.life[1]),
        size: o.size * U.rand(0.7, 1.3), sizeEnd: o.sizeEnd,
        color: o.color, colorEnd: o.colorEnd, tex: o.tex || 'dot',
      });
    }
  }

  // ---------- 斩击弧光池 ----------
  const slashes = [];
  function buildSlashes() {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.MeshBasicMaterial({
        map: tex.slash, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0,
      });
      const mesh = new THREE.Mesh(geo, m);
      mesh.visible = false;
      mesh.rotation.order = 'YXZ';
      scene.add(mesh);
      slashes.push({ mesh, alive: false, t: 0, scale: 1, spin: 0 });
    }
  }
  function slash(pos, yaw, color, scale = 2.2) {
    const s = slashes.find((x) => !x.alive) || slashes[0];
    s.alive = true; s.t = 0; s.scale = scale;
    s.spin = U.rand(-3, 3);
    s.mesh.visible = true;
    s.mesh.position.set(pos.x, pos.y !== undefined ? pos.y : 1.1, pos.z);
    s.mesh.rotation.set(U.rand(-0.35, 0.35), yaw, 0);
    s.mesh.material.color.set(color);
  }

  // ---------- 冲击波池 ----------
  const waves = [];
  function buildWaves() {
    const geo = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.MeshBasicMaterial({
        transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0,
      });
      const mesh = new THREE.Mesh(geo, m);
      mesh.visible = false;
      scene.add(mesh);
      waves.push({ mesh, alive: false, t: 0, maxR: 5, dur: 0.35 });
    }
  }
  function shockwave(pos, color, maxR = 5, dur = 0.35) {
    const w = waves.find((x) => !x.alive) || waves[0];
    w.alive = true; w.t = 0; w.maxR = maxR; w.dur = dur;
    w.mesh.visible = true;
    w.mesh.position.set(pos.x, 0.15, pos.z);
    w.mesh.material.color.set(color);
  }

  // ---------- 预警贴花（同一时刻只有一个 Boss 预警）----------
  const decal = { group: null, outline: null, fill: null, kind: '', r: 1, len: 1, width: 1 };
  function buildDecal() {
    decal.group = new THREE.Group();
    decal.group.visible = false;
    const mk = (op) => new THREE.MeshBasicMaterial({
      color: 0xff4030, transparent: true, opacity: op, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    decal.outline = new THREE.Mesh(new THREE.BufferGeometry(), mk(0.18));
    decal.fill = new THREE.Mesh(new THREE.BufferGeometry(), mk(0.4));
    decal.group.add(decal.outline, decal.fill);
    scene.add(decal.group);
  }
  function setDecalGeo(mesh, geo) {
    if (mesh.geometry) mesh.geometry.dispose();
    mesh.geometry = geo;
  }
  function decalShow(kind, pos, yaw, opts) {
    decal.kind = kind;
    decal.group.visible = true;
    decal.group.position.set(pos.x, 0.13, pos.z);
    decal.group.rotation.y = yaw || 0;
    const color = opts.color !== undefined ? opts.color : 0xff4030;
    decal.outline.material.color.set(color);
    decal.fill.material.color.set(color);
    if (kind === 'ring') {
      decal.r = opts.r;
      setDecalGeo(decal.outline, new THREE.RingGeometry(0.955, 1, 56).rotateX(-Math.PI / 2));
      setDecalGeo(decal.fill, new THREE.CircleGeometry(1, 56).rotateX(-Math.PI / 2));
    } else if (kind === 'sector') {
      decal.r = opts.r;
      const half = opts.halfArc;
      const geoO = new THREE.CircleGeometry(1, 40, Math.PI / 2 - half, half * 2).rotateX(Math.PI / 2);
      setDecalGeo(decal.outline, geoO);
      setDecalGeo(decal.fill, geoO.clone());
    } else if (kind === 'line') {
      decal.len = opts.len; decal.width = opts.width;
      const geo = new THREE.PlaneGeometry(1, 1).rotateX(Math.PI / 2).translate(0, 0, 0.5);
      setDecalGeo(decal.outline, geo);
      setDecalGeo(decal.fill, geo.clone());
    }
    decalProgress(0);
  }
  function decalProgress(k) {
    if (!decal.group.visible) return;
    if (decal.kind === 'line') {
      decal.outline.scale.set(decal.width, 1, decal.len);
      decal.fill.scale.set(decal.width, 1, Math.max(decal.len * k, 0.001));
    } else {
      decal.outline.scale.setScalar(decal.r);
      decal.fill.scale.setScalar(Math.max(decal.r * k, 0.001));
    }
  }
  function decalHide() { decal.group.visible = false; }
  // 预警期间跟随施法者移动/转向（不重建几何体）
  function decalFollow(pos, yaw) {
    if (!decal.group.visible) return;
    decal.group.position.set(pos.x, 0.13, pos.z);
    if (yaw !== undefined) decal.group.rotation.y = yaw;
  }

  // ---------- 魅惑符阵 ----------
  const charm = { group: null, t: 0, dur: 0, alive: false };
  function buildCharm() {
    charm.group = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({
      color: CONFIG.COLORS.pink, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.55, 64).rotateX(-Math.PI / 2), ringMat);
    const runeMat = new THREE.MeshBasicMaterial({
      map: tex.rune, color: CONFIG.COLORS.pink, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const rune = new THREE.Mesh(new THREE.CircleGeometry(2.25, 48).rotateX(-Math.PI / 2), runeMat);
    rune.position.y = 0.02;
    charm.group.add(ring, rune);
    charm.group.position.y = 0.18;
    charm.group.visible = false;
    scene.add(charm.group);
  }
  function charmShow(pos, dur) {
    charm.alive = true; charm.t = 0; charm.dur = dur;
    charm.group.visible = true;
    charm.group.position.set(pos.x, 0.18, pos.z);
    burst({
      pos: new THREE.Vector3(pos.x, 1.2, pos.z), count: 16, speed: [1, 3], up: 1.5, spread: 1,
      life: [0.5, 1], size: 0.3, sizeEnd: 0.05, color: CONFIG.COLORS.pink, colorEnd: 0xffffff, gravity: -0.5,
    });
  }

  // ---------- 残影（玩家闪避）----------
  const ghosts = [];
  function initGhosts(srcRoot, count = 4) {
    for (let i = 0; i < count; i++) {
      const root = srcRoot.clone(true);
      const mat = new THREE.MeshBasicMaterial({
        color: CONFIG.COLORS.cyan, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const nodes = [];
      root.traverse((n) => {
        if (n.isMesh) { n.material = mat; n.castShadow = false; n.receiveShadow = false; }
        if (n.isSprite) n.visible = false; // clone 不复制材质，残影里的狐火/光点会共享活体材质永不褪色——直接隐藏
        nodes.push(n);
      });
      const srcNodes = [];
      srcRoot.traverse((n) => srcNodes.push(n));
      root.visible = false;
      scene.add(root);
      ghosts.push({ root, nodes, srcNodes, mat, t: 0, life: 0.32, alive: false });
    }
  }
  function spawnGhost() {
    const g = ghosts.find((x) => !x.alive) || ghosts[0];
    if (!g) return;
    for (let i = 0; i < g.nodes.length; i++) {
      const s = g.srcNodes[i], d = g.nodes[i];
      if (!s || !d) continue;
      d.position.copy(s.position);
      d.quaternion.copy(s.quaternion);
      d.scale.copy(s.scale);
    }
    g.alive = true; g.t = 0;
    g.root.visible = true;
    g.mat.opacity = 0.4;
  }

  // ---------- 伤害数字（DOM）----------
  const dmgPool = [];
  const _proj = new THREE.Vector3();
  function buildDmgPool() {
    const layer = document.getElementById('dmg-layer');
    for (let i = 0; i < 24; i++) {
      const el = document.createElement('div');
      el.className = 'dmg';
      el.style.display = 'none';
      layer.appendChild(el);
      dmgPool.push({ el, alive: false, t: 0, life: 0.75, world: new THREE.Vector3() });
    }
  }
  function dmgNumber(worldPos, text, kind = '') {
    const d = dmgPool.find((x) => !x.alive) || dmgPool[0];
    d.alive = true; d.t = 0;
    d.world.copy(worldPos);
    d.world.y += U.rand(0.2, 0.7);
    d.world.x += U.rand(-0.4, 0.4);
    d.el.textContent = text;
    d.el.className = 'dmg ' + kind;
    d.el.style.display = 'block';
  }

  // ---------- 震屏 ----------
  let trauma = 0;
  const shakeOut = { x: 0, y: 0, roll: 0 };
  function addTrauma(x) { trauma = Math.min(trauma + x, 1); }
  function computeShake(rt) {
    const m = trauma * trauma;
    shakeOut.x = Math.sin(rt * 37.7) * 0.35 * m;
    shakeOut.y = Math.sin(rt * 43.1 + 1.3) * 0.28 * m;
    shakeOut.roll = Math.sin(rt * 53.3) * 0.022 * m;
    return shakeOut;
  }

  // ---------- 主更新 ----------
  function update(dt, rt, camera) {
    trauma = Math.max(0, trauma - 1.5 * dt);

    for (const p of particles) {
      if (!p.alive) continue;
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) { p.alive = false; p.sprite.visible = false; continue; }
      p.vel.y -= p.gravity * dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      p.sprite.scale.setScalar(U.lerp(p.size0, p.size1, k));
      p.sprite.material.opacity = 1 - k;
      p.sprite.material.color.copy(p.c0).lerp(p.c1, k);
    }

    for (const s of slashes) {
      if (!s.alive) continue;
      s.t += dt;
      const k = s.t / 0.18;
      if (k >= 1) { s.alive = false; s.mesh.visible = false; continue; }
      const e = U.easeOutCubic(k);
      s.mesh.scale.setScalar((0.7 + e * 0.9) * s.scale);
      s.mesh.rotation.y += s.spin * dt;
      s.mesh.material.opacity = (1 - k) * 0.9;
    }

    for (const w of waves) {
      if (!w.alive) continue;
      w.t += dt;
      const k = w.t / w.dur;
      if (k >= 1) { w.alive = false; w.mesh.visible = false; continue; }
      w.mesh.scale.setScalar(Math.max(U.easeOutCubic(k) * w.maxR, 0.001));
      w.mesh.material.opacity = (1 - k) * 0.7;
    }

    if (decal.group && decal.group.visible) {
      decal.fill.material.opacity = 0.33 + Math.sin(rt * 18) * 0.09;
    }

    if (charm.alive) {
      charm.t += dt;
      charm.group.rotation.y += dt * 0.8;
      const k = charm.t / charm.dur;
      if (k >= 1) { charm.alive = false; charm.group.visible = false; }
      else {
        const fade = Math.min(1, Math.min(charm.t / 0.2, (charm.dur - charm.t) / 0.4));
        charm.group.children.forEach((c) => { c.material.opacity = 0.85 * fade; });
      }
    }

    for (const g of ghosts) {
      if (!g.alive) continue;
      g.t += dt;
      const k = g.t / g.life;
      if (k >= 1) { g.alive = false; g.root.visible = false; continue; }
      g.mat.opacity = 0.4 * (1 - k);
    }

    const w2 = window.innerWidth, h2 = window.innerHeight;
    for (const d of dmgPool) {
      if (!d.alive) continue;
      d.t += dt;
      const k = d.t / d.life;
      if (k >= 1) { d.alive = false; d.el.style.display = 'none'; continue; }
      _proj.copy(d.world).project(camera);
      if (_proj.z > 1) { d.el.style.display = 'none'; continue; }
      d.el.style.display = 'block';
      const x = (_proj.x * 0.5 + 0.5) * w2;
      const y = (-_proj.y * 0.5 + 0.5) * h2 - U.easeOutCubic(k) * 60;
      d.el.style.transform = `translate(-50%,-100%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      d.el.style.opacity = String(1 - k * k);
    }
  }

  function clear() {
    for (const p of particles) { p.alive = false; p.sprite.visible = false; }
    for (const s of slashes) { s.alive = false; s.mesh.visible = false; }
    for (const w of waves) { w.alive = false; w.mesh.visible = false; }
    for (const g of ghosts) { g.alive = false; g.root.visible = false; }
    for (const d of dmgPool) { d.alive = false; d.el.style.display = 'none'; }
    charm.alive = false;
    if (charm.group) charm.group.visible = false;
    decalHide();
    trauma = 0;
  }

  return {
    init(sceneRef) {
      scene = sceneRef;
      buildTextures();
      buildParticles();
      buildSlashes();
      buildWaves();
      buildDecal();
      buildCharm();
      buildDmgPool();
    },
    burst, slash, shockwave,
    decalShow, decalProgress, decalHide, decalFollow,
    charmShow,
    initGhosts, spawnGhost,
    dmgNumber,
    addTrauma, computeShake,
    update, clear,
  };
})();
