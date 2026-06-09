# 游戏文件导入格式说明

导入功能只支持一种格式：`zip` 压缩包。

## 导入规则

- 在“剧情 -> 导入”选择一个 `.zip` 文件。
- 压缩包必须且仅能包含一个顶层目录，目录名即 `gameId`。
- 文件路径必须满足 `<gameId>/...`。
- 系统会解压该 zip，并将文件写入 `assets/games/{识别出的gameId}/`。
- 写入前会先清空目标游戏目录，然后按压缩包内容重建。
- 因此，导入后目录文件集合与压缩包内文件集合一致（允许缺失部分文件）。

## 压缩包内路径规范

- 推荐使用 `<gameId>/...` 结构（最清晰），例如：
  - `my-game/story-fm.json`
  - `my-game/story.tw`
  - `my-game/story-scenes.json`
  - `my-game/story-characters.json`
- 允许子目录（例如 `media/bg/forest.png`），会按相对路径写入目标目录。
- 一个压缩包只能包含一个 `gameId` 目录；包含多个会报错。

## 项目级策略文件（`assets/policy.json`）

`assets/policy.json` 是**项目级**策略文件，不属于某个 `gameId`，因此：

- 不放在 zip 压缩包中；
- 不放在 `assets/games/{gameId}/` 下；
- 由项目仓库维护，不由上游导入包传递；
- 本文档仅说明其与导入格式的边界，不展开其内部内容规范。

## 项目级自定义媒体（`assets/media_custom/`）

`assets/media_custom/` 是**项目级**本地自定义媒体目录，与 `assets/policy.json` 类似：

- 不放在 zip 压缩包中；
- 不放在 `assets/games/{gameId}/` 下；
- 由本地项目维护，zip 导入游戏时不会被覆盖或删除；
- 在 JSON 字段中通过 `media_custom/...` 相对路径引用（见下文「多媒体文件导入说明」）。

## 多媒体文件导入说明

- 导入不限制文件扩展名：只要在 zip 内路径合法（不含 `..`）即可写入目标目录。
- 上游导入媒体固定目录：`<gameId>/media/`（例如 `media/bg/forest.png`）。
- 本地自定义媒体固定目录：`assets/media_custom/`（**项目级**，不属于某个 `gameId`；不放在 zip 中，zip 导入也不会覆盖）。
- 运行时会严格按字段填写路径解析（例如填写 `media/xxx.png` 就读取游戏目录下的 `media/`，填写 `media_custom/xxx.png` 就读取 `assets/media_custom/`）。
- 运行时引用媒体时，建议在相关字段中填写相对路径，例如：
  - `openingAnimation: "media/beach.mp4"`
  - `backgroundMusic: "media/frog.mp3"`
  - `images: ["media/flower.png"]`
- 若使用本地自定义媒体，可填写：
  - `avatar: "media_custom/chars/hero.png"`
  - `backgroundMusic: "media_custom/bgm/custom_theme.mp3"`
- 若 `VITE_MEDIA_BASE_URL` 配置了 CDN，相对路径会按该基地址解析；未配置时将按页面相对地址加载。
- 构建产物会保留游戏目录下的全部文件（包含 `media/` 及其他附加资源），并复制 `assets/media_custom/` 到产物目录。

### 多媒体引用方式（字段级规范）

- 可填写两类值：
  - **相对路径**（推荐）：如 `media/beach.mp4`、`media/bgm/frog.mp3`
  - **完整 URL**：如 `https://cdn.example.com/tango/media/beach.mp4`
- 相对路径建议不要以 `/` 开头，统一使用 `<gameId>/` 目录内相对位置（最稳妥）。
- 常用字段对应：
  - `story-scenes.json > scene.openingAnimation`：开场视频
  - `story-scenes.json > scene.backgroundMusic`：场景背景音乐
  - `story-scenes.json > scene.images[]`：场景图片轮播
  - `story-events.json > event.openingAnimation / endingAnimation / backgroundMusic`：事件媒体
  - `story-characters.json > character.avatar / backgroundMusic`：人物头像与人物专属 BGM
  - `story-items.json > item.images[]`：物品配图（背包查看）
  - `story-items.json > item.backgroundMusic`：物品专属 BGM（背包查看物品详情时）
- 若 `story.tw` passage metadata 中也写了 `openingAnimation/images/backgroundMusic`，运行时同样可识别，建议与 `story-scenes.json` 保持一致。

## 物品目录（`story-items.json`）

运行时背包从 `StoryData.inventory`（或 `story-fm.json > initialState.inventory`）读取玩家**已持有**的物品 id 列表；物品的名称、描述、配图等展示信息来自 `story-items.json`。

### 字段约定

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 物品唯一 id；`inventory` / `give` / `take` 中**必须**使用此 id |
| `name` | 是 | 展示名称（状态栏、背包列表） |
| `description` | 否 | 查看时的文字描述；无配图时作为主要展示内容 |
| `images` | 否 | 配图路径数组（相对路径或完整 URL）；背包详情页展示首张，支持后续扩展轮播 |
| `backgroundMusic` | 否 | 物品专属背景音乐（在背包中打开该物品详情时覆盖场景 BGM） |

### 示例

```json
[
  {
    "id": "imperial_edict",
    "name": "钦差谕旨",
    "description": "道光帝亲笔御批，命林则徐赴粤禁烟。",
    "images": ["media/items/imperial_edict.png"]
  },
  {
    "id": "humen_record",
    "name": "虎门销烟记录"
  }
]
```

- 无 `images` 时，背包详情降级为「名称 + 描述」；两者皆无则显示「暂无图文描述」。
- 物品媒体建议放在 `<gameId>/media/items/` 下，与场景、人物媒体目录并列。

### 与运行时状态的关系

