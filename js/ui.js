// 中文 HUD + 全部画面层（标题/Boss登场/结算/暂停）。
// 每个图片槽位都有 CSS 兜底：assets/ 缺图也是完整设计稿，放图自动升级。
window.UI = (() => {
  const $ = (id) => document.getElementById(id);
  const el = {};
  let bossGhost = 1; // 血条白影（缓慢追赶真实血量）
  let announceTimer = 0, announceSmallTimer = 0;
  const cache = { hp: -1, stam: -1, meter: -1, boss: -1, dog: -1, charm: -1, flask: -1 };

  function init() {
    ['hud', 'boss-wrap', 'boss-name', 'boss-pips', 'boss-fill', 'boss-ghost', 'dog-wrap', 'dog-fill',
     'hp-fill', 'stam-fill', 'stam-wrap', 'meter-fill', 'portrait-img', 'portrait-fallback',
     'skill-charm', 'charm-cd', 'charm-num', 'skill-ult', 'skill-heavy', 'skill-dodge', 'skill-flask', 'flask-num', 'god-badge',
     'announce-big', 'announce-small', 'hint-bar',
     'title-screen', 'title-bg', 'boss-card', 'card-img', 'result-screen', 'result-bg',
     'result-big', 'result-sub', 'result-stats', 'pause-overlay', 'phase-tint', 'hurt-flash',
    ].forEach((id) => { el[id] = $(id); });
  }

  function applyAssets() {
    const slot = (imgEl, name, wrapId) => {
      const img = Assets.domImg(name);
      const wrap = $(wrapId);
      if (img && imgEl) {
        imgEl.src = img.src;
        imgEl.style.display = 'block';
        if (wrap) wrap.classList.add('has-img');
      }
    };
    slot(el['title-bg'], 'title', 'title-screen');
    slot(el['portrait-img'], 'portrait', 'portrait-wrap');
    slot(el['card-img'], 'namecard', 'boss-card');
    // 胜负图在 showResult 时按需填
    const bgm = $('bgm');
    if (bgm) bgm.volume = 0.4;
  }

  function setBar(elFill, key, v) {
    const pct = Math.round(U.clamp(v, 0, 1) * 1000) / 10;
    if (cache[key] === pct) return;
    cache[key] = pct;
    elFill.style.width = pct + '%';
  }

  function sync() {
    const p = Game.player, b = Game.boss, d = Game.dog;
    const P = CONFIG.PLAYER;
    setBar(el['hp-fill'], 'hp', p.hp / P.HP);
    setBar(el['stam-fill'], 'stam', p.stamina / P.STAMINA_MAX);
    setBar(el['meter-fill'], 'meter', p.meter / P.ULT.MAX);

    const bossPct = b.hp / CONFIG.BOSS.HP;
    setBar(el['boss-fill'], 'boss', bossPct);
    bossGhost = Math.max(bossPct, U.damp(bossGhost, bossPct, 1.4, 1 / 60));
    el['boss-ghost'].style.width = (bossGhost * 100).toFixed(1) + '%';

    if (d && d.active && d.alive) {
      el['dog-wrap'].style.display = 'flex';
      setBar(el['dog-fill'], 'dog', d.hp / CONFIG.DOG.HP);
    } else {
      el['dog-wrap'].style.display = 'none';
    }

    // 魅惑 CD
    const cd = Math.max(0, p.charmReadyAt - Game.time);
    const cdK = cd / P.CHARM.CD;
    if (cache.charm !== Math.ceil(cd)) {
      cache.charm = Math.ceil(cd);
      el['charm-num'].textContent = cd > 0 ? Math.ceil(cd) : '';
      el['skill-charm'].classList.toggle('cooling', cd > 0);
    }
    el['charm-cd'].style.height = (cdK * 100).toFixed(1) + '%';

    // 狐露存量
    if (cache.flask !== p.flasks) {
      cache.flask = p.flasks;
      el['flask-num'].textContent = '×' + p.flasks;
      el['skill-flask'].classList.toggle('dim', p.flasks <= 0);
    }

    // 大招就绪
    el['skill-ult'].classList.toggle('ready', p.meter >= P.ULT.MAX && !p.ultActive);
    el['skill-ult'].classList.toggle('active', p.ultActive);
    // 体力不足置灰
    const lowStam = p.stamina < CONFIG.PLAYER.DODGE.COST;
    el['skill-dodge'].classList.toggle('dim', lowStam);
    el['skill-heavy'].classList.toggle('dim', p.stamina < CONFIG.PLAYER.HEAVY.COST);
  }

  function announce(big, small, dur = 1.8) {
    el['announce-big'].textContent = big;
    el['announce-big'].classList.add('show');
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => el['announce-big'].classList.remove('show'), dur * 1000);
    if (small) announceSmall(small, dur + 0.6);
  }

  function announceSmall(text, dur = 1.8) {
    el['announce-small'].textContent = text;
    el['announce-small'].classList.add('show');
    clearTimeout(announceSmallTimer);
    announceSmallTimer = setTimeout(() => el['announce-small'].classList.remove('show'), dur * 1000);
  }

  function setBossPhase(n) {
    const pips = el['boss-pips'].children;
    for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('lost', i < n - 1);
  }

  function showScreen(name) {
    el['title-screen'].classList.toggle('show', name === 'title');
    el['result-screen'].classList.toggle('show', name === 'victory' || name === 'defeat');
    el['pause-overlay'].classList.toggle('show', name === 'pause');
    if (name !== 'victory' && name !== 'defeat') el['result-screen'].className = el['result-screen'].className.replace(/\b(victory|defeat)\b/g, '').trim();
  }

  function showBossCard(on) {
    el['boss-card'].classList.toggle('show', on);
  }

  function showHud(on) {
    el['hud'].classList.toggle('show', on);
    el['hint-bar'].classList.toggle('show', on);
    if (on) setTimeout(() => el['hint-bar'].classList.remove('show'), 9000);
  }

  function showResult(kind, stats) {
    const win = kind === 'victory';
    const img = Assets.domImg(win ? 'victory' : 'defeat');
    if (img) { el['result-bg'].src = img.src; el['result-bg'].style.display = 'block'; }
    else el['result-bg'].style.display = 'none';
    el['result-screen'].classList.add('show', kind);
    el['result-screen'].classList.remove(win ? 'defeat' : 'victory');
    el['result-big'].textContent = win ? '降魔成功' : '形神俱灭';
    el['result-sub'].textContent = win ? '朱雀台月明依旧' : '魂归幽冥 · 再入轮回';
    const sec = Math.round(stats.dur);
    el['result-stats'].textContent = `用时 ${Math.floor(sec / 60)} 分 ${sec % 60} 秒 · 受击 ${stats.hitsTaken} 次`;
  }

  function hurtFlash() {
    el['hurt-flash'].classList.remove('show');
    void el['hurt-flash'].offsetWidth; // 重启动画
    el['hurt-flash'].classList.add('show');
  }

  function flashStamina() {
    el['stam-wrap'].classList.remove('flash');
    void el['stam-wrap'].offsetWidth;
    el['stam-wrap'].classList.add('flash');
  }

  function setPhaseTint(phase) {
    el['phase-tint'].classList.toggle('p3', phase >= 3);
  }

  function setGod(on) { el['god-badge'].style.display = on ? 'block' : 'none'; }

  function reset() {
    bossGhost = 1;
    Object.keys(cache).forEach((k) => { cache[k] = -1; });
    setBossPhase(1);
    setPhaseTint(1);
    showScreen(null);
    showBossCard(false);
    showHud(true);
  }

  return {
    init, applyAssets, sync, announce, announceSmall,
    setBossPhase, showScreen, showBossCard, showHud, showResult,
    hurtFlash, flashStamina, setPhaseTint, setGod, reset,
  };
})();
