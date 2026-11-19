# 扩展内容：加角色 / 加地图

本项目的可玩内容是**注册表驱动**的：角色和地图各自是一个类，加新内容不需要改战斗逻辑、渲染代码或数据协议。

```
shared/src/content/
├── characters/
│   ├── character.ts     Character 类（数值 + 贴图 + 占位配色，成套存在）
│   ├── reimu.ts         灵梦
│   ├── marisa.ts        魔理沙
│   └── index.ts         ★ 角色注册表（加角色就在这里加一行）
└── maps/
    ├── map.ts           GameMap 类（尺寸 + 墙体 + 出生点 + 瓦片贴图）
    ├── shrine.ts        博丽神社
    └── index.ts         ★ 地图注册表（加地图就在这里加一行）
```

---

## 1. 加一个角色

### 1.1 三步

**第一步**：新建 `shared/src/content/characters/<id>.ts`，照 `reimu.ts` 抄一份改数值：

```ts
import { Character } from './character';

export const sakuya = new Character({
  id: 'sakuya', // 只能用小写字母 + 数字，且与文件名一致
  displayName: '十六夜咲夜',

  stats: {
    maxHp: 85,
    maxShield: 45,
    shieldRegenDelay: 5000,
    shieldRegenPerSecond: 1.6,
    moveSpeed: 185,
    fireInterval: 380,
    damage: 5.5,
    bulletSpeed: 700,
    bulletRadius: 4,
    bulletLife: 1000,
    bodyRadius: 12,
    respawnDelay: 5000,
  },

  assetFile: 'images/char_sakuya.png',
  textureKey: 'char_sakuya',

  // 没有正式素材时，程序用这组颜色画一个能分辨的占位角色
  placeholder: {
    hairColor: 0xb9c4d0,
    robeColor: 0x2c3a52,
    skirtColor: 0xf2f2f2,
    accentColor: 0x7ecbe8,
    accessory: 'none', // 'bow' | 'hat' | 'none'
  },
});
```

**第二步**：在 `content/characters/index.ts` 注册：

```ts
import { sakuya } from './sakuya';

export const CHARACTERS = {
  reimu,
  marisa,
  sakuya, // ← 加这一行
} as const;
```

**第三步**：把 `assets/images/char_sakuya.png` 放好（48×48 PNG，四周留 2px）。没有也能跑，会显示占位图。

### 1.2 加完自动生效的部分

| 位置       | 为什么不用改                                                       |
| ---------- | ------------------------------------------------------------------ |
| 选人界面   | 遍历 `SELECTABLE_CHARACTERS`，卡片会按数量自动收间距、缩放         |
| 占位贴图   | 遍历 `CHARACTER_LIST`，按 `placeholder` 配色现场生成               |
| 素材清单   | `client/src/assets/manifest.ts` 从角色定义收集 `assetFile`         |
| 数值配置   | `config/characters.ts` 从角色定义派生，`game-config.json` 自动带上 |
| 服务端校验 | `isCharacterId()` 读注册表                                         |
| 快照恢复   | `resolveCharacterId()` 未知 id 回退默认角色，不会崩                |

### 1.3 数值怎么写

参考 `docs/requirements.md` 2.3.2 的手感约束：

- **DPS = damage ÷ (fireInterval / 1000)**，目标约 14 点/秒
- 有效血量 = `maxHp + maxShield`，目标落在 140 左右
- 两者合起来决定"实际击杀 8–13 秒"

调数值只改 `stats`，不需要走需求变更流程（需求 0.3 第 4 条：数值为暂定值）。

### 1.4 只给特定模式用的角色

想加一个"只在 Boss 战出现、不进选人界面"的角色，设 `selectable: false`：
它仍在注册表里（可以被逻辑引用、服务端下发），但不会出现在选人卡片上。

---

## 2. 加一张地图

### 2.1 三步

**第一步**：新建 `shared/src/content/maps/<id>.ts`：

