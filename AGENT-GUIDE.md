# Agent 指南

本文档面向 Agent，侧重数据结构说明与方法/接口的使用方式。

---

## 1. 核心数据结构

### 1.1 StoryFramework（剧情框架）

```ts
interface StoryFramework {
  title: string;
  background?: string;
  rules?: string[];
  chapters: FrameworkChapter[];
  initialState?: { variables?: Record<string, string|number|boolean>; inventory?: string[] };
  maps?: GameMap[];
  characters?: GameCharacter[];
  events?: GameEvent[];
  metadata?: GameMetadata;
  items?: GameItem[];
  playerCharacterId?: string;    // 当前玩家角色 id，用户在时间线中指定
}
```

### 1.2 时间线：章节与场景

```ts
interface FrameworkChapter {
  id: string;
  title: string;
  theme?: string;
  scenes: FrameworkScene[];
}

interface FrameworkScene {
  id: string;                    // 唯一 id，用作 passage 名
  title?: string;
  summary: string;               // 剧情概要，AI 据此生成正文
  hints?: string;
  links: FrameworkLink[];
  stateActions?: FrameworkStateActions;
  mapNodeId?: string;            // 关联地图节点 id
  characterIds?: string[];       // 出场人物 id（非玩家控制时按脚本行动）
  eventIds?: string[];           // 关联事件 id
}

interface FrameworkLink {
  displayText?: string;
  target: string;                // 目标场景 id
  condition?: string;            // 如 $items has "令牌"、$rep.尔朱荣 >= 5
}
```

**工具函数**：
- `flattenScenes(fw)`：扁平化所有场景
- `validateFramework(fw)`：校验链接 target 是否都存在

### 1.3 FrameworkStateActions（状态变更）

用于场景、地图节点、人物、事件的「进入时/触发时」变更：

```ts
interface FrameworkStateActions {
  set?: Record<string, string | number | boolean>;
  add?: Record<string, number>;
  subtract?: Record<string, number>;
  give?: string | string[];
  take?: string | string[];
}
```

### 1.4 GameMap（地图）

```ts
interface GameMap {
  id: string;
  name: string;
  nodes: MapNode[];
  edges: MapEdge[];
}

interface MapNode {
  id: string;
  name: string;
  x?: number;
  y?: number;
  rules?: string[];
  onEnter?: FrameworkStateActions;
  items?: string[];
  characterIds?: string[];       // 该地点的人物 id 列表
  npcs?: string[];              // @deprecated 使用 characterIds
}

interface MapEdge {
  from: string;
  to: string;
  displayText?: string;
  condition?: string;
}
```

### 1.5 GameCharacter（人物）

人物不再区分玩家/NPC，玩家由 `StoryFramework.playerCharacterId` 指定。非用户操作的人物按脚本（时间线偶发行为、人物详情规律行为）行动。

```ts
interface GameCharacter {
  id: string;
  type?: 'player' | 'npc';       // @deprecated 保留兼容，玩家由 playerCharacterId 指定
  name: string;
  description?: string;
  attributes?: Record<string, string | number | boolean>;
  inventory?: string[];
  rules?: string[];              // 非玩家控制时按脚本行动
  onMeet?: FrameworkStateActions; // 首次遇见时变更
  inLocations?: string[];        // @deprecated 人物-地点关系在 scene.characterIds 中设定
}
```

### 1.6 GameEvent（事件）

```ts
interface GameEvent {
  id: string;
  name: string;
  trigger: 'unconditional' | 'conditional';
  condition?: string;            // trigger=conditional 时必填
  actions?: FrameworkStateActions;
}
```

### 1.7 GameItem（物品）

```ts
interface GameItem {
  id: string;
  name: string;
}
```

### 1.8 GameMetadata（元信息）

```ts
interface GameMetadata {
  characterAttributes: CharacterAttributeDef[];
}

interface CharacterAttributeDef {
  id: string;
  name: string;
  type: 'string' | 'number' | 'boolean';
  valueRange?: string;           // number 时如 "0,100"
}
```

---

## 2. 编辑操作的使用说明

所有编辑器的共同模式：接收 `fw: StoryFramework` 和 `updateFw: (fn: (d: StoryFramework) => StoryFramework) => void`。

### 2.1 编辑时间线（FrameworkEditor）

- **数据位置**：`fw.chapters`（每个 chapter 含 `scenes`），`fw.playerCharacterId`（当前玩家）
- **预加载**：打开时间线页面时自动从 API 拉取 characters、maps、events、items、metadata，填充到 fw，避免下拉列表等字段数据为空
- **更新方式**：`updateFw((d) => ({ ...d, chapters: [...] }))` 或修改 `d.chapters[i]` / `d.chapters[i].scenes[j]`
- **当前玩家**：在时间线顶部选择 `playerCharacterId`，从 `fw.characters` 中指定用户操作的角色
- **章节**：增删改 `chapters` 数组
- **场景**：增删改 `chapter.scenes`，包含 `id`、`summary`、`links`、`stateActions`、`mapNodeId`、`characterIds`（出场人物）、`eventIds`
- **链接**：`scene.links` 每项需 `target`，可选 `displayText`、`condition`
- **导出**：`downloadJson(fw, 'story-framework.json')`
- **导入**：解析 JSON 后 `updateFw(() => parsed)`
- **生成剧情**：需 `VITE_AIGC_API_KEY`，调用 `generateScenePassageText` 将 `summary` 转为正文并写入 `.tw` 文件