- **持有列表**：`story.tw` 的 `StoryData.inventory` 为初始背包；游戏中通过 `give` / `take` 或 passage 内 `<<run $inventory.push(...)>>` 变更。
- **id 规范**：`inventory` 数组元素必须是 `story-items.json` 中某条的 `id`，不要使用 `name` 或其他别名。
- **条件表达式**：`$items has "imperial_edict"` 与 `$inventory has "imperial_edict"` 等价，均检查是否持有该 id。

### 上游交付前自检（物品维度）

- [ ] `story-items.json` 中每个会被 `give` 或初始 `inventory` 引用的 id 均有对应条目。
- [ ] 需要图文展示的物品已填写 `description` 和/或 `images`。
- [ ] `images` 路径在 zip 包内存在对应文件（如 `media/items/xxx.png`）。

## 示例

压缩包结构（推荐）：

```text
my-game.zip
└── my-game/
    ├── story-fm.json
    ├── story.tw
    ├── story-characters.json
    ├── story-scenes.json
    ├── story-events.json
    ├── story-items.json
    ├── story-maps.json
    ├── story-rules.json
    ├── story-metadata.json
    ├── story-features.json
    └── media/
        ├── beach.mp4
        ├── flower.png
        └── items/
            └── imperial_edict.png
```

说明：`assets/policy.json` 若存在，应位于项目根目录（非 zip 内容）。

导入后会自动识别到游戏 `my-game`，写入：

- `assets/games/my-game/story-fm.json`
- `assets/games/my-game/story.tw`
- `assets/games/my-game/media/beach.mp4`
- 其余文件同理

错误示例（不支持）：

```text
lzx-twine-import.zip
├── story-fm.json
└── story.tw
```

该结构会导入失败：缺少 `<gameId>/` 顶层目录。

## 注意事项

- 导入仅支持开发模式（`npm run dev`）。
- zip 中识别出的游戏目录名必须合法：`^[a-zA-Z0-9_-]+$`。
- 导入会覆盖（重建）目标目录，请先备份。

## 章节、场景池与路由图（当前模型）

运行时玩家**不看到「章节」标题**，只会经历地图节点与分页后的 passage。`story-fm.json > chapters[]` 与编辑器「章节」页负责**编排场景池、叙事图与跨章过渡**；场景正文与媒体仍在 `story-scenes.json`。

### 三层关系

| 层级 | 文件 | 含义 |
|------|------|------|
| **章节** | `story-fm.json > chapters[]` | 场景池 + 叙事有向图 + 跨章过渡；不直接存正文 |
| **场景** | `story-scenes.json` + `chapters[].availableSceneIds[]` | 叙事内容单元（`passageBlocks`、地图落点、媒体等） |
| **正文块** | `scene.passageBlocks[]` | 汇编后写入 `story.tw` 单个 passage，再自动分页（`.p_100`…） |

### 章节结构（`story-fm.json > chapters[]`）

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 章节 id |
| `title` | 是 | 编辑/治理用标题（建议简短，可与地图节点 name 对齐） |
| `availableSceneIds` | 是 | 本章场景池（**无序**） |
| `narrativeGraph` | 否 | `sceneId → true` 表示叙事图（勾选）；省略表示开放世界 |
| `startSceneId` | 否 | 叙事态推荐入口 |
| ~~`endSceneIds`~~ | — | **已废弃**：由叙事图程序推断章末场景 |
| `narrativeEdges` | 否 | 叙事态有向图边（见下节） |
| `transitions` | 否 | 跨章跳转（`fromSceneId` → `toChapterId`；落地取目标章 `startSceneId`） |
| `sceneMeta` | 否 | 每场景 `compiledFingerprint` / `routingFingerprint`（编辑器维护） |
| `graphLayout` | 否 | 叙事图编辑器节点坐标 |

**已废弃（勿在新 zip 中使用）**：`sceneEntries`、`sceneModes`、`narrativeRouting`、`openWorld`、`startMapNodeId`、`endMapNodeId`；`story-scenes.json` 中的 `branchOptions`、`mainlineLinkDisplayText`、`branchFailureEnding*`。请用 `node scripts/migrate-chapter-graph.mjs [gameId]` 迁移旧数据。

章节示例：

```json
{
  "id": "ch_n02a",
  "title": "京师·宣南",
  "theme": "宣南消寒",
  "availableSceneIds": ["scene_1015", "scene_1015_b1", "scene_1015_b2"],
  "narrativeGraph": {
    "scene_1015": true
  },
  "startSceneId": "scene_1015",
  "narrativeEdges": [
    {
      "id": "e_main_continue",
      "fromSceneId": "scene_1015",
      "toSceneId": "scene_1015_b1",
      "displayText": "仓促认罪，换取速断",
      "condition": "$will < 40",
      "isBranch": true
    },
    {
      "id": "e_branch_return",
      "fromSceneId": "scene_1015_b1",
      "toSceneId": "scene_1015",
      "displayText": "回到会审前夜",
      "isBranch": true
    }
  ],
  "transitions": [
    {
      "fromSceneId": "scene_1015",
      "toChapterId": "ch_n03",
      "displayText": "前往江南"
    }
  ]
}
```

### 场景准入规则（`story-rules.json`）

规则定义与章节×场景绑定**分离**存储：

```json
{
  "rules": [{"id": "rule_0001", "name": "onlyOnce", "judgeExpr": "..."}],
  "sceneBindings": [
    {"chapterId": "ch_n02a", "sceneId": "scene_1015_b1", "ruleIds": ["rule_0001"]}
  ]
}
```

编译准入条件 = `sceneBindings` 规则 ∧ `scene.conditions` ∧ `scene.ruleIds`（均按 and 合并）。

### 场景与地图（`story-scenes.json`）

- `scene.mapNodeId`：场景叙事落点，须在 `story-maps.json > nodes[].id` 中存在。
- 场景**不再**自带路由字段；章内/跨章链接均由章节图 + 地图边编译生成。
- 开放世界态出口：`mapNodeId` 相同或地图**一步**可达的、且在本章 `availableSceneIds` 内的场景。

