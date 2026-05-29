# 游戏文件导入格式说明

导入功能只支持一种格式：`zip` 压缩包。

## 导入规则

- 在“剧情 -> 导入”选择一个 `.zip` 文件。
- 压缩包必须且仅能包含一个顶层目录，目录名即 `gameId`。
- 文件路径必须满足 `<gameId>/...`。
- 系统会解压该 zip，并将文件写入 `assets/games/{识别出的gameId}/`。
- 写入前会先清空目标游戏目录，然后按压缩包内容重建。
- 因此，导入后该目录中的文件集合与压缩包内文件集合一致（允许缺失部分文件）。

## 压缩包内路径规范

- 推荐使用 `<gameId>/...` 结构（最清晰），例如：
  - `my-game/story-fm.json`
  - `my-game/story.tw`
  - `my-game/story-scenes.json`
  - `my-game/story-characters.json`
- 允许子目录（例如 `media/bg/forest.png`），会按相对路径写入目标目录。
- 一个压缩包只能包含一个 `gameId` 目录；包含多个会报错。

## 多媒体文件导入说明

- 导入不限制文件扩展名：只要在 zip 内路径合法（不含 `..`）即可写入目标目录。
- 建议将图片/音频/视频统一放在 `<gameId>/media/` 目录下，便于管理（也可使用任意子目录）。
- 运行时引用媒体时，建议在相关字段中填写相对路径，例如：
  - `openingAnimation: "media/beach.mp4"`
  - `backgroundMusic: "media/frog.mp3"`
  - `images: ["media/flower.png"]`
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
  - `story-items.json > item.images[]`：物品配图（背包查看）
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

本项目里“场景顺序”不是硬编码线性列表，而是通过**地图节点连通 + 玩家在节点间移动**来驱动。

上游录入时，核心是把这三层数据对齐：

1. **场景落点（scene -> map node）**
   - 文件：`story-scenes.json`
   - 字段：`scene.mapNodeId`
   - 含义：该场景发生在哪个地图节点。

2. **地图连通（map node -> map node）**
   - 文件：`story-maps.json`
   - 字段：`map.edges[].from / to / displayText / condition`
   - 含义：玩家在地图上的可移动关系。

3. **章节使用的场景集合**
   - 文件：`story-fm.json`
   - 字段：`chapters[].sceneEntries[].sceneId`
   - 含义：同一个章节内，哪些场景参与“节点移动 -> 场景跳转”的计算。

### 运行时如何从“地图移动”得到“场景跳转”

- 当前场景先根据 `mapNodeId` 找到自己所在地图节点；
- 读取该节点的可达节点（默认实现会同时考虑 `from -> to` 和反向入边）；
- 对每个可达节点，查找“本章节中 `mapNodeId` 命中该节点”的目标场景；
- 只有找到目标场景时，才会生成可点击跳转选项；
- 若某条边有 `condition`，会并入该跳转的可见条件；
- 跳转文案优先取边的 `displayText`，否则回退为目标节点名（并补 `前往 ` 前缀）。

### 默认游戏中的实际映射（`assets/games/default`）

- `story-scenes.json` 中：
  - `游历市井` 绑定 `xuanyangmen`（宣阳门）
  - `政见纷争` 绑定 `taimiao`（太庙）
  - `寺中祷告` 绑定 `jinglesi`（景乐寺）
  - `河阴丕变` 绑定 `guozixue`（国子学）
- `story-maps.json` 中可见：
  - `xuanyangmen -> taimiao`，因此可从“宣阳门场景”进入“太庙场景”
  - `jinglesi -> taimiao`、`jinglesi -> guozixue`，因此“景乐寺场景”可进入“太庙/国子学场景”
  - 默认实现支持沿入边反向移动，所以也会出现从 `taimiao` 回 `jinglesi`、从 `guozixue` 回 `jinglesi` 的场景跳转

### 上游录入建议（避免常见坑）

- `scene.mapNodeId` 必须填写且能在 `story-maps.json` 的 `nodes[].id` 找到；
- `scene.summary` 建议填写为该场景的**事实性概要**（人物、地点、事件、情绪、关键台词），作为“剧情 > 章节 > 场景 > 生成游戏”时 AI 生成正文的主依据；
- `scene.summary` 若缺失或过短，会导致 `story.tw` 对应 passage 正文更依赖模型自由补全，稳定性和可控性都会下降；
- 要让 A 场景能去 B 场景，本质是让 `A.mapNodeId` 与 `B.mapNodeId` 在地图边上连通；
- 如果连了边但目标节点没有任何场景，运行时不会生成该跳转；
- 当前实现尚未完整处理“同一地图节点对应多个场景”的分流，上游暂按**一个节点一个主场景**录入最稳妥。

### `story-scenes.json` 里 `summary` 字段建议写法

- 字段位置：`story-scenes.json > scene.summary`（字符串，必填建议）
- 用途：用于生成 `story.tw` 中该场景对应 passage 的正文草稿；不是运行时跳转条件字段，但会显著影响生成文本质量。
- 推荐包含（3-6 句）：
  - 场景发生地点与时间（或时代氛围）
  - 本场出场关键人物及关系
  - 本场核心事件（发生了什么）
  - 玩家视角能感知的冲突/目标
  - 1-2 句关键对白或语气示例（可选）
- 不建议：
  - 只写“在某地发生一些事”这种空泛描述
  - 引入与本章无关的大量新设定（会放大 AI 演义偏差）

### 上游交付前自检清单（5条）

- [ ] **场景节点完整性**：`story-scenes.json` 中每个参与流程的场景都填写了 `mapNodeId`。
- [ ] **节点引用有效性**：所有 `scene.mapNodeId` 都能在 `story-maps.json > nodes[].id` 中找到。
- [ ] **连通可达性**：希望互相可跳转的场景，其 `mapNodeId` 在 `story-maps.json > edges` 中存在连通关系。
- [ ] **章节收录一致性**：`story-fm.json > chapters[].sceneEntries[].sceneId` 已包含需要参与该章节导航的场景。
- [ ] **一节点一主场景**：当前版本避免将多个主流程场景绑定到同一个 `mapNodeId`（多场景同节点分流暂未稳定支持）。

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
   - 字段：`story-fm.json > chapters[].sceneEntries[].wordCount`
   - 说明：点击“剧情 -> 章节 -> 场景 -> 生成游戏”时，若该字段为空，模型不带字数约束；建议上游显式填写。

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

- [ ] 所有参与生成的 `sceneEntry` 已填写 `wordCount`（避免“默认无限制生成”）。
- [ ] 已根据目标体验配置分页阈值（`VITE_PASSAGE_PAGE_CHARS_MIN/MAX`）。
- [ ] 实际产物抽检 3 个场景：无“单页超长墙文本”，每页信息点数量可控。
