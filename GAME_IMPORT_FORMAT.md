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
