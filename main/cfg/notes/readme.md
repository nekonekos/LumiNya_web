# 笔记 · 子目录示例

这个文件位于 `notes/readme.md`，用来演示：**conf.json 支持嵌套目录**。

在 `conf.json` 里，路径使用 `/` 分隔即可：

```json
{ "path": "notes/readme.md", "type": "md" }
```

前端会把它渲染成资源管理器里的文件夹结构。