```ts
import { GameMap } from './map';

export const bamboo = new GameMap({
  id: 'bamboo',
  displayName: '迷途竹林',
  tileSize: 32,
  columns: 32,
  rows: 32,

  // 坐标单位是瓦片，不是像素；四周边界墙由 GameMap 自动补齐，不用写
  wallBlocks: [
    { column: 4, row: 4, widthInTiles: 3, heightInTiles: 1 },
    { column: 20, row: 18, widthInTiles: 2, heightInTiles: 6 },
  ],

  playerSpawn: { column: 3, row: 16 },
  multiSpawns: [
    { column: 3, row: 3 },
    { column: 28, row: 28 },
  ],
  dummySpawns: [{ column: 28, row: 16 }],
  itemSpawns: [
    { column: 16, row: 8 },
    { column: 16, row: 24 },
  ],

  floorTextureKey: 'tile_bamboo_floor',
  wallTextureKey: 'tile_bamboo_wall',
  floorFile: 'images/tile_bamboo_floor.png',
  wallFile: 'images/tile_bamboo_wall.png',

  floorPlaceholder: { base: 0x141c14, detail: 0x1f2a1f },
  wallPlaceholder: { base: 0x2a3a26, detail: 0x3c5340 },
});
```

**第二步**：在 `content/maps/index.ts` 注册：

```ts
import { bamboo } from './bamboo';

export const MAPS = {
  shrine,
  bamboo, // ← 加这一行
} as const;
```

**第三步**：放两张 32×32 可平铺的 PNG。没有也能跑。

### 2.2 加完自动生效的部分

- 墙体生成（`buildWalls()`：4 面边界墙 + 你的 `wallBlocks`）
- 出生点分配（练习用 `playerSpawn`，联机用 `multiSpawns` 按序号循环）
- 道具刷新点（`itemSpawns`，按随机数取）
- 瓦片占位图（按 `floorPlaceholder` / `wallPlaceholder` 现场生成）
- 素材清单（从地图定义收集 `floorFile` / `wallFile`）

### 2.3 地图设计检查清单

- [ ] `playerSpawn` 与所有 `multiSpawns` **不要落在墙体里**
- [ ] `itemSpawns` 不要落在墙体里（否则道具会被埋在墙中）
- [ ] 边界留出至少 1 格走廊，否则贴边作战会很别扭
- [ ] 想好"掩体后的视野记忆"：本项目有墙体遮挡视线，密林式地图要留意
- [ ] 联机出生点 ≥ 2，且分散在地图不同角落

### 2.4 现在怎么用第二张地图

```ts
// 单机 / 本地调试：显式指定
createBattleState(battleConfig, { mapId: 'bamboo' });

// 不指定 = 默认地图（content/maps/index.ts 的 DEFAULT_MAP_ID）
createBattleState(battleConfig, {});
```

`BattleState.mapId` 会记录本局用的地图，渲染层通过 `getMap(state.mapId)` 还原同一张图。

> ⚠️ **联机目前固定使用默认地图**。原因：房间选图需要把 `mapId` 加进 `join` / 快照协议，
> 让"服务端建的世界"和"客户端画的图"是同一张。这属于后续工作（见第 4 节）。
> 单机练习与本地调试已经可以任意指定地图。

---

## 3. 素材命名规则

| 类型     | 路径                                 | 尺寸                     |
| -------- | ------------------------------------ | ------------------------ |
| 角色     | `assets/images/char_<id>.png`        | 48×48                    |
| 地图地面 | `assets/images/tile_<map>_floor.png` | 与该地图 `tileSize` 一致 |
| 地图墙体 | `assets/images/tile_<map>_wall.png`  | 同上                     |
| 道具     | `assets/images/item_<id>.png`        | 24×24                    |

文件名写在角色 / 地图定义里，所以**不强制**这个格式；但保持统一能让别人一眼看懂。
完整的素材清单与常见坑见 [assets/README.md](../assets/README.md)。

---

## 4. 已知边界（后续工作）

| 项目            | 现状         | 要做什么                                                      |
| --------------- | ------------ | ------------------------------------------------------------- |
| 联机选图        | 固定默认地图 | `mapId` 加进 join + welcome，客户端按它建影子世界             |
| 选图界面        | 没有         | 在选人之后加一步地图选择，或大厅里让房主选                    |
| 角色解锁 / 皮肤 | 无           | 角色定义里加 `unlock` 字段，选人界面按条件过滤                |
| 每角色专属弹道  | 无           | `FighterStats` 加弹道类型字段，`step.ts` 的开火逻辑按类型分支 |

---

## 5. 加完怎么验证

```bash
npm run typecheck   # 三端类型检查（注册表加漏了会在这里被抓到）
npm test            # 内容层单测：地图几何、注册表回退
npm run dev         # 打开页面，进练习场看新角色 / 新地图
```

页面控制台会打印素材统计，例如：

```
[素材] 图片 2/14 来自文件，其余用占位图；音效 0/6 来自文件，其余用合成音
```

分母变大了说明新内容已经被识别；如果尺寸不对会额外打印 `[素材] 尺寸不符：…`。
