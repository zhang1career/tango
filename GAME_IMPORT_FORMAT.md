# 游戏文件导入格式说明

导入功能只支持一种格式：`zip` 压缩包。

## 导入规则

- 在“剧情 -> 导入”选择一个 `.zip` 文件。
- 压缩包必须且仅能包含一个顶层目录，目录名即 `gameId`。
- 文件路径必须满足 `<gameId>/...`。
- 系统会解压该 zip，并将文件写入 `assets/games/{识别出的gameId}/`。
- 写入前会先清空目标游戏目录，然后按压缩包内容重建。
- **例外**：`assets/games/{gameId}/media-custom/` 会在重建前自动保留，导入完成后恢复，不会被覆盖。
- 因此，导入后除 `media-custom/` 外，目录文件集合与压缩包内文件集合一致（允许缺失部分文件）。

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

## 多媒体文件导入说明

- 导入不限制文件扩展名：只要在 zip 内路径合法（不含 `..`）即可写入目标目录。
- 上游导入媒体固定目录：`<gameId>/media/`（例如 `media/bg/forest.png`）。
- 本地自定义媒体固定目录：`assets/games/{gameId}/media-custom/`（zip 导入不会覆盖该目录）。
- 运行时会严格按字段填写路径解析（例如填写 `media/xxx.png` 就读取 `media/`，填写 `media-custom/xxx.png` 就读取 `media-custom/`）。
- 运行时引用媒体时，建议在相关字段中填写相对路径，例如：
  - `openingAnimation: "media/beach.mp4"`
  - `backgroundMusic: "media/frog.mp3"`
  - `images: ["media/flower.png"]`
- 若使用本地自定义媒体，可填写：
  - `avatar: "media-custom/chars/hero.png"`
  - `backgroundMusic: "media-custom/bgm/custom_theme.mp3"`
- 若项目配置了 `VITE_MEDIA_BASE_URL`，相对路径会按该基地址解析；未配置时将按页面相对地址加载。
- 构建产物会保留游戏目录下的全部文件（包含 `media/` 及其他附加资源）。

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

## 地图节点与场景绑定（默认游戏参考）

当前版本中，**主线场景顺序默认由 `story-fm.json > chapters[].sceneEntries[]` 的顺序驱动**，不再按 `story-maps.json > edges` 自动生成章内跳转。

上游录入时，核心是把这三层数据对齐：

1. **场景落点（scene -> map node）**
   - 文件：`story-scenes.json`
   - 字段：`scene.mapNodeId`
   - 含义：该场景发生在哪个地图节点。

2. **地图连通（map node -> map node）**
   - 文件：`story-maps.json`
   - 字段：`map.edges[].from / to / displayText / condition`
   - 含义：章节边界（跨章）可选校验关系，不再作为章内主线导航来源。

3. **章节使用的场景集合**
   - 文件：`story-fm.json`
   - 字段：`chapters[].sceneEntries[].sceneId`
   - 含义：同一个章节内主线场景的实际播放顺序来源。

### 运行时主线跳转规则（重要）

- 章内主线默认按 `sceneEntries` 顺序生成“继续”链接；
- 只有在章节边界（跨章）且两侧都配置了节点时，才会读取地图边：
  - 前一章要求填写 `endMapNodeId`；
  - 后一章要求填写 `startMapNodeId`；
  - 前一章最后一个主线场景的 `mapNodeId` 必须等于该章 `endMapNodeId`；
  - `story-maps.json` 必须存在 `endMapNodeId -> next.startMapNodeId` 连边；
  - 满足后才生成“前往 下一章”跳转（可合并边条件与目标场景准入条件）。

### 默认游戏中的实际映射（`assets/games/default`）

- `story-scenes.json` 中：
  - `游历市井` 绑定 `xuanyangmen`（宣阳门）
  - `政见纷争` 绑定 `taimiao`（太庙）
  - `寺中祷告` 绑定 `jinglesi`（景乐寺）
  - `河阴丕变` 绑定 `guozixue`（国子学）
