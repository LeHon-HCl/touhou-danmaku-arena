import { describe, expect, it } from 'vitest';
import { AI_SKILLS, AiController } from './ai-controller';
import { battleConfig } from '../config';
import type { BattleConfig } from '../config/types';
import { createBattleState } from '../world';
import type { BattleState, PlayerInput, PlayerState } from '../types';

/** 造一局「1 真人 + 1 AI」，返回两方引用 */
function setup(options: { aiCount?: number } = {}): {
  state: BattleState;
  config: BattleConfig;
  human: PlayerState;
  ai: PlayerState;
} {
  const config = battleConfig;
  const state = createBattleState(config, {
    characterId: 'reimu',
    dummyCount: 0,
    seedPickups: 0,
    aiCount: options.aiCount ?? 1,
  });
  const human = state.players.find((player) => !player.isAi && !player.isDummy)!;
  const ai = state.players.find((player) => player.isAi)!;
  return { state, config, human, ai };
}

/** 把 AI 与真人放到固定的相对位置，方便验证「会靠近 / 会开火」 */
function placeNear(human: PlayerState, ai: PlayerState): void {
  human.x = 400;
  human.y = 300;
  human.vx = 0;
  human.vy = 0;
  ai.x = 700;
  ai.y = 300;
  human.alive = true;
  ai.alive = true;
}

/** 造一个只有左右边界墙的空世界，排除地图自带掩体对视线/走位的干扰 */
function clearMiddleWalls(state: BattleState): void {
  state.walls = state.walls.filter(
    (wall) =>
      !(
        wall.x > 0 &&
        wall.x + wall.width < state.mapWidth &&
        wall.y > 0 &&
        wall.y + wall.height < state.mapHeight
      ),
  );
}

