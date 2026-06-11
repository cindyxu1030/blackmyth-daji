// 妲己：程序化九尾狐模型 + 全技能组。
// 模型 = THREE.Group 枢轴层级 + 基础几何体；动画 = 正弦循环 + 状态姿态覆盖。
// buildFox / foxAnimate 被分身(clone.js)和哮天犬(boss.js)复用。

// ---------- 共享几何体 ----------
const FOX_GEO = {
  sphere: new THREE.SphereGeometry(1, 14, 11),
  cone: new THREE.ConeGeometry(1, 1, 10),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 8),
  box: new THREE.BoxGeometry(1, 1, 1),
};

// opts: {scale, tails, segs, bodyColor, accentColor, eyeColor, ghostMat, bulky}
function buildFox(opts = {}) {
  const scale = opts.scale || 1;
  const nTails = opts.tails !== undefined ? opts.tails : 9;
  const nSegs = opts.segs || 6;

  const mats = opts.ghostMat ? null : {
    body: new THREE.MeshStandardMaterial({ color: opts.bodyColor !== undefined ? opts.bodyColor : 0x17171d, roughness: 0.55, metalness: 0.1 }),
    cream: new THREE.MeshStandardMaterial({ color: 0xcfc4ae, roughness: 0.8 }),
    accent: new THREE.MeshStandardMaterial({ color: 0x8a6a1f, roughness: 0.35, metalness: 0.6, emissive: opts.accentColor !== undefined ? opts.accentColor : 0xd4af37, emissiveIntensity: 0.45 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: opts.eyeColor !== undefined ? opts.eyeColor : 0x6ef0e0, emissiveIntensity: 1.6 }),
    tip: new THREE.MeshStandardMaterial({ color: 0x222228, roughness: 0.5, emissive: opts.accentColor !== undefined ? opts.accentColor : 0xd4af37, emissiveIntensity: 0.7 }),
  };
  const M = (kind) => (opts.ghostMat ? opts.ghostMat : mats[kind]);
  const mesh = (geo, mat, sx, sy, sz, x, y, z, cast) => {
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    if (cast && !opts.ghostMat) m.castShadow = true;
    return m;
  };

  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.85 * scale;
  root.add(body);

  const bulk = opts.bulky ? 1.18 : 1;
  body.add(mesh(FOX_GEO.sphere, M('body'), 0.42 * bulk, 0.36 * bulk, 0.78, 0, 0, 0, true));
  body.add(mesh(FOX_GEO.sphere, M(opts.bulky ? 'body' : 'cream'), 0.3 * bulk, 0.28 * bulk, 0.3, 0, -0.08, 0.5, false));

  // 头
  const head = new THREE.Group();
  head.position.set(0, 0.34, 0.78);
  body.add(head);
  head.add(mesh(FOX_GEO.sphere, M('body'), 0.26, 0.24, 0.26, 0, 0, 0, true));
  const snout = mesh(FOX_GEO.cone, M('body'), 0.12, 0.36, 0.12, 0, -0.06, 0.32, false);
  snout.rotation.x = Math.PI / 2;
  head.add(snout);
  [-1, 1].forEach((s) => {
    const ear = mesh(FOX_GEO.cone, M('body'), 0.1, 0.32, 0.05, s * 0.15, 0.3, -0.04, false);
    ear.rotation.z = -s * 0.28;
    const inner = mesh(FOX_GEO.cone, M('accent'), 0.05, 0.2, 0.03, s * 0.14, 0.26, -0.01, false);
    inner.rotation.z = -s * 0.28;
    head.add(ear, inner);
    head.add(mesh(FOX_GEO.sphere, M('eye'), 0.05, 0.05, 0.04, s * 0.12, 0.04, 0.22, false));
  });
  const brow = mesh(FOX_GEO.box, M('accent'), 0.06, 0.13, 0.02, 0, 0.18, 0.2, false);
  brow.rotation.x = -0.4;
  head.add(brow);

  // 四肢（髋部枢轴 + 膝部枢轴）
  const legs = [];
  [[-0.26, 0.45], [0.26, 0.45], [-0.26, -0.45], [0.26, -0.45]].forEach(([x, z]) => {
    const hip = new THREE.Group();
    hip.position.set(x * bulk, -0.26, z);
    body.add(hip);
    const upper = mesh(FOX_GEO.cyl, M('body'), 0.06, 0.36, 0.06, 0, -0.18, 0, false);
    hip.add(upper);
    const knee = new THREE.Group();
    knee.position.y = -0.36;
    hip.add(knee);
    knee.add(mesh(FOX_GEO.cyl, M('body'), 0.045, 0.34, 0.045, 0, -0.17, 0, false));
    knee.add(mesh(FOX_GEO.sphere, M('body'), 0.065, 0.05, 0.09, 0, -0.34, 0.02, false));
    legs.push({ hip, knee });
  });

  // 尾巴：逐节链式 parent，正弦相位差 = 液态摆动
  const tailRoot = new THREE.Group();
  tailRoot.position.set(0, 0.12, -0.72);
  body.add(tailRoot);
  const tails = [];
  for (let i = 0; i < nTails; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = (i - (nTails - 1) / 2) * U.deg(16);
    pivot.rotation.x = 0.55 + Math.abs(i - (nTails - 1) / 2) * 0.04;
    tailRoot.add(pivot);
    const segGroups = [];
    let parent = pivot;
    for (let j = 0; j < nSegs; j++) {
      const k = j / (nSegs - 1);
      const len = U.lerp(0.34, 0.16, k);
      const r = U.lerp(0.085, 0.028, k);
      const seg = new THREE.Group();
      seg.position.z = j === 0 ? 0 : -U.lerp(0.34, 0.16, (j - 1) / (nSegs - 1));
      parent.add(seg);
      seg.add(mesh(FOX_GEO.sphere, j === nSegs - 1 ? M('tip') : M('body'), r, r, len * 0.72, 0, 0, -len / 2, false));
      segGroups.push(seg);
      parent = seg;
    }
    tails.push(segGroups);
  }

  root.scale.setScalar(scale);
  return { root, body, head, legs, tailRoot, tails, mats };
}

