// 九尾分身：大招召唤的 3 个狐影，环绕 Boss 轮流扑咬。
// 幽灵材质（青色叠加半透明），不受伤、不被锁定，纯输出+视觉热闹。
class FoxClone {
  constructor(scene, index) {
    this.ghostMat = new THREE.MeshBasicMaterial({
      color: CONFIG.COLORS.cyan, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    // 幽灵狐女（spawn() 会覆写 root.scale=0.8×easeOutBack，builder 必须传 1 防双重缩放）
    this.fox = buildDaji({ scale: 1, tails: 3, segs: 5, ghostMat: this.ghostMat });
    this.root = this.fox.root;
    scene.add(this.root);
    this.pos = this.root.position;
    this.index = index;
    this.anim = { phase: Math.random() * 6, speedRatio: 1, tailAmp: 1.6, yawVel: 0, lean: 0 };
    this.alive = false;
    this.root.visible = false;
    this._tmp = new THREE.Vector3();
    this._dir = new THREE.Vector3();
  }

  spawn(playerPos, until) {
    this.alive = true;
    this.until = until;
    this.state = 'orbit';
    this.st = 0;
    this.orbitAngle = (this.index / CONFIG.PLAYER.ULT.CLONES) * Math.PI * 2;
    this.nextDart = Game.time + 0.6 + this.index * 0.4;
    this.pos.set(
      playerPos.x + Math.sin(this.orbitAngle) * 1.5,
      0,
      playerPos.z + Math.cos(this.orbitAngle) * 1.5
    );
    this.root.visible = true;
    this.root.scale.setScalar(0.01);
    this.ghostMat.opacity = 0.5;
    this._tmp.copy(this.pos).setY(0.8);
    VFX.burst({ pos: this._tmp, count: 10, speed: [1, 3], spread: 1, up: 1, life: [0.3, 0.6], size: 0.35, sizeEnd: 0.05, color: 0x8899aa, colorEnd: CONFIG.COLORS.cyan });
  }

  despawn() {
    if (!this.alive) return;
    this.alive = false;
    this.root.visible = false;
    this._tmp.copy(this.pos).setY(0.8);
    VFX.burst({ pos: this._tmp, count: 8, speed: [0.5, 2], spread: 1, up: 1.2, life: [0.3, 0.6], size: 0.3, sizeEnd: 0.04, color: CONFIG.COLORS.cyan, colorEnd: 0x223366 });
  }

  update(dt) {
    if (!this.alive) return;
    this.st += dt;

    // 出生缩放 + 到期淡出
    const grow = Math.min(this.st / 0.25, 1);
    this.root.scale.setScalar(0.8 * U.easeOutBack(grow));
    const remain = this.until - Game.time;
    if (remain <= 0) { this.despawn(); return; }
    if (remain < 0.5) this.ghostMat.opacity = remain;

    const boss = Game.boss;
    const target = boss && boss.alive ? boss : null;
    if (!target) {
      // Boss 没了就绕玩家撒欢
      this.orbitAngle += dt * 1.5;
      this._tmp.set(
        Game.player.pos.x + Math.sin(this.orbitAngle) * 3,
        0, Game.player.pos.z + Math.cos(this.orbitAngle) * 3
      );
      this.moveToward(this._tmp, dt, 8);
      dajiAnimate(this.fox, this.anim, dt, Game.time + this.index * 2);
      return;
    }

    switch (this.state) {
      case 'orbit': {
        this.orbitAngle += dt * 1.4;
        const r = target.radius + 2.2;
        this._tmp.set(
          target.pos.x + Math.sin(this.orbitAngle) * r,
          0, target.pos.z + Math.cos(this.orbitAngle) * r
        );
        this.moveToward(this._tmp, dt, 9);
        this.yawFace(target.pos, dt);
        if (Game.time >= this.nextDart) {
          this.state = 'dart';
          this.dartT = 0;
          this.dartFrom = this.pos.clone();
        }
        break;
      }
      case 'dart': {
        this.dartT += dt;
        const k = Math.min(this.dartT / 0.22, 1);
        this._dir.copy(target.pos).sub(this.dartFrom).normalize();
        this._tmp.copy(target.pos).addScaledVector(this._dir, -target.radius * 0.6);
        this.pos.lerpVectors(this.dartFrom, this._tmp, U.easeInCubic(k));
        this.yawFace(target.pos, dt);
        if (k >= 1) {
          this._tmp.copy(target.pos).setY(1.2);
          Game.applyDamageToBoss(CONFIG.PLAYER.ULT.CLONE_DMG, this._tmp, { clone: true });
          VFX.slash(this._tmp, U.yawTo(this.pos, target.pos), CONFIG.COLORS.cyan, 1.6);
          this.state = 'orbit';
          this.nextDart = Game.time + CONFIG.PLAYER.ULT.CLONE_HIT_EVERY * U.rand(0.85, 1.25);
        }
        break;
      }
    }

    this.anim.speedRatio = 1;
    dajiAnimate(this.fox, this.anim, dt, Game.time + this.index * 2);
  }

  moveToward(target, dt, rate) {
    this.pos.x = U.damp(this.pos.x, target.x, rate, dt);
    this.pos.z = U.damp(this.pos.z, target.z, rate, dt);
  }

  yawFace(target, dt) {
    this.root.rotation.y = U.turnToward(this.root.rotation.y, U.yawTo(this.pos, target), 12 * dt);
  }
}
