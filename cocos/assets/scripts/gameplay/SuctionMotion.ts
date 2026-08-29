/**
 * 贝塞尔切向螺旋下潜吸附动力学算法 (SuctionMotion.ts)
 * 严格保持原型中经过验证的四维吸附动力学特征：飞入、旋转、加速、下潜缩小
 */
import { Vec3, math } from 'cc';

export interface ISuctionMotionResult {
  readonly newPosition: Vec3;
  readonly newScale: Vec3;
  readonly newRotationY: number;
  readonly isAbsorbed: boolean;
}

export class SuctionMotionCalculator {
  /**
   * 计算受黑洞吸引过程中的每帧位移、切向旋转与下潜收缩
   * @param currentPos 当前物体坐标
   * @param targetHolePos 黑洞核心坐标
   * @param suctionRadius 黑洞有效吸附半径
   * @param dt 帧间隔
   * @param suckTimer 已处于深渊吞噬态的时间
   * @param suckDuration 总下潜吞噬所需时间 (通常 0.4s)
   * @param isMagnetStorm 是否处于磁暴超强状态
   */
  public static computeMotion(
    currentPos: Vec3,
    targetHolePos: Vec3,
    suctionRadius: number,
    dt: number,
    suckTimer: number,
    suckDuration: number = 0.4,
    isMagnetStorm: boolean = false
  ): ISuctionMotionResult {
    const dx = targetHolePos.x - currentPos.x;
    const dz = targetHolePos.z - currentPos.z;
    const distSq = dx * dx + dz * dz;
    const dist = Math.sqrt(distSq);

    const outPos = currentPos.clone();
    let outScale = Vec3.ONE.clone();
    let outRotY = 0;
    let isAbsorbed = false;

    if (dist < 0.6 || suckTimer > 0) {
      // 处于深渊核心吞噬态 (SUCKING)：体积缩小、加速旋转并向下潜入
      const updatedTimer = suckTimer + dt;
      const progress = Math.min(1.0, updatedTimer / suckDuration);

      outPos.x = math.lerp(currentPos.x, targetHolePos.x, progress * 0.4);
      outPos.z = math.lerp(currentPos.z, targetHolePos.z, progress * 0.4);
      outPos.y = math.lerp(0.35, -0.8, progress);

      const scaleVal = Math.max(0.01, 1.0 - progress);
      outScale.set(scaleVal, scaleVal, scaleVal);
      outRotY = progress * Math.PI * 4;

      if (progress >= 1.0) {
        isAbsorbed = true;
      }
    } else {
      // 处于受引力吸引飞行态 (ATTRACTED)：沿引力矢量加速并带切向螺旋力
      const pullSpeed = isMagnetStorm ? 18.0 : (9.0 + (1.0 - Math.min(1.0, dist / suctionRadius)) * 12.0);
      const dirX = dist > 0.001 ? dx / dist : 0;
      const dirZ = dist > 0.001 ? dz / dist : 0;

      // 切向垂直分量
      const tangentX = -dirZ * 0.35;
      const tangentZ = dirX * 0.35;

      outPos.x += (dirX + tangentX) * pullSpeed * dt;
      outPos.z += (dirZ + tangentZ) * pullSpeed * dt;
      outPos.y = math.lerp(currentPos.y, 0.35, dt * 5.0);

      outRotY = Math.atan2(-dirX, -dirZ);
    }

    return {
      newPosition: outPos,
      newScale: outScale,
      newRotationY: outRotY,
      isAbsorbed
    };
  }
}