### 运行时双轨路由（重要）

编译器为每个场景预生成**叙事**与**开放世界**两套链接，由运行时变量 `$chapterMode_{chapterId}` 门控：

| 连通态 | 出口来源 | 门控条件 |
|--------|----------|----------|
| `narrative` | `narrativeEdges[]` | `$chapterMode_{chapterId} == "narrative"` |
| `open_world` | 地图一步边 ∩ 本章场景池 | `$chapterMode_{chapterId} == "open_world"` |

- 进入场景时，passage metadata 的 `set` 块写入 `$activeChapterId` 与 `$chapterMode_{chapterId}`（`narrativeGraph[toSceneId] === true` 时为 `narrative`，否则 `open_world`）。
- **跨章**：仅通过 `transitions[]`（从 `fromSceneId` 起跳至 `toChapterId`）；落地场景取目标章 `startSceneId`；链接附带 `set.activeChapterId` 与目标章模式。
- **支线**：在 `narrativeEdges[]` 边字段设 `isBranch: true` 表示结构上的支线；是否失败结局由目标场景 `isFailure`、`failureEnding`、`branchEndingText` 定义，统一媒体/模板见 `story-features.failureBranch`。

### 上游录入建议

- 主线场景在 `narrativeGraph` 中设为 `true`，用 `narrativeEdges` 串联。
- 支线/分歧场景不设 `narrativeGraph`（开放世界），或用叙事边连回主线。
- 跨章在 `transitions` 显式声明，勿依赖旧版 `startMapNodeId`/`endMapNodeId` 自动推断。
- 池内叙事图不可达的场景，须在开放世界态下经地图可达（否则编译报错）。

### 旧版迁移

```bash
node scripts/migrate-chapter-graph.mjs [gameId]   # 省略 gameId 则处理 assets/games 下全部目录
```

迁移将：`sceneEntries` 顺序 → 主线 `narrativeEdges`；`branchOptions` → 支线边（`isBranch`）+ 场景失败字段；`sceneEntries[].ruleIds` → `story-rules.json > sceneBindings`。

### `story-scenes.json` 里 `passageBlocks` 字段规范（必填）

- 字段位置：`story-scenes.json > scene.passageBlocks`（数组，**必填**）
- **结构（硬性）**：
  - **有且仅有一个** leading `type: "raw"`，且必须为数组**首项**（定调 / 史料）；
  - 其余项**必须**为 `type: "ai"`（**禁止** `raw-ai-raw` 交替；旧式中间 raw 应拆成独立 scene 或合并进 leading raw）。
- **生成与存储（叙事引擎两阶段）**：
  1. **生成内容**（「场景」菜单，每 AI 块）：按块规格调用叙事引擎，正文写入 `ai.generatedText`（存于 `story-scenes.json`）。
  2. **汇编内容**（「剧情」菜单，每场景条目）：将 `raw` + 各块 `generatedText` 连缀（必要时插入过渡句），写入 `story.tw`，再按 `VITE_PASSAGE_PAGE_CHARS_MIN/MAX` 自动分页。
  - **块级规格**存于 JSON；**汇编后的成稿**在 `story.tw`；**不在** JSON 重复存整段 passage 全文。
- `ai` 块字段（`hints` 已废弃，请用结构化字段）：
  - **必填**：`summary`、`wordCount`（建议 **160–220**，默认 **200**）；
  - **选填**：`emotion`、`perspective`、`priority`（`low` | `medium` | `high`，默认 `medium`）、`style`、`pacing`、`voice`、`constraints`；
  - **数组选填**：`anchors`（必须体现的情节点/对白）、`forbidden`（禁止写入）；
  - **数组选填**：`characterIds`（本块可发言人物，须为 `scene.characterIds` 的子集；省略则继承出场人物，`[]` 表示不写具名对白）；
  - **生成结果**：`generatedText`（由编辑器「生成内容」写入，上游手填亦可）。
- 文风、对白分工见「AI 正文文风与对白约定」（面向上游素材规范）。
- 推荐每 scene：**1 个 raw + 2–4 个 ai**；单块宜控制在约一页阅读量内，避免拼接后再被拆成过多子页造成文字墙。

示例：

```json
{
  "id": "scene_0001",
  "name": "游历市井",
  "mapNodeId": "xuanyangmen",
  "passageBlocks": [
    {
      "type": "raw",
      "text": "【史料摘录】洛阳宣阳门外，车马辐辏，市声喧然。"
    },
    {
      "type": "ai",
      "summary": "费穆初入市井，心怀投机与上升期待，见闻繁华后情绪高涨。",
      "wordCount": 200,
      "style": "白描为主",
      "voice": "第一人称限知",
      "constraints": "对白极少；勿复述 raw",
      "generatedText": "（由编辑器生成后填入，或上游手填）"
    },
    {
      "type": "ai",
      "summary": "人流中与旧识擦肩，短暂停步后仍被人潮推向前方。",
      "wordCount": 180,
      "pacing": "短句；段末留悬念",
      "generatedText": ""
    }
  ]
}
```

### AI 正文文风与对白约定（`type: "ai"`，上游必遵）

本节面向**上游素材提供方**：在交付 `story-scenes.json` 时，应使各 `ai` 块结构化字段与下列约定一致。运行时「生成内容 / 汇编内容」由开发模式叙事引擎执行（需 `VITE_AIGC_API_KEY`），引擎审校不强制全局对白比例。

#### 体裁与节奏

- **推荐白描**：以场景、动作、体感、心理为主，用具体画面承载情绪与背景；节奏宜适中，既不要快剪式流水账，也不要长篇议论或报告体。
- **旁白与描写优先**：默认输出以叙述者视角的旁白 + 描写性文字为主；不在正文中堆砌背景百科。
- **对白宜少**：完整问答、可反复触发的角色台词应写入 `story-characters.json > behaviorLibrary`（玩家通过人物弹窗阅读）。passage 正文**仅保留**推进本场叙事所必需的少量引语（通常 0–2 轮，每轮一问一答）。

