// 自包含后期处理管线（HDR 工作流：bloom + ACES + 调色 + 颗粒 + 暗角）
// 锁定 Three.js r147 UMD（window.THREE）。经典 script，禁止 import/export。
// 全部用 r147 核心 API 手搓：WebGLRenderTarget / ShaderMaterial / 正交相机 + 全屏三角形。
// 禁止 EffectComposer / examples 插件。
//
// 对外契约（主程序按此接线）：
//   window.Post = {
//     enabled,                         // 只读状态
//     init(renderer) -> bool,          // 创建资源，成功 enabled=CONFIG.POST
//     render(scene, camera, time),     // enabled 走管线；否则直接 renderer.render
//     resize(w, h),                    // 重建/重设 RT 尺寸（乘 pixelRatio）
//     setEnabled(on),                  // 运行时开关（FPS 看门狗调用）
//   };
//
// HDR 要点：
//   init 成功 → renderer.toneMapping = NoToneMapping（场景按原始 HDR 线性渲到 RT）。
//   setEnabled(false) / init 失败 → 恢复 ACESFilmicToneMapping。
//   renderer.outputEncoding 始终不动（sRGB 由管线最后一步 pow(1/2.2) 自己做）。

(function () {
  'use strict';

  // ---------- 顶点着色器：全屏三角形直通 ----------
  // 几何体 3 个顶点位于裁剪空间 [(-1,-1),(3,-1),(-1,3)]，覆盖整个屏幕。
  // vUv = position.xy*0.5+0.5 → 屏幕 UV（左下 0,0 右上 1,1）。
  var VERT = [
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = position.xy * 0.5 + 0.5;',
    '  gl_Position = vec4(position.xy, 0.0, 1.0);',
    '}',
  ].join('\n');

  // ---------- Pass 1：亮度阈值提取（bright-pass）----------
  // 输入全分辨率 HDR 场景，输出渲到 1/4 RT。
  // soft knee：在 threshold 附近做平滑过渡，避免硬边。
  var FRAG_BRIGHT = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform sampler2D tDiffuse;',
    'uniform float threshold;',  // 亮度阈值（默认 1.0）
    'uniform float knee;',       // soft knee 宽度
    'void main() {',
    '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
    // 感知亮度（Rec.709）
    '  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));',
    // soft knee：max(0, luma-threshold) 基础上做 quadratic knee 平滑
    '  float soft = luma - threshold + knee;',
    '  soft = clamp(soft, 0.0, 2.0 * knee);',
    '  soft = soft * soft / (4.0 * knee + 0.0001);',
    '  float contrib = max(soft, luma - threshold);',
    '  contrib = max(contrib, 0.0) / max(luma, 0.0001);',
    '  gl_FragColor = vec4(c * contrib, 1.0);',
    '}',
  ].join('\n');

  // ---------- Pass 2：可分离高斯模糊（9-tap，单向）----------
  // direction = (1,0) 水平 或 (0,1) 垂直；texelSize = 1/分辨率。
  var FRAG_BLUR = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform sampler2D tDiffuse;',
    'uniform vec2 texelSize;',
    'uniform vec2 direction;',
    'void main() {',
    // 9-tap 高斯权重（中心 + 对称 4 对），sigma≈2.0，已归一化
    '  float w0 = 0.227027;',
    '  float w1 = 0.194595;',
    '  float w2 = 0.121622;',
    '  float w3 = 0.054054;',
    '  float w4 = 0.016216;',
    '  vec2 d = direction * texelSize;',
    '  vec3 acc = texture2D(tDiffuse, vUv).rgb * w0;',
    '  acc += texture2D(tDiffuse, vUv + d * 1.0).rgb * w1;',
    '  acc += texture2D(tDiffuse, vUv - d * 1.0).rgb * w1;',
    '  acc += texture2D(tDiffuse, vUv + d * 2.0).rgb * w2;',
    '  acc += texture2D(tDiffuse, vUv - d * 2.0).rgb * w2;',
    '  acc += texture2D(tDiffuse, vUv + d * 3.0).rgb * w3;',
    '  acc += texture2D(tDiffuse, vUv - d * 3.0).rgb * w3;',
    '  acc += texture2D(tDiffuse, vUv + d * 4.0).rgb * w4;',
    '  acc += texture2D(tDiffuse, vUv - d * 4.0).rgb * w4;',
    '  gl_FragColor = vec4(acc, 1.0);',
    '}',
  ].join('\n');

  // ---------- Pass 3：合成（渲到屏幕）----------
  // scene + bloom 加性叠加 → ACES filmic 近似 → 调色 → 颗粒 → 暗角 → sRGB。
  var FRAG_COMPOSITE = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform sampler2D tScene;',     // 全分辨率 HDR 场景
    'uniform sampler2D tBloom;',     // 1/4 分辨率模糊后的 bloom
    'uniform float bloomStrength;',  // bloom 强度系数
    'uniform float time;',           // 颗粒动画用
    'uniform vec2 resolution;',      // 全屏像素尺寸（颗粒哈希用）',
    // 哈希噪声：基于像素坐标 + 时间，输出 [0,1)
    'float hash(vec2 p) {',
    '  p = fract(p * vec2(123.34, 456.21));',
    '  p += dot(p, p + 45.32);',
    '  return fract(p.x * p.y);',
    '}',
    'void main() {',
    '  vec3 hdr = texture2D(tScene, vUv).rgb;',
    '  vec3 bloom = texture2D(tBloom, vUv).rgb;',
    // 1) bloom 加性叠加
    '  vec3 color = hdr + bloom * bloomStrength;',
    // 2) ACES filmic 近似（Narkowicz）：把 HDR 拉回 [0,1]
    '  color = (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14);',
    '  color = clamp(color, 0.0, 1.0);',
    // 3) 调色：阴影偏蓝（暗部 lift），轻微去饱和，轻微对比
    '  vec3 lift = vec3(0.01, 0.015, 0.03);',          // 阴影偏冷蓝
    '  color += lift * (1.0 - color);',                // lift 主要作用于暗部
    '  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));',
    '  color = mix(color, vec3(luma), 0.08);',         // 去饱和 8%
    '  color = (color - 0.5) * 1.06 + 0.5;',           // 轻微对比 +6%
    '  color = clamp(color, 0.0, 1.0);',
    // 4) 胶片颗粒：±0.035，暗部多亮部少
    '  float n = hash(vUv * resolution + vec2(time * 60.0, time * 37.0)) - 0.5;',
    '  float grainAmt = 0.035 * (1.0 - smoothstep(0.0, 0.6, luma));', // 暗部权重高
    '  color += n * grainAmt;',
    // 5) 暗角：径向衰减
    '  vec2 q = vUv - 0.5;',
    '  float r = length(q) * 1.414214;',                // 角到中心归一
    '  float vig = smoothstep(1.0, 0.4, r);',           // 边缘暗、中心亮
    '  color *= mix(1.0, vig, 0.35);',                  // 暗角强度 0.35
    '  color = clamp(color, 0.0, 1.0);',
    // 6) 线性 → sRGB 输出（outputEncoding 在管线里被绕过，此处自己转）
    '  color = pow(color, vec3(1.0 / 2.2));',
    '  gl_FragColor = vec4(color, 1.0);',
    '}',
  ].join('\n');

  // ---------- 可调参数（集中）----------
  var PARAMS = {
    bloomStrength: 0.7,   // bloom 加性强度
    threshold: 1.0,       // 亮度提取阈值（HDR，emissive>1 才进 bloom）
    knee: 0.5,            // soft knee 宽度
    bloomScale: 4,        // bloom RT 缩小倍数（1/4 分辨率）
  };

  window.Post = {
    enabled: false,

    // 内部资源（init 后填充）
    _renderer: null,
    _ready: false,        // 资源是否已成功创建
    _w: 1, _h: 1,         // 像素尺寸（已乘 pixelRatio）

    _sceneRT: null,       // 全分辨率 HDR 场景 RT
    _brightRT: null,      // 1/4 分辨率 bright-pass 输出
    _blurRTA: null,       // 1/4 分辨率 ping
    _blurRTB: null,       // 1/4 分辨率 pong

    _quadScene: null,     // 全屏三角形复用场景
    _quadCam: null,       // 正交相机
    _quad: null,          // Mesh（每个 pass 换 material）

    _matBright: null,
    _matBlur: null,
    _matComposite: null,

    // ---------- 初始化 ----------
    init: function (renderer) {
      this._renderer = renderer;
      // CONFIG.POST 为 false → 不建资源，直接关
      if (!window.CONFIG || !CONFIG.POST) {
        this.enabled = false;
        this._restoreToneMapping();
        return false;
      }
      try {
        var THREE = window.THREE;
        if (!THREE) throw new Error('THREE missing');

        // 当前像素尺寸
        var pr = renderer.getPixelRatio();
        var w = Math.max(1, Math.floor(renderer.domElement.width));
        var h = Math.max(1, Math.floor(renderer.domElement.height));
        // domElement.width/height 已含 pixelRatio；此处直接用作 RT 物理像素尺寸
        this._w = w;
        this._h = h;

        var bw = Math.max(1, Math.floor(w / PARAMS.bloomScale));
        var bh = Math.max(1, Math.floor(h / PARAMS.bloomScale));

        // sceneRT：HalfFloat HDR，保留 emissive>1 的高光
        var rtOpts = {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
          type: THREE.HalfFloatType,
          depthBuffer: true,
          stencilBuffer: false,
        };
        this._sceneRT = new THREE.WebGLRenderTarget(w, h, rtOpts);

        // bloom RT 不需要深度
        var bloomOpts = {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
          type: THREE.HalfFloatType,
          depthBuffer: false,
          stencilBuffer: false,
        };
        this._brightRT = new THREE.WebGLRenderTarget(bw, bh, bloomOpts);
        this._blurRTA = new THREE.WebGLRenderTarget(bw, bh, bloomOpts);
        this._blurRTB = new THREE.WebGLRenderTarget(bw, bh, bloomOpts);

        // 全屏三角形几何体
        var geo = new THREE.BufferGeometry();
        var verts = new Float32Array([
          -1, -1, 0,
           3, -1, 0,
          -1,  3, 0,
        ]);
        geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));

        // 三个 pass 的材质
        this._matBright = new THREE.ShaderMaterial({
          vertexShader: VERT,
          fragmentShader: FRAG_BRIGHT,
          depthTest: false,
          depthWrite: false,
          uniforms: {
            tDiffuse: { value: null },
            threshold: { value: PARAMS.threshold },
            knee: { value: PARAMS.knee },
          },
        });

        this._matBlur = new THREE.ShaderMaterial({
          vertexShader: VERT,
          fragmentShader: FRAG_BLUR,
          depthTest: false,
          depthWrite: false,
          uniforms: {
            tDiffuse: { value: null },
            texelSize: { value: new THREE.Vector2(1 / bw, 1 / bh) },
            direction: { value: new THREE.Vector2(1, 0) },
          },
        });

        this._matComposite = new THREE.ShaderMaterial({
          vertexShader: VERT,
          fragmentShader: FRAG_COMPOSITE,
          depthTest: false,
          depthWrite: false,
          uniforms: {
            tScene: { value: null },
            tBloom: { value: null },
            bloomStrength: { value: PARAMS.bloomStrength },
            time: { value: 0 },
            resolution: { value: new THREE.Vector2(w, h) },
          },
        });

        // 复用的全屏场景 + 正交相机
        this._quadScene = new THREE.Scene();
        this._quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this._quad = new THREE.Mesh(geo, this._matBright);
        this._quad.frustumCulled = false;
        this._quadScene.add(this._quad);

        // HDR 工作流：场景按原始线性渲到 RT，tone mapping 关闭
        renderer.toneMapping = THREE.NoToneMapping;
        // outputEncoding 不动

        // 移动端兜底：试渲一帧 bright-pass，失败则回退
        this._probe();

        this._ready = true;
        this.enabled = true; // CONFIG.POST 已为 true
        return true;
      } catch (e) {
        console.error('[Post] init failed, falling back to direct render:', e);
        this._dispose();
        this._ready = false;
        this.enabled = false;
        this._restoreToneMapping();
        return false;
      }
    },

    // 试渲一帧：把一个空场景渲进 sceneRT，再跑一次 bright-pass，
    // 任一步抛错（如 HalfFloat 不支持 / framebuffer incomplete）由外层 catch 捕获。
    _probe: function () {
      var r = this._renderer;
      this._quad.material = this._matBright;
      this._matBright.uniforms.tDiffuse.value = this._sceneRT.texture;
      r.setRenderTarget(this._brightRT);
      r.render(this._quadScene, this._quadCam);
      r.setRenderTarget(null);
    },

    // ---------- 主渲染 ----------
    render: function (scene, camera, time) {
      // 未启用 → 直接渲染（契约要求）
      if (!this.enabled || !this._ready) {
        this._renderer.render(scene, camera);
        return;
      }
      var r = this._renderer;
      try {
        // 1) 场景渲到全分辨率 HDR sceneRT（NoToneMapping，线性）
        r.setRenderTarget(this._sceneRT);
        r.clear();
        r.render(scene, camera);

        // 2) bright-pass → brightRT（1/4）
        this._quad.material = this._matBright;
        this._matBright.uniforms.tDiffuse.value = this._sceneRT.texture;
        r.setRenderTarget(this._brightRT);
        r.render(this._quadScene, this._quadCam);

        // 3) 水平模糊 brightRT → blurRTA
        this._quad.material = this._matBlur;
        this._matBlur.uniforms.tDiffuse.value = this._brightRT.texture;
        this._matBlur.uniforms.direction.value.set(1, 0);
        r.setRenderTarget(this._blurRTA);
        r.render(this._quadScene, this._quadCam);

        // 4) 垂直模糊 blurRTA → blurRTB
        this._matBlur.uniforms.tDiffuse.value = this._blurRTA.texture;
        this._matBlur.uniforms.direction.value.set(0, 1);
        r.setRenderTarget(this._blurRTB);
        r.render(this._quadScene, this._quadCam);

        // 5) 合成 → 屏幕（renderTarget = null）
        this._quad.material = this._matComposite;
        this._matComposite.uniforms.tScene.value = this._sceneRT.texture;
        this._matComposite.uniforms.tBloom.value = this._blurRTB.texture;
        this._matComposite.uniforms.time.value = time || 0;
        r.setRenderTarget(null);
        r.render(this._quadScene, this._quadCam);
      } catch (e) {
        // 任意 pass throw → 报错一次 + 自动关 + 当帧回退直接渲染（演示永不黑屏）
        console.error('[Post] render error, disabling pipeline:', e);
        this.setEnabled(false);
        r.setRenderTarget(null);
        r.render(scene, camera);
      }
    },

    // ---------- 尺寸调整 ----------
    resize: function (w, h) {
      if (!this._ready || !this._renderer) return;
      var THREE = window.THREE;
      var pr = this._renderer.getPixelRatio();
      var pw = Math.max(1, Math.floor(w * pr));
      var ph = Math.max(1, Math.floor(h * pr));
      this._w = pw;
      this._h = ph;

      var bw = Math.max(1, Math.floor(pw / PARAMS.bloomScale));
      var bh = Math.max(1, Math.floor(ph / PARAMS.bloomScale));

      this._sceneRT.setSize(pw, ph);
      this._brightRT.setSize(bw, bh);
      this._blurRTA.setSize(bw, bh);
      this._blurRTB.setSize(bw, bh);

      // 更新依赖分辨率的 uniform
      this._matBlur.uniforms.texelSize.value.set(1 / bw, 1 / bh);
      this._matComposite.uniforms.resolution.value.set(pw, ph);
    },

    // ---------- 运行时开关 ----------
    setEnabled: function (on) {
      var THREE = window.THREE;
      if (on) {
        // 只有资源就绪才能真正开启
        if (!this._ready) { this.enabled = false; return; }
        this.enabled = true;
        if (THREE) this._renderer.toneMapping = THREE.NoToneMapping;
      } else {
        this.enabled = false;
        // 关闭后由 renderer 自己做 ACES tone mapping
        this._restoreToneMapping();
      }
    },

    // 恢复主程序原始 tone mapping（ACES），让直接渲染路径仍然好看。
    _restoreToneMapping: function () {
      var THREE = window.THREE;
      if (this._renderer && THREE) {
        this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
      }
    },

    // 释放资源（init 失败 / 清理用）
    _dispose: function () {
      var targets = [this._sceneRT, this._brightRT, this._blurRTA, this._blurRTB];
      for (var i = 0; i < targets.length; i++) {
        if (targets[i] && targets[i].dispose) targets[i].dispose();
      }
      this._sceneRT = this._brightRT = this._blurRTA = this._blurRTB = null;
      var mats = [this._matBright, this._matBlur, this._matComposite];
      for (var j = 0; j < mats.length; j++) {
        if (mats[j] && mats[j].dispose) mats[j].dispose();
      }
      if (this._quad && this._quad.geometry && this._quad.geometry.dispose) {
        this._quad.geometry.dispose();
      }
    },
  };
})();