describe('AI 控制器', () => {
  it('没有真人目标时保持静止（不返回输入）', () => {
    const { state, ai } = setup();
    const controller = new AiController(AI_SKILLS.normal);
    // 把「不存在的 id」当真人：AI 找不到目标，不应产生输入
    const out = new Map<number, PlayerInput>();
    controller.fillInputs(state, new Set([999]), out);
    expect(out.has(ai.id)).toBe(false);
  });

  it('会朝真人方向瞄准并开火（有视线）', () => {
    const { state, human, ai } = setup();
    placeNear(human, ai);
    clearMiddleWalls(state);

    const controller = new AiController(AI_SKILLS.hard);
    const out = new Map<number, PlayerInput>();
    controller.fillInputs(state, new Set([human.id]), out);

    const input = out.get(ai.id);
    expect(input).toBeDefined();
    // 真人在 AI 左侧 → 瞄准点应在 AI 左边
    expect(input!.aimX).toBeLessThan(ai.x);
    expect(input!.isFiring).toBe(true);
  });

  it('离得太远时朝目标移动', () => {
    const { state, human, ai } = setup();
    placeNear(human, ai);
    clearMiddleWalls(state);
    human.x = 200;
    ai.x = 1100;

    const controller = new AiController(AI_SKILLS.hard);
    const out = new Map<number, PlayerInput>();
    controller.fillInputs(state, new Set([human.id]), out);
    const input = out.get(ai.id)!;

    // 目标在左侧：移动方向与目标方向的点积应为正（靠近）
    const dot = input.moveX * (human.x - ai.x) + input.moveY * (human.y - ai.y);
    expect(dot).toBeGreaterThan(0);
  });

  it('离得太近时后退（远离目标）', () => {
    const { state, human, ai } = setup();
    placeNear(human, ai);
    clearMiddleWalls(state);
    human.x = 690;
    ai.x = 700; // 只差 10px，远小于 preferredRange

    const controller = new AiController(AI_SKILLS.hard);
    const out = new Map<number, PlayerInput>();
    controller.fillInputs(state, new Set([human.id]), out);
    const input = out.get(ai.id)!;

    // 后退意味着移动方向与目标方向的点积为负
    const dot = input.moveX * (human.x - ai.x) + input.moveY * (human.y - ai.y);
    expect(dot).toBeLessThan(0);
  });

  it('距离合适时保持横向游走（始终在动，不站桩）', () => {
    const { state, human, ai } = setup();
    placeNear(human, ai);
    clearMiddleWalls(state);
    human.x = 400;
    ai.x = 700; // 300px ≈ normal 的理想距离

    const controller = new AiController(AI_SKILLS.normal);
    const out = new Map<number, PlayerInput>();
    controller.fillInputs(state, new Set([human.id]), out);
    const input = out.get(ai.id)!;

    const magnitude = Math.hypot(input.moveX, input.moveY);
    expect(magnitude).toBeGreaterThan(0.5);
    // 前后分量为 0 时，横向分量应明显（垂直于连线方向）
    expect(Math.abs(input.moveY)).toBeGreaterThan(0);
  });

  it('隔墙时不开火（requireLineOfSight）', () => {
    const { state, human, ai } = setup();
    placeNear(human, ai);
    clearMiddleWalls(state);
    // 在两者之间横插一堵厚墙
    state.walls.push({ x: 520, y: 0, width: 60, height: state.mapHeight });

    const controller = new AiController(AI_SKILLS.normal);
    const out = new Map<number, PlayerInput>();
    controller.fillInputs(state, new Set([human.id]), out);
    expect(out.get(ai.id)!.isFiring).toBe(false);
  });

  it('看不见目标时朝目标靠拢，而不是原地转圈', () => {
    const { state, human, ai } = setup();
    placeNear(human, ai);
    clearMiddleWalls(state);
    state.walls.push({ x: 520, y: 0, width: 60, height: state.mapHeight });

    const controller = new AiController(AI_SKILLS.normal);
    const out = new Map<number, PlayerInput>();
    controller.fillInputs(state, new Set([human.id]), out);
    const input = out.get(ai.id)!;

    // 目标在左侧 → 应向左侧接近
    expect(input.moveX).toBeLessThan(0);
  });

  it('贴近地图边缘时朝场内移动（不会来回抖）', () => {
    const { state, human, ai } = setup();
    placeNear(human, ai);
    clearMiddleWalls(state);
    ai.y = state.mapHeight - 20; // 紧贴下边界
    human.y = 300;

    const controller = new AiController(AI_SKILLS.normal);
    const out = new Map<number, PlayerInput>();
    controller.fillInputs(state, new Set([human.id]), out);
    const input = out.get(ai.id)!;

    // 下边界在下方 → moveY 应为负（向上离开边界）
    expect(input.moveY).toBeLessThan(0);
  });

  it('AI 只把真人当目标，不理会更近的假人', () => {
    const state = createBattleState(battleConfig, {
      characterId: 'reimu',
      dummyCount: 2,
      seedPickups: 0,
      aiCount: 1,
    });
    clearMiddleWalls(state);
    const ai = state.players.find((player) => player.isAi)!;
    const human = state.players.find((player) => player.id === 1)!;
    const dummy = state.players.find((player) => player.isDummy)!;

    // 假人紧贴 AI，真人放远：若 AI 会打假人，瞄准点就会停在近处
    ai.x = 400;
    ai.y = 300;
    dummy.x = 460;
    dummy.y = 300;
    dummy.alive = true;
    human.x = 1000;
    human.y = 300;
    human.alive = true;

    const controller = new AiController(AI_SKILLS.hard);
    const out = new Map<number, PlayerInput>();
    controller.fillInputs(state, new Set([human.id]), out);
    const input = out.get(ai.id)!;

    // 瞄准点应在 AI 右侧很远处（朝真人），而不是 60px 外的假人
    expect(input.aimX - ai.x).toBeGreaterThan(100);
  });

  it('reset() 后重新从零开始（重开一局不会沿用旧记忆）', () => {
    const { state, human, ai } = setup();
    placeNear(human, ai);
    clearMiddleWalls(state);

    const controller = new AiController(AI_SKILLS.normal);
    const out = new Map<number, PlayerInput>();
    controller.fillInputs(state, new Set([human.id]), out);
    controller.reset();
    out.clear();
    controller.fillInputs(state, new Set([human.id]), out);
    expect(out.has(ai.id)).toBe(true);
  });
});

describe('AI 接入战斗逻辑', () => {
  it('AI 使用真角色数值，并与本地玩家区分角色', () => {
    const state = createBattleState(battleConfig, {
      characterId: 'reimu',
      dummyCount: 0,
      seedPickups: 0,
      aiCount: 2,
    });
    const ais = state.players.filter((player) => player.isAi);
    expect(ais).toHaveLength(2);
    for (const ai of ais) {
      expect(ai.isDummy).toBe(false);
      expect(ai.hp).toBe(ai.stats.maxHp);
      // AI 默认用另一个角色，便于玩家一眼区分
      expect(ai.characterId).not.toBe('reimu');
      expect(ai.id).not.toBe(1);
    }
  });
});