// 共享的狐狸基础动画（跑动循环 + 尾巴）
// anim: {phase, speedRatio, tailAmp, yawVel, lean}
function foxAnimate(fox, anim, dt, t) {
  const sr = anim.speedRatio;
  anim.phase += dt * (4 + sr * 9);

  for (let i = 0; i < fox.legs.length; i++) {
    const ph = anim.phase + (i === 0 || i === 3 ? 0 : Math.PI);
    fox.legs[i].hip.rotation.x = Math.sin(ph) * 0.85 * sr;
    fox.legs[i].knee.rotation.x = Math.max(0, -Math.sin(ph + 0.5)) * 1.15 * sr + 0.08;
  }

  fox.body.position.y = 0.85 + Math.abs(Math.sin(anim.phase * 2)) * 0.07 * sr + Math.sin(t * 2.1) * 0.015;
  anim.lean = U.damp(anim.lean, sr * 0.14, 8, dt);
  fox.body.rotation.x = anim.lean + (anim.poseBodyPitch || 0);
  fox.head.rotation.x = -anim.lean * 0.7 + Math.sin(t * 1.3) * 0.04;

  // 尾巴：每节相位差 + 转身惯性滞后
  const amp = 0.12 * (anim.tailAmp || 1) + sr * 0.05;
  for (let i = 0; i < fox.tails.length; i++) {
    const segs = fox.tails[i];
    for (let j = 0; j < segs.length; j++) {
      segs[j].rotation.y = Math.sin(t * 2.2 + j * 0.55 + i * 0.9) * amp;
      segs[j].rotation.x = Math.sin(t * 1.7 + j * 0.4 + i * 0.5) * amp * 0.5;
    }
  }
  fox.tailRoot.rotation.y = U.damp(fox.tailRoot.rotation.y, U.clamp(-anim.yawVel * 0.45, -0.8, 0.8), 6, dt);
}

// ---------- 妲己人形模型（黑金汉服九尾狐女）----------
// 立绘参考 assets/title.png + assets/ref_daji.png：黑色汉服重金线刺绣、金冠长黑发、
// 九条发光白金尾、苍白皮肤、金色丹凤眼、风格化面具脸（无鼻无嘴防恐怖谷）。

// 共享几何体：高精球 + 开口锥台（裙/袖共用）+ 环 + 锥 + 盒 + 柱
const DAJI_GEO = {
  sphere: new THREE.SphereGeometry(1, 24, 18),
  taper: new THREE.CylinderGeometry(0.8, 1, 1, 14, 1, true), // 开口锥台：上窄下宽
  torus: new THREE.TorusGeometry(1, 0.05, 8, 24),
  cone: new THREE.ConeGeometry(1, 1, 12),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
};