- `story-maps.json` 中的边主要用于跨章节点衔接校验，不再直接决定章内跳转选项。

### 上游录入建议（避免常见坑）

- `scene.mapNodeId` 必须填写且能在 `story-maps.json` 的 `nodes[].id` 找到；
- `scene.passageBlocks` 必填，且按数组顺序生成对应 passage 正文（`raw` 透传 + `ai` 生成混排）；
- `scene.passageBlocks` 中每个 `ai` 块都应提供清晰 `summary`（事实性概要：人物、地点、事件、情绪、关键台词），避免模型自由补全导致偏移；
- 章内主线顺序以 `sceneEntries` 为准，不要再依赖地图边表达章内流程；
- 若需要跨章“前往 下一章”，请同时配置 `endMapNodeId`、`next.startMapNodeId` 与对应地图边；
- 支线剧情与地图边解耦，按 `branchOptions` 规则录入（见“支线剧情选项”章节）。

### `story-scenes.json` 里 `passageBlocks` 字段规范（必填）

- 字段位置：`story-scenes.json > scene.passageBlocks`（数组，**必填**）
- 生成规则：按数组顺序拼接为 `story.tw` 对应 passage 正文。
  - `type: "raw"`：`text` 直接透传，不经过模型；
  - `type: "ai"`：调用 OpenAI 兼容接口生成正文片段。
- `ai` 块字段：
  - `summary`（必填）：该块扩写依据；
  - `hints`（可选）：该块风格/语气提示；
  - `wordCount`（可选）：该块目标字数。
