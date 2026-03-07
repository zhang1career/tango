# TA - React Web 文字冒险游戏框架

基于 React + Vite 的网页文字冒险框架，兼容 [Twine](https://twinery.org/) 的 Twee 格式，支持变量、物品、声誉与条件分支。

## 功能

- **Twine 兼容**：支持 Twee 3 格式（`.tw` / `.twee`）
- **变量系统**：`variables` 存储标志位、数值、文本
- **物品系统**：`inventory` 收集、消耗、条件判定
- **声誉系统**：`reputation` 阵营/角色好感度
- **条件链接**：链接后可加条件表达式，未满足时隐藏

## 快速开始

```bash
npm install
cp .env.example .env   # 可选
npm run dev
```

构建：`npm run build`，预览：`npm run preview`。

## 配置

`.env`：

```env
GAME_CONTENT_PATH=assets/story.tw
```

## Twee 格式

### 基础结构

```twee
:: StoryTitle
游戏标题

:: StoryData
{"start": "Start"}

:: Start
你醒来...

[[继续|Next]] [[其他|Other]]
```

### StoryData 初始状态

在 StoryData 的 JSON 中可设置开局变量、物品、声誉：

```twee
:: StoryData
{
  "start": "序章",
  "variables": {"chapter": 1},
  "inventory": [],
  "reputation": {"朝廷": 5}
}
```

### Passage 进入时修改状态

在 passage 标题后加 metadata JSON，支持 `set`、`give`、`take`、`rep`：

```twee
:: 获取令牌 {"give":"令牌"}
你捡起了一块令牌。

[[返回|上一场景]]

:: 军营内 {"rep":{"尔朱荣":2}}
守卫放行，你在军中的声望提升了。
```

- `set`: 修改变量 `{"set":{"visited":true}}`
- `give`: 添加物品 `{"give":"令牌"}` 或 `{"give":["令牌","信物"]}`
- `take`: 移除物品 `{"take":"令牌"}`
- `rep`: 增减声誉 `{"rep":{"尔朱荣":2}}` 表示尔朱荣 +2

### 条件链接

链接后写条件表达式，满足条件才显示该选项：

```twee
[[出示令牌|军营内]] $items has "令牌"
[[离开|城门]]
```

条件表达式支持：

| 表达式 | 说明 |
|--------|------|
| `$items has "物品名"` | 持有该物品 |
| `$var` | 变量为真（非空、非 0、非 false） |
| `$var >= 5` | 变量比较（>=、<=、==、!=、>、<） |
| `$rep.角色名 >= 7` | 声誉比较 |

## 项目结构

```
src/
  config/       # 配置
  engine/       # 解析器、引擎、状态管理、条件求值
  components/   # 游戏 UI
  data/         # 内嵌示例故事
assets/         # 故事源文件
```

## 剧情生成（框架 + AI）

支持「人工编辑剧情框架 → AI 生成剧情内容」工作流：

1. **框架 Schema**：`src/schema/story-framework.ts` 定义剧情框架结构（场景、链接、状态变更、条件等）
2. **示例框架**：`assets/story-framework.example.json` 可编辑
3. **生成脚本**：

```bash
npm run generate:story
# 或指定框架文件：
npx tsx scripts/generate-story.ts assets/story-framework.example.json --output assets/story.tw
```

配置 `.env` 中的 `VITE_AIGC_API_KEY` 后，脚本会调用 AI 生成每个场景的正文；未配置则直接使用框架中的 `summary` 作为正文。

## 扩展

- **远程内容**：`GAME_CONTENT_PATH` 设为 URL，`fetchContent` 会通过 `fetch` 加载

## 与 Twine 的关系

本框架解析 Twee 结构并扩展了条件链接与状态元数据。Twine 官方运行时（Harlowe、SugarCube）通过宏实现变量与逻辑；本框架则用轻量条件语法和 passage metadata 达成类似效果，便于在 Twee 中直接书写。

## 参考资料

- [故事背景和人物介绍](background.md)
- [剧情](plot.md)
- [Twee 3 规范](https://github.com/iftechfoundation/twine-specs/blob/master/twee-3-specification.md)
