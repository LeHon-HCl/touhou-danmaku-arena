/**
 * 数值配置 -> config/game-config.json
 *
 * 为什么要多这一步（tech-design 7.2.1）：
 * - 源格式用 TS 模块，写错字段名当场报红；
 * - 但服务端是"数值权威"，它要读一份运行期文件，并且这份文件必须入库，
 *   这样拉下代码就能直接启动，不依赖在生产机上装构建链；
 * - 版本号取内容 hash 的前 8 位，只进日志、不用于拦截（手写 semver 一定会忘了改）。
 *
 * 用法：npm run build:config
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { battleConfig } from '../shared/src/config';

const targetPath = resolve('config/game-config.json');

// 先把配置序列化成稳定的文本，再对它算 hash
const configJson = JSON.stringify(battleConfig, null, 2);
const version = createHash('sha256').update(configJson).digest('hex').slice(0, 8);

const payload = {
  /** 内容 hash 前 8 位，服务端启动日志与对局日志都会记它 */
  version,
  config: battleConfig,
};

mkdirSync(dirname(targetPath), { recursive: true });
writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

console.log(`已生成 config/game-config.json（version=${version}）`);