- 推荐将一个场景拆成 2-6 个正文块，按“事实片段 -> 扩写片段 -> 事实片段”组织，便于控制叙事节奏。

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
      "hints": "第一人称，短句，压迫感逐步增强",
      "wordCount": 260
    },
    {
      "type": "raw",
      "text": "旁白：若早知终局，是否仍会走向同一条路？"
    }
  ]
}
```

### 上游交付前自检清单（5条）

- [ ] **场景节点完整性**：`story-scenes.json` 中每个参与流程的场景都填写了 `mapNodeId`。
- [ ] **正文块完整性**：每个场景都提供了非空 `passageBlocks[]`，且块顺序符合预期叙事节奏。
- [ ] **AI 块摘要质量**：每个 `type: "ai"` 块都包含明确 `summary`（避免空泛描述）。
- [ ] **节点引用有效性**：所有 `scene.mapNodeId` 都能在 `story-maps.json > nodes[].id` 中找到。
- [ ] **连通可达性**：希望互相可跳转的场景，其 `mapNodeId` 在 `story-maps.json > edges` 中存在连通关系。
- [ ] **章节收录一致性**：`story-fm.json > chapters[].sceneEntries[].sceneId` 已包含需要参与该章节导航的场景。
- [ ] **章节末场景显式可识别**：每章最后一个主线场景必须在 `sceneEntries` 顺序中明确可识别（建议作为该章 `sceneEntries` 末项），避免跨章边界校验歧义。
- [ ] **一节点一主场景**：当前版本避免将多个主流程场景绑定到同一个 `mapNodeId`（多场景同节点分流暂未稳定支持）。

### 支线剧情选项（`story-scenes.json`，用于失败结局分支）

为降低上游与编译链路复杂度，支线剧情统一建模在 `story-scenes.json > scene.branchOptions[]`（仅主线根场景填写）。

#### 设计约束（硬性）

- 支线剧情**只在当前章节内生效**，不产生“进入下一章/返回上一章”线路。
- 说明：`story.tw` 中可能出现“继续”链接（长文本自动分页子页），这属于同一场景内容分页机制，不属于地图导航或章节跳转分支。
- 支线剧情语义是“导向某种失败结局”，且支线末端必须返回其根主线场景。
- 单个支线仅允许 `1-2` 个支线场景；支线场景之间单向连通，不可成环。
- 支线剧情与地图边解耦：支线链接不通过 `story-maps.json > edges` 生成。
- 支线场景 **MUST** 与其根主线场景使用相同 `mapNodeId`（视为同一地点内的分歧）。
- 作为支线场景的 `scene.ruleIds` **MUST** 包含 `rule_0001`（`onlyOnce`）。
- 若某主线场景配置了 `branchOptions`，该主线场景的规则（`chapter.sceneEntries[].ruleIds` 与 `scene.ruleIds`）**MUST NOT** 包含 `rule_0001`。

#### 字段定义（`story-scenes.json > scene.branchOptions[]`）

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 分支选项 id（建议全局唯一） |
| `displayText` | 是 | 主线场景中展示的入口文案 |
| `failureEnding` | 是 | 该分支对应的失败结局标识/描述（供验收与内容治理） |
| `branchSceneIds` | 是 | 支线路径场景 id 数组，长度必须为 `1` 或 `2` |
| `condition` | 否 | 主线 -> 支线入口可见条件表达式 |
| `continueDisplayTexts` | 否 | 支线内部“继续”文案数组；长度应为 `branchSceneIds.length - 1` |
| `returnDisplayText` | 否 | 末端支线场景返回主线根场景的文案（默认 `返回主线`） |

#### 示例（位于 `story-scenes.json`）

```json
{
  "id": "scene_0100",
  "name": "会审前夜",
  "passageBlocks": [{"type": "ai", "summary": "主线正文略"}],
  "branchOptions": [
    {
      "id": "br_confess",
      "displayText": "仓促认罪，换取速断",
      "failureEnding": "名节尽失，民望崩塌",
      "condition": "$will < 40",
      "branchSceneIds": ["scene_0100_b1"],
      "returnDisplayText": "回到会审前夜"
    },
    {
      "id": "br_private_deal",
      "displayText": "私下交易，暂避锋芒",
      "failureEnding": "短期脱身，长期失控",
      "branchSceneIds": ["scene_0100_b2", "scene_0100_b3"],
      "continueDisplayTexts": ["继续掩盖"],
      "returnDisplayText": "硬着头皮回到主线"
    }
  ]
}
```

配套约束示例（支线场景必须 onlyOnce）：

```json
{
  "id": "scene_0100_b2",
  "name": "密室交易",
  "passageBlocks": [{"type": "ai", "summary": "失败分支正文略"}],
  "ruleIds": ["rule_0001"]
}
```

#### 从 `*.json` 到 `story.tw` 的编译规则

- 编译器会把 `branchOptions` 翻译为 passage 间链接：
  - 主线根场景 -> `branchSceneIds[0]`（文案=`displayText`，条件=`condition` 与目标场景准入条件按 `and` 合并）
  - 若 `branchSceneIds` 有第 2 个场景：第 1 个支线场景 -> 第 2 个支线场景（文案取 `continueDisplayTexts[0]` 或默认 `继续`）
  - 末端支线场景 -> 主线根场景（文案取 `returnDisplayText` 或默认 `返回主线`）
- 作为支线场景的 passage，默认不再从 `map.edges` 自动生成导航链接（避免与支线约束冲突）。
- 若章节终点场景恰好是支线场景，编译器不会为其注入跨章“前往下一章”链接。
- 支线末端场景会自动附加“失败结局模板文案”（由 `failureEnding` 填充），并可套用统一失败结局媒体预设（见下文 `story-features.json`）。
- 任一约束不满足（例如：`branchSceneIds` 超过 2、支线场景缺少 `rule_0001`、主线根场景使用了 `rule_0001`）时，编译会报错并中止。

#### 失败结局模板与统一媒体预设（`story-features.json`）

可选在 `story-features.json` 提供 `branchFailureEnding` 配置，让所有支线失败结局使用统一背景图/BGM，同时保留每个分支自定义失败文案。

```json
{
  "battle": {
    "backgroundMusic": "media/bgm/battle_theme.mp3"
  },
  "branchFailureEnding": {
    "backgroundMusic": "media/bgm/failure_common.mp3",
    "images": ["media/bg/failure_common.png"],
    "template": "【失败结局】{{failureEnding}}\n\n你暂时偏离了主线目标。"
  }
}
```

模板占位符：

- `{{failureEnding}}`：取自 `branchOptions[].failureEnding`
- `{{rootSceneName}}`：根主线场景名
- `{{branchOptionId}}`：分支选项 id

#### 上游交付前自检（支线维度）

- [ ] 每个 `branchOptions[].branchSceneIds` 仅包含当前章节已收录的场景 id。
- [ ] 每个 `branchOptions[].branchSceneIds` 长度为 `1-2` 且无重复 id。
- [ ] 每个支线场景与根主线场景使用同一 `mapNodeId`。
- [ ] 每个支线场景 `scene.ruleIds` 均包含 `rule_0001`。
- [ ] 配置 `branchOptions` 的主线根场景，未在 `scene.ruleIds` 或 `sceneEntries[].ruleIds` 中使用 `rule_0001`。
- [ ] 支线末端已设置可回到根主线场景（显式或使用默认 `returnDisplayText`）。

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

本节为上游内容生成方的**硬性契约**。约定大于实现：运行时只识别 id 为 `rule_0001` 的规则，**不会**根据 `judgeExpr` / `writebackExpr` 的语义自动匹配其他 id。

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

## 篇幅、段落与分页建议（建议纳入上游规范）

为降低阅读压力（尤其是“短视频化节奏”的交互小说/轻量 RPG），建议上游在导出时同时约束三层尺度：

1. **场景总字数**（控制单场信息体量）  
   - 字段：`story-scenes.json > scene.passageBlocks[].wordCount`（仅 `type: "ai"` 块生效）
   - 说明：建议按块配置字数目标，再由多个块累加得到场景总量。

2. **每页字数范围**（控制单页阅读负担）  
   - 环境变量：`VITE_PASSAGE_PAGE_CHARS_MIN` / `VITE_PASSAGE_PAGE_CHARS_MAX`
   - 默认值：`300 / 500`
   - 说明：正文会自动分页为主 passage + `继续` 子页（如 `.p_100/.p_200`）。

3. **信息分布密度**（控制节奏与停留时长）  
   - 建议每页只承载 1 个核心情绪点 + 1 个新信息点，避免单页塞入过多背景解释。

### 推荐区间（按体验目标）

- **短视频感（强节奏）**
  - `wordCount`: `250-450` / 场景
  - `VITE_PASSAGE_PAGE_CHARS_MIN`: `120`
  - `VITE_PASSAGE_PAGE_CHARS_MAX`: `220`
  - 预期：单场约 3-6 页，节奏快，阅读压力低

- **平衡叙事（默认推荐）**
  - `wordCount`: `400-700` / 场景
  - `VITE_PASSAGE_PAGE_CHARS_MIN`: `160`
  - `VITE_PASSAGE_PAGE_CHARS_MAX`: `280`
  - 预期：单场约 3-5 页，叙事与节奏平衡

- **剧情深读（文本向）**
  - `wordCount`: `700-1200` / 场景
  - `VITE_PASSAGE_PAGE_CHARS_MIN`: `220`
  - `VITE_PASSAGE_PAGE_CHARS_MAX`: `360`
  - 预期：单场约 4-7 页，适合重剧情用户

### 上游自检补充（篇幅维度）

- [ ] 所有 `type: "ai"` 正文块已按需要填写 `wordCount`（避免“默认无限制生成”）。
- [ ] 已根据目标体验配置分页阈值（`VITE_PASSAGE_PAGE_CHARS_MIN/MAX`）。
- [ ] 实际产物抽检 3 个场景：无“单页超长墙文本”，每页信息点数量可控。