#### `raw` 与 `ai` 分工（避免重复扩写）

- `type: "raw"` 的 `text` 会原样展示；若其中已含史料摘录、殿议台词、诏书原句等，**同一信息不得**在相邻 `ai` 块中复述、摘抄或同义改写。
- 承接型 `ai` 块（紧跟含台词的 `raw` 之后）应只写 **新信息**：环境变化、身体感受、心理余波、行动后果等，**不要**再扩写 `raw` 里已有的对白。
- `summary` 中**避免**使用会诱导模型写长对白的表述，例如：“连续对话”“对白交锋”“殿议全文”“消化这句材料并外化对白”等。应改为事实性白描概要，例如：“退朝后夜路湿冷，肩上千钧，回想殿上最后一句的压力”。

#### `ai` 块结构化字段填写规范

| 字段 | 必填 | 要求 |
|------|------|------|
| `summary` | 是 | 事实性概要：人物、地点、事件、情绪、关键结果 |
| `wordCount` | 是 | 该块扩写**上限**（160–220，默认 200） |
| `style` / `voice` / `constraints` | 否 | 文风、人称、禁区（原 `hints` 内容应拆入此处） |
| `anchors` | 否 | 必须出现的情节点或关键对白 |
| `forbidden` | 否 | 禁止剧透、禁止复述 raw 等 |
| `generatedText` | 否 | 生成或手填的正文；汇编前各 AI 块宜已填写 |

#### 对白排版（引擎与上游一致）

当正文不可避免地出现对白时：

- 每一句发言**单独成行**（问一行、答一行）；不要把多轮对话挤在同一段。
- 引号内为角色原话；叙述性说明（“他说”“我答”）可单独成行，宜短。
- 示例（引擎期望形态）：

```text
殿上静了一息。
道光帝问：“谁去做，谁肯担？”
我答：“臣不敢言必胜，只敢言不退。”
退朝时檐角还在滴水。
```

#### 篇幅（单块 `wordCount`，轻量互动默认）

- **仅**在 `passageBlocks[].wordCount`（`ai` 块）配置上限。
- 推荐区间（汉字，含标点，**上限**）：

| 块角色 | 建议 `wordCount` |
|--------|------------------|
| 常规 ai 块 | `160`–`220`（默认 `200`） |
| 失败支线收束（若用 ai 块） | `160`–`200` |

- leading `raw` 宜 **≤220 字**（约 2–3 句），避免单块拼接后占满多页。
- 单 scene 若有 3 个 `ai` 块，AI 总量宜 **≤660**；仍过长则增加 scene 或下调各块 `wordCount`。

#### 上游自检补充（文风维度）

- [ ] 每个 `ai` 块均填写 `wordCount`，且落在上述单块区间内。
- [ ] `summary` 未要求“连续对话 / 对白交锋”；对白需求已迁移至 `behaviorLibrary` 的，正文不再重复。
- [ ] 含殿议、诏书、史料台词的 `raw` 之后，`ai` 块 `summary` 仅写环境与心理，不扩写 `raw` 台词。
- [ ] `style` / `constraints` 含白描与对白排版约束（或等价表述）。
- [ ] 抽检导出正文：无大段无换行对白墙；单段不宜超过约 4 句。

### 上游交付前自检清单（5条）

- [ ] **场景节点完整性**：`story-scenes.json` 中每个参与流程的场景都填写了 `mapNodeId`。
- [ ] **正文块完整性**：每个场景都提供了非空 `passageBlocks[]`，且块顺序符合预期叙事节奏。
- [ ] **AI 块摘要质量**：每个 `type: "ai"` 块都包含明确 `summary`（避免空泛描述），并符合「AI 正文文风与对白约定」。
- [ ] **节点引用有效性**：所有 `scene.mapNodeId` 都能在 `story-maps.json > nodes[].id` 中找到。
- [ ] **连通可达性**：希望互相可跳转的场景，其 `mapNodeId` 在 `story-maps.json > edges` 中存在连通关系。
- [ ] **章节场景池**：`chapters[].availableSceneIds` 已包含本章所有参与路由的场景 id。
- [ ] **叙事图完整**：主线 `narrative` 场景经 `narrativeEdges` 可达；`startSceneId` 已配置；章末场景由图推断（无叙事出边，或入口仅有支线出边）。
- [ ] **跨章过渡**：章间跳转写在 `transitions[]`；`fromSceneId` 为推断章末场景之一；`toChapterId` 有效且目标章已配置 `startSceneId`。
- [ ] **场景绑定**：章内准入规则写在 `story-rules.json > sceneBindings`，非 `sceneEntries[].ruleIds`。
- [ ] **开放世界兜底**：叙事图不可达的池内场景，在 `open_world` 态下须地图一步可达。
- [ ] **passageBlocks 结构**：每 scene 首块为唯一 `raw`，其余为 `ai`；每个 `ai` 块填写 `wordCount`（160–220）及结构化文风字段（无 `hints`）。

### 叙事引擎真相层（可选 JSON，推荐随游戏维护）

| 文件 | 导入 zip | 说明 |
|------|----------|------|
| `story-outline.json` | 可选 | 滚动大纲：`chapters[].narrativeGoal`、`beats[]`，与 `story-fm` 章节 id 对齐 |
| `story-foreshadowing.json` | 可选 | 伏笔池：`threads[]`（`planned` / `planted` / `resolved`） |
| `story-canon.json` | 可选 | 叙事状态快照：`scenes[sceneId].facts` / `characterStates` 等 |
| `story-generation-traces.json` | **不得** | DEV 本地生成轨迹，由编辑器追加，**不要**放入上游 zip |

`story-journal.json`（心迹）**不参与**叙事生成 context，避免汇总剧透。

编辑器「叙事引擎」菜单可查看/编辑大纲、伏笔、Canon；「生成轨迹」只读。

