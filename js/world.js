// 竞技场：月夜朱雀台废墟 —— 水墨+鎏金
// 全程序化：石板地（实例化）、断柱、巨月、星空、雾、火盆。
// assets/skybox.jpg + ground.jpg 存在且 WebGL 纹理可用时自动升级。
// CGI 质感升级：PMREM 环境贴图 + 大气层次（远山剪影 / 地面流雾 / 飘雪 / 月光柱）。
window.World = (() => {
  let scene = null;
  const state = {
    skyMesh: null,
    braziers: [],   // {light, flame, pos}
    dust: null,
    emberTimer: 0,
    fogPlanes: [],  // {mesh, dir, base, phase, speed}
    snow: null,     // {points, pos, vel, phase} —— 飘落灰烬/雪
  };

  function makeCanvasTex(w, h, draw, srgb) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    // srgb 默认 true（颜色纹理）；bump/alpha 等数据纹理传 false 走线性
    if (srgb !== false) t.encoding = THREE.sRGBEncoding;
    return t;
  }

  // ---------- 任务1：PMREM 环境贴图（CGI 质感底座）----------
  // 手搭「暗房间」：黑盒 + 几块发光面板，烘成环境贴图喂给所有 PBR 材质。
  function buildEnvironment(renderer) {
    if (!renderer) return; // 没拿到 renderer 就跳过，材质退化为纯灯光
    const room = new THREE.Scene();
    const disposables = []; // 待回收的几何体/材质（不含 render target）

    // 10×10×10 黑盒（BackSide），墨蓝近黑
    const boxGeo = new THREE.BoxGeometry(10, 10, 10);
    const boxMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(0.015, 0.025, 0.055),
      side: THREE.BackSide,
    });
    room.add(new THREE.Mesh(boxGeo, boxMat));
    disposables.push(boxGeo, boxMat);

    // 朝内发光面板：addPanel(几何, 颜色, 位置, 朝向目标点)
    const addPanel = (geo, color, px, py, pz, rx, ry, rz) => {
      const mat = new THREE.MeshBasicMaterial({ color, side: THREE.FrontSide });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.rotation.set(rx, ry, rz);
      room.add(m);
      disposables.push(geo, mat);
    };

    // 顶部冷月白（高光来源）—— 平面默认朝 +Z，绕 X 转 +90° 后法线朝下（朝内）
    addPanel(new THREE.PlaneGeometry(3, 3), new THREE.Color().setRGB(5, 5.5, 6.5),
      0, 4.9, 0, Math.PI / 2, 0, 0);
    // 两面墙低位暖金条（鎏金反射来源）
    addPanel(new THREE.PlaneGeometry(8, 0.7), new THREE.Color().setRGB(3.2, 2.1, 0.8),
      0, -3.4, -4.9, 0, 0, 0);              // 后墙，法线朝 +Z（朝内）
    addPanel(new THREE.PlaneGeometry(8, 0.7), new THREE.Color().setRGB(3.2, 2.1, 0.8),
      -4.9, -3.4, 0, 0, Math.PI / 2, 0);    // 左墙，法线朝 +X（朝内）
    // 一块青色点缀（冷暖对比里的一点妖青）
    addPanel(new THREE.PlaneGeometry(1.5, 1.5), new THREE.Color().setRGB(0.5, 2.6, 2.3),
      4.9, 1.0, 0, 0, -Math.PI / 2, 0);     // 右墙，法线朝 -X（朝内）

    const pmrem = new THREE.PMREMGenerator(renderer);
    const rt = pmrem.fromScene(room, 0.04);
    scene.environment = rt.texture; // PMREM 输出按线性消费，不设 encoding
    pmrem.dispose();
    // 回收房间几何体/材质（render target 仍被 scene.environment 引用，不能 dispose）
    for (const d of disposables) d.dispose();
  }

  function buildSky() {
    // 程序化夜空：墨黑 → 深靛 → 地平线月银
    const tex = makeCanvasTex(4, 512, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0.0, '#04050a');
      grad.addColorStop(0.45, '#0b1024');
      grad.addColorStop(0.8, '#1a2342');
      grad.addColorStop(1.0, '#2c3a55');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    });
    const geo = new THREE.SphereGeometry(200, 24, 16);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false });
    state.skyMesh = new THREE.Mesh(geo, mat);
    state.skyMesh.renderOrder = -10;
    scene.add(state.skyMesh);

    // 星星
    const n = 300;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const elev = Math.random() * Math.PI * 0.45 + 0.08;
      const r = 190;
      pos[i * 3] = r * Math.cos(elev) * Math.sin(a);
      pos[i * 3 + 1] = r * Math.sin(elev);
      pos[i * 3 + 2] = r * Math.cos(elev) * Math.cos(a);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const sm = new THREE.PointsMaterial({ color: 0xcdd8ff, size: 0.7, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 });
    scene.add(new THREE.Points(sg, sm));

    // 巨月 + 辉光
    const moon = new THREE.Mesh(
      new THREE.CircleGeometry(11, 48),
      new THREE.MeshBasicMaterial({ color: 0xf4f0e0, fog: false })
    );
    moon.position.set(-75, 42, -140);
    moon.lookAt(0, 8, 0);
    scene.add(moon);
    const glowTex = makeCanvasTex(128, 128, (g, w, h) => {
      const grad = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(244,240,224,0.8)');
      grad.addColorStop(0.4, 'rgba(200,205,235,0.25)');
      grad.addColorStop(1, 'rgba(200,205,235,0)');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    });
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, fog: false, transparent: true, depthWrite: false }));
    glow.scale.setScalar(55);
    glow.position.copy(moon.position);
    scene.add(glow);
  }

  function buildFloor() {
    // 石板地：实例化盒子 + 轻微高度/旋转抖动 = 废墟感
    const tileGeo = new THREE.BoxGeometry(1.9, 0.28, 1.9);
    const tileMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0.05 });
    tileMat.envMapIntensity = 0.18; // 环境贴图微反射，地面有湿冷质感
    // 程序化凹凸：噪声 bump 让石板表面不再死平
    tileMat.bumpMap = makeCanvasTex(128, 128, (g, w, h) => {
      const img = g.createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        // 邻域平均 = 轻微模糊感，避免单像素硬噪点
        const v = 110 + (Math.random() * 90 - 45);
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      // 叠一层半透明柔光，模拟磨损起伏
      g.globalAlpha = 0.35;
      for (let k = 0; k < 24; k++) {
        const rr = U.rand(8, 26);
        const gx = U.rand(0, w), gy = U.rand(0, h);
        const rad = g.createRadialGradient(gx, gy, 0, gx, gy, rr);
        rad.addColorStop(0, 'rgba(160,160,160,1)');
        rad.addColorStop(1, 'rgba(160,160,160,0)');
        g.fillStyle = rad; g.beginPath(); g.arc(gx, gy, rr, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    }, false);
    tileMat.bumpMap.wrapS = tileMat.bumpMap.wrapT = THREE.RepeatWrapping;
    tileMat.bumpScale = 0.04;
    const groundTex = Assets.tex('ground');
    if (groundTex) tileMat.map = groundTex;

    const positions = [];
    for (let x = -26; x <= 26; x += 2) {
      for (let z = -26; z <= 26; z += 2) {
        if (Math.hypot(x, z) <= 26.5) positions.push([x, z]);
      }
    }
    const inst = new THREE.InstancedMesh(tileGeo, tileMat, positions.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    const col = new THREE.Color();
    positions.forEach(([x, z], i) => {
      e.set(0, U.rand(-0.02, 0.02), 0);
      q.setFromEuler(e);
      v.set(x + U.rand(-0.03, 0.03), -0.14 + U.rand(-0.035, 0.025), z + U.rand(-0.03, 0.03));
      m.compose(v, q, s);
      inst.setMatrixAt(i, m);
      const shade = U.rand(0.78, 1.12);
      if (groundTex) col.setRGB(0.24 * shade, 0.25 * shade, 0.3 * shade); // 压暗贴图地砖保住夜景
      else col.setRGB(0.165 * shade, 0.172 * shade, 0.2 * shade);
      inst.setColorAt(i, col);
    });
    inst.receiveShadow = true;
    scene.add(inst);

    // 鎏金嵌环
    const ringMat = new THREE.MeshBasicMaterial({
      color: CONFIG.COLORS.gold, transparent: true, opacity: 0.28,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    [[6, 0.14], [10.5, 0.1], [16, 0.08]].forEach(([r, w]) => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - w, r + w, 96), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
      scene.add(ring);
    });
  }

  function buildRuins() {
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x33343c, roughness: 0.85, metalness: 0.08 });
    stoneMat.envMapIntensity = 0.2;
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x26272e, roughness: 0.9 });
    darkMat.envMapIntensity = 0.2;
    const colGeo = new THREE.CylinderGeometry(0.95, 1.1, 1, 10);
    const capGeo = new THREE.BoxGeometry(2.6, 0.7, 2.6);

    // 断柱圈（全部在可玩半径 22 之外，相机永远不会被柱子卡住）
    const N = 10;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + 0.31;
      const r = U.rand(25, 28);
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      const broken = Math.random() < 0.4;
      const h = broken ? U.rand(2.5, 4.5) : U.rand(7, 9.5);
      const col = new THREE.Mesh(colGeo, stoneMat);
      col.scale.set(1, h, 1);
      col.position.set(x, h / 2, z);
      col.rotation.y = U.rand(0, Math.PI);
      if (broken) col.rotation.z = U.rand(-0.06, 0.06);
      col.castShadow = true;
      scene.add(col);
      if (!broken) {
        const cap = new THREE.Mesh(capGeo, darkMat);
        cap.position.set(x, h + 0.35, z);
        cap.rotation.y = col.rotation.y;
        scene.add(cap);
      } else {
        // 倒在旁边的断块
        const chunk = new THREE.Mesh(capGeo, darkMat);
        chunk.scale.setScalar(U.rand(0.5, 0.8));
        chunk.position.set(x + U.rand(-2, 2), 0.4, z + U.rand(-2, 2));
        chunk.rotation.set(U.rand(0, 0.6), U.rand(0, Math.PI), U.rand(0, 0.5));
        scene.add(chunk);
      }
    }

    // 残破山门（一侧的剪影）
    const gateMat = new THREE.MeshStandardMaterial({ color: 0x1d1e26, roughness: 0.95 });
    gateMat.envMapIntensity = 0.12;
    const gx = 0, gz = -30;
    [-4.5, 4.5].forEach((dx) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(1.6, 12, 1.6), gateMat);
      post.position.set(gx + dx, 6, gz);
      scene.add(post);
    });
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(13, 1.4, 2), gateMat);
    lintel.position.set(gx, 11.5, gz);
    lintel.rotation.z = 0.025;
    scene.add(lintel);
    const lintel2 = new THREE.Mesh(new THREE.BoxGeometry(10.5, 1.0, 1.7), gateMat);
    lintel2.position.set(gx, 13, gz);
    scene.add(lintel2);
  }

  function buildBraziers() {
    const flameTex = makeCanvasTex(64, 64, (g, w, h) => {
      const grad = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(255,210,120,1)');
      grad.addColorStop(0.35, 'rgba(255,140,50,0.6)');
      grad.addColorStop(1, 'rgba(255,90,20,0)');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    });
    const standMat = new THREE.MeshStandardMaterial({ color: 0x2c2117, roughness: 0.6, metalness: 0.6 });
    standMat.envMapIntensity = 0.5; // 金属架对环境反射更敏感
    [[14, 10], [-14, 10], [0, -17]].forEach(([x, z]) => {
      const g = new THREE.Group();
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 2.2, 8), standMat);
      stand.position.y = 1.1;
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.35, 0.5, 10), standMat);
      bowl.position.y = 2.4;
      g.add(stand, bowl);
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      flame.position.y = 3.0;
      flame.scale.set(1.6, 2.2, 1);
      g.add(flame);
      const light = new THREE.PointLight(0xff9a3c, 1.1, 20, 2);
      light.position.y = 3.1;
      g.add(light);
      g.position.set(x, 0, z);
      scene.add(g);
      state.braziers.push({ light, flame, pos: new THREE.Vector3(x, 3.0, z), seed: Math.random() * 10 });
    });
  }

  function buildDust() {
    // 漂浮尘埃
    const n = 80;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = U.rand(-20, 20);
      pos[i * 3 + 1] = U.rand(0.5, 7);
      pos[i * 3 + 2] = U.rand(-20, 20);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: 0x8d96b8, size: 0.06, transparent: true, opacity: 0.5, depthWrite: false });
    state.dust = new THREE.Points(g, m);
    scene.add(state.dust);
  }

  // ---------- 任务3：大气层次 ----------

  // 远景剪影纹理：黑色山脊轮廓 + 几棵枯树，下实上透
  function makeSilhouetteTex(baseColor) {
    return makeCanvasTex(512, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      // 山脊：一条折线填到底，下实上透由 alpha 渐变控制
      g.fillStyle = baseColor;
      g.beginPath();
      g.moveTo(0, h);
      let y = h * 0.55;
      g.lineTo(0, y);
      const segs = 14;
      for (let i = 1; i <= segs; i++) {
        const x = (i / segs) * w;
        y = h * (0.4 + Math.random() * 0.35);
        g.lineTo(x, y);
      }
      g.lineTo(w, h);
      g.closePath();
      g.fill();
      // 几棵枯树剪影（竖线 + 几根斜枝）
      const trees = 5;
      for (let t = 0; t < trees; t++) {
        const tx = (t + 0.5) / trees * w + U.rand(-20, 20);
        const th = U.rand(70, 130);
        const baseY = h * 0.62;
        g.strokeStyle = baseColor;
        g.lineWidth = U.rand(2, 4);
        g.beginPath();
        g.moveTo(tx, baseY); g.lineTo(tx, baseY - th);
        // 枝
        for (let b = 0; b < 4; b++) {
          const by = baseY - th * U.rand(0.4, 0.95);
          const len = U.rand(8, 22);
          const dir = Math.random() < 0.5 ? -1 : 1;
          g.moveTo(tx, by); g.lineTo(tx + dir * len, by - U.rand(4, 14));
        }
        g.stroke();
      }
      // 顶部 alpha 渐变：上虚下实，融入雾
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(0,0,0,1)');     // 顶部全裁
      grad.addColorStop(0.45, 'rgba(0,0,0,0.4)');
      grad.addColorStop(0.75, 'rgba(0,0,0,0)');  // 下部全留
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'source-over';
    });
  }

  function buildSilhouettes() {
    // 3 层水墨远山/枯树，半径与 opacity 递减，远层颜色偏浅融入雾色
    const layers = [
      { r: 60, count: 5, op: 0.55, color: '#10131f', wPlane: 60, hPlane: 30 },
      { r: 85, count: 5, op: 0.35, color: '#141a2c', wPlane: 80, hPlane: 38 },
      { r: 115, count: 4, op: 0.20, color: '#1a2238', wPlane: 110, hPlane: 48 },
    ];
    for (const L of layers) {
      const tex = makeSilhouetteTex(L.color);
      const mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: L.op,
        depthWrite: false, fog: false, side: THREE.DoubleSide,
      });
      for (let i = 0; i < L.count; i++) {
        const a = (i / L.count) * Math.PI * 2;
        const geo = new THREE.PlaneGeometry(L.wPlane, L.hPlane);
        const m = new THREE.Mesh(geo, mat);
        m.position.set(Math.sin(a) * L.r, L.hPlane * 0.35, Math.cos(a) * L.r);
        m.lookAt(0, L.hPlane * 0.35, 0); // 面向场景中心
        m.renderOrder = -8;
        scene.add(m);
      }
    }
  }

  // 柔和噪声雾纹理：径向衰减防硬边
  function makeFogTex() {
    return makeCanvasTex(128, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      // 底噪
      for (let k = 0; k < 60; k++) {
        const x = U.rand(0, w), y = U.rand(0, h), r = U.rand(10, 40);
        const rad = g.createRadialGradient(x, y, 0, x, y, r);
        const a = U.rand(0.02, 0.08);
        rad.addColorStop(0, 'rgba(200,210,230,' + a + ')');
        rad.addColorStop(1, 'rgba(200,210,230,0)');
        g.fillStyle = rad; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
      // 整体径向衰减罩，确保四边透明无硬切
      const mask = g.createRadialGradient(w / 2, h / 2, w * 0.1, w / 2, h / 2, w * 0.5);
      mask.addColorStop(0, 'rgba(0,0,0,0)');
      mask.addColorStop(1, 'rgba(0,0,0,1)');
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = mask; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'source-over';
    });
  }

  function buildGroundFog() {
    // 5 片大型水平雾平面，缓慢漂移
    const tex = makeFogTex();
    for (let i = 0; i < 5; i++) {
      const sz = U.rand(20, 30);
      const mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: U.rand(0.05, 0.10),
        depthWrite: false, fog: false, blending: THREE.NormalBlending, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), mat);
      mesh.rotation.x = -Math.PI / 2; // 水平躺放
      const a = Math.random() * Math.PI * 2;
      const rad = U.rand(0, 18);
      mesh.position.set(Math.cos(a) * rad, U.rand(0.4, 1.0), Math.sin(a) * rad);
      mesh.renderOrder = -6;
      scene.add(mesh);
      const da = Math.random() * Math.PI * 2;
      state.fogPlanes.push({
        mesh,
        dir: new THREE.Vector2(Math.cos(da), Math.sin(da)),
        speed: U.rand(0.2, 0.5),
        baseY: mesh.position.y,
        phase: Math.random() * 10,
      });
    }
  }

  function buildSnow() {
    // 漫天飘落灰烬/雪：独立 Points ~300，速度/相位存普通数组
    const n = 300;
    const pos = new Float32Array(n * 3);
    const vel = new Array(n);
    const phase = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 26; // 均匀分布在半径 26 圆内
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = U.rand(0, 12);
      pos[i * 3 + 2] = Math.sin(a) * r;
      vel[i] = U.rand(0.4, 0.8);
      phase[i] = Math.random() * Math.PI * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({
      color: 0xaab4cc, size: 0.07, transparent: true, opacity: 0.9,
      depthWrite: false, fog: true,
    });
    const points = new THREE.Points(g, m);
    points.frustumCulled = false; // 整片覆盖，别被裁
    scene.add(points);
    state.snow = { points, pos, vel, phase };
  }

  // 月光体积光假象：从月亮方向斜插地面的狭长光柱
  function buildMoonShafts() {
    const tex = makeCanvasTex(64, 256, (g, w, h) => {
      // 横向线性渐变：中亮边透
      const grad = g.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, 'rgba(190,205,235,0)');
      grad.addColorStop(0.5, 'rgba(200,212,240,1)');
      grad.addColorStop(1, 'rgba(190,205,235,0)');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    });
    const moonPos = new THREE.Vector3(-75, 42, -140);
    // 2-3 片光柱，落点散布在场内
    const targets = [
      new THREE.Vector3(-6, 0, -4),
      new THREE.Vector3(2, 0, 2),
      new THREE.Vector3(-2, 0, -10),
    ];
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const len = U.rand(40, 60);
      const wid = U.rand(3, 5);
      const mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: U.rand(0.04, 0.06),
        depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wid, len), mat);
      // 沿「月亮→落点」方向摆放，平面中点取两端中线
      const dir = new THREE.Vector3().subVectors(t, moonPos).normalize();
      const mid = new THREE.Vector3().copy(t).addScaledVector(dir, -len * 0.5);
      mesh.position.copy(mid);
      // 让平面的 +Y（长轴）对齐 dir
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      mesh.renderOrder = -5;
      scene.add(mesh);
    }
  }

  function buildLights() {
    // 夜景基调：总光量压低，亮部留给火盆/发光体/bloom（对齐黑神话的暗调）
    scene.add(new THREE.HemisphereLight(0x33415e, 0x0a0a12, 0.32));
    const moonLight = new THREE.DirectionalLight(0xbfd4ff, 0.6);
    moonLight.position.set(-30, 38, -45);
    if (CONFIG.SHADOWS) {
      moonLight.castShadow = true;
      moonLight.shadow.mapSize.set(1024, 1024);
      const d = 30;
      moonLight.shadow.camera.left = -d; moonLight.shadow.camera.right = d;
      moonLight.shadow.camera.top = d; moonLight.shadow.camera.bottom = -d;
      moonLight.shadow.camera.near = 5; moonLight.shadow.camera.far = 120;
      moonLight.shadow.bias = -0.002;
    }
    scene.add(moonLight);

    // 轮廓光：从相机后侧偏上扫出冷青边缘光，分离主体与背景（不投影）
    const rim = new THREE.DirectionalLight(0x6f9fc8, 0.38);
    rim.position.set(20, 14, 38);
    scene.add(rim);
  }

  return {
    init(sceneRef, renderer) {
      scene = sceneRef;
      scene.background = new THREE.Color(CONFIG.COLORS.bg);
      scene.fog = new THREE.FogExp2(CONFIG.COLORS.bg, CONFIG.COLORS.fogDensity);
      buildEnvironment(renderer); // 先烘环境贴图，后续 PBR 材质共享反射
      buildSky();
      buildSilhouettes();
      buildFloor();
      buildRuins();
      buildBraziers();
      buildGroundFog();
      buildSnow();
      buildMoonShafts();
      buildDust();
      buildLights();
    },

    // Assets 探测之后调用：有全景图就换天空
    applySky() {
      const tex = Assets.tex('skybox');
      if (tex && state.skyMesh) {
        state.skyMesh.material.map = tex;
        // 生成图普遍偏亮，乘色压暗成夜空（保住水墨夜的基调）
        state.skyMesh.material.color.set(0x2e3650);
        state.skyMesh.material.needsUpdate = true;
        state.skyMesh.scale.x = -1; // 镜像修正：从球内看全景
      }
    },

    update(dt, t) {
      // 火盆闪烁 + 余烬
      for (const b of state.braziers) {
        const f = Math.sin(t * 9 + b.seed) * 0.5 + Math.sin(t * 23 + b.seed * 2) * 0.5;
        b.light.intensity = 1.1 + f * 0.25;
        b.flame.scale.set(1.6 + f * 0.15, 2.2 + f * 0.3, 1);
      }
      state.emberTimer -= dt;
      if (state.emberTimer <= 0 && window.VFX) {
        state.emberTimer = 0.5;
        const b = state.braziers[U.randInt(0, state.braziers.length - 1)];
        VFX.burst({
          pos: b.pos, count: 2, tex: 'ember', speed: [0.3, 0.9], up: 1.2, spread: 0.4,
          life: [1.2, 2.2], size: 0.1, sizeEnd: 0.02, color: 0xffb050, colorEnd: 0xff3010, gravity: 0.4,
        });
      }
      // 尘埃缓慢漂移
      if (state.dust) { state.dust.rotation.y = t * 0.012; state.dust.position.y = Math.sin(t * 0.3) * 0.3; }

      // 地面流雾：各自方向漂移 + 轻微起伏，越界绕回
      for (const fp of state.fogPlanes) {
        const p = fp.mesh.position;
        p.x += fp.dir.x * fp.speed * dt;
        p.z += fp.dir.y * fp.speed * dt;
        if (Math.hypot(p.x, p.z) > 28) { p.x = -p.x * 0.6; p.z = -p.z * 0.6; } // 绕回中心侧
        p.y = fp.baseY + Math.sin(t * 0.4 + fp.phase) * 0.15;
      }

      // 飘落灰烬/雪：每粒下落 + 横向摆动，落地回顶
      if (state.snow) {
        const sn = state.snow;
        const arr = sn.pos;
        for (let i = 0; i < sn.vel.length; i++) {
          const iy = i * 3 + 1;
          arr[iy] -= sn.vel[i] * dt;
          arr[i * 3] += Math.sin(t * 0.8 + sn.phase[i]) * 0.15 * dt; // 横向飘
          if (arr[iy] < 0) {
            arr[iy] = 12;
            const a = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * 26;
            arr[i * 3] = Math.cos(a) * r;
            arr[i * 3 + 2] = Math.sin(a) * r;
          }
        }
        sn.points.geometry.attributes.position.needsUpdate = true;
      }
    },
  };
})();