### 2.2 编辑地图（MapEditor）

- **数据位置**：`fw.maps`（`GameMap[]`）
- **更新方式**：`updateFw((d) => ({ ...d, maps: fn(d.maps ?? []) }))`
- **地图 CRUD**：对 `maps` 数组增删改，每项为 `GameMap`
- **保存接口**：开发模式下 `POST /api/save-story-maps`，body 为 `GameMap[]`，写入 `assets/story-maps.json`
- **生产环境**：触发浏览器下载 `story-maps.json`

### 2.3 编辑人物（CharacterEditor）

- **数据位置**：`fw.characters`（`GameCharacter[]`）
- **更新方式**：`updateFw((d) => ({ ...d, characters: fn(d.characters ?? []) }))`
- **人物 CRUD**：对 `characters` 增删改，统一「添加人物」（不再区分玩家/NPC），每项为 `GameCharacter`
- **依赖**：`fw.metadata?.characterAttributes` 定义属性，`fw.items` 为物品选项
- **加载**：`GET /api/story-characters` 返回 `GameCharacter[]`，可初始化 `fw.characters`
- **保存接口**：`POST /api/story-characters`，body 为 `GameCharacter[]`，写入 `assets/story-characters.json`
- **JSON 格式**：`type` 字段可省略（玩家由 `StoryFramework.playerCharacterId` 指定）

### 2.4 编辑事件（EventEditor）

- **数据位置**：`fw.events`（`GameEvent[]`）
- **更新方式**：`updateFw((d) => ({ ...d, events: fn(d.events ?? []) }))`
- **事件 CRUD**：对 `events` 增删改，每项为 `GameEvent`
- **依赖**：`fw.metadata?.characterAttributes`、`fw.items` 用于 `actions` 编辑
- **保存接口**：`POST /api/story-events`，body 为 `GameEvent[]`，写入 `assets/story-events.json`

### 2.5 编辑物品（ItemsEditorPage）

- **数据位置**：`fw.items`（`GameItem[]`）
- **更新方式**：`updateFw((d) => ({ ...d, items: fn(d.items ?? []) }))`
- **物品 CRUD**：对 `items` 增删改，每项 `{ id, name }`
- **保存接口**：`POST /api/story-items`，body 为 `GameItem[]`，写入 `assets/story-items.json`

### 2.6 编辑元信息（MetadataEditor）

- **数据位置**：`fw.metadata`（`GameMetadata`）
- **更新方式**：`updateFw((d) => ({ ...d, metadata: fn(d.metadata ?? { characterAttributes: [] }) }))`
- **属性 CRUD**：`metadata.characterAttributes` 增删改 `CharacterAttributeDef`
- **加载**：`GET /api/story-metadata` 返回 `{ characterAttributes: [...] }`
- **保存接口**：`POST /api/story-metadata`，body 为 `GameMetadata`，写入 `assets/story-metadata.json`
- **用途**：人物属性定义供「编辑时间线」「编辑人物」等处的属性/状态操作使用

---

## 3. Twee 格式与数据结构

### 3.1 基础结构

- `:: StoryTitle`：标题
- `:: StoryData`：JSON，含 `start`、`variables`、`inventory`、`reputation`
- `:: PassageId`：场景正文

### 3.2 StoryData 初始状态

```json
{
  "start": "序章",
  "variables": {"chapter": 1},
  "inventory": [],
  "reputation": {"朝廷": 5}
}
```

### 3.3 Passage 进入时修改状态（metadata JSON）

- `set`：修改变量 `{"set":{"visited":true}}`
- `give`：添加物品 `{"give":"令牌"}` 或 `{"give":["令牌","信物"]}`
- `take`：移除物品 `{"take":"令牌"}`
- `rep`：增减声誉 `{"rep":{"尔朱荣":2}}`

### 3.4 条件链接

链接后写条件表达式，满足才显示：

| 表达式 | 说明 |
|--------|------|
| `$items has "物品名"` | 持有该物品 |
| `$var` | 变量为真 |
| `$var >= 5` | 变量比较（>=、<=、==、!=、>、<） |
| `$rep.角色名 >= 7` | 声誉比较 |

---

## 4. 预设文件路径（开发模式）

| 类型 | 路径 |
|------|------|
| 框架 | `assets/story-framework.example.json` |
| 地图 | `assets/story-maps.json` |
| 人物 | `assets/story-characters.json` |
| 事件 | `assets/story-events.json` |
| 物品 | `assets/story-items.json` |
| 元信息 | `assets/story-metadata.json` |
| 剧情 | `assets/story.tw`（Twee 格式） |
