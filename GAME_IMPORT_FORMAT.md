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
        └── flower.png
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

为确保“场景中点人物 -> 出现该人物对话集”生效，上游导出需要满足下面两层绑定：

1. **场景绑定人物**：在 `story.tw` 的 passage metadata 使用 `characterIds`（驼峰）；
2. **人物绑定对话集**：在 `StoryData` 的 `characters[].behaviorLibrary` 提供行为列表。

### 运行时读取来源（很重要）

- 当前前端运行时通过 `story.tw` 加载故事（`StoryData + passage metadata`）。
- `story_bundle.json` 可以保留用于其他链路，但**不会直接驱动前端人物对话弹窗**。

### 1) 场景绑定人物（passage metadata）

在对应 passage 标题后附加 JSON metadata，字段名必须是 `characterIds`：

```twee
:: 京师七年 {"characterIds":["emperor_dg"],"eventIds":["evt_02"]}
```

- `characterIds` 必须是字符串数组；
- 数组中的 id 必须能在 `StoryData.characters` 中找到对应人物。

### 2) 人物绑定对话集（StoryData.characters[].behaviorLibrary）

在 `:: StoryData` 的 JSON 里，每个可互动人物应带 `behaviorLibrary`：

```json
{
  "id": "emperor_dg",
  "name": "道光帝",
  "behaviorLibrary": [
    {
      "id": "emperor_dg.b_100",
      "q": "皇上如何看待当前民情？",
      "a": "朕自有权衡，亦需顾及朝局。",
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

> 若 `behaviorLibrary` 缺失或为空，人物可显示但弹窗会是“暂无可用行为”。

## 最小可用示例（可直接作为导出参考）

```twee
:: StoryData
{"characters":[{"id":"merchant","name":"商贩","behaviorLibrary":[{"id":"merchant.b_100","q":"最近生意如何？","a":"勉强糊口。","t":"dialog"}]}],"gameRules":[],"start":"市场"}

:: 市场 {"characterIds":["merchant"]}
你来到集市。
[[继续|End]]
```

## 上游导出常见错误

- 只导出 `story_bundle.json` 的 `character_ids` / `media_cues`，但 `story.tw` passage metadata 未写 `characterIds`；
- `story.tw` 写了 `characterIds`，但 `StoryData.characters` 中人物没有 `behaviorLibrary`；
- `characterIds` 引用的角色 id 与 `StoryData.characters[].id` 不一致。
