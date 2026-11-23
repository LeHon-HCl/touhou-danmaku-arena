/**
 * 场景 key 的唯一来源。
 *
 * 为什么不用 `import { BattleScene }` 去跳场景：
 * 场景之间互相跳转会形成循环 import（战斗 → 结算 → 战斗），
 * 虽然 ES 模块能处理，但读起来很绕。用字符串 key 就没有这个问题，
 * 同时把 key 集中在这里，避免各处手写字符串拼错。
 */
export const SceneKeys = {
  Boot: 'boot',
  Menu: 'menu',
  CharacterSelect: 'character-select',
  Battle: 'battle',
  Pause: 'pause',
  Result: 'result',
} as const;
