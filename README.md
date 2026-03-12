# TA - React Web 文字冒险游戏框架

基于 React + Vite 的网页文字冒险框架，兼容 [Twine](https://twinery.org/) 的 Twee 格式，支持变量、物品、声誉与条件分支。

## 功能

- **Twine 兼容**：支持 Twee 3 格式（`.tw` / `.twee`）
- **变量系统**：`variables` 存储标志位、数值、文本
- **物品系统**：`inventory` 收集、消耗、条件判定
- **声誉系统**：`reputation` 阵营/角色好感度
- **条件链接**：链接后可加条件表达式，未满足时隐藏
- **编辑器**：时间线、地图、人物、事件、物品、元信息（人物属性）一站式编辑

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
VITE_AIGC_API_KEY=xxx   # 可选，用于 AI 生成剧情
```

## 项目结构

```
src/
  config/       # 配置
  engine/       # 解析器、引擎、状态管理、条件求值
  components/   # 游戏 UI 与编辑器
  schema/       # 数据结构定义
  data/         # 内嵌示例故事
{VITE_GAMES_BASE_PATH}/   # 游戏数据，按 gameId 隔离（默认 assets/games）
```

## 扩展

- **远程内容**：游戏数据位于 `GAMES_BASE_PATH/{gameId}/`（默认 assets/games），支持多游戏
- **多媒体**：支持 HTML `<img>`、`<audio>`、`<video>`，以及 SugarCube 宏 `<<image>>`、`<<audio>>`、`<<video>>`。配置 `VITE_MEDIA_BASE_URL` 可将相对路径解析为 CDN 地址

## 参考资料

- [AGENT-GUIDE.md](AGENT-GUIDE.md)：数据结构与编辑接口说明（面向 Agent）
- [故事背景和人物介绍](background.md)
- [剧情](plot.md)
- [Twee 3 规范](https://github.com/iftechfoundation/twine-specs/blob/master/twee-3-specification.md)
