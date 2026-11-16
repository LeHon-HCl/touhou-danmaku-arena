import { describe, expect, it } from 'vitest';
import { applyDamage } from './damage';
import { battleConfig } from '../config';
import { createBattleState, findPlayer, PLAYER_ID } from '../world';

/** 取一个满状态的角色作为受击目标，按需改写护盾/生命来构造边界情况 */
function createTarget() {
  const state = createBattleState(battleConfig);
  const target = findPlayer(state, PLAYER_ID);
  if (!target) {
    throw new Error('测试数据错误：找不到本地玩家');
  }
  // 关闭回盾干扰，让断言只看单次伤害结算
  target.stats = { ...target.stats, shieldRegenPerSecond: 0 };
  return { state, target };
}

describe('伤害与护盾结算（需求 2.3.3 / 附录 A.3）', () => {
  it('护盾未破时只扣护盾，生命不变', () => {
    const { state, target } = createTarget();
    target.shield = 40;
    target.hp = 100;

    const result = applyDamage(state, target, 8);

    expect(result.shieldDamage).toBe(8);
    expect(result.hpDamage).toBe(0);
    expect(target.shield).toBe(32);
    expect(target.hp).toBe(100);
  });

  it('护盾不足时先清空护盾，溢出部分扣生命', () => {
    const { state, target } = createTarget();
    target.shield = 3;
    target.hp = 100;

    const result = applyDamage(state, target, 8);

    expect(result.shieldDamage).toBe(3);
    expect(result.hpDamage).toBe(5);
    expect(target.shield).toBe(0);
    expect(target.hp).toBe(95);
    expect(result.isShieldBroken).toBe(true);
  });

  it('护盾硬化生效时 1 点护盾吸收 2 点伤害，且溢出按原始伤害扣血', () => {
    // 需求附录 A.3 记录过的坑：护盾 5 挨 20 伤，
    // 正确结果是「护盾清零 + 生命扣 10」，
    // 若按字面实现成「护盾扣除量减半」会变成扣 2.5 盾 + 17.5 血。
    const { state, target } = createTarget();
    target.shield = 5;
    target.hp = 100;

    const result = applyDamage(state, target, 20, 2);

    expect(target.shield).toBe(0);
    expect(target.hp).toBe(90);
    expect(result.hpDamage).toBe(10);
    expect(result.shieldDamage).toBe(5);
  });

  it('护盾硬化生效但伤害打不穿时只扣一半数值的护盾', () => {
    const { state, target } = createTarget();
    target.shield = 10;
    target.hp = 100;

    applyDamage(state, target, 6, 2);

    expect(target.shield).toBe(7);
    expect(target.hp).toBe(100);
  });

  it('生命归零则阵亡，并按配置设定重生时刻', () => {
    const { state, target } = createTarget();
    target.shield = 0;
    target.hp = 5;
    state.timeMs = 1000;

    applyDamage(state, target, 8);

    expect(target.hp).toBe(0);
    expect(target.alive).toBe(false);
    expect(target.respawnAtMs).toBe(1000 + target.stats.respawnDelay);
    expect(state.events.some((event) => event.type === 'death')).toBe(true);
  });

  it('统计战果：攻击者记击杀与总伤害，被击倒者记阵亡', () => {
    const state = createBattleState(battleConfig);
    const attacker = findPlayer(state, PLAYER_ID);
    const victim = state.players.find((fighter) => fighter.isDummy);
    if (!attacker || !victim) {
      throw new Error('测试数据错误：缺少攻击者或假人');
    }

    victim.shield = 10;
    victim.hp = 5;

    // 打 20 点：先破 10 点盾（记入总伤害），再扣 10 点 HP（其中 5 点致命）
    applyDamage(state, victim, 20, 1, attacker.id);

    expect(victim.score.deaths).toBe(1);
    expect(attacker.score.kills).toBe(1);
    // 伤害统计含被护盾吸收的部分：10 盾 + 5 血 = 15
    expect(attacker.score.damageDealt).toBe(15);
  });
});
