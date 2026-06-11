// 《黑神话：妲己》—— 全部可调数值集中在这里
// 锁定 Three.js r147（UMD 经典脚本时代 API：sRGBEncoding / outputEncoding）。
// 勿粘贴 r160+ 的代码片段（colorSpace 等新 API 在 r147 不存在）。
window.CONFIG = {
  ARENA_RADIUS: 22,        // 可玩区域半径，所有实体被钳制在内
  PIXEL_RATIO_MAX: 1.5,    // 防 4K 屏掉帧
  SHADOWS: true,           // 性能急救开关
  POST: true,              // 后期管线总开关（bloom/颗粒/调色；启动失败或帧率<40自动关）

  // 电影感机位（旧机位回退值：DIST 7.5 / HEIGHT 3.4 / FOV 55 / SIDE 0 / LOOK_H 1.2 / 近身 8.7+4.6）
  CAMERA: { DIST: 6.4, HEIGHT: 2.1, FOV: 50, SIDE: 0.7, LOOK_H: 1.6, CLOSE_DIST: 7.6, CLOSE_H: 3.0 },

  COLORS: {
    bg: 0x0a0d18,
    fogDensity: 0.015,
    gold: 0xd4af37,
    goldBright: 0xffd76a,
    cyan: 0x6ef0e0,
    red: 0xff4030,
    pink: 0xff7ab8,
  },

  PLAYER: {
    HP: 100, SPEED: 6.5, RADIUS: 0.6,
    STAMINA_MAX: 100, STAMINA_REGEN: 28, STAMINA_DELAY: 0.5,
    HURT_IFRAME: 0.6, HURT_STAGGER: 0.18,
    LIGHT: { DMG: [6, 6, 10], RANGE: 2.6, HALF_ARC: 70, WINDUP: 0.10, ACTIVE: 0.08, RECOVER: 0.25, CHAIN: 0.45, LUNGE: 1.3 },
    HEAVY: { DMG: 30, RANGE: 3.2, HALF_ARC: 180, WINDUP: 0.35, ACTIVE: 0.30, RECOVER: 0.40, COST: 25 },
    DODGE: { DUR: 0.42, DIST: 5.5, IFRAME: 0.30, COST: 30 },
    FLASK: { CHARGES: 9, HEAL: 45, TIME: 0.9 }, // 狐露·回血药 [F]：饮用 0.9s 不能动，被打断药不退
    CHARM: { CD: 20, RANGE: 12, FREEZE: 3.0, FREEZE_P3: 1.5, CAST: 0.35 },
    ULT:   { MAX: 100, GAIN_LIGHT: 4, GAIN_HEAVY: 9, GAIN_HURT: 6, DURATION: 8, CLONES: 3, CLONE_DMG: 4, CLONE_HIT_EVERY: 1.0 },
  },

  BOSS: {
    HP: 1000, P2_HP: 660, P3_HP: 330, RADIUS: 1.4,
    SPEED: 4.2, TURN_RATE: 200, PREFER_RANGE: 3.5,
    P3_SPEED_MULT: 1.25, P3_TELEGRAPH_MULT: 0.75,
    COOLDOWN_MIN: 0.6, COOLDOWN_MAX: 1.2,
    MELEE: {
      combo3: { dmg: 14, range: 4.2, halfArc: 60, windup: 0.7, gap: 0.45, hits: 3, trackRate: 120 },
      sweep:  { dmg: 16, range: 4.5, halfArc: 75, windup: 0.8, active: 0.30, knockback: 7 },
      thrust: { dmg: 18, dist: 10, width: 1.2, windup: 0.6, dashDur: 0.35 },
      slam:   { dmg: 22, r: 4.5, windup: 1.0, minDist: 7 },
    },
    BEAM: {
      sweep: { dmg: 10, telegraph: 1.2, rotSpeed: 80, dur: 6.8, halfWidthDeg: 3.5, len: 25, innerR: 3.0, cd: 14 },
      track: { dmg: 10, telegraph: 0.8, dur: 2.5, turnRate: 60, halfWidthDeg: 3.0, len: 25, innerR: 3.0, cd: 8 },
    },
  },

  DOG: {
    HP: 120, RADIUS: 0.8, SPEED: 7.0, DMG: 8,
    LUNGE_RANGE: 4, LUNGE_TELE: 0.5, LUNGE_DIST: 6, LUNGE_DUR: 0.3, RECOVER: 1.2,
  },

  DEBUG: true, // 演示保险：1/2 跳阶段，0 无敌
};
