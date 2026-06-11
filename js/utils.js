// 数学工具 + 缓动 + 关键帧采样器
window.U = (() => {
  const TAU = Math.PI * 2;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  // 帧率无关的指数趋近（相机平滑、姿态混合都用它）
  const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const deg = (d) => (d * Math.PI) / 180;

  // 角度差，包裹到 [-PI, PI]
  function angleDiff(target, current) {
    let d = (target - current) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }
  // 朝目标角转动，限制单步最大转角
  function turnToward(current, target, maxStep) {
    return current + clamp(angleDiff(target, current), -maxStep, maxStep);
  }

  // XZ 平面距离 / 朝向（yaw 约定：0 = +Z，正向 = 绕 Y 逆时针，dir = (sin, 0, cos)）
  const dist2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
  const yawDir = (yaw, out) => { out.set(Math.sin(yaw), 0, Math.cos(yaw)); return out; };

  // 缓动
  const easeInQuad = (t) => t * t;
  const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
  const easeInCubic = (t) => t * t * t;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const easeOutBack = (t) => { const c = 1.70158; const u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; };

  // 关键帧轨道采样：track = [{t, v, ease?}]，按 t 升序；ease 作用于到达该关键帧的那一段
  function sampleTrack(track, t) {
    if (t <= track[0].t) return track[0].v;
    for (let i = 1; i < track.length; i++) {
      if (t <= track[i].t) {
        const a = track[i - 1], b = track[i];
        let k = (t - a.t) / (b.t - a.t);
        if (b.ease) k = b.ease(k);
        return a.v + (b.v - a.v) * k;
      }
    }
    return track[track.length - 1].v;
  }

  return {
    TAU, clamp, lerp, damp, rand, randInt, deg,
    angleDiff, turnToward, dist2D, yawTo, yawDir,
    easeInQuad, easeOutQuad, easeInCubic, easeOutCubic, easeInOut, easeOutBack,
    sampleTrack,
  };
})();
