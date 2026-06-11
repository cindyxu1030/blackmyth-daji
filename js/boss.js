// 杨戬（二郎神）：甲胄人形 + 天眼 + 三尖两刃刀。
// 双层状态机：阶段FSM(1/2/3) × 攻击FSM(选招→预警→出招→收招)。
// 哮天犬在第三阶段入场，与 Boss 共享「攻击令牌」：大招期间狗不扑咬，杜绝不公平叠招。

class Boss {
  constructor(scene) {
    this.scene = scene;
    this._buildModel();
    this._buildBeams();
    this._buildAura();
    this._buildTrail();
    this.pos = this.root.position;
    this.radius = CONFIG.BOSS.RADIUS;
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this.statue = null;
    this._objMat = null;
    this.reset();
    this._tryLoadObjModel();
  }

  // ---------- assets/yangjian/model_lite.obj 混合接入 ----------
  // Meshy 生成模型（减面后 8.6 万面，三尖戟烘焙在手中=静置武器）。
  // 雕像挂 root（悬浮/跳跃/冲刺/死亡下沉全跟随），躯干姿态按比例耦合体态倾斜；
  // 程序化武器隐形化：拖尾光带沿挥砍轨迹照常绘制（读作「剑气」），
  // 预警发光改为雕像整体微光（_syncStatue 同步 bladeMat 的预警色）+ 天眼。
  // 加载失败（file:// / 缺文件）→ 程序化模型兜底。
  _tryLoadObjModel() {
    if (!THREE.OBJLoader) return;
    new THREE.OBJLoader().load('assets/yangjian/model_lite.obj', (obj) => {
      try {
        const tex = new THREE.TextureLoader().load('assets/yangjian/model_baseColor.png');
        tex.encoding = THREE.sRGBEncoding;
        const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.25, envMapIntensity: 0.8 });
        obj.traverse((n) => {
          if (n.isMesh) {
            n.material = mat;
            n.castShadow = true;
            if (!n.geometry.attributes.normal) n.geometry.computeVertexNormals();
          }
        });
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3());
        if (size.y < 0.01) return;
        // 戟尖比人高：按「身体部分 ≈ 整体高度 89%」配比到目标身高 3.3
        const s = 3.3 / (size.y * 0.89);
        const wrapper = new THREE.Group();
        wrapper.add(obj);
        obj.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
        wrapper.scale.setScalar(s);
        this._hideProceduralBody();
        this.root.add(wrapper);
        this.statue = wrapper;
        this._objMat = mat;
        console.log('[yangjian] 模型已接入 scale=' + s.toFixed(2));
      } catch (e) { console.error('[yangjian] 接入失败，保持程序化模型', e); }
    }, undefined, () => { /* 程序化兜底，静默 */ });
  }

  _hideProceduralBody() {
    // 隐藏程序化全部网格；保留天眼（预警信号）与狂暴光环
    this.root.traverse((n) => {
      if (n.isMesh && n !== this.eye && n !== this.aura) n.visible = false;
    });
  }

  // 每帧同步雕像：体态倾斜耦合 + 预警/受击发光（挂在 _updateTrail 里，所有状态分支都会走到）
  _syncStatue() {
    if (!this.statue) return;
    this.statue.rotation.x = this.torso.rotation.x * 0.55;
    this.statue.rotation.y = this.torso.rotation.y * 0.45;
    const m = this._objMat;
    if (m) {
      if (this.flashT > 0) m.emissive.setScalar(0.45); // 受击白闪
      else m.emissive.copy(this.bladeMat.emissive).multiplyScalar(this.bladeMat.emissiveIntensity * 0.1); // 预警微光
    }
  }

  // ---------- 模型 ----------
  // 重建：对齐立绘（杨戬战神）—— 拉长比例(总高≈3.3) + 暗漆蓝层叠金边甲 + 大披膊 +
  // 甲裙 + 高金冠 + 长黑发链 + 苍白脸竖瞳天眼 + 三尖两刃刀。
  // 外观全部重写，但对外属性契约逐项保持（root/torso/head/eye/eyeLight/armR/armL/
  // weapon/tipMarker/baseMarker/tassel/capeSegs/bladeMat/eyeMat/mats.armor|gold|dark|cape）。
  _buildModel() {
    // 暗漆蓝层叠甲：物理材质 + clearcoat 漆面（r147 可用）
    const armor = new THREE.MeshPhysicalMaterial({ color: 0x161c30, roughness: 0.4, metalness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.3, envMapIntensity: 0.8 });
    // 金边：立绘最强特征，肩/胸/裙/护臂处处勾边
    const gold = new THREE.MeshStandardMaterial({ color: 0x9c7b22, roughness: 0.3, metalness: 0.75, emissive: 0xd4af37, emissiveIntensity: 0.35, envMapIntensity: 1.25 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x15161d, roughness: 0.8 });
    const cape = new THREE.MeshStandardMaterial({ color: 0x471a22, roughness: 0.9, side: THREE.DoubleSide }); // 暗红飘带用
    const skin = new THREE.MeshStandardMaterial({ color: 0xe8dccc, roughness: 0.55, metalness: 0.0 });        // 苍白战神脸
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x0c0c12, roughness: 0.35 });                     // 黑发
    this.bladeMat = new THREE.MeshStandardMaterial({ color: 0xb8c2cc, roughness: 0.25, metalness: 0.9, emissive: 0xffd76a, emissiveIntensity: 0, envMapIntensity: 1.5 });
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0x331100, emissive: 0xffcc44, emissiveIntensity: 1.2 });
    // 契约四键必须存在；skin/hairMat 作为额外键挂入
    this.mats = { armor, gold, dark, cape, skin, hairMat };

    const B = (geo, mat, sx, sy, sz, x, y, z, cast) => {
      const m = new THREE.Mesh(geo, mat);
      m.scale.set(sx, sy, sz); m.position.set(x, y, z);
      if (cast) m.castShadow = true;
      return m;
    };
    const box = FOX_GEO.box, sph = FOX_GEO.sphere, cone = FOX_GEO.cone, cyl = FOX_GEO.cyl;

    this.root = new THREE.Group();
    // 骨盆压低（腿加长），总身高拉到 ≈3.3，站姿挺拔
    const pelvis = new THREE.Group();
    pelvis.position.y = 1.78;
    this.root.add(pelvis);
    pelvis.add(B(box, armor, 0.66, 0.36, 0.44, 0, 0, 0, true)); // 收窄的胯甲
    pelvis.add(B(box, gold, 0.7, 0.06, 0.48, 0, 0.2, 0, false)); // 腰封金边

    // 双腿：长圆柱 + 护胫甲片 + 靴（神仙滑步，不做腿部IK）
    [-0.2, 0.2].forEach((x) => {
      pelvis.add(B(cyl, dark, 0.12, 1.78, 0.12, x, -0.95, 0, true));     // 长腿
      pelvis.add(B(box, armor, 0.2, 0.5, 0.22, x, -0.55, 0.02, true));   // 大腿护甲
      pelvis.add(B(box, gold, 0.21, 0.04, 0.23, x, -0.32, 0.02, false)); // 大腿金边
      pelvis.add(B(box, armor, 0.18, 0.55, 0.2, x, -1.45, 0.03, true));  // 护胫甲片
      pelvis.add(B(box, gold, 0.19, 0.04, 0.21, x, -1.18, 0.03, false)); // 护胫金边
      pelvis.add(B(box, dark, 0.22, 0.16, 0.3, x, -1.86, 0.06, true));   // 战靴
      pelvis.add(B(box, gold, 0.23, 0.05, 0.31, x, -1.78, 0.06, false)); // 靴口金边
    });

    // 躯干：收窄拉长
    const torso = new THREE.Group();
    torso.position.y = 0.4;
    pelvis.add(torso);
    this.torso = torso;
    torso.add(B(box, armor, 0.84, 1.0, 0.5, 0, 0.5, 0, true)); // 收窄拉长的胸甲基体
    // 层叠胸甲：2 层错位甲板（暗蓝主体 + 金条勾边）
    const chestPlate = (y, w, h, z) => {
      torso.add(B(box, armor, w, h, 0.1, 0, y, z, false));
      torso.add(B(box, gold, w + 0.04, 0.045, 0.12, 0, y + h / 2, z + 0.01, false)); // 上沿金边
      torso.add(B(box, gold, w + 0.04, 0.045, 0.12, 0, y - h / 2, z + 0.01, false)); // 下沿金边
    };
    chestPlate(0.74, 0.66, 0.36, 0.25);  // 上层胸甲板
    chestPlate(0.44, 0.7, 0.3, 0.26);    // 中层（略宽错位）
    torso.add(B(box, gold, 0.16, 0.7, 0.07, 0, 0.6, 0.28, false)); // 中线金条
    // 腹甲横条（3 条暗蓝薄板 + 金边）
    [0.18, 0.05, -0.08].forEach((y) => {
      torso.add(B(box, armor, 0.62, 0.08, 0.1, 0, y, 0.26, false));
      torso.add(B(box, gold, 0.64, 0.018, 0.12, 0, y + 0.05, 0.27, false));
    });
    torso.add(B(box, gold, 0.9, 0.07, 0.54, 0, 1.02, 0, false)); // 领口鎏金沿

    // 头 + 高金冠 + 天眼
    const head = new THREE.Group();
    head.position.y = 1.22;
    torso.add(head);
    this.head = head;
    head.add(B(sph, skin, 0.24, 0.27, 0.24, 0, 0, 0.01, true));        // 苍白脸
    // 黑发罩（FrontSide 留出正面脸）
    const hairCap = B(sph, hairMat, 0.28, 0.3, 0.29, 0, 0.03, -0.02, true);
    hairCap.material = hairMat; hairCap.material.side = THREE.FrontSide;
    head.add(hairCap);
    head.add(B(box, hairMat, 0.5, 0.12, 0.36, 0, 0.0, -0.12, false));  // 后脑发量
    // 颔下护颈甲
    head.add(B(box, armor, 0.34, 0.12, 0.3, 0, -0.24, 0.04, true));
    head.add(B(box, gold, 0.36, 0.04, 0.31, 0, -0.18, 0.04, false));
    // 高金冠：中央高锥 + 两侧弯凤翅片
    head.add(B(box, gold, 0.4, 0.1, 0.36, 0, 0.27, -0.02, false));     // 冠箍
    head.add(B(cone, gold, 0.09, 0.5, 0.09, 0, 0.58, -0.02, false));   // 中央高锥
    [-1, 1].forEach((s) => {
      const wing = B(cone, gold, 0.06, 0.42, 0.05, s * 0.2, 0.5, -0.03, false); // 凤翅
      wing.rotation.z = s * 0.5;
      head.add(wing);
      const wing2 = B(cone, gold, 0.045, 0.3, 0.04, s * 0.32, 0.42, -0.03, false);
      wing2.rotation.z = s * 0.8;
      head.add(wing2);
    });
    // 眉心竖瞳天眼（保持竖直透镜形 + 金边眶）
    this.eye = B(sph, this.eyeMat, 0.05, 0.11, 0.05, 0, 0.08, 0.23, false);
    head.add(this.eye);
    head.add(B(box, gold, 0.09, 0.18, 0.02, 0, 0.08, 0.24, false));    // 天眼金眶（衬在眼后）
    this.eyeLight = new THREE.PointLight(0xffcc55, 0, 14, 2);
    this.eyeLight.position.set(0, 0.1, 0.5);
    head.add(this.eyeLight);

    // 大披膊 + 手臂（右手持刀）—— shoulder/elbow/hand 枢轴层级与原版一致
    const mkArm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.66, 0.92, 0); // 肩点略外移（肩部加宽）
      torso.add(shoulder);
      // 大披膊：3 层叠片（弯板/锥），比原版大一圈，外缘金边
      shoulder.add(B(cone, armor, 0.36, 0.34, 0.36, side * 0.06, 0.14, 0, true));   // 主披膊
      shoulder.add(B(cone, gold, 0.32, 0.06, 0.32, side * 0.06, 0.28, 0, false));   // 顶金边
      shoulder.add(B(box, armor, 0.5, 0.14, 0.42, side * 0.1, 0.04, 0, true));      // 外叠片
      shoulder.add(B(box, gold, 0.52, 0.04, 0.44, side * 0.1, 0.12, 0, false));     // 叠片金边
      shoulder.add(B(box, armor, 0.42, 0.12, 0.38, side * 0.12, -0.12, 0, true));   // 下叠片
      shoulder.add(B(box, gold, 0.44, 0.035, 0.4, side * 0.12, -0.06, 0, false));   // 下叠片金边
      // 上臂：护臂甲片 + 金环
      shoulder.add(B(cyl, dark, 0.1, 0.62, 0.1, 0, -0.38, 0, true));
      shoulder.add(B(cyl, armor, 0.13, 0.4, 0.13, 0, -0.32, 0, true));              // 上臂护甲
      shoulder.add(B(cyl, gold, 0.135, 0.05, 0.135, 0, -0.5, 0, false));            // 上臂金环
      const elbow = new THREE.Group();
      elbow.position.y = -0.66;
      shoulder.add(elbow);
      elbow.add(B(cyl, armor, 0.095, 0.58, 0.095, 0, -0.29, 0, true));              // 前臂护甲
      elbow.add(B(cyl, gold, 0.1, 0.05, 0.1, 0, -0.04, 0, false));                  // 肘金环
      elbow.add(B(cyl, gold, 0.1, 0.05, 0.1, 0, -0.54, 0, false));                  // 腕金环
      const hand = new THREE.Group();
      hand.position.y = -0.62;
      elbow.add(hand);
      hand.add(B(box, armor, 0.16, 0.16, 0.14, 0, 0, 0, false));                    // 甲手套
      return { shoulder, elbow, hand };
    };
    this.armR = mkArm(1);
    this.armL = mkArm(-1);
    this.armL.shoulder.rotation.z = -0.25;

    // 三尖两刃刀（握在右手，全部挥砍动画 = 转肩部枢轴）
    const weapon = new THREE.Group();
    this.armR.hand.add(weapon);
    this.weapon = weapon;
    weapon.add(B(cyl, dark, 0.038, 3.4, 0.038, 0, 0.45, 0, true));   // 长杆
    weapon.add(B(cyl, gold, 0.05, 0.12, 0.05, 0, 1.55, 0, false));   // 杆中段金护手环
    weapon.add(B(cyl, gold, 0.05, 0.1, 0.05, 0, -0.9, 0, false));    // 杆尾金箍
    const bladeG = new THREE.Group();
    bladeG.position.y = 2.15;
    weapon.add(bladeG);
    bladeG.add(B(sph, gold, 0.09, 0.12, 0.09, 0, -0.18, 0, false));           // 刀根护手环
    bladeG.add(B(box, this.bladeMat, 0.2, 0.72, 0.05, 0, 0.22, 0, true));     // 中刃
    bladeG.add(B(box, gold, 0.03, 0.7, 0.055, 0, 0.22, 0, false));            // 中刃刻线（细金条）
    bladeG.add(B(cone, this.bladeMat, 0.06, 0.46, 0.03, 0, 0.78, 0, false));  // 中尖
    [-0.09, 0.09].forEach((x) => bladeG.add(B(cone, this.bladeMat, 0.045, 0.34, 0.03, x, 0.68, 0, false))); // 两侧尖
    // 刀缨（链式滞后）
    this.tassel = [];
    let tParent = bladeG;
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Group();
      t.position.y = i === 0 ? -0.26 : -0.12;
      tParent.add(t);
      t.add(B(sph, new THREE.MeshStandardMaterial({ color: 0xa03030, roughness: 0.8 }), 0.05, 0.07, 0.05, 0, -0.05, 0, false));
      this.tassel.push(t);
      tParent = t;
    }
    // 刀尖/刀根：拖尾采样点（随新刃微调；tip 在刃尖、base 在刃根）
    this.tipMarker = new THREE.Object3D(); this.tipMarker.position.set(0, 1.05, 0); bladeG.add(this.tipMarker);
    this.baseMarker = new THREE.Object3D(); this.baseMarker.position.set(0, -0.18, 0); bladeG.add(this.baseMarker);

    // 长发链（契约名 capeSegs 不变）：后脑垂下 4 节链式黑发，逐节变窄，末节挂暗红飘带
    this.capeSegs = [];
    let cParent = head; // 从后脑垂下
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Group();
      c.position.set(0, i === 0 ? -0.18 : -0.42, i === 0 ? -0.22 : 0.01);
      cParent.add(c);
      c.add(B(box, hairMat, 0.34 - i * 0.06, 0.46, 0.08, 0, -0.22, 0, false)); // 黑发链节
      if (i === 3) {
        // 末节挂 2 条暗红飘带薄盒
        [-0.08, 0.08].forEach((x) => c.add(B(box, cape, 0.06, 0.5, 0.02, x, -0.46, 0.01, false)));
      }
      this.capeSegs.push(c);
      cParent = c;
    }

    // 甲裙：腰部一圈 5 片暗蓝布片（薄盒 + 金边条），垂到小腿，静态挂腰上
    this.skirtPanels = [];
    const skirtAngles = [-1.0, -0.5, 0, 0.5, 1.0];
    skirtAngles.forEach((ang) => {
      const sp = new THREE.Group();
      sp.position.y = -0.05;
      sp.rotation.y = ang;
      pelvis.add(sp);
      const panel = B(box, armor, 0.34, 1.05, 0.05, 0, -0.5, 0.42, false);
      panel.rotation.x = 0.12; // 略向外张
      sp.add(panel);
      const edge = B(box, gold, 0.36, 0.04, 0.06, 0, -1.02, 0.42, false); // 下摆金边
      edge.rotation.x = 0.12;
      sp.add(edge);
      this.skirtPanels.push(sp);
    });

    // 姿态参数（damp 趋近目标 = 平滑挥舞）
    this.pose = { srx: -0.25, sry: 0, srz: 0.18, slx: -0.1, ty: 0, tx: 0, wx: 0 };
    this.poseTarget = Object.assign({}, this.pose);
    this.poseRate = 8;

    this.scene.add(this.root);
  }

  // ---------- 激光 ----------
  _buildBeams() {
    this.beamGroup = new THREE.Group();
    this.scene.add(this.beamGroup);
    this.beamPivots = [];
    const len = CONFIG.BOSS.BEAM.sweep.len;
    const coreGeo = new THREE.CylinderGeometry(0.12, 0.12, 1, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    const glowGeo = new THREE.CylinderGeometry(0.38, 0.38, 1, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    for (let i = 0; i < 3; i++) {
      const pivot = new THREE.Group();
      const core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color: 0xfff4e0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
      const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color: 0xff5030, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
      core.scale.z = len; glow.scale.z = len;
      pivot.add(core, glow);
      pivot.visible = false;
      this.beamGroup.add(pivot);
      this.beamPivots.push(pivot);
    }
    this.beams = { active: false, mode: '', t: 0, n: 2, angle: 0, dir: 1, yaw: 0, sparkTimer: 0 };
  }

  // ---------- 狂暴光环 ----------
  _buildAura() {
    this.aura = new THREE.Mesh(
      new THREE.SphereGeometry(2.4, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xff4422, transparent: true, opacity: 0, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.aura.visible = false;
    this.root.add(this.aura);
    this.aura.position.y = 1.8;
    this._auraEmber = 0;
  }

  // ---------- 武器拖尾（预分配 ribbon）----------
  _buildTrail() {
    this.TRAIL_N = 22;
    const n = this.TRAIL_N;
    const pos = new Float32Array(n * 2 * 3);
    const col = new Float32Array(n * 2 * 3);
    const idx = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.trailMesh = new THREE.Mesh(geo, mat);
    this.trailMesh.frustumCulled = false;
    this.scene.add(this.trailMesh);
    this._trailPos = pos;
    this._trailCol = col;
    this._trailGlow = 0;
    this._trailColor = new THREE.Color(CONFIG.COLORS.gold);
  }

  _updateTrail(dt) {
    this._syncStatue();
    const n = this.TRAIL_N, pos = this._trailPos, col = this._trailCol;
    // 历史下移
    pos.copyWithin(6, 0, (n - 1) * 6);
    this.tipMarker.getWorldPosition(this._tmp);
    this.baseMarker.getWorldPosition(this._tmp2);
    pos[0] = this._tmp2.x; pos[1] = this._tmp2.y; pos[2] = this._tmp2.z;
    pos[3] = this._tmp.x; pos[4] = this._tmp.y; pos[5] = this._tmp.z;
    this._trailGlow = Math.max(0, this._trailGlow - dt * 4);
    const c = this._trailColor;
    for (let i = 0; i < n; i++) {
      const b = Math.max(0, 1 - i / (n - 1)) * this._trailGlow;
      for (const o of [i * 6, i * 6 + 3]) {
        col[o] = c.r * b; col[o + 1] = c.g * b; col[o + 2] = c.b * b;
      }
    }
    this.trailMesh.geometry.attributes.position.needsUpdate = true;
    this.trailMesh.geometry.attributes.color.needsUpdate = true;
  }

  // ---------- 状态 ----------
  reset() {
    const B = CONFIG.BOSS;
    this.hp = B.HP;
    this.phase = 1;
    this.state = 'idle'; // idle | attack | frozen | cinematic | dead
    this.atk = null;
    this.cooldown = 1.6;
    this.frozenT = 0;
    this.flashT = 0;
    this.deadT = 0;
    this.bigAttackUntil = 0;
    this.lastMove = '';
    this.lastMove2 = '';
    this.beamSweepReadyAt = 4;  // 进二阶段后稍等就放
    this.beamTrackReadyAt = 2;
    this.strafeDir = 1;
    this.strafeTimer = 2;
    this.yaw = 0;
    this.pos.set(0, 0, -7);
    this.root.rotation.y = 0;
    this.root.position.y = 0;
    this.hoverY = 0;
    this.aura.visible = false;
    this.aura.material.opacity = 0;
    this.eyeLight.intensity = 0;
    this.eyeMat.emissive.set(0xffcc44);
    this.eyeMat.emissiveIntensity = 1.2;
    this.bladeMat.emissiveIntensity = 0;
    this._trailGlow = 0;
    this.mats.armor.emissive.setScalar(0);
    this.stopBeams();
    Object.assign(this.pose, { srx: -0.25, sry: 0, srz: 0.18, slx: -0.1, ty: 0, tx: 0, wx: 0 });
    Object.assign(this.poseTarget, this.pose);
    // 拖尾清零到当前位置
    this.root.updateMatrixWorld(true);
    for (let i = 0; i < this.TRAIL_N; i++) this._updateTrail(0.1);
  }

  get alive() { return this.state !== 'dead'; }
  get frozen() { return this.state === 'frozen'; }
  get invuln() { return this.state === 'cinematic'; }

  setPose(target, rate) {
    Object.assign(this.poseTarget, target);
    if (rate) this.poseRate = rate;
  }

  freeze(dur) {
    if (!this.alive || this.state === 'cinematic') return;
    this.cancelAttack();
    this.state = 'frozen';
    this.frozenT = dur;
  }

  cancelAttack() {
    this.atk = null;
    VFX.decalHide();
    this.bladeMat.emissiveIntensity = 0;
    this.bigAttackUntil = 0;
    this.stopBeams();
    this.eyeMat.emissive.set(0xffcc44);
    this.eyeMat.emissiveIntensity = 1.2;
    this.eyeLight.intensity = this.phase >= 3 ? 1.2 : 0;
    if (this.state === 'attack') this.state = 'idle';
    this.cooldown = 0.8;
  }

  die() {
    this.cancelAttack();
    this.state = 'dead';
    this.deadT = 0;
    this._tmp.copy(this.pos).setY(2);
    VFX.burst({ pos: this._tmp, count: 60, speed: [2, 8], up: 2, spread: 1, life: [0.6, 1.6], size: 0.5, sizeEnd: 0.05, color: CONFIG.COLORS.goldBright, colorEnd: 0xff4030, gravity: 1 });
    VFX.shockwave(this.pos, CONFIG.COLORS.gold, 12, 0.6);
    AudioMan.roar();
  }

  // ---------- 选招 ----------
  chooseAttack() {
    const B = CONFIG.BOSS, M = B.MELEE;
    const d = U.dist2D(this.pos, Game.player.pos);
    const cands = [];
    if (d < 7) cands.push(['combo3', 3]);
    if (d < 6) cands.push(['sweep', 2.5]);
    if (d > 5 && d < 15) cands.push(['thrust', 2.2]);
    cands.push(['slam', d > M.slam.minDist ? 3 : 0.4]);
    if (this.phase >= 2) {
      if (Game.time >= this.beamSweepReadyAt) cands.push(['beamSweep', 5]);
      if (Game.time >= this.beamTrackReadyAt && d > 5) cands.push(['beamTrack', 2.8]);
    }
    // 不三连同招
    for (const c of cands) {
      if (c[0] === this.lastMove && c[0] === this.lastMove2) c[1] *= 0.08;
    }
    let total = 0;
    for (const c of cands) total += c[1];
    let roll = Math.random() * total;
    let pick = cands[0][0];
    for (const c of cands) { roll -= c[1]; if (roll <= 0) { pick = c[0]; break; } }
    this.lastMove2 = this.lastMove;
    this.lastMove = pick;
    this.startAttack(pick);
  }

  startAttack(name) {
    const B = CONFIG.BOSS;
    const teleMult = this.phase >= 3 ? B.P3_TELEGRAPH_MULT : 1;
    this.state = 'attack';
    const a = { name, t: 0, sub: 'tele', fired: 0 };
    this.atk = a;
    const p = Game.player.pos;

    switch (name) {
      case 'combo3': {
        a.tele = B.MELEE.combo3.windup * teleMult;
        this.setPose({ srx: -2.5, sry: 0, srz: 0.4, ty: -0.45, wx: 0 }, 6);
        this._teleFx('gold', a.tele);
        break;
      }
      case 'sweep': {
        a.tele = B.MELEE.sweep.windup * teleMult;
        this.setPose({ srx: -0.7, sry: -1.7, srz: 0.1, ty: -0.9, wx: 1.2 }, 6);
        VFX.decalShow('sector', this.pos, this.yaw, { halfArc: U.deg(B.MELEE.sweep.halfArc), r: B.MELEE.sweep.range, color: 0xffaa30 });
        this._teleFx('gold', a.tele);
        break;
      }
      case 'thrust': {
        a.tele = B.MELEE.thrust.windup * teleMult;
        this.setPose({ srx: 0.6, sry: 0, srz: -0.2, ty: 0.4, wx: 1.55 }, 6);
        VFX.decalShow('line', this.pos, this.yaw, { len: B.MELEE.thrust.dist + 2, width: B.MELEE.thrust.width * 2, color: 0xff4030 });
        this._teleFx('red', a.tele);
        this.bigAttackUntil = Game.time + a.tele + B.MELEE.thrust.dashDur;
        break;
      }
      case 'slam': {
        a.tele = B.MELEE.slam.windup * teleMult;
        a.target = p.clone();
        this.setPose({ srx: -2.8, sry: 0, srz: 0, slx: -2.6, ty: 0, tx: -0.15, wx: 0 }, 5);
        VFX.decalShow('ring', a.target, 0, { r: B.MELEE.slam.r, color: 0xff4030 });
        this._teleFx('red', a.tele);
        this.bigAttackUntil = Game.time + a.tele + 0.6;
        break;
      }
      case 'beamSweep': {
        a.sub = 'leap';
        a.tele = B.BEAM.sweep.telegraph;
        a.leapFrom = this.pos.clone();
        this.beamSweepReadyAt = Game.time + B.BEAM.sweep.cd;
        this.bigAttackUntil = Game.time + 0.5 + a.tele + B.BEAM.sweep.dur;
        this.setPose({ srx: -0.6, sry: 0, srz: 1.3, slx: -0.6, ty: 0, tx: 0.12, wx: 0 }, 5);
        UI.announceSmall('天眼 · 焚世');
        break;
      }
      case 'beamTrack': {
        a.tele = B.BEAM.track.telegraph;
        a.beamYaw = U.yawTo(this.pos, p);
        this.beamTrackReadyAt = Game.time + B.BEAM.track.cd;
        this.bigAttackUntil = Game.time + a.tele + B.BEAM.track.dur;
        this.setPose({ srx: -0.4, sry: 0, srz: 0.8, ty: 0, tx: 0.1, wx: 0 }, 6);
        VFX.decalShow('line', this.pos, a.beamYaw, { len: B.BEAM.track.len, width: 0.5, color: 0xff4030 });
        this._teleFx('red', a.tele);
        break;
      }
    }
  }

  _teleFx(kind, dur) {
    this.bladeMat.emissive.set(kind === 'red' ? 0xff3020 : 0xffd76a);
    this._teleKind = kind;
    this._teleDur = dur;
    AudioMan.telegraph(dur);
  }

  // ---------- 出招 ----------
  runAttack(dt) {
    const a = this.atk;
    if (!a) { this.state = 'idle'; return; }
    a.t += dt;
    const B = CONFIG.BOSS, M = B.MELEE, player = Game.player;

    // 预警期：刀光渐亮 + 贴花充能 + 缓慢追踪玩家朝向
    if (a.sub === 'tele') {
      const k = Math.min(a.t / a.tele, 1);
      this.bladeMat.emissiveIntensity = k * 1.6;
      VFX.decalProgress(k);
      if (a.name !== 'slam' && a.name !== 'beamTrack') {
        this.yaw = U.turnToward(this.yaw, U.yawTo(this.pos, player.pos), U.deg(80) * dt);
      }
      if (a.name === 'sweep' || a.name === 'thrust') VFX.decalFollow(this.pos, this.yaw);
      if (a.name === 'beamTrack') {
        a.beamYaw = U.yawTo(this.pos, player.pos);
        VFX.decalFollow(this.pos, a.beamYaw);
        this.eyeLight.intensity = k * 3;
        this.eyeMat.emissiveIntensity = 1.2 + k * 2;
      }
      if (a.t >= a.tele) {
        a.sub = 'active';
        a.t = 0;
        VFX.decalHide();
        this._trailGlow = 1;
        if (a.name === 'thrust') { a.lockedYaw = this.yaw; }
      }
      return;
    }

    // beamSweep 专用子状态流（收招阶段走下面的通用 recover）
    if (a.name === 'beamSweep' && a.sub !== 'recover') { this._runBeamSweep(a, dt); return; }

    if (a.sub === 'active') {
      switch (a.name) {
        case 'combo3': {
          const def = M.combo3;
          const slashAt = [0.05, 0.05 + def.gap, 0.05 + def.gap * 2];
          // 斩与斩之间限速追踪
          this.yaw = U.turnToward(this.yaw, U.yawTo(this.pos, player.pos), U.deg(def.trackRate) * dt);
          if (a.fired < 3 && a.t >= slashAt[a.fired]) {
            const side = a.fired % 2 === 0 ? 1 : -1;
            this.setPose({ srx: 0.9, sry: side * 0.7, srz: side * 0.4, ty: side * 0.5, wx: 0.3 }, 30);
            U.yawDir(this.yaw, this._tmp).multiplyScalar(2.4).add(this.pos).setY(1.6);
            VFX.slash(this._tmp, this.yaw, 0xffc050, 3.2);
            this._meleeHitPlayer(def.range, def.halfArc, def.dmg);
            AudioMan.hit();
            a.fired++;
            this._pullback = { srx: -1.8, sry: -side * 0.5, srz: 0.2, ty: -side * 0.4 };
          }
          // 斩与斩之间回拉蓄力
          if (a.fired < 3 && this._pullback && a.t > slashAt[a.fired] - def.gap * 0.45) {
            this.setPose(this._pullback, 10);
            this._pullback = null;
          }
          if (a.t >= slashAt[2] + 0.3) this._endAttack(0.5);
          break;
        }
        case 'sweep': {
          const def = M.sweep;
          this.setPose({ srx: -0.3, sry: 1.5, srz: 0.1, ty: 0.9, wx: 1.2 }, 26);
          if (!a.fired && a.t >= 0.13) {
            a.fired = 1;
            this._tmp.copy(this.pos).setY(1.4);
            VFX.slash(this._tmp, this.yaw, 0xffaa30, 4.5);
            VFX.shockwave(this.pos, 0xffaa30, def.range, 0.3);
            if (this._meleeHitPlayer(def.range, def.halfArc, def.dmg)) {
              // 击退
              this._tmp.copy(player.pos).sub(this.pos).setY(0).normalize();
              player.knockVel.addScaledVector(this._tmp, def.knockback);
            }
            AudioMan.heavyHit();
          }
          if (a.t >= def.active + 0.1) this._endAttack(0.6);
          break;
        }
        case 'thrust': {
          const def = M.thrust;
          this.setPose({ srx: -0.2, sry: 0, srz: -0.4, ty: -0.3, wx: 1.55 }, 28);
          const k = Math.min(a.t / def.dashDur, 1);
          const step = (U.easeOutQuad(k) - (a.dashK || 0)) * def.dist;
          a.dashK = U.easeOutQuad(k);
          U.yawDir(a.lockedYaw, this._tmp);
          this.pos.addScaledVector(this._tmp, step);
          this._clampArena();
          if (!a.fired && U.dist2D(this.pos, player.pos) < def.width + player.radius + 0.3) {
            a.fired = 1;
            this._hitPlayer(def.dmg);
          }
          // 冲刺尘土
          this._tmp2.copy(this.pos).setY(0.3);
          VFX.burst({ pos: this._tmp2, count: 1, speed: [0.5, 1.5], spread: 1, up: 0.6, life: [0.3, 0.6], size: 0.5, sizeEnd: 0.1, color: 0x665e52, colorEnd: 0x332f28 });
          if (k >= 1) this._endAttack(0.55);
          break;
        }
        case 'slam': {
          const def = M.slam;
          const dur = 0.5;
          const k = Math.min(a.t / dur, 1);
          // 跃向目标点的抛物线
          this.pos.x = U.lerp(a.leapX !== undefined ? a.leapX : (a.leapX = this.pos.x), a.target.x, U.easeInOut(k));
          this.pos.z = U.lerp(a.leapZ !== undefined ? a.leapZ : (a.leapZ = this.pos.z), a.target.z, U.easeInOut(k));
          this.root.position.y = Math.sin(k * Math.PI) * 3.2;
          if (!a.fired && k >= 1) {
            a.fired = 1;
            this.root.position.y = 0;
            this.setPose({ srx: 0.8, sry: 0, srz: 0, slx: 0.6, ty: 0, tx: 0.3, wx: 0 }, 30);
            VFX.shockwave(this.pos, 0xff5030, def.r, 0.45);
            VFX.addTrauma(0.55);
            AudioMan.heavyHit();
            this._tmp.copy(this.pos).setY(0.3);
            VFX.burst({ pos: this._tmp, count: 18, speed: [3, 7], spread: 0.3, up: 1.5, life: [0.4, 0.8], size: 0.5, sizeEnd: 0.1, color: 0x776a55, colorEnd: 0x332f28, gravity: 6 });
            const d = U.dist2D(this.pos, player.pos);
            if (d < def.r + player.radius) this._hitPlayer(def.dmg);
          }
          if (a.t >= dur + 0.25) this._endAttack(0.7);
          break;
        }
        case 'beamTrack': {
          const def = B.BEAM.track;
          if (!a.fired) {
            a.fired = 1;
            this.startBeams('track', 1, a.beamYaw);
          }
          a.beamYaw = U.turnToward(a.beamYaw, U.yawTo(this.pos, player.pos), U.deg(def.turnRate) * dt);
          this.beams.yaw = a.beamYaw;
          this.yaw = a.beamYaw;
          if (a.t >= def.dur) { this.stopBeams(); this._endAttack(0.6); }
          break;
        }
      }
      return;
    }

    if (a.sub === 'recover') {
      this.setPose({ srx: -0.25, sry: 0, srz: 0.18, slx: -0.1, ty: 0, tx: 0, wx: 0 }, 7);
      if (a.t >= a.recoverDur) {
        this.atk = null;
        this.state = 'idle';
        this.cooldown = U.rand(CONFIG.BOSS.COOLDOWN_MIN, CONFIG.BOSS.COOLDOWN_MAX) * (this.phase >= 3 ? 0.8 : 1);
      }
    }
  }

  _runBeamSweep(a, dt) {
    const def = CONFIG.BOSS.BEAM.sweep;
    switch (a.sub) {
      case 'leap': {
        const k = Math.min(a.t / 0.5, 1);
        this.pos.x = U.lerp(a.leapFrom.x, 0, U.easeInOut(k));
        this.pos.z = U.lerp(a.leapFrom.z, 0, U.easeInOut(k));
        this.root.position.y = Math.sin(k * Math.PI) * 2 + k * 1.0;
        if (k >= 1) { a.sub = 'tele2'; a.t = 0; AudioMan.telegraph(def.telegraph); }
        break;
      }
      case 'tele2': {
        const k = Math.min(a.t / def.telegraph, 1);
        this.root.position.y = 1.0 + Math.sin(Game.time * 3) * 0.1;
        this.eyeLight.intensity = k * 5;
        this.eyeMat.emissiveIntensity = 1.2 + k * 3;
        this.eyeMat.emissive.set(0xff3020);
        if (k >= 1) {
          a.sub = 'fire'; a.t = 0;
          a.angle0 = this.yaw;
          a.rotDir = Math.random() < 0.5 ? 1 : -1;
          const n = this.phase >= 3 ? 3 : 2;
          this.startBeams('sweep', n, a.angle0);
          AudioMan.roar();
        }
        break;
      }
      case 'fire': {
        this.root.position.y = 1.0 + Math.sin(Game.time * 3) * 0.1;
        this.beams.angle = a.angle0 + a.rotDir * U.deg(def.rotSpeed) * a.t;
        this.yaw = this.beams.angle;
        if (a.t >= def.dur) {
          this.stopBeams();
          this.eyeMat.emissive.set(0xffcc44);
          this.eyeMat.emissiveIntensity = 1.2;
          this.eyeLight.intensity = this.phase >= 3 ? 1.2 : 0;
          a.sub = 'fall';
          a.t = 0;
        }
        break;
      }
      case 'fall': {
        this.root.position.y = U.damp(this.root.position.y, this.hoverY, 6, dt);
        if (a.t >= 0.5) this._endAttack(0.8);
        break;
      }
    }
  }

  _endAttack(recoverDur) {
    if (!this.atk) return;
    this.atk.sub = 'recover';
    this.atk.t = 0;
    this.atk.recoverDur = recoverDur;
    this.bladeMat.emissiveIntensity = 0;
    this.bigAttackUntil = 0;
    VFX.decalHide();
  }

  _meleeHitPlayer(range, halfArcDeg, dmg) {
    const p = Game.player;
    if (!p.alive) return false;
    const d = U.dist2D(this.pos, p.pos);
    if (d > range + p.radius) return false;
    if (Math.abs(U.angleDiff(U.yawTo(this.pos, p.pos), this.yaw)) > U.deg(halfArcDeg)) return false;
    return this._hitPlayer(dmg);
  }

  _hitPlayer(dmg) {
    return Game.applyDamageToPlayer(dmg, this.pos);
  }

  // ---------- 激光开关与判定 ----------
  startBeams(mode, n, yaw) {
    this.beams.active = true;
    this.beams.mode = mode;
    this.beams.n = n;
    this.beams.yaw = yaw;
    this.beams.angle = yaw;
    for (let i = 0; i < this.beamPivots.length; i++) this.beamPivots[i].visible = i < n;
    AudioMan.laserStart();
  }

  stopBeams() {
    if (!this.beams) return;
    this.beams.active = false;
    for (const p of this.beamPivots) p.visible = false;
    AudioMan.laserStop();
  }

  _updateBeams(dt) {
    if (!this.beams.active) return;
    const B = CONFIG.BOSS.BEAM;
    const def = this.beams.mode === 'sweep' ? B.sweep : B.track;
    const baseYaw = this.beams.mode === 'sweep' ? this.beams.angle : this.beams.yaw;
    this.beamGroup.position.set(this.pos.x, this.root.position.y + 1.6, this.pos.z);
    const player = Game.player;
    const d = U.dist2D(this.pos, player.pos);
    const pYaw = U.yawTo(this.pos, player.pos);
    for (let i = 0; i < this.beams.n; i++) {
      const yaw = baseYaw + (i * U.TAU) / this.beams.n;
      this.beamPivots[i].rotation.y = yaw;
      // 命中：角度扇区 + 距离窗
      if (player.alive && d > def.innerR && d < def.len) {
        const halfW = U.deg(def.halfWidthDeg) + Math.atan2(player.radius, d);
        if (Math.abs(U.angleDiff(pYaw, yaw)) < halfW) {
          Game.applyDamageToPlayer(def.dmg, this.pos, { noStagger: true });
        }
      }
    }
    // 光束末端火花
    this.beams.sparkTimer -= dt;
    if (this.beams.sparkTimer <= 0) {
      this.beams.sparkTimer = 0.12;
      for (let i = 0; i < this.beams.n; i++) {
        const yaw = baseYaw + (i * U.TAU) / this.beams.n;
        U.yawDir(yaw, this._tmp).multiplyScalar(def.len).add(this.beamGroup.position);
        this._tmp.y = 0.5;
        VFX.burst({ pos: this._tmp, count: 3, speed: [1, 4], spread: 1, up: 2, life: [0.2, 0.5], size: 0.3, sizeEnd: 0.05, color: 0xffe0b0, colorEnd: 0xff4020, gravity: 4 });
      }
    }
  }

  // ---------- 主更新 ----------
  update(dt) {
    const B = CONFIG.BOSS;
    const t = Game.time;

    if (this.state === 'dead') {
      this.deadT += dt;
      const k = Math.min(this.deadT / 2.2, 1);
      this.torso.rotation.x = U.easeOutCubic(k) * 0.9;
      this.root.position.y = -U.easeInQuad(k) * 0.6;
      this.eyeLight.intensity = Math.max(0, 3 * (1 - this.deadT / 2.5));
      this.eyeMat.emissiveIntensity = Math.max(0, 2.5 * (1 - this.deadT / 2.8));
      this.mats.armor.emissive.setScalar(Math.max(0, 0.5 - k * 0.5));
      this._updateTrail(dt);
      return;
    }

    // 受击白闪
    this.flashT = Math.max(0, this.flashT - dt);
    this.mats.armor.emissive.setScalar(this.flashT > 0 ? 0.55 : 0);

    if (this.state === 'cinematic') {
      // 阶段过场：Game 负责移动；这里只摆姿态吼叫
      this.setPose({ srx: -1.4, sry: 0, srz: 1.4, slx: -1.4, ty: 0, tx: -0.2, wx: 0 }, 5);
      this._applyPose(dt);
      this._ambientAnim(dt, t);
      this._updateTrail(dt);
      return;
    }

    if (this.state === 'frozen') {
      this.frozenT -= dt;
      // 定身颤抖
      this.root.rotation.y = this.yaw + Math.sin(t * 40) * 0.012;
      if (this.frozenT <= 0) { this.state = 'idle'; this.cooldown = 0.5; }
      this._updateTrail(dt);
      this._updateBeams(dt);
      return;
    }

    const player = Game.player;
    if (!player.alive) {
      // 玩家死亡：收招立正
      if (this.state === 'attack') this.cancelAttack();
      this.setPose({ srx: -0.25, sry: 0, srz: 0.18, ty: 0, tx: 0, wx: 0 }, 4);
      this._applyPose(dt);
      this._ambientAnim(dt, t);
      this._updateTrail(dt);
      return;
    }

    if (this.state === 'idle') {
      this.cooldown -= dt;
      const d = U.dist2D(this.pos, player.pos);
      const speedMult = this.phase >= 3 ? B.P3_SPEED_MULT : 1;
      // 朝向玩家
      this.yaw = U.turnToward(this.yaw, U.yawTo(this.pos, player.pos), U.deg(B.TURN_RATE) * dt);
      // 走位：贴近理想距离 + 横向移动
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) { this.strafeTimer = U.rand(1.5, 3); this.strafeDir *= Math.random() < 0.7 ? -1 : 1; }
      U.yawDir(this.yaw, this._tmp);
      let mv = 0;
      if (d > B.PREFER_RANGE + 0.6) mv = B.SPEED * speedMult;
      else if (d < B.PREFER_RANGE - 1.2) mv = -B.SPEED * 0.5;
      this.pos.addScaledVector(this._tmp, mv * dt);
      this._tmp2.set(this._tmp.z, 0, -this._tmp.x); // 垂直方向
      this.pos.addScaledVector(this._tmp2, this.strafeDir * B.SPEED * 0.45 * speedMult * dt);
      this._clampArena();
      this.setPose({ srx: -0.25, sry: 0, srz: 0.18, slx: -0.1, ty: 0, tx: 0, wx: 0 }, 6);
      if (this.cooldown <= 0) this.chooseAttack();
    } else if (this.state === 'attack') {
      this.runAttack(dt);
    }

    // 悬浮（二阶段后接地攻击除外）
    const grounded = this.atk && (this.atk.name === 'slam' || this.atk.name === 'beamSweep');
    this.hoverY = this.phase >= 2 ? 0.32 + Math.sin(t * 2.2) * 0.08 : 0;
    if (!grounded) this.root.position.y = U.damp(this.root.position.y, this.hoverY, 5, dt);

    this.root.rotation.y = this.yaw;
    this._applyPose(dt);
    this._ambientAnim(dt, t);
    this._updateTrail(dt);
    this._updateBeams(dt);

    // 狂暴光环
    if (this.phase >= 3) {
      this.aura.visible = true;
      this.aura.material.opacity = 0.13 + Math.sin(t * 6) * 0.07;
      this._auraEmber -= dt;
      if (this._auraEmber <= 0) {
        this._auraEmber = 0.18;
        this._tmp.set(this.pos.x + U.rand(-1.5, 1.5), this.root.position.y + U.rand(0.5, 2.5), this.pos.z + U.rand(-1.5, 1.5));
        VFX.burst({ pos: this._tmp, count: 1, speed: [0.2, 0.8], spread: 1, up: 1.5, life: [0.5, 1], size: 0.2, sizeEnd: 0.04, color: 0xff5030, colorEnd: CONFIG.COLORS.gold, tex: 'ember' });
      }
    }
  }

  _applyPose(dt) {
    const p = this.pose, tg = this.poseTarget, r = this.poseRate;
    for (const k of ['srx', 'sry', 'srz', 'slx', 'ty', 'tx', 'wx']) p[k] = U.damp(p[k], tg[k] !== undefined ? tg[k] : p[k], r, dt);
    this.armR.shoulder.rotation.set(p.srx, p.sry, p.srz);
    this.armL.shoulder.rotation.set(p.slx !== undefined ? p.slx : -0.1, 0, -0.25);
    this.torso.rotation.set(p.tx, p.ty, 0);
    this.weapon.rotation.x = p.wx;
  }

  _ambientAnim(dt, t) {
    // 呼吸 + 披风/刀缨滞后 + 天眼脉动
    this.torso.scale.y = 1 + Math.sin(t * 1.8) * 0.012;
    for (let i = 0; i < this.capeSegs.length; i++) {
      this.capeSegs[i].rotation.x = 0.15 + Math.sin(t * 1.6 + i * 0.7) * 0.08 + i * 0.04;
    }
    for (let i = 0; i < this.tassel.length; i++) {
      this.tassel[i].rotation.x = Math.sin(t * 2.3 + i * 0.8) * 0.25;
      this.tassel[i].rotation.z = Math.sin(t * 1.9 + i * 0.6) * 0.2;
    }
    // 甲裙布片微摆
    if (this.skirtPanels) {
      for (let i = 0; i < this.skirtPanels.length; i++) {
        this.skirtPanels[i].rotation.x = Math.sin(t * 1.7 + i * 1.3) * 0.05;
      }
    }
    if (this.phase < 2 || !this.beams.active) {
      const pulse = this.phase >= 3 ? 2.2 + Math.sin(t * 5) * 0.8 : 1.1 + Math.sin(t * 2.5) * 0.25;
      if (!this.atk || this.atk.name.indexOf('beam') !== 0) this.eyeMat.emissiveIntensity = pulse;
    }
  }

  _clampArena() {
    const max = CONFIG.ARENA_RADIUS - 0.5;
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > max) { this.pos.x *= max / r; this.pos.z *= max / r; }
  }
}

// ---------- 哮天犬 ----------
class Dog {
  constructor(scene) {
    this.fox = buildFox({ scale: 0.95, tails: 1, segs: 5, bulky: true, bodyColor: 0x3b3b42, accentColor: 0xff3322, eyeColor: 0xff2211 });
    // 环境反射分级（CGI 底座）
    if (this.fox.mats) {
      Object.values(this.fox.mats).forEach((m) => { m.envMapIntensity = 0.4; });
      this.fox.mats.accent.envMapIntensity = 1.0;
    }
    this.root = this.fox.root;
    this.root.visible = false;
    scene.add(this.root);
    this.pos = this.root.position;
    this.radius = CONFIG.DOG.RADIUS;
    this.anim = { phase: 0, speedRatio: 0, tailAmp: 1, yawVel: 0, lean: 0 };
    this.knockVel = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this.alive = false;
    this.active = false;
  }

  spawn() {
    const D = CONFIG.DOG;
    this.hp = D.HP;
    this.alive = true;
    this.active = true;
    this.state = 'chase';
    this.st = 0;
    this.yaw = 0;
    this.flashT = 0;
    // 从场边冲进来
    const a = U.yawTo(Game.boss.pos, Game.player.pos) + U.deg(120);
    this.pos.set(Math.sin(a) * 18, 0, Math.cos(a) * 18);
    this.root.visible = true;
    this.root.rotation.set(0, 0, 0);
    this.fox.body.rotation.set(0, 0, 0);
    this.setOpacity(1);
    AudioMan.dogBark();
    UI.announceSmall('哮天犬入场');
  }

  setOpacity(o) {
    const m = this.fox.mats;
    if (!m) return;
    [m.body, m.cream, m.accent, m.eye, m.tip].forEach((mat) => {
      mat.transparent = o < 1;
      mat.opacity = o;
    });
  }

  die() {
    this.alive = false;
    this.state = 'dying';
    this.st = 0;
    AudioMan.dogBark();
    UI.announceSmall('哮天犬已倒下');
  }

  flee() {
    if (!this.alive) return;
    this.state = 'flee';
    this.st = 0;
    this.alive = false;
  }

  despawn() {
    this.active = false;
    this.alive = false;
    this.root.visible = false;
  }

  update(dt) {
    if (!this.active) return;
    const D = CONFIG.DOG;
    const t = Game.time;
    const player = Game.player;
    this.st += dt;
    this.flashT = Math.max(0, this.flashT - dt);
    if (this.fox.mats) this.fox.mats.body.emissive.setScalar(this.flashT > 0 ? 0.5 : 0);

    switch (this.state) {
      case 'chase': {
        const d = U.dist2D(this.pos, player.pos);
        this.yaw = U.turnToward(this.yaw, U.yawTo(this.pos, player.pos), U.deg(240) * dt);
        U.yawDir(this.yaw, this._dir);
        this.pos.addScaledVector(this._dir, D.SPEED * dt);
        this.anim.speedRatio = U.damp(this.anim.speedRatio, 1, 8, dt);
        // 攻击令牌：Boss 大招期间不扑咬
        if (d < D.LUNGE_RANGE && player.alive && Game.time > Game.boss.bigAttackUntil) {
          this.state = 'tele';
          this.st = 0;
        }
        break;
      }
      case 'tele': {
        // 蓄力下蹲（姿态在 foxAnimate 之后统一覆盖）
        this.anim.speedRatio = U.damp(this.anim.speedRatio, 0, 12, dt);
        this.yaw = U.turnToward(this.yaw, U.yawTo(this.pos, player.pos), U.deg(160) * dt);
        if (this.st >= D.LUNGE_TELE) {
          this.state = 'lunge';
          this.st = 0;
          this.lungeK = 0;
          U.yawDir(this.yaw, this._dir);
          AudioMan.dogBark();
        }
        break;
      }
      case 'lunge': {
        const k = Math.min(this.st / D.LUNGE_DUR, 1);
        const step = (U.easeOutQuad(k) - this.lungeK) * D.LUNGE_DIST;
        this.lungeK = U.easeOutQuad(k);
        this.pos.addScaledVector(this._dir, step);
        if (!this.hitFlag && U.dist2D(this.pos, player.pos) < 1.1 + player.radius) {
          this.hitFlag = true;
          if (Game.applyDamageToPlayer(D.DMG, this.pos)) {
            this._tmp.copy(player.pos).sub(this.pos).setY(0).normalize();
            player.knockVel.addScaledVector(this._tmp, 3);
          }
        }
        if (k >= 1) {
          this.state = 'recover';
          this.st = 0;
          this.hitFlag = false;
          this.fox.body.scale.set(1, 1, 1);
          this.fox.body.rotation.x = 0;
          this.fox.body.position.y = 0.85;
        }
        break;
      }
      case 'recover': {
        // 出招后硬直 = 玩家的惩罚窗口
        this.anim.speedRatio = 0;
        if (this.st >= D.RECOVER) { this.state = 'chase'; }
        break;
      }
      case 'dying': {
        const k = Math.min(this.st / 1.0, 1);
        this.fox.body.rotation.z = U.easeOutCubic(k) * Math.PI * 0.5;
        this.fox.body.position.y = U.lerp(0.85, 0.35, k);
        this.setOpacity(1 - U.easeInQuad(k));
        if (k >= 1) this.despawn();
        return;
      }
      case 'flee': {
        // Boss 倒下：哮天犬哀鸣逃出场外
        this._dir.copy(this.pos).setY(0).normalize();
        if (this._dir.lengthSq() < 0.01) this._dir.set(0, 0, 1);
        this.pos.addScaledVector(this._dir, D.SPEED * 1.3 * dt);
        this.anim.speedRatio = 1;
        this.setOpacity(Math.max(0, 1 - this.st / 1.5));
        if (this.st > 1.6) this.despawn();
        break;
      }
    }

    // 击退 + 边界
    this.pos.addScaledVector(this.knockVel, dt);
    this.knockVel.multiplyScalar(Math.exp(-8 * dt));
    if (this.state !== 'flee') {
      const r = Math.hypot(this.pos.x, this.pos.z);
      if (r > CONFIG.ARENA_RADIUS) { this.pos.x *= CONFIG.ARENA_RADIUS / r; this.pos.z *= CONFIG.ARENA_RADIUS / r; }
    }

    this.root.rotation.y = this.yaw;
    foxAnimate(this.fox, this.anim, dt, t + 5);

    // 状态姿态覆盖（必须在 foxAnimate 之后）
    if (this.state === 'tele') {
      this.fox.body.position.y = 0.85 - U.easeOutQuad(Math.min(this.st / CONFIG.DOG.LUNGE_TELE, 1)) * 0.3;
      this.fox.body.rotation.x = 0.25;
      this.fox.body.scale.set(1, 1, 1);
    } else if (this.state === 'lunge') {
      this.fox.body.rotation.x = -0.2;
      this.fox.body.scale.set(0.95, 0.95, 1.25);
    } else if (this.state === 'recover') {
      this.fox.body.position.y = 0.85 + Math.sin(t * 14) * 0.02; // 喘气
      this.fox.body.scale.set(1, 1, 1);
    } else {
      this.fox.body.scale.set(1, 1, 1);
    }
  }
}