迁移旧 `hints`：`node scripts/migrate-passage-blocks.mjs [gameId]`

### 支线（`narrativeEdges[]` + 场景）

章节只定义场景顺序与结构；是否失败结局由场景定义。不再使用 `story-scenes.json > branchOptions`。

#### 设计约束（硬性）

- 支线**只在当前章节内**生效；跨章仅走 `transitions[]`。
- 支线边须设 `isBranch: true`；入口边可填 `condition`。
- 支线末端须有一条返回主线的 `narrativeEdge`（`isBranch: true`）。
- 支线场景 **MUST** 与根场景同 `mapNodeId`（同一地点分歧）。
- 支线场景 **MUST** 在 `story-rules.json > sceneBindings` 或 `scene.ruleIds` 中包含 `rule_0001`（`onlyOnce`）。
- 主线根场景 **MUST NOT** 使用 `rule_0001`。

#### 叙事边字段（支线）

| 字段 | 说明 |
|------|------|
| `displayText` | 链接文案 |
| `condition` | 可见条件（与目标场景准入 and 合并） |
| `isBranch` | `true` 表示支线边（结构） |

#### 场景字段（失败）

| 字段 | 说明 |
|------|------|
| `isFailure` | `true` 表示失败支线结局场景 |
| `failureEnding` | 失败结局描述（模板占位符） |
| `branchEndingText` | 可选，覆盖末端附加文案 |

#### 编译行为

- `isFailure` 场景可套用 `story-features.json > failureBranch` 统一媒体与模板。
- `isFailure` 且为支线末端的场景 metadata 含 `branchTerminal: true`。
- 开放世界态下，失败支线场景默认不生成地图导航出口（避免与支线语义冲突）。

#### 失败结局模板（`story-features.json`）

```json
{
  "failureBranch": {
    "backgroundMusic": "media/bgm/failure_common.mp3",
    "images": ["media/bg/failure_common.png"],
    "template": "【失败结局】{{failureEnding}}\n\n你暂时偏离了主线目标。"
  }
}
```

模板占位符：`{{failureEnding}}`（取自场景 `failureEnding` / `branchEndingText`）、`{{rootSceneName}}`、`{{branchOptionId}}`（入边 `id`）。

#### 上游自检（支线维度）

- [ ] 支线路径场景均在 `availableSceneIds` 内。
- [ ] 支线场景与根场景 `mapNodeId` 一致。
- [ ] 支线场景含 `rule_0001`；主线根场景不含 `rule_0001`。
- [ ] 每条支线路径有返回主线的 `narrativeEdge`。

## 对话集（人物互动）可识别格式

为确保“场景中点人物 -> 出现该人物对话集”生效，上游导出需要满足下面三层绑定：

1. **场景绑定人物**：在 `story.tw` 的 passage metadata 使用 `characterIds`（驼峰）；
2. **人物绑定对话集**：在 `StoryData` 的 `characters[].behaviorLibrary` 提供行为列表；
3. **（可选）对话限定场景**：在 `behaviorLibrary[]` 条目上使用 `sceneIds`，仅在该场景显示该对话。

### 运行时读取来源（很重要）

- 当前前端运行时通过 `story.tw` 加载故事（`StoryData + passage metadata`）。
- `story_bundle.json` 可以保留用于其他链路，但**不会直接驱动前端人物对话弹窗**。
- 人物对话数据也可来自 `story-characters.json`（编辑/导出链路会合并进 `story.tw` 的 `StoryData.characters`）。

### 1) 场景绑定人物（passage metadata）

在对应 passage 标题后附加 JSON metadata，字段名必须是 `characterIds`：

```twee
:: 游历市井 {"sceneId":"scene_0001","characterIds":["feimu","yuanyong"]}
```

- `characterIds` 必须是字符串数组；
- 数组中的 id 必须能在 `StoryData.characters` 中找到对应人物；
- 建议同时写入 `sceneId`（与 `story-scenes.json` 中 `scene.id` 一致）；使用编辑器生成 `story.tw` 时会自动写入。若省略，运行时会尝试从 passage id（`ch{N}.{sceneId}`）解析。

### 2) 人物绑定对话集（StoryData.characters[].behaviorLibrary）

在 `:: StoryData` 的 JSON 里，每个可互动人物应带 `behaviorLibrary`（`story-characters.json` 中同名字段格式一致）：

```json
{
  "id": "yuanyong",
  "name": "元雍",
  "behaviorLibrary": [
    {
      "id": "yuanyong.b_scene1_01",
      "q": "你为何反对引入军事强人整肃朝廷？",
      "a": "我认为旧有的官僚体系是稳定政权的基石，一旦动摇，后果不堪设想。",
      "t": "dialog",
      "sceneIds": ["scene_0001"]
    },
    {
      "id": "yuanyong.b_scene2_01",
      "q": "在太庙，你为何如此激动？",
      "a": "此地岂容你放肆！",
      "t": "dialog",
      "sceneIds": ["scene_0002"]
    },
    {
      "id": "yuanyong.b_common",
      "q": "高阳王这个称号对你意味着什么？",
      "a": "这不仅是一个称号，更是我肩负的责任。",
      "t": "dialog"
    }
  ]
}
```

字段约定：

- `id`: 行为 id（建议全局唯一，推荐 `<characterId>.b_xxx`）
- `q`: 选项文案（玩家看到的问题/动作名）
- `a`: 反馈文本（执行后展示）
- `t`: `dialog` 或 `action`
- 可选：`ruleIds`、`judgeExpr`、`writebackExpr`
- 可选：`sceneIds`：字符串数组，元素为 `story-scenes.json` 中的 `scene.id`；**省略或空数组表示所有场景均可用**；填写后仅当玩家处于对应场景时，该对话才会出现在人物弹窗中

> 若 `behaviorLibrary` 缺失或为空，人物可显示但弹窗会是“暂无可用行为”。
> 若某人物在当前场景下没有任何可用对话（全部被 `sceneIds` 排除或准入未通过），弹窗同样会显示“暂无可用行为”。

