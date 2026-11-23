import type { Character } from './character';
import { marisa } from './marisa';
import { reimu } from './reimu';

/**
 * 角色注册表 —— **加角色的唯一入口**。
 *
 * 加一个新角色只需两步：
 * 1. 照 `reimu.ts` 的样子新建 `content/characters/<id>.ts`；
 * 2. 在下面的 `CHARACTERS` 里加一行（id 必须与 new Character({ id }) 一致）。
 *
 * 其余都自动生效：
 * - `CharacterId` 联合类型由本表的键推导，所以 `Record<CharacterId, …>` 会强制你补全配置；
 * - 选人界面、占位贴图、素材清单、服务端校验都遍历本表，不需要再改。
 *
 * 详细步骤见 `docs/extending-content.md`。
 */
export const CHARACTERS = {
  reimu,
  marisa,
} as const;

/** 合法角色 id。新增角色后自动扩展，不需要手写联合类型 */
export type CharacterId = keyof typeof CHARACTERS;

/** 可选角色总数（编译期常量，便于数组声明） */
export const CHARACTER_COUNT = Object.keys(CHARACTERS).length;

/** 全部角色，顺序即选人界面的显示顺序 */
export const CHARACTER_LIST: readonly Character[] = Object.values(CHARACTERS);

/** 出现在选人界面的角色（过滤掉 selectable: false 的） */
export const SELECTABLE_CHARACTERS: readonly Character[] = CHARACTER_LIST.filter(
  (character) => character.selectable,
);

/** 默认角色：不指定 / id 非法时的兜底 */
export const DEFAULT_CHARACTER_ID: CharacterId = 'reimu';

/** 判断一个任意值是不是已知角色 id（服务端用它校验客户端上报的 characterId） */
export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CHARACTERS, value);
}

/**
 * 取角色定义。
 *
 * 未知 id 一律回退到默认角色而不是抛错：客户端可能比服务端旧，
 * 让对局能继续打，比因为一个 id 对不上就整局崩掉要好。
 */
export function getCharacter(id: string): Character {
  return isCharacterId(id) ? CHARACTERS[id] : CHARACTERS[DEFAULT_CHARACTER_ID];
}

/**
 * 把任意值收敛成一个合法角色 id。
 * 用于"客户端上报的 id 可能不认识"的场景（未知一律回退默认角色）。
 */
export function resolveCharacterId(value: unknown): CharacterId {
  return isCharacterId(value) ? value : DEFAULT_CHARACTER_ID;
}

export type { Character, CharacterInit, CharacterPlaceholder } from './character';
