import { describe, expect, it } from 'vitest';
import { applyItemToPlayer, collectPickups, spawnPickup, updateEffectTimers } from './items';
import { battleConfig } from '../config';
import { ITEMS } from '../config/items';
import { createBattleState, findPlayer, PLAYER_ID } from '../world';

function setup() {
  const state = createBattleState(battleConfig, { seedPickups: 0 });
  const player = findPlayer(state, PLAYER_ID);
  if (!player) {
    throw new Error('测试数据错误：找不到本地玩家');
  }
  return { state, player };
}

describe('道具效果（需求 6.3 / 6.4）', () => {
  it('治疗包回血但不会超过上限', () => {
    const { player } = setup();
    player.hp = player.stats.maxHp - 10;

    applyItemToPlayer(player, 'heal');

    expect(player.hp).toBe(player.stats.maxHp);

    // 已经满血时再吃一个，不应溢出
    applyItemToPlayer(player, 'heal');
    expect(player.hp).toBe(player.stats.maxHp);
  });

  it('同类增益不叠加，只刷新剩余时间', () => {
    const { player } = setup();
    const attack = ITEMS.attackBoost;

    applyItemToPlayer(player, 'attackBoost');
    const firstDuration = player.activeEffects[0].remainingMs;

    // 消耗掉 3 秒
    updateEffectTimers(player, 3000);
    expect(player.activeEffects[0].remainingMs).toBeLessThan(firstDuration);

    // 再吃一次：数量仍是 1 条，时间回到满值
    applyItemToPlayer(player, 'attackBoost');
    expect(player.activeEffects).toHaveLength(1);
    expect(player.activeEffects[0].remainingMs).toBe(attack.duration);
    expect(player.modifiers.damageMultiplier).toBeCloseTo(1.35);
  });

  it('增益到期后倍率恢复为 1', () => {
    const { player } = setup();
    applyItemToPlayer(player, 'speedBoost');
    expect(player.modifiers.moveSpeedMultiplier).toBeCloseTo(1.25);

    updateEffectTimers(player, ITEMS.speedBoost.duration + 100);

    expect(player.activeEffects).toHaveLength(0);
    expect(player.modifiers.moveSpeedMultiplier).toBe(1);
  });

  it('防御强化让护盾吸收倍率变成 2', () => {
    const { player } = setup();
    applyItemToPlayer(player, 'armorHarden');
    expect(player.modifiers.shieldAbsorbMultiplier).toBe(2);
  });

  it('走到道具上自动拾取，并记入统计', () => {
    const { state, player } = setup();
    // 把道具放在玩家脚下
    spawnPickup(state, battleConfig, player.x, player.y, 'heal');
    player.hp = 50;

    collectPickups(state, battleConfig);

    expect(state.pickups).toHaveLength(0);
    expect(player.score.itemsPicked).toBe(1);
    expect(player.hp).toBe(80);
    expect(state.events.some((event) => event.type === 'pickup')).toBe(true);
  });

  it('距离太远不会拾取', () => {
    const { state, player } = setup();
    spawnPickup(state, battleConfig, player.x + 300, player.y, 'heal');

    collectPickups(state, battleConfig);

    expect(state.pickups).toHaveLength(1);
    expect(player.score.itemsPicked).toBe(0);
  });
});