## AI 正文扩写的人物资源字典输入约定

从当前版本起，`type: "ai"` 的正文块在调用 OpenAI 兼容接口时，会按“人物资源字典”提供更细粒度的创作素材。上游若希望模型产出更稳定，请按以下字段准备 `story-characters.json`。

### 参与构建资源字典的字段

- `story-characters.json > character.id / name / description`
- `story-characters.json > character.nameProfile`
- `story-characters.json > character.addressingProfile`
- `story-characters.json > character.attributes`
- `story-characters.json > character.inventory`
- `story-characters.json > character.behaviorLibrary[]`
- `story-scenes.json > scene.characterIds`（当前场景可互动人物）
- `story-scenes.json > scene.counterpartCharacterIds`（当前场景对手戏人物集，必须显式提供，不再自动推导）
- `story-scenes.json > scene.characterOverrides`（场景级人物覆写）

说明：

- 章节内出场人物会进入资源字典；
- 对手戏人物集仅以 `counterpartCharacterIds` 为准，不从 `characterIds` 自动推导；
- 默认人物资料来自 `story-characters.json`；若 `characterOverrides` 提供同人物覆写，则以场景覆写为准；
- `behaviorLibrary` 会以摘要形式提供给模型（用于对话语气与行为风格参考）。

### `story-characters.json` 新增字段约定（结构化姓名与称呼）

```json
{
  "id": "yuanyong",
  "name": "元雍",
  "nameProfile": {
    "familyName": "元",
    "givenName": "雍",
    "courtesyName": "某某",
    "title": "高阳王"
  },
  "addressingProfile": {
    "peerOrJuniorPrefer": ["courtesyName", "title", "name"],
    "elderPrefer": ["title", "courtesyName", "name"],
    "avoidGivenName": true,
    "contextTags": ["ancient_china"]
  }
}
```

字段语义：

- `nameProfile.familyName / givenName`：用于拆分“姓/名”；
- `nameProfile.courtesyName`：字（古代语境常用于平辈称呼）；
- `nameProfile.artName`：号（可选）；
- `nameProfile.title`：封号/爵位（如“高阳王”）；
- `addressingProfile.peerOrJuniorPrefer`：平辈/晚辈称呼优先级；
- `addressingProfile.elderPrefer`：长辈称呼优先级；
- `addressingProfile.avoidGivenName`：是否避免直呼其“名”；
- `addressingProfile.contextTags`：该称呼规则生效的语境标签（如 `ancient_china`）。

### 人物称呼字段的上游交付要求（与项目策略联动）

当项目级策略（`assets/policy.json`）包含古代称呼约束（如平辈/晚辈优先称字、号、封号）时，上游在 `story-characters.json` 中应满足以下要求：

- **MUST** 提供 `name`（人物通用显示名）；
- **SHOULD** 提供 `nameProfile.courtesyName`（字）；
- **SHOULD** 提供 `nameProfile.artName`（号）；
- **SHOULD** 提供 `nameProfile.title`（封号/爵位）；
- **SHOULD** 在 `addressingProfile.peerOrJuniorPrefer` 中显式包含 `"courtesyName"` / `"artName"` / `"title"` / `"name"` 的优先顺序；
- 若某角色史料上确无字/号/封号，可留空对应字段，但建议在 `description` 中注明，避免模型误补。

最小建议示例：

```json
{
  "id": "yuanyong",
  "name": "元雍",
  "nameProfile": {
    "courtesyName": "某某",
    "artName": "",
    "title": "高阳王"
  },
  "addressingProfile": {
    "peerOrJuniorPrefer": ["courtesyName", "artName", "title", "name"],
    "avoidGivenName": true,
    "contextTags": ["ancient_china"]
  }
}
```

### `story-scenes.json` 新增字段约定（人物维度）

```json
{
  "id": "scene_0001",
  "characterIds": ["feimu", "yuanyong"],
  "counterpartCharacterIds": ["yuanyong"],
  "characterOverrides": {
    "yuanyong": {
      "description": "在本场景中更强势，语气更激进。",
      "inventory": ["humen_record"],
      "behaviorLibrary": [
        {"id":"yuanyong.scene_0001.01","q":"...","a":"...","t":"dialog"}
      ]
    }
  }
}
```

字段语义：

- `counterpartCharacterIds`: 字符串数组；表示该场景应作为“对手戏”参考的人物集合。
- `characterOverrides`: key 为人物 id；value 为场景级人物覆写对象。
- 覆写规则：
  - 数组字段（`inventory`、`behaviorLibrary`）使用 **replace** 语义；
  - 对象字段（`attributes`）按整对象替换；
  - 未提供的字段回退到 `story-characters.json` 默认值。
- 该覆写不仅用于 AI 生成，也将用于运行时人物交互（对话/行为可见性等）。

### AI 上下文预算约束（防止 prompt 过长）

- 每个角色最多注入前 `5` 条行为预览；
- 前序场景摘要最多注入 `8` 条；
- 章节事件最多注入 `8` 条；
- 当前场景 raw 片段最多注入 `6` 条；
- 章节人物最多注入 `14` 人（超出部分截断）。

> 上游若提供更长数据不会报错，但模型可见内容将按预算截断。

### 人物描述（`description`）篇幅建议

为提升 AI 扩写稳定性，建议对主线人物提供足够密度的描述文本：

- 主线核心人物：建议 `120-300` 字；
- 关键配角：建议 `80-180` 字；
- 路人/功能角色：建议 `30-80` 字；
- 描述应优先包含：立场、关系、说话习惯、行为偏好、禁忌/底线。

### `onMeet` 当前状态（重要）

- `onMeet`（首次遇见触发）目前**尚未接入运行时执行链路**；
- 因此本次 AI 扩写增强中，`onMeet` **不会**进入人物资源字典；
- 上游可继续保留该字段用于未来兼容，但当前不作为必填或生效项。

