import type { CharacterId, PlayerScore } from '@shared';

/**
 * 场景之间传参的类型定义。
 *
 * 为什么单独放一个文件：`this.scene.start(key, data)` 的 data 是 any，
 * 手动标注类型能让"传参写错字段名"在编译期就报错。
 */

/** 进入战斗场景时的参数 */
export interface BattleSceneData {
  /** 本地玩家选择的角色 */
  characterId: CharacterId;
  /** 本局时长（毫秒）。不传 = 自由练习（不计时） */
  matchDurationMs?: number;
  /** 房间号；有值表示进联机对局，空/未传则是单机练习 */
  onlineRoom?: string;
}

/** 进入选人界面时的参数 */
export interface CharacterSelectSceneData {
  /** 选完之后要传给战斗场景的时长；不传 = 自由练习 */
  matchDurationMs?: number;
  /** 选完之后要进哪个房间；不传 = 单机 */
  onlineRoom?: string;
}

/** 进入结算界面时的参数 */
export interface ResultSceneData {
  /** 用的哪个角色（"再来一局"时原样传回去） */
  characterId: CharacterId;
  /** 本局时长；不传表示自由练习（此时不会有结算，保留字段以备将来用） */
  matchDurationMs?: number;
  /** 本局战果 */
  score: PlayerScore;
  /** 是否打满时间结束（false 表示中途退出/主动结算） */
  isTimeUp: boolean;
}