// 狐火精灵贴图：32×32 径向渐变，模块级生成一次共享
let DAJI_WISP_TEX = null;
function dajiWispTexture() {
  if (DAJI_WISP_TEX) return DAJI_WISP_TEX;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(160,255,240,0.7)');
  g.addColorStop(1, 'rgba(110,240,224,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  DAJI_WISP_TEX = new THREE.CanvasTexture(cv);
  return DAJI_WISP_TEX;
}

// opts: {scale, tails, segs, ghostMat}
// ghostMat 存在时所有网格用它（分身幽灵），并跳过 wisp 精灵。
function buildDaji(opts = {}) {
  const scale = opts.scale || 1;
  const nTails = opts.tails !== undefined ? opts.tails : 9;
  const nSegs = opts.segs || 6;

  const mats = opts.ghostMat ? null : {
    // 黑色绸缎汉服：sheen 金色光泽
    silk: new THREE.MeshPhysicalMaterial({ color: 0x121017, roughness: 0.55, sheen: 1.0, sheenColor: new THREE.Color(0xd4af37), sheenRoughness: 0.35, side: THREE.DoubleSide, envMapIntensity: 0.9 }),
    // 金饰：冠、腰封、领、裙边、步摇
    gold: new THREE.MeshStandardMaterial({ color: 0xc9a13b, metalness: 1.0, roughness: 0.22, emissive: 0xd4af37, emissiveIntensity: 0.15, envMapIntensity: 1.3 }),
    // 苍白皮肤
    skin: new THREE.MeshPhysicalMaterial({ color: 0xf2e6d8, roughness: 0.45, envMapIntensity: 0.6 }),
    // 长黑发：微蓝 sheen
    hair: new THREE.MeshPhysicalMaterial({ color: 0x0d0d14, roughness: 0.35, sheen: 0.6, sheenColor: new THREE.Color(0x4a6fae), sheenRoughness: 0.45, envMapIntensity: 0.7 }),
    // 发光白金尾（普通节）
    tail: new THREE.MeshStandardMaterial({ color: 0xd9c8a8, roughness: 0.6, emissive: 0xd4af37, emissiveIntensity: 0.14 }),
    // 尾尖（末 2 节）：强发光
    tailTip: new THREE.MeshStandardMaterial({ color: 0xe8dcc8, roughness: 0.5, emissive: 0xd4af37, emissiveIntensity: 1.4 }),
    // 金色丹凤眼
    eye: new THREE.MeshStandardMaterial({ color: 0x110800, emissive: 0xffc14d, emissiveIntensity: 2.2 }),
  };
  const M = (kind) => (opts.ghostMat ? opts.ghostMat : mats[kind]);
  const mesh = (geo, mat, sx, sy, sz, x, y, z, cast) => {
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    if (cast && !opts.ghostMat) m.castShadow = true;
    return m;
  };

  const root = new THREE.Group();

  // 腰部枢轴：所有上身部件挂在 body，总高约 1.8
  const body = new THREE.Group();
  body.position.y = 1.05 * scale;
  root.add(body);

  // ---------- 裙：4 节链式锥台，A 字裙复利收成 ----------
  const skirt = [];
  {
    const topR = 0.16;             // 顶半径（贴腰，防棋子感）
    const segH = [0.28, 0.25, 0.22, 0.18];
    let parent = body;
    let curTop = topR;
    for (let j = 0; j < 4; j++) {
      const pivot = new THREE.Group();
      // 第一节挂腰部下缘，其余挂上一节底部
      pivot.position.y = j === 0 ? -0.02 : -segH[j - 1];
      parent.add(pivot);
      const botR = curTop * 1.17;  // 收敛的 A 字（×1.17 复利，柔和不像圆锥）
      const h = segH[j];
      // 共享开口锥台 scale 实现；z 压 0.88 = 椭圆截面，更像裙不像漏斗
      const m = mesh(DAJI_GEO.taper, M('silk'), botR, h, botR * 0.88, 0, -h / 2, 0, true);
      pivot.add(m);
      // 最末节底缘加金 torus 裙边（半径比裙摆大 0.015 防 z-fight）
      if (j === 3) {
        const hem = mesh(DAJI_GEO.torus, M('gold'), botR + 0.015, (botR + 0.015) * 0.88, 1, 0, -h, 0, false);
        hem.rotation.x = Math.PI / 2;
        hem.scale.z = 0.18; // 压扁环管视觉
        pivot.add(hem);
      }
      skirt.push(pivot);
      curTop = botR;
      parent = pivot;
    }
  }

  // ---------- 躯干 ----------
  body.add(mesh(DAJI_GEO.sphere, M('silk'), 0.22, 0.34, 0.18, 0, 0.18, 0, true));
  // 金腰封：压扁 torus
  const belt = mesh(DAJI_GEO.torus, M('gold'), 0.23, 0.23, 1, 0, -0.02, 0, false);
  belt.rotation.x = Math.PI / 2;
  belt.scale.z = 0.12;
  body.add(belt);
  // 锁骨金领：细横条
  const collar = mesh(DAJI_GEO.box, M('gold'), 0.26, 0.02, 0.04, 0, 0.42, 0.1, false);
  body.add(collar);

  // ---------- 手臂 ----------
  const sleeves = [];
  const shoulders = {};
  const elbows = {};
  [-1, 1].forEach((s) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.23, 0.46, 0);
    shoulder.rotation.z = -s * 0.35; // 静息外张（左 s=-1 → +0.35，右 s=1 → -0.35）
    body.add(shoulder);
    // 上臂 silk 圆柱（pivot 在肩，向下）
    shoulder.add(mesh(DAJI_GEO.cyl, M('silk'), 0.05, 0.3, 0.05, 0, -0.15, 0, false));
    const elbow = new THREE.Group();
    elbow.position.y = -0.3;
    shoulder.add(elbow);
    // 前臂
    elbow.add(mesh(DAJI_GEO.cyl, M('silk'), 0.042, 0.26, 0.042, 0, -0.13, 0, false));
    // 手 skin 小球
    elbow.add(mesh(DAJI_GEO.sphere, M('skin'), 0.05, 0.05, 0.05, 0, -0.27, 0, false));
    // 广袖：开口锥台挂在肘部，开口朝下
    const sleevePivot = new THREE.Group();
    sleevePivot.position.y = -0.05;
    elbow.add(sleevePivot);
    sleevePivot.add(mesh(DAJI_GEO.taper, M('silk'), 0.13, 0.42, 0.13, 0, -0.21, 0, false));
    sleeves.push(sleevePivot);
    if (s < 0) { shoulders.L = shoulder; elbows.L = elbow; }
    else { shoulders.R = shoulder; elbows.R = elbow; }
  });

  // ---------- 头 ----------
  const head = new THREE.Group();
  head.position.set(0, 0.78, 0);
  body.add(head);
  // 苍白脸（无鼻无嘴）
  head.add(mesh(DAJI_GEO.sphere, M('skin'), 0.155, 0.18, 0.16, 0, 0, 0, true));
  // 发罩：FrontSide hair，偏移留出脸部开口（壳间隙 ≥ 0.015）
  const hairCap = new THREE.Mesh(DAJI_GEO.sphere, opts.ghostMat ? opts.ghostMat : (() => {
    const m = mats.hair.clone();
    m.side = THREE.FrontSide;
    return m;
  })());
  hairCap.scale.set(0.188, 0.205, 0.192); // 包住后脑+侧面，只留正面脸部开口
  hairCap.position.set(0, 0.035, -0.052);
  if (!opts.ghostMat) hairCap.castShadow = true;
  head.add(hairCap);
  // 丹凤眼：压扁小球上挑
  [-1, 1].forEach((s) => {
    const eye = mesh(DAJI_GEO.sphere, M('eye'), 0.035, 0.013, 0.012, s * 0.065, 0.01, 0.145, false);
    eye.rotation.z = -s * 0.22;
    head.add(eye);
  });
  // 眉心金印：小菱形（box 旋转 45°）
  const mark = mesh(DAJI_GEO.box, M('gold'), 0.02, 0.02, 0.01, 0, 0.07, 0.155, false);
  mark.rotation.z = Math.PI / 4;
  head.add(mark);
  // 狐耳：双锥 hair + 内耳金小锥
  [-1, 1].forEach((s) => {
    const ear = mesh(DAJI_GEO.cone, M('hair'), 0.045, 0.13, 0.03, s * 0.075, 0.2, -0.01, false);
    ear.rotation.z = -s * 0.2;
    head.add(ear);
    const inner = mesh(DAJI_GEO.cone, M('gold'), 0.022, 0.08, 0.018, s * 0.072, 0.18, 0.0, false);
    inner.rotation.z = -s * 0.2;
    head.add(inner);
  });
  // 双髻：2 小球 hair + 金步摇（细金柱 + 小金球垂饰）
  [-1, 1].forEach((s) => {
    head.add(mesh(DAJI_GEO.sphere, M('hair'), 0.045, 0.045, 0.045, s * 0.05, 0.17, -0.02, false));
    const stepPin = mesh(DAJI_GEO.cyl, M('gold'), 0.005, 0.06, 0.005, s * 0.07, 0.13, 0.02, false);
    head.add(stepPin);
    head.add(mesh(DAJI_GEO.sphere, M('gold'), 0.012, 0.012, 0.012, s * 0.07, 0.1, 0.02, false));
  });
  // 后发：4 节链式（压扁球逐节变窄 0.16→0.08，每节长 0.22）从后脑垂到背中
  const hairSegs = [];
  {
    let parent = head;
    let py = -0.02;
    for (let j = 0; j < 4; j++) {
      const k = j / 3;
      const w = U.lerp(0.16, 0.08, k);
      const seg = new THREE.Group();
      seg.position.set(0, j === 0 ? -0.05 : -0.22, j === 0 ? -0.12 : 0);
      parent.add(seg);
      seg.add(mesh(DAJI_GEO.sphere, M('hair'), w, 0.13, w * 0.55, 0, -0.11, 0, false));
      hairSegs.push(seg);
      parent = seg;
    }
  }
  // 侧发丝：2 细锥垂在脸侧
  [-1, 1].forEach((s) => {
    const strand = mesh(DAJI_GEO.cone, M('hair'), 0.025, 0.22, 0.02, s * 0.14, -0.05, 0.05, false);
    strand.rotation.x = Math.PI;
    head.add(strand);
  });

  // ---------- 九尾 ----------
  const tailRoot = new THREE.Group();
  tailRoot.position.set(0, 0.02, -0.30);
  body.add(tailRoot);
  const tails = [];
  for (let i = 0; i < nTails; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = (i - (nTails - 1) / 2) * U.deg(23); // 宽扇形（立绘里近 180° 展开）
    pivot.rotation.x = 0.16 + Math.abs(i - (nTails - 1) / 2) * 0.04; // 根部近水平后伸，卷曲交给逐节曲线
    tailRoot.add(pivot);
    const segGroups = [];
    let parent = pivot;
    for (let j = 0; j < nSegs; j++) {
      const k = j / (nSegs - 1);
      const len = U.lerp(0.30, 0.14, k);
      const r = U.lerp(0.07, 0.024, k); // 蓬松粗尾（太细像白骨精的手）
      const seg = new THREE.Group();
      seg.position.z = j === 0 ? 0 : -U.lerp(0.30, 0.14, (j - 1) / (nSegs - 1));
      parent.add(seg);
      const isTip = j >= nSegs - 2; // 末 2 节强发光
      // 圆润椭球 + 节间大重叠 = 毛茸感，不露关节
      seg.add(mesh(DAJI_GEO.sphere, isTip ? M('tailTip') : M('tail'), r, r * 0.92, len * 0.85, 0, 0, -len / 2, false));
      segGroups.push(seg);
      parent = seg;
    }
    tails.push(segGroups);
  }

  // ---------- 狐火 wisp（仅 !ghostMat）----------
  const wisps = [];
  if (!opts.ghostMat) {
    const tex = dajiWispTexture();
    for (let i = 0; i < 3; i++) {
      const sm = new THREE.SpriteMaterial({ map: tex, color: 0x6ef0e0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
      const sp = new THREE.Sprite(sm);
      sp.scale.setScalar(0.22);
      root.add(sp); // 挂在 root，不挂 body
      wisps.push(sp);
    }
  }

  root.scale.setScalar(scale);
  return {
    root, body, head,
    shoulderL: shoulders.L, shoulderR: shoulders.R,
    elbowL: elbows.L, elbowR: elbows.R,
    sleeves, skirt, hairSegs, tailRoot, tails, wisps, mats,
  };
}

// 妲己动画：滑行悬浮 + 长裙反垂 + 广袖 + 后发 + 九尾 + 狐火
// anim 字段与 foxAnimate 相同：phase/speedRatio/tailAmp/yawVel/lean/poseBodyPitch
function dajiAnimate(fox, anim, dt, t) {
  const sr = anim.speedRatio;
  anim.phase += dt * (3 + sr * 6);

  // 滑行悬浮：绝对写入（死亡重置依赖这一点）
  fox.body.position.y = 1.05 + Math.sin(t * 2.0) * 0.04 + sr * 0.04 * Math.sin(anim.phase * 2);

  // 身体前倾 + 头反向微倾
  anim.lean = U.damp(anim.lean, sr * 0.22, 8, dt);
  const pitch = anim.lean + (anim.poseBodyPitch || 0); // || 0 必须有（分身无 poseBodyPitch）
  fox.body.rotation.x = pitch;
  fox.head.rotation.x = -anim.lean * 0.5 + Math.sin(t * 1.3) * 0.03;

  // 裙摆反垂：防插地 + 布料垂重感
  for (let j = 0; j < fox.skirt.length; j++) {
    fox.skirt[j].rotation.x = -pitch * 0.55 + Math.sin(t * 2.3 + j * 0.7) * 0.05 + sr * (0.10 + j * 0.05);
    fox.skirt[j].rotation.z = Math.sin(t * 1.9 + j * 0.6) * 0.04;
  }

  // 肩/肘所有 rotation 通道每帧无条件写（攻击姿态在 Player.update 末尾覆盖；
  // 若不每帧写，被打断的攻击会永久卡姿态）
  const shoulderX = -0.12 + Math.sin(t * 1.5) * 0.04 - sr * 0.4; // 跑动时手臂后摆
  const elbowX = -0.25 + Math.sin(t * 1.6) * 0.04 + sr * 0.3;
  fox.shoulderL.rotation.x = shoulderX;
  fox.shoulderR.rotation.x = shoulderX;
  fox.shoulderL.rotation.z = 0.35;   // 左 +
  fox.shoulderR.rotation.z = -0.35;  // 右 −
  fox.elbowL.rotation.x = elbowX;
  fox.elbowR.rotation.x = elbowX;

  // 广袖：随身体前倾飘动
  for (let i = 0; i < fox.sleeves.length; i++) {
    fox.sleeves[i].rotation.x = anim.lean * 1.4 + Math.sin(t * 1.6 + i * 2.5) * 0.12;
    fox.sleeves[i].rotation.z = Math.sin(t * 1.3 + i * 1.7) * 0.06;
  }

  // 后发：链式 sin 相位差，第一节叠加转身滞后
  for (let j = 0; j < fox.hairSegs.length; j++) {
    let ry = Math.sin(t * 1.8 + j * 0.6) * 0.08;
    if (j === 0) ry += -anim.yawVel * 0.3;
    fox.hairSegs[j].rotation.y = ry;
    fox.hairSegs[j].rotation.x = Math.sin(t * 1.5 + j * 0.5) * 0.05;
  }

  // 尾巴：双层正弦相位差 + 渐进上卷（根部平伸、尾梢卷起的火焰弧，对齐立绘）
  const amp = 0.12 * (anim.tailAmp || 1) + sr * 0.05;
  for (let i = 0; i < fox.tails.length; i++) {
    const segs = fox.tails[i];
    for (let j = 0; j < segs.length; j++) {
      const curl = ((j + 1) / segs.length) * 0.24; // 越到尾梢卷得越多
      segs[j].rotation.y = Math.sin(t * 2.2 + j * 0.55 + i * 0.9) * amp;
      segs[j].rotation.x = curl + Math.sin(t * 1.7 + j * 0.4 + i * 0.5) * amp * 0.5;
    }
  }
  fox.tailRoot.rotation.y = U.damp(fox.tailRoot.rotation.y, U.clamp(-anim.yawVel * 0.45, -0.8, 0.8), 6, dt);

  // 狐火环游 root
  if (fox.wisps) {
    for (let i = 0; i < fox.wisps.length; i++) {
      fox.wisps[i].position.set(
        Math.sin(t * 1.1 + i * 2.09) * 0.65,
        0.95 + Math.sin(t * 1.7 + i) * 0.3,
        Math.cos(t * 1.1 + i * 2.09) * 0.65
      );
      fox.wisps[i].material.opacity = 0.4 + Math.sin(t * 2.0 + i) * 0.2 + 0.2;
    }
  }
}

// ---------- 玩家 ----------
class Player {
  constructor(scene) {
    this.fox = buildDaji({}); // 人形妲己（属性名沿用 fox 最小化 diff）
    this.root = this.fox.root;
    scene.add(this.root);
    this.pos = this.root.position;
    this.anim = { phase: 0, speedRatio: 0, tailAmp: 1, yawVel: 0, lean: 0, poseBodyPitch: 0 };
    this._dir = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this.knockVel = new THREE.Vector3();
    this.radius = CONFIG.PLAYER.RADIUS;
    this._trailTimer = 0;
    this._ghostTimer = 0;
    this.usingObjModel = false;
    this.reset();
    this._tryLoadObjModel(scene);
  }

  // ---------- assets/daji.obj 混合接入 ----------
  // Tripo 生成的单件静态网格（无 rig）：当身体外形用，隐藏程序化身体，
  // 保留会动的九尾/狐火/翻滚悬浮（动作挂在 body 枢轴上，整体驱动雕像）。
  // file:// 下 fetch 被禁或文件缺失 → 静默回退程序化全身。
  // TODO: 拿到 Tripo 的 rigged GLB 后换 GLTFLoader 驱动真骨骼。
  _tryLoadObjModel() {
    if (!THREE.OBJLoader) return;
    new THREE.OBJLoader().load('assets/daji.obj', (obj) => {
      try {
        const mat = new THREE.MeshStandardMaterial({
          vertexColors: true, roughness: 0.75, metalness: 0.05, envMapIntensity: 0.6,
        });
        obj.traverse((n) => {
          if (n.isMesh) {
            if (!n.geometry.attributes.color) mat.vertexColors = false;
            n.material = mat;
            n.castShadow = true;
          }
        });
        // 模型面向 +X → 转到游戏前向 +Z
        obj.rotation.y = -Math.PI / 2;
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3());
        if (size.y < 0.01) return;
        const wrapper = new THREE.Group();
        wrapper.add(obj);
        wrapper.scale.setScalar(1.78 / size.y); // 等比到身高 1.78
        // 居中 + 脚贴 wrapper 原点
        obj.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
        wrapper.position.y = -1.05; // body 枢轴在腰部 1.05，脚回到地面
        this._hideProceduralBody(); // 必须先藏旧身体，再挂新模型（否则新模型也被遍历隐藏）
        this.fox.body.add(wrapper);
        this._objMat = mat;
        this.usingObjModel = true;
        console.log('[daji.obj] 模型已接入（' + size.y.toFixed(2) + ' → 1.78）');
      } catch (e) { console.error('[daji.obj] 接入失败，保持程序化模型', e); }
    }, undefined, () => { /* 加载失败 = 程序化兜底，静默 */ });
  }

  _hideProceduralBody() {
    // 隐藏程序化身体视觉网格；保留 tailRoot 子树（九尾）与 root 上的狐火精灵
    const keep = new Set();
    this.fox.tailRoot.traverse((n) => keep.add(n));
    this.fox.body.traverse((n) => {
      if (n.isMesh && !keep.has(n)) n.visible = false;
    });
  }

  reset() {
    const P = CONFIG.PLAYER;
    this.hp = P.HP;
    this.stamina = P.STAMINA_MAX;
    this.staminaDelay = 0;
    this.flasks = P.FLASK.CHARGES;
    this.meter = 0;
    this.ultUntil = -1;
    this.charmReadyAt = 0;
    this.invulnUntil = -1;
    this.state = 'free';
    this.st = 0;
    this.combo = 0;
    this.hitFlag = false;
    this.yaw = Math.PI; // 面向 -Z（Boss 初始在 -Z 侧）
    this.yawVelTrack = 0;
    this.pos.set(0, 0, 8);
    this.root.rotation.y = this.yaw;
    this.fox.body.rotation.set(0, 0, 0);
    this.knockVel.set(0, 0, 0);
    this.anim.tailAmp = 1;
    this.setGhostly(false);
  }

  get alive() { return this.state !== 'dead'; }
  get invuln() { return Game.time < this.invulnUntil; }
  get ultActive() { return Game.time < this.ultUntil; }

  // 无敌帧视觉：半透明墨蓝
  setGhostly(on) {
    const m = this.fox.mats;
    if (!m) return;
    [m.silk, m.skin, m.hair].forEach((mat) => {
      mat.transparent = on || mat === m.silk; // silk 本身 DoubleSide，保持 transparent 切换不重编译
      mat.opacity = on ? 0.55 : 1;
    });
    m.silk.emissive.set(on ? 0x2a6f8f : 0x000000);
    if (this._objMat) { // OBJ 模型的无敌帧视觉
      this._objMat.transparent = on;
      this._objMat.opacity = on ? 0.55 : 1;
      this._objMat.emissive.set(on ? 0x2a6f8f : 0x000000);
    }
  }

  canAct() { return this.state === 'free'; }
  inRecover() {
    const L = CONFIG.PLAYER.LIGHT, H = CONFIG.PLAYER.HEAVY;
    if (this.state === 'light') return this.st > L.WINDUP + L.ACTIVE;
    if (this.state === 'heavy') return this.st > H.WINDUP + H.ACTIVE;
    return false;
  }

  faceBoss() {
    const boss = Game.boss;
    if (boss && boss.alive && U.dist2D(this.pos, boss.pos) < 12) {
      this.yaw = U.yawTo(this.pos, boss.pos);
    }
  }

  startLight() {
    const L = CONFIG.PLAYER.LIGHT;
    this.combo = this.state === 'light' ? (this.combo % 3) + 1 : 1;
    this.state = 'light';
    this.st = 0;
    this.hitFlag = false;
    this.faceBoss();
  }

  startHeavy() {
    const H = CONFIG.PLAYER.HEAVY;
    if (this.stamina < H.COST) { UI.flashStamina(); return; }
    this.stamina -= H.COST;
    this.staminaDelay = CONFIG.PLAYER.STAMINA_DELAY;
    this.state = 'heavy';
    this.st = 0;
    this.hitFlag = false;
    this.faceBoss();
  }

  startDodge(moveDir) {
    const D = CONFIG.PLAYER.DODGE;
    if (this.stamina < D.COST) { UI.flashStamina(); return; }
    this.stamina -= D.COST;
    this.staminaDelay = CONFIG.PLAYER.STAMINA_DELAY;
    this.state = 'dodge';
    this.st = 0;
    this.invulnUntil = Game.time + D.IFRAME;
    if (moveDir.lengthSq() > 0.01) {
      this._dir.copy(moveDir).normalize();
      this.yaw = Math.atan2(this._dir.x, this._dir.z);
    } else {
      U.yawDir(this.yaw + Math.PI, this._dir); // 无方向输入 = 后撤
    }
    this._dodgeEase = 0;
    AudioMan.dodge();
  }

  tryCharm() {
    const C = CONFIG.PLAYER.CHARM;
    if (Game.state !== 'FIGHT') return;
    if (Game.time < this.charmReadyAt) return;
    const boss = Game.boss;
    if (!boss || !boss.alive) return;
    if (U.dist2D(this.pos, boss.pos) > C.RANGE) {
      UI.announceSmall('距离过远');
      return;
    }
    this.charmReadyAt = Game.time + C.CD;
    this.state = 'cast';
    this.st = 0;
    this.hitFlag = false;
    this.faceBoss();
  }

  tryFlask() {
    if (Game.state !== 'FIGHT') return;
    if (this.flasks <= 0) { UI.announceSmall('狐露已尽'); return; }
    if (this.hp >= CONFIG.PLAYER.HP) return;
    this.flasks--;
    this.state = 'drink';
    this.st = 0;
    AudioMan.ui();
  }

  tryUlt() {
    const T = CONFIG.PLAYER.ULT;
    if (this.meter < T.MAX || this.ultActive) return;
    this.meter = 0;
    this.ultUntil = Game.time + T.DURATION;
    this.anim.tailAmp = 2.4;
    Game.spawnClones();
    AudioMan.cloneSpawn();
    UI.announce('九尾分身', '', 1.2);
    VFX.burst({
      pos: this._tmp.copy(this.pos).setY(1), count: 24, speed: [2, 5], up: 2, spread: 1,
      life: [0.4, 0.9], size: 0.4, sizeEnd: 0.05, color: CONFIG.COLORS.cyan, colorEnd: CONFIG.COLORS.gold,
    });
  }

  gainMeter(x) {
    const was = this.meter;
    this.meter = U.clamp(this.meter + x, 0, CONFIG.PLAYER.ULT.MAX);
    if (was < CONFIG.PLAYER.ULT.MAX && this.meter >= CONFIG.PLAYER.ULT.MAX) {
      AudioMan.ultReady();
      UI.announceSmall('妖力全开 · 按 [;] 召唤九尾分身');
    }
  }

  // 近战命中（Boss + 哮天犬）
  meleeHit(range, halfArcDeg, dmg, heavy) {
    const half = U.deg(halfArcDeg);
    let hitAny = false;
    const targets = [Game.boss, Game.dog].filter((e) => e && e.alive);
    for (const e of targets) {
      const d = U.dist2D(this.pos, e.pos);
      if (d > range + e.radius) continue;
      if (halfArcDeg < 180 && Math.abs(U.angleDiff(U.yawTo(this.pos, e.pos), this.yaw)) > half) continue;
      this._tmp.copy(e.pos).setY(1.2);
      if (e === Game.boss) Game.applyDamageToBoss(dmg, this._tmp, { heavy, meter: heavy ? CONFIG.PLAYER.ULT.GAIN_HEAVY : CONFIG.PLAYER.ULT.GAIN_LIGHT });
      else Game.applyDamageToDog(dmg, this._tmp, { heavy, knockback: heavy ? 6 : 0 });
      hitAny = true;
    }
    return hitAny;
  }

  update(dt) {
    const P = CONFIG.PLAYER;
    if (this.state === 'dead') { this.updateDead(dt); return; }

    // 体力恢复
    this.staminaDelay -= dt;
    if (this.staminaDelay <= 0) this.stamina = U.clamp(this.stamina + P.STAMINA_REGEN * dt, 0, P.STAMINA_MAX);
    if (!this.ultActive && this.anim.tailAmp > 1) this.anim.tailAmp = U.damp(this.anim.tailAmp, 1, 3, dt);

    // 无敌帧视觉开关
    const ghostly = this.invuln;
    if (ghostly !== this._wasGhostly) { this.setGhostly(ghostly); this._wasGhostly = ghostly; }

    this.st += dt;
    const move = Game.moveDir; // 相机相对方向（已归一化或零向量）

    switch (this.state) {
      case 'free': {
        const speed = move.length();
        if (speed > 0.01) {
          this.pos.addScaledVector(move, P.SPEED * dt);
          const targetYaw = Math.atan2(move.x, move.z);
          const before = this.yaw;
          this.yaw = U.turnToward(this.yaw, targetYaw, 14 * dt);
          this.anim.yawVel = U.angleDiff(this.yaw, before) / Math.max(dt, 1e-4);
        } else {
          this.anim.yawVel = U.damp(this.anim.yawVel, 0, 8, dt);
        }
        this.anim.speedRatio = U.damp(this.anim.speedRatio, speed > 0.01 ? 1 : 0, 10, dt);

        if (Game.consumePressed('light')) this.startLight();
        else if (Game.consumePressed('heavy')) this.startHeavy();
        else if (Game.consumePressed('dodge')) this.startDodge(move);
        else if (Game.consumePressed('charm')) this.tryCharm();
        else if (Game.consumePressed('ult')) this.tryUlt();
        else if (Game.consumePressed('flask')) this.tryFlask();
        break;
      }

      case 'light': {
        const L = P.LIGHT;
        this.anim.speedRatio = U.damp(this.anim.speedRatio, 0, 12, dt);
        const activeAt = L.WINDUP;
        if (!this.hitFlag && this.st >= activeAt) {
          this.hitFlag = true;
          // 前冲 + 弧光 + 命中
          U.yawDir(this.yaw, this._dir);
          this.pos.addScaledVector(this._dir, L.LUNGE);
          this._tmp.copy(this.pos).addScaledVector(this._dir, 1.4).setY(1.1);
          VFX.slash(this._tmp, this.yaw, CONFIG.COLORS.cyan, this.combo === 3 ? 3 : 2.2);
          if (this.meleeHit(L.RANGE, L.HALF_ARC, L.DMG[this.combo - 1], false)) AudioMan.hit();
        }
        const total = L.WINDUP + L.ACTIVE + L.RECOVER;
        // 连段 / 翻滚取消（出招判定后才允许）
        if (this.st > activeAt + L.ACTIVE) {
          if (Game.consumePressed('dodge')) { this.startDodge(move); break; }
          if (this.combo < 3 && Game.consumePressed('light')) { this.startLight(); break; }
        }
        if (this.st >= total + (this.combo < 3 ? L.CHAIN : 0)) {
          if (this.combo < 3 && Game.consumePressed('light')) { this.startLight(); break; }
          this.state = 'free'; this.combo = 0;
        }
        break;
      }

      case 'heavy': {
        const H = P.HEAVY;
        this.anim.speedRatio = U.damp(this.anim.speedRatio, 0, 12, dt);
        if (!this.hitFlag && this.st >= H.WINDUP + 0.1) {
          this.hitFlag = true;
          this._tmp.copy(this.pos).setY(1.1);
          VFX.slash(this._tmp, this.yaw, CONFIG.COLORS.gold, 3.4);
          VFX.shockwave(this.pos, CONFIG.COLORS.gold, 3.4, 0.3);
          if (this.meleeHit(H.RANGE, H.HALF_ARC, H.DMG, true)) AudioMan.heavyHit();
        }
        if (this.st > H.WINDUP + H.ACTIVE && Game.consumePressed('dodge')) { this.startDodge(move); break; }
        if (this.st >= H.WINDUP + H.ACTIVE + H.RECOVER) this.state = 'free';
        break;
      }

      case 'dodge': {
        const D = P.DODGE;
        const k0 = this._dodgeEase;
        const k1 = U.easeOutCubic(Math.min(this.st / D.DUR, 1));
        this.pos.addScaledVector(this._dir, (k1 - k0) * D.DIST);
        this._dodgeEase = k1;
        // 残影 + 狐火（翻滚姿态在 foxAnimate 之后统一覆盖）
        this._ghostTimer -= dt;
        if (this._ghostTimer <= 0) { this._ghostTimer = 0.07; VFX.spawnGhost(); }
        this._trailTimer -= dt;
        if (this._trailTimer <= 0) {
          this._trailTimer = 0.04;
          this._tmp.copy(this.pos).setY(0.8);
          VFX.burst({ pos: this._tmp, count: 2, speed: [0.3, 1], spread: 1, up: 0.8, life: [0.25, 0.45], size: 0.3, sizeEnd: 0.04, color: CONFIG.COLORS.cyan, colorEnd: 0x2255ff });
        }
        if (this.st >= D.DUR) { this.state = 'free'; this.fox.body.rotation.x = 0; }
        break;
      }

      case 'cast': {
        const C = P.CHARM;
        if (!this.hitFlag && this.st >= 0.15) {
          this.hitFlag = true;
          const boss = Game.boss;
          if (boss && boss.alive) {
            const dur = boss.phase >= 3 ? C.FREEZE_P3 : C.FREEZE;
            boss.freeze(dur);
            VFX.charmShow(boss.pos, dur);
            AudioMan.charm();
            UI.announce('魅惑 · 定身', boss.phase >= 3 ? '神志清明！定身减半' : '', 1.1);
          }
        }
        if (this.st >= C.CAST) { this.state = 'free'; this.hitFlag = false; }
        break;
      }

      case 'hurt': {
        this.anim.speedRatio = U.damp(this.anim.speedRatio, 0, 12, dt);
        if (this.st >= P.HURT_STAGGER) this.state = 'free';
        break;
      }

      case 'drink': {
        // 饮·狐露：站定 0.9s，结束瞬间回血；被打断（hurt 覆盖状态）药不退
        const FL = P.FLASK;
        this.anim.speedRatio = U.damp(this.anim.speedRatio, 0, 12, dt);
        this._trailTimer -= dt;
        if (this._trailTimer <= 0) {
          this._trailTimer = 0.08;
          this._tmp.copy(this.pos).setY(U.rand(0.8, 1.5));
          VFX.burst({ pos: this._tmp, count: 2, speed: [0.2, 0.7], spread: 1, up: 1, life: [0.3, 0.6], size: 0.2, sizeEnd: 0.03, color: 0xff9ec4, colorEnd: CONFIG.COLORS.gold });
        }
        if (this.st >= FL.TIME) {
          this.hp = U.clamp(this.hp + FL.HEAL, 0, P.HP);
          this._tmp.copy(this.pos).setY(1.6);
          VFX.dmgNumber(this._tmp, '+' + FL.HEAL, 'heal');
          VFX.burst({ pos: this._tmp, count: 14, speed: [1, 3], spread: 1, up: 1.5, life: [0.4, 0.8], size: 0.3, sizeEnd: 0.05, color: 0x7cf2a0, colorEnd: CONFIG.COLORS.gold });
          AudioMan.charm();
          this.state = 'free';
        }
        break;
      }
    }

    // 击退衰减 + 边界钳制
    this.pos.addScaledVector(this.knockVel, dt);
    this.knockVel.multiplyScalar(Math.exp(-8 * dt));
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > CONFIG.ARENA_RADIUS) {
      this.pos.x *= CONFIG.ARENA_RADIUS / r;
      this.pos.z *= CONFIG.ARENA_RADIUS / r;
    }

    this.root.rotation.y = this.yaw;
    dajiAnimate(this.fox, this.anim, dt, Game.time);

    // 攻击/翻滚姿态覆盖（必须在 dajiAnimate 之后，否则被基础循环覆盖）
    if (this.state === 'dodge') {
      const dk = Math.min(this.st / P.DODGE.DUR, 1);
      this.fox.body.rotation.x = -U.easeInOut(dk) * Math.PI * 2;
      // 翻滚跳跃：长裙绕腰部枢轴翻转必插地，跳起来解决
      this.fox.body.position.y += Math.sin(dk * Math.PI) * 0.5;
    } else if (this.state === 'light') {
      const L = P.LIGHT;
      const k = Math.min(this.st / (L.WINDUP + L.ACTIVE), 1);
      this.anim.poseBodyPitch = -Math.sin(k * Math.PI) * 0.35;
      this.fox.body.rotation.x = this.anim.lean + this.anim.poseBodyPitch;
      // 交替臂狐爪挥击 + 肘部跟随
      const arm = this.combo % 2 ? this.fox.shoulderR : this.fox.shoulderL;
      const elbow = this.combo % 2 ? this.fox.elbowR : this.fox.elbowL;
      arm.rotation.x = -0.12 - Math.sin(Math.min(k * 1.25, 1) * Math.PI) * 2.2;
      elbow.rotation.x = -0.6 * Math.sin(k * Math.PI);
    } else if (this.state === 'heavy') {
      const H = P.HEAVY;
      const k2 = Math.min(this.st / (H.WINDUP + H.ACTIVE), 1);
      if (this.st > H.WINDUP) {
        const k = Math.min((this.st - H.WINDUP) / H.ACTIVE, 1);
        this.fox.body.rotation.y = U.easeOutQuad(k) * Math.PI * 2;
      } else {
        this.fox.body.rotation.y = -0.5 * (this.st / H.WINDUP);
      }
      if (this.st >= H.WINDUP + H.ACTIVE) this.fox.body.rotation.y = 0;
      // 双肩外展（九尾横扫的舒展感）
      const flare = 0.35 + Math.sin(k2 * Math.PI) * 1.2;
      this.fox.shoulderL.rotation.z = flare;
      this.fox.shoulderR.rotation.z = -flare;
    } else if (this.state === 'cast') {
      // 魅惑：双掌前推
      this.fox.shoulderL.rotation.x = -1.9;
      this.fox.shoulderR.rotation.x = -1.9;
      this.fox.elbowL.rotation.x = -0.3;
      this.fox.elbowR.rotation.x = -0.3;
    } else {
      this.anim.poseBodyPitch = 0;
      if (this.fox.body.rotation.y !== 0) this.fox.body.rotation.y = 0;
    }

    // 大招期间狐火缭绕
    if (this.ultActive) {
      this._trailTimer -= dt;
      if (this._trailTimer <= 0) {
        this._trailTimer = 0.1;
        this._tmp.set(this.pos.x + U.rand(-0.5, 0.5), U.rand(0.6, 1.4), this.pos.z + U.rand(-0.5, 0.5));
        VFX.burst({ pos: this._tmp, count: 1, speed: [0.2, 0.6], spread: 1, up: 1, life: [0.4, 0.8], size: 0.25, sizeEnd: 0.04, color: CONFIG.COLORS.cyan, colorEnd: CONFIG.COLORS.gold });
      }
    }
  }

  updateDead(dt) {
    this.st += dt;
    const k = Math.min(this.st / 0.7, 1);
    this.fox.body.rotation.z = U.easeOutCubic(k) * Math.PI * 0.55;
    this.fox.body.position.y = U.lerp(1.05, 0.45, U.easeOutCubic(k)); // 人形腰部枢轴
  }

  die() {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.st = 0;
    this._tmp.copy(this.pos).setY(1);
    VFX.burst({ pos: this._tmp, count: 20, speed: [1, 4], up: 1.5, spread: 1, life: [0.5, 1.2], size: 0.35, sizeEnd: 0.05, color: CONFIG.COLORS.cyan, colorEnd: 0x223366 });
  }
}