## 准入规则约定（`story-rules.json`）

本节为上游内容生成方的**硬性契约**。约定大于实现：`rule_0001` 承担 onlyOnce 语义；`rule_0002`（可选）承担动作触发型 setOn 语义；其余规则仅在被显式引用时生效。

### 规范定义：`rule_0001`（onlyOnce）

**语义**：同一实体（人物对话、事件行为等）首次通过准入并执行后，标记为已使用；后续不再出现在可选列表中。

**每个游戏包 MUST 原样包含以下规则定义（禁止修改字段值）：**

```json
{
  "id": "rule_0001",
  "name": "onlyOnce",
  "judgeExpr": "!$entity.is_used",
  "writebackExpr": "$entity.is_used = true"
}
```

字段约束：

| 字段 | 要求 |
|------|------|
| `id` | **MUST** 为 `"rule_0001"`（精确匹配，区分大小写） |
| `name` | **SHOULD** 为 `"onlyOnce"`（供人阅读，引擎不依赖） |
| `judgeExpr` | **MUST** 为 `"!$entity.is_used"` |
| `writebackExpr` | **MUST** 为 `"$entity.is_used = true"` |

### 出现位置

- **MUST** 写入 `story-rules.json`（推荐作为数组首项，但不强制顺序）。
- 若 `story.tw` 的 `:: StoryData` 内嵌了 `gameRules`，**MUST** 包含与上表完全一致的一条 `rule_0001`。
- 允许在同一 `story-rules.json` 中定义其他规则（如 `rule_0002`），但**不得**用其他 id 替代 `rule_0001` 的 onlyOnce 语义。

### 运行时行为（供理解，非可配置项）

- 引擎在人物对话、事件行为等准入计算时，**自动**将 `rule_0001` 置于规则列表最前。
- `behaviorLibrary` 中的对话项**无需**逐条填写 `ruleIds`；引擎会自动应用 `rule_0001`。
- 若 `story-rules.json` 中缺少 `rule_0001`，或 id / 表达式不符合上表，onlyOnce **不会生效**（对话可重复触发、历史会重复累积）。

### MUST NOT（禁止项）

- **MUST NOT** 使用 `rule_only_once`、`only_once` 等自定义 id 代替 `rule_0001`。
- **MUST NOT** 仅把 onlyOnce 语义写在 `judgeExpr` / `writebackExpr` 中，却使用非 `rule_0001` 的 id。
- **MUST NOT** 修改 `rule_0001` 的 `judgeExpr` 或 `writebackExpr`（例如改成 `"true"` 或空字符串）。
- **MUST NOT** 省略 `story-rules.json`，或在 `StoryData.gameRules` 中遗漏 `rule_0001`。

### 上游交付前自检（规则维度）

- [ ] `story-rules.json` 中存在 id 为 `rule_0001` 的规则。
- [ ] `judgeExpr` 精确为 `!$entity.is_used`，`writebackExpr` 精确为 `$entity.is_used = true`。
- [ ] 未使用其他 id 承载 onlyOnce 语义。
- [ ] 若 `story.tw` 内嵌 `gameRules`，同样包含与规范定义一致的 `rule_0001` 条目。

### 规范定义：`story-journal.json`（心迹目录）

**语义**：发行前定稿的心迹主题与列表项；游玩时仅展示 `unlockVar === true` 的条目。

| 字段 | 必填 | 说明 |
|------|------|------|
| `themes[]` | 是 | 主题列表 |
| `themes[].id` | 是 | 主题 id |
| `themes[].name` | 是 | 显示名 |
| `themes[].order` | 是 | 玩家页分组排序（升序） |
| `themes[].description` | 否 | 主题说明 |
| `entries[]` | 是 | 心迹列表项 |
| `entries[].id` | 是 | 稳定 id，供 `journal.unlock` 引用 |
| `entries[].themeId` | 是 | 所属主题 id |
| `entries[].title` | 是 | 标题 |
| `entries[].content` | 是 | 正文（推荐 40–120 字） |
| `entries[].unlockVar` | 否 | 省略时为 `journal.unlocked.{id}` |
| `entries[].order` | 否 | 同主题内排序 |

> `journalThemes` 应自 `story-metadata.json` 迁至本文件；prod 构建会将本文件写入 `StoryData.journal`。

### 规范定义：`rule_0002`（setOn）

**语义**：当命中指定动作（`actionRef`）且准入通过时，按序执行 `effects`（统一执行面）。

启用约束：

- 若某游戏包启用了心迹能力，**MUST** 提供 `story-journal.json` 与 `rule_0002`；
- 若 `story.tw` 内嵌 `gameRules`，启用该能力时 **MUST** 同步包含 `rule_0002`。

推荐示例：

```json
{
  "id": "rule_0002",
  "name": "setOn",
  "judgeExpr": "true",
  "execution": {"kind": "injectable"},
  "entries": [
    {
      "judgeExpr": "$action.type == 'scene.enter' && $action.sceneId == 'scene_1000'",
      "effects": [{"type": "journal.unlock", "journalId": "j_scene_1000"}]
    }
  ]
}
```

> **规则元信息**（`id`、`name`、`judgeExpr`、`execution.kind`）在「规则」菜单统一编辑。何时命中由 **条件表达式**（含 `$action.*`）描述；**`builtin`** 时使用处无需配置执行内容；**`injectable`** 时仅在使用处展示固定执行类型列表（引擎 `RULE_EFFECT_TYPES`）。动作上下文由使用处页面决定，不在规则上配置动作类型。

`effects` 类型：

| `type` | 字段 | 说明 |
|--------|------|------|
| `set` | `key`, `value` | 设置运行时变量 |
| `journal.unlock` | `journalId` | 将 `journal.unlocked.{journalId}` 置为 `true` |
| `give` | `itemId` | 获得物品 |
| `take` | `itemId` | 失去物品 |
| `rep` | `entity`, `delta` | 调整声誉 |

