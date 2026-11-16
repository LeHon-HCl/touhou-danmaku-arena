import type { BattleState, PlayerState } from '../types';
import { findPlayer } from '../world';

/** 一次伤害结算的实际结果，供 HUD 与音效使用 */
export interface DamageResult {
  /** 实际扣掉的护盾点数 */
  shieldDamage: number;
  /** 实际扣掉的生命值 */
  hpDamage: number;
  /** 本次是否打破护盾 */
  isShieldBroken: boolean;
}

/**
 * 结算一次伤害（需求 2.3.3 与附录 A.3）。
 *
 * 顺序固定：先扣护盾 → 护盾归零后溢出部分扣 HP → HP 归零则阵亡。
 * 护盾硬化（防御强化道具）生效期间「1 点护盾可吸收 2 点伤害」；
 * 溢出伤害仍按**原始伤害**扣除，不做折半。
 * 若按字面实现成「护盾扣除量减半」，护盾 5 挨 20 伤会变成扣 2.5 盾 + 17.5 HP，
 * 玩家会认为这个道具是负面效果——这是需求附录 A.3 明确记录过的坑。
 *
 * @param absorbMultiplier 每点护盾能吸收多少伤害。1 = 普通，2 = 硬化（由目标的 modifiers 传入）
 * @param attackerId 伤害来源，用于统计击杀数与造成伤害；不传表示非玩家来源
 */
export function applyDamage(
  state: BattleState,
  target: PlayerState,
  amount: number,
  absorbMultiplier = 1,
  attackerId?: number,
): DamageResult {
  const absorbable = target.shield * absorbMultiplier;

  const shieldBefore = target.shield;
  const hpBefore = target.hp;

  if (amount <= absorbable) {
    target.shield = Math.max(0, target.shield - amount / absorbMultiplier);
  } else {
    target.shield = 0;
    target.hp = Math.max(0, target.hp - (amount - absorbable));
  }

  target.lastDamagedAtMs = state.timeMs;

  const shieldDamage = shieldBefore - target.shield;
  const hpDamage = hpBefore - target.hp;

  // 统计"对别人造成的总伤害"（需求 4.7：被护盾吸收的部分也计入，否则打了半天全是盾的人数据很难看）
  if (attackerId !== undefined) {
    const attacker = findPlayer(state, attackerId);
    if (attacker) {
      attacker.score.damageDealt += shieldDamage + hpDamage;
    }
  }

  const isShieldBroken = shieldBefore > 0 && target.shield <= 0;
  if (isShieldBroken) {
    state.events.push({ type: 'shieldBreak', playerId: target.id });
  }

  if (hpBefore > 0 && target.hp <= 0) {
    target.alive = false;
    target.respawnAtMs = state.timeMs + target.stats.respawnDelay;
    target.score.deaths += 1;

    if (attackerId !== undefined && attackerId !== target.id) {
      const attacker = findPlayer(state, attackerId);
      if (attacker) {
        attacker.score.kills += 1;
      }
    }

    state.events.push({ type: 'death', playerId: target.id });
  }

  return { shieldDamage, hpDamage, isShieldBroken };
}

/**
 * 脱战回盾（需求 2.3.4）：
 * 连续 shieldRegenDelay 毫秒未受伤才开始回复；回复中再次受伤会因 lastDamagedAtMs 重置而中断。
 */
export function updateShieldRegen(
  state: BattleState,
  player: PlayerState,
  dtSeconds: number,
): void {
  if (!player.alive) {
    return;
  }

  const { maxShield, shieldRegenDelay, shieldRegenPerSecond } = player.stats;
  if (player.shield >= maxShield) {
    return;
  }
  if (state.timeMs - player.lastDamagedAtMs < shieldRegenDelay) {
    return;
  }

  player.shield = Math.min(maxShield, player.shield + shieldRegenPerSecond * dtSeconds);
}
