import { describe, expect, it } from 'vitest';
import { step } from './step';
import { battleConfig } from './config';
import { createBattleState, findPlayer, PLAYER_ID } from './world';
import type { BattleState, PlayerInput, PlayerState } from './types';

/** 把玩家与指定假人摆到开阔地（y=560 一带没有墙体），其余假人挪到角落避免挡枪 */
function setupOpenField(): { state: BattleState; player: PlayerState; dummy: PlayerState } {
  const state = createBattleState(battleConfig);
  const player = findPlayer(state, PLAYER_ID);
  const dummy = state.players.find((fighter) => fighter.isDummy);
  if (!player || !dummy) {
    throw new Error('测试数据错误：缺少玩家或假人');
  }

  for (const fighter of state.players) {
    if (fighter.isDummy && fighter !== dummy) {
      fighter.x = 60;
      fighter.y = 60;
    }
  }

  player.x = 360;
  player.y = 560;
  dummy.x = 520;
  dummy.y = 560;
  dummy.shield = 30;
  dummy.hp = 100;

  return { state, player, dummy };
}

function firingInput(aimX: number, aimY: number): Map<number, PlayerInput> {
  return new Map([[PLAYER_ID, { moveX: 0, moveY: 0, aimX, aimY, isFiring: true }]]);
}

describe('固定步长推进 step()', () => {
  it('按住开火会生成子弹，并在飞行后命中假人', () => {
    const { state, dummy } = setupOpenField();
    const inputs = firingInput(dummy.x, dummy.y);

    step(state, inputs, battleConfig);
    expect(state.bullets).toHaveLength(1);

    for (let frame = 0; frame < 10; frame += 1) {
      step(state, inputs, battleConfig);
    }

    expect(dummy.shield).toBeLessThan(30);
  });

  it('墙体阻挡子弹：隔着掩体打不到对方', () => {
    const { state, player, dummy } = setupOpenField();
    // 中央掩体占 x 576–704、y 320–448
    player.x = 560;
    player.y = 384;
    dummy.x = 720;
    dummy.y = 384;

    const inputs = firingInput(dummy.x, dummy.y);
    for (let frame = 0; frame < 30; frame += 1) {
      step(state, inputs, battleConfig);
    }

    expect(dummy.shield).toBe(30);
    expect(dummy.hp).toBe(100);
  });

  it('移动不会穿墙：贴住掩体后位置被分离出来', () => {
    const { state, player } = setupOpenField();
    player.x = 552;
    player.y = 384;

    const inputs = new Map<number, PlayerInput>([
      [PLAYER_ID, { moveX: 1, moveY: 0, aimX: 640, aimY: 384, isFiring: false }],
    ]);
    for (let frame = 0; frame < 30; frame += 1) {
      step(state, inputs, battleConfig);
    }

    // 中央掩体左边界 576，角色半径 12 → 最多到 564
    expect(player.x).toBeLessThanOrEqual(576 - player.stats.bodyRadius + 0.001);
  });

  it('同样的输入序列跑两遍得到同样的世界状态（为服务端复用兜底）', () => {
    const run = (): string => {
      const { state, dummy } = setupOpenField();
      const inputs = firingInput(dummy.x, dummy.y);
      for (let frame = 0; frame < 60; frame += 1) {
        step(state, inputs, battleConfig);
      }
      return JSON.stringify({
        tick: state.tick,
        players: state.players.map((fighter) => ({
          id: fighter.id,
          x: fighter.x,
          y: fighter.y,
          hp: fighter.hp,
          shield: fighter.shield,
        })),
        bullets: state.bullets.length,
      });
    };

    expect(run()).toBe(run());
  });
});
