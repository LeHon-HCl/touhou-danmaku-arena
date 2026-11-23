import { describe, expect, it } from 'vitest';
import { characters } from '../../config/characters';
import {
  CHARACTERS,
  CHARACTER_LIST,
  DEFAULT_CHARACTER_ID,
  getCharacter,
  isCharacterId,
  resolveCharacterId,
} from './index';

describe('角色注册表', () => {
  it('未知 id 回退到默认角色', () => {
    expect(getCharacter('no-such-character').id).toBe(DEFAULT_CHARACTER_ID);
    expect(resolveCharacterId(undefined)).toBe(DEFAULT_CHARACTER_ID);
  });

  it('只接受注册表里存在的 id', () => {
    expect(isCharacterId('reimu')).toBe(true);
    expect(isCharacterId('dummy')).toBe(false);
    expect(isCharacterId(123)).toBe(false);
  });

  it('列表顺序与注册表一致，且每个角色都有贴图 key', () => {
    expect(CHARACTER_LIST.map((character) => character.id)).toEqual(Object.keys(CHARACTERS));
    for (const character of CHARACTER_LIST) {
      expect(character.textureKey).not.toBe('');
      expect(character.assetFile.startsWith('images/')).toBe(true);
    }
  });

  it('数值表由角色定义派生，不额外维护一份', () => {
    for (const character of CHARACTER_LIST) {
      const config = characters[character.id as keyof typeof characters];
      expect(config.displayName).toBe(character.displayName);
      expect(config.maxHp).toBe(character.stats.maxHp);
      expect(config.fireInterval).toBe(character.stats.fireInterval);
    }
  });
});
