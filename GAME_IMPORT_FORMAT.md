# 游戏文件导入格式说明

导入功能只支持一种格式：`zip` 压缩包。

## 导入规则

- 在“剧情 -> 导入”选择一个 `.zip` 文件。
- 系统会解压该 zip，并将文件写入 `assets/games/{当前游戏ID}/`。
- 写入前会先清空目标游戏目录，然后按压缩包内容重建。
- 因此，导入后该目录中的文件集合与压缩包内文件集合一致（允许缺失部分文件）。

## 压缩包内路径规范

- 推荐直接把游戏文件放在 zip 根目录，例如：
  - `story-fm.json`
  - `story.tw`
  - `story-scenes.json`
  - `story-characters.json`
- 允许子目录（例如 `media/bg/forest.png`），会按相对路径写入目标目录。
- 若压缩包路径带有前缀 `assets/games/<任意ID>/`，导入时会自动去掉该前缀再写入。

## 示例

压缩包结构（推荐）：

```text
my-game.zip
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

导入到当前游戏 `demo` 后：

- `assets/games/demo/story-fm.json`
- `assets/games/demo/story.tw`
- `assets/games/demo/media/beach.mp4`
- 其余文件同理

## 注意事项

- 导入仅支持开发模式（`npm run dev`）。
- 当前游戏 ID 必须合法：`^[a-zA-Z0-9_-]+$`。
- 导入会覆盖（重建）目标目录，请先备份。
