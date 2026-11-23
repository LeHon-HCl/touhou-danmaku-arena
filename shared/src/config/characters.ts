import { CHARACTERS, resolveCharacterId } from '../content/characters';
import type { CharacterId } from '../types';
import type { CharacterConfig } from './types';

/**
 * 角色数值表（`BattleConfig.characters` 的形状）。
 *
 * 这里**不再是数值的真源**：真源是 `content/characters/` 里的 Character 实例。
 * 本文件只做一次形状转换，好让：
 * - `config/game-config.json`（服务端读取的运行期数值文件）保持原有结构；
 * - 服务端不需要认识 Character 类，只认 `Record<CharacterId, CharacterConfig>`。
 *
 * 加角色不需要改这个文件：注册表里加了，这里自动跟着变。
 */
export const characters = Object.fromEntries(
  (Object.keys(CHARACTERS) as CharacterId[]).map((id) => {
    const character = CHARACTERS[resolveCharacterId(id)];
    return [
      id,
      {
        id,
        displayName: character.displayName,
        ...character.stats,
      } satisfies CharacterConfig,
    ];
  }),
) as Record<CharacterId, CharacterConfig>;
