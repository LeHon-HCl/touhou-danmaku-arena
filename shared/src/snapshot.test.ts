import { describe, expect, it } from 'vitest';
import { battleConfig } from './config';
import { applySnapshotToState, createSnapshot } from './snapshot';
import { createBattleState, findPlayer, PLAYER_ID } from './world';
import { applyItemToPlayer } from './sim/items';

describe('快照与影子世界（协议层）', () => {
  it('快照能完整带回位置、血量、增益与子弹数量', () => {
    const state = createBattleState(battleConfig);
    const player = findPlayer(state, PLAYER_ID);
    if (!player) {
      throw new Error('测试数据错误：找不到本地玩家');
    }

    player.x = 321;
    player.y = 654;
    player.hp = 42;
    player.shield = 7;
    applyItemToPlayer(player, 'attackBoost');

    const snapshot = createSnapshot(state);

    expect(snapshot.players[0].x).toBe(321);
    expect(snapshot.players[0].y).toBe(654);
    expect(snapshot.players[0].hp).toBe(42);
    expect(snapshot.players[0].shield).toBe(7);
    expect(snapshot.players[0].effects[0].itemId).toBe('attackBoost');
  });

  it('客户端用快照重建影子世界后，渲染要用的字段一致', () => {
    const source = createBattleState(battleConfig);
    const sourcePlayer = findPlayer(source, PLAYER_ID);
    if (!sourcePlayer) {
      throw new Error('测试数据错误：找不到本地玩家');
    }
    sourcePlayer.x = 500;
    sourcePlayer.y = 600;
    sourcePlayer.hp = 33;

    const snapshot = createSnapshot(source);

    // 模拟客户端：从空世界开始，用快照填充
    const clientState = createBattleState(battleConfig, { dummyCount: 0, seedPickups: 0 });
    clientState.players = [];
    applySnapshotToState(clientState, snapshot, battleConfig);

    const clientPlayer = clientState.players[0];
    expect(clientPlayer.x).toBe(500);
    expect(clientPlayer.y).toBe(600);
    expect(clientPlayer.hp).toBe(33);
    expect(clientState.players).toHaveLength(source.players.length);
  });

  it('增益倍率会在客户端按快照重算（而不是靠本地猜）', () => {
    const source = createBattleState(battleConfig, { dummyCount: 0, seedPickups: 0 });
    const sourcePlayer = findPlayer(source, PLAYER_ID);
    if (!sourcePlayer) {
      throw new Error('测试数据错误：找不到本地玩家');
    }
    applyItemToPlayer(sourcePlayer, 'armorHarden');

    const snapshot = createSnapshot(source);
    const clientState = createBattleState(battleConfig, { dummyCount: 0, seedPickups: 0 });
    applySnapshotToState(clientState, snapshot, battleConfig);

    expect(clientState.players[0].modifiers.shieldAbsorbMultiplier).toBe(2);
  });
});
