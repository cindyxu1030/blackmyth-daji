// 永不失败的资源加载器。
// assets/ 里的图全部可选：缺图 → 程序化/CSS 兜底；放图 → 自动升级画面。
// 关键坑：file:// 下 <img> 能显示，但作为 WebGL 纹理上传会抛 SecurityError，
// 所以 UI 图走 DOM <img>，只有天空盒/地面需要 WebGL 纹理 —— 启动时探测一次权限。
window.Assets = {
  ok: {},              // name -> HTMLImageElement | null
  canWebGLTex: false,  // probeWebGL() 之后才可信
  _done: false,

  MANIFEST: {
    skybox:   'assets/skybox.jpg',        // WebGL 槽（需本地服务器）
    ground:   'assets/ground.jpg',        // WebGL 槽（需本地服务器）
    title:    'assets/title.png',         // DOM 槽（file:// 也能用）
    victory:  'assets/victory.png',
    defeat:   'assets/defeat.png',
    portrait: 'assets/daji_portrait.png',
    namecard: 'assets/boss_card.png',
  },

  load(onDone) {
    const finish = () => { if (!this._done) { this._done = true; onDone(); } };
    let pending = Object.keys(this.MANIFEST).length;
    const settle = () => { if (--pending === 0) finish(); };
    for (const [name, url] of Object.entries(this.MANIFEST)) {
      const img = new Image();
      img.onload = () => { this.ok[name] = img; settle(); };
      img.onerror = () => { this.ok[name] = null; settle(); };
      img.src = url;
    }
    setTimeout(finish, 3000); // 兜底：任何情况下 3 秒后必定开始游戏
  },

  // 探测 WebGL 纹理上传权限（file:// 下被 taint 的图会同步抛错）
  probeWebGL(renderer) {
    const img = this.ok.skybox || this.ok.ground;
    if (!img) { this.canWebGLTex = false; return; }
    try {
      const t = new THREE.Texture(img);
      t.needsUpdate = true;
      renderer.initTexture(t); // 强制立即上传；taint 时抛 SecurityError
      this.canWebGLTex = true;
      t.dispose();
    } catch (e) {
      this.canWebGLTex = false; // 静默回退程序化天空/地面
    }
  },

  // world.js 只通过这里拿 WebGL 纹理；拿不到就返回 null 走程序化
  tex(name) {
    if (!this.canWebGLTex || !this.ok[name]) return null;
    const t = new THREE.Texture(this.ok[name]);
    t.encoding = THREE.sRGBEncoding;
    t.needsUpdate = true;
    return t;
  },

  // ui.js：拿 DOM 图，null = 显示 CSS 兜底节点
  domImg(name) { return this.ok[name] || null; },
};
