/**
 * shared/ 依赖边界检查（开发约定 5.1 的"硬纪律"）。
 *
 * 规则：shared/ 里的任何文件，都不允许 import 以下东西：
 *   - phaser         —— 渲染框架，服务端跑不了
 *   - ws             —— Node 的 WebSocket 库
 *   - node:* / 常见内置模块 —— Node 专属
 *   - ../client/ 或 ../server/ —— 不能反向依赖上层
 *
 * 为什么用脚本而不是 ESLint：
 * 当前仓库的 TypeScript 是 7.x（原生实现），typescript-eslint 对它的解析支持尚不确定。
 * 这条规则本身用正则就足够可靠，用脚本能做到零依赖、跑得稳定。
 * 等 TypeScript / ESLint 生态对齐后，可以把这段规则平移到 eslint.config.js 里。
 *
 * 用法：npm run lint:boundary（失败时进程退出码为 1）
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const SHARED_ROOT = path.resolve('shared/src');

/** 被禁止的模块名（精确匹配） */
const FORBIDDEN_MODULES = new Set(['phaser', 'ws', 'fs', 'path', 'http', 'https', 'crypto', 'os']);

/** 被禁止的前缀 */
const FORBIDDEN_PREFIXES = ['node:', '../client/', '../../client/', '../server/', '../../server/', 'client/', 'server/'];

/** 递归收集 .ts 文件（跳过测试文件里的 node 用法？测试同样要守规矩，所以不跳过） */
async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
      continue;
    }
    if (entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

/** 抽出文件里所有 `from 'xxx'` 与 `import 'xxx'` 的模块名 */
function extractModuleSpecifiers(source) {
  const specifiers = [];
  const importFromPattern = /(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/g;
  const sideEffectPattern = /import\s+['"]([^'"]+)['"]/g;

  for (const pattern of [importFromPattern, sideEffectPattern]) {
    let match = pattern.exec(source);
    while (match) {
      specifiers.push({ specifier: match[1], index: match.index });
      match = pattern.exec(source);
    }
  }

  return specifiers;
}

/** 把字符下标换算成行号，方便定位 */
function toLineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

function findViolation(specifier) {
  if (FORBIDDEN_MODULES.has(specifier)) {
    return `禁止依赖 "${specifier}"`;
  }
  if (FORBIDDEN_PREFIXES.some((prefix) => specifier.startsWith(prefix))) {
    return `禁止反向依赖 "${specifier}"（shared/ 必须能被客户端与服务端同时执行）`;
  }
  return null;
}

const files = await collectFiles(SHARED_ROOT);
const violations = [];

for (const file of files) {
  const source = await readFile(file, 'utf8');
  for (const { specifier, index } of extractModuleSpecifiers(source)) {
    const reason = findViolation(specifier);
    if (reason) {
      violations.push(`${path.relative(process.cwd(), file)}:${toLineNumber(source, index)} ${reason}`);
    }
  }
}

if (violations.length > 0) {
  console.error('shared/ 依赖边界检查未通过：');
  for (const violation of violations) {
    console.error('  ' + violation);
  }
  process.exit(1);
}

console.log(`shared/ 依赖边界检查通过（检查了 ${files.length} 个文件）`);