字段约定：

| 字段 | 必填 | 说明 |
|------|------|------|
| `judgeExpr` | 否 | 规则级条件表达式；省略视为 `true` |
| `execution` | 推荐 | 仅 `kind`：`builtin`（内建）或 `injectable`（使用处注入） |
| `entries` | 否 | `injectable` 规则在使用处写入的执行项 |
| `entries[].judgeExpr` | 推荐 | 本条命中条件，使用 `$action.type`、`$action.sceneId` 等约定变量 |
| `entries[].effects` | 推荐 | 有序执行列表 |
| `entries[].when` / 规则级 `when` | — | **遗留字段**，引擎兼容；新内容请只用 `judgeExpr` + `$action.*` |
| `setOn` / `setOn[].when` | — | **已废弃** |
| `setOn[].set` | 否 | **已废弃**，加载时转为 `effects` |
| `setOn[].journalAppend` | 否 | **已废弃**，请用目录 + `journal.unlock` |

#### 条件表达式约定变量（`$action.*`）

与 `$entity.is_used` 同级，在 `judgeExpr` 中引用当前动作上下文：

| 变量 | 含义 |
|------|------|
| `$action.type` | 动作类型：`scene.enter`、`event.complete`、`behavior.execute`、`item.obtain` |
| `$action.sceneId` | 场景 id（若有） |
| `$action.eventId` | 事件 id |
| `$action.behaviorId` | 行为 id |
| `$action.itemId` | 物品 id |

示例：`$action.type == 'scene.enter' && $action.sceneId == 'scene_1000'`

### 场景/事件消息（标题右侧滚动）

为支持游戏页标题右侧单行滚动消息，新增以下可选字段：

| 文件 | 字段 | 类型 |
|------|------|------|
| `story-scenes.json` | `scene.messages` | `string[]` |
| `story-events.json` | `event.messages` | `string[]` |

运行时优先级（严格）：

1. 当前场景存在事件上下文时：**只播放事件消息**；
2. 若该事件消息为空：**不回退场景消息**（显示“当前无消息”）；
3. 仅当场景无事件上下文时，播放场景消息。

### 心迹（Journal）入口约定

- 游戏页在“攀谈”和“背包”之间提供“心迹”入口；
- 正文来自 `story-journal.json`，可见性由解锁变量控制；
- 触发在 `rule_0002` 的 `effects` 中使用 `journal.unlock`；
- 编辑：顶栏「心迹」管目录，「规则」管 `setOn` 触发。

## 最小可用示例（可直接作为导出参考）

```twee
:: StoryData
{"characters":[{"id":"merchant","name":"商贩","behaviorLibrary":[{"id":"merchant.b_100","q":"最近生意如何？","a":"勉强糊口。","t":"dialog"}]}],"gameRules":[{"id":"rule_0001","name":"onlyOnce","judgeExpr":"!$entity.is_used","writebackExpr":"$entity.is_used = true"}],"start":"市场"}

:: 市场 {"characterIds":["merchant"]}
你来到集市。
[[继续|End]]
```

## 上游导出常见错误

- 只导出 `story_bundle.json` 的 `character_ids` / `media_cues`，但 `story.tw` passage metadata 未写 `characterIds`；
- `story.tw` 写了 `characterIds`，但 `StoryData.characters` 中人物没有 `behaviorLibrary`；
- `characterIds` 引用的角色 id 与 `StoryData.characters[].id` 不一致。
- `behaviorLibrary[].sceneIds` 引用了不存在的 `scene.id`，导致该对话在任何场景都不会出现。
- 手写 passage 未带 `sceneId`，且 passage id 不符合 `ch{N}.{sceneId}` 格式，导致 `sceneIds` 过滤无法识别当前场景。
- `story-rules.json` 或 `StoryData.gameRules` 中缺少 `rule_0001`，或 `rule_0001` 的 id / 表达式不符合「准入规则约定」。

## 篇幅、段落与分页（轻量互动，默认）

为降低**文字墙**，上游与运行时应同时约束：

1. **块级上限**（`passageBlocks` 中每个 `ai` 的 `wordCount`，及 leading `raw` 字数）  
2. **自动分页阈值**（现有能力，不新增块级分页）  
3. **段落密度**（每段 2–3 句；对白极少）

### 默认配置（手机竖屏、偏轻量互动）

| 项 | 值 |
|----|-----|
| 每 `ai` 块 `wordCount` | **160–220**（推荐 **200**） |
| leading `raw` | ≤220 字，2–3 句 |
| `VITE_PASSAGE_PAGE_CHARS_MIN` / `MAX` | **160** / **220**（引擎与 `.env.example` 默认值） |
| 段落 | 叙述段 2–3 句；对白问答各占一行 |

说明：块按顺序拼接为 passage 后，仍由 `paginatePassageText` 在句号/换行处切分为 `.p_100` 子页。控制块字数 + 分页阈值，使**多数块拼接后约 1–2 屏**，避免整场景一次露出过长正文。

### 上游自检补充（篇幅维度）

- [ ] 每个 `ai` 块已填 `wordCount`（160–220）。
- [ ] 每 scene 仅一个 leading `raw`，无 `raw-ai-raw` 交替。
- [ ] 部署环境分页阈值为 160/220（或与目标体验一致）。
- [ ] 抽检 3 个场景导出正文：无连续超长无换行段；单页约 1 情绪点 + 1 信息点。
- [ ] 对白在 `behaviorLibrary`；正文不重复 leading `raw` 已有台词。
- [ ] 若启用 `rule_0002 setOn`，已覆盖至少一个 `actionRef` 触发并验证变量赋值生效。
- [ ] `journalAppend` 配置了 `onceKey` 的条目，重复触发时不会重复入账。
- [ ] 已验证消息优先级：存在事件时只播放事件消息；事件无消息时不回退场景消息。
