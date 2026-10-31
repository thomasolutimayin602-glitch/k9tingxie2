# 字字有功 · 汉字默写

面向手机和平板的拼音默写应用。包含全量 1–9 年级词语库、逐笔笔顺校验、错题连续订正、学习统计与字帖导出。

## 本地运行

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
npm run preview
```

## Vercel 部署

仓库根目录包含 `vercel.json`。在 Vercel 导入仓库后，使用默认的 `npm run build`，并将 `dist/` 作为输出目录即可。项目固定使用 Node 22.x 和 Vite 8.3.0。

## 账号

- 用户名：`gamer`
- 密码：`Diffraction1`

学习进度保存在浏览器 `localStorage`，升级时会自动迁移旧版 `hanzi-data-gamer` 数据。

## 主要内容

- **全量词库**：1,640 组词语、覆盖 3,594 个独立汉字；常用入门词置顶，其余按 1–9 年级分组。
- **逐笔书写判定**：基于 Hanzi Writer 的笔顺与笔画数校验；点“看提示”可显示描红轮廓。
- **错题闭环**：整词写错进入错词本，单字写错进入错字本；每项必须连续写对 3 遍才标记为已掌握。
- **复习与统计**：按待巩固/已掌握筛选、搜索、批量订正，展示词语与生字覆盖率、连续学习天数和学段进度。
- **导出**：JSON 学习备份、CSV 错题清单、可打印 A4 田字格字帖。

## 笔顺数据

书写判定依赖 Hanzi Writer 字形数据。应用会按以下顺序加载：

1. 部署目录下的 `/hanzi-data/<汉字>.json`（可自行离线放置）
2. jsDelivr / Fastly / unpkg 的 `hanzi-writer-data@2.0.1`

若三者均不可用，练习会切换为“自评模式”，手写后可手动确认，不会卡死页面。

离线部署时，可将 [hanzi-writer-data](https://github.com/chanind/hanzi-writer-data) 中的 JSON 文件放到 `public/hanzi-data/`。

## 第三方组件

`src/vendor/hanzi-writer.esm.js` 为 Hanzi Writer v3.7.3，遵循 MIT 许可，许可文本见 `src/vendor/hanzi-writer.LICENSE`。
