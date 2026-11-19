import { describe, expect, it } from 'vitest';
import { candidateFiles } from './loader';

const EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];

describe('素材候选路径', () => {
  it('清单里写的路径排在最前，写对了就只发一次请求', () => {
    expect(candidateFiles('images/char_reimu.png', EXTENSIONS)[0]).toBe('images/char_reimu.png');
  });

  it('同名其它格式兜底，目录结构保持不变', () => {
    const candidates = candidateFiles('images/char_reimu.png', EXTENSIONS);
    expect(candidates).toContain('images/char_reimu.jpg');
    expect(candidates).toContain('images/char_reimu.jpeg');
    expect(candidates).toContain('images/char_reimu.webp');
  });

  it('大写后缀也能匹配，且候选不重复', () => {
    const candidates = candidateFiles('images/tile_floor.PNG', EXTENSIONS);
    expect(candidates).toContain('images/tile_floor.png');
    expect(candidates).toContain('images/tile_floor.PNG');
    expect(new Set(candidates).size).toBe(candidates.length);
  });

  it('目录名里的点不会被当成扩展名', () => {
    const candidates = candidateFiles('images/v1.2/bullet', EXTENSIONS);
    expect(candidates[0]).toBe('images/v1.2/bullet');
    expect(candidates).toContain('images/v1.2/bullet.png');
  });
});
