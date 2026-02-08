# 项目现状（最后更新：2026-02-08）

## 项目概述
- 当前已完成 M0.12 + M0.12-R1 + M0.12-R2 + M0.12-R3 + M0.12-R4：子任务交互增强、实时同步、样式保留修复、checkbox 视觉统一与便签书签可移除修复均已落地。

## 技术架构
- 当前使用的技术栈、框架版本
  - 主进程：Electron + TypeScript
  - 渲染层：React 18 + Zustand
  - 编辑器：Tiptap（StarterKit + TaskList + TaskItem + 自定义 `taskLink` 节点）
  - 数据层：better-sqlite3 + SQLite FTS5
- 核心架构设计（简要描述）
  - 任务数据主存于 `tasks`，父子关系由 `edges` 独立维护，正文链接块仅作入口展示。
  - `Library` 与 `Sticky` 双窗口并行，依赖 IPC + 广播事件同步状态。
- 关键目录结构
  - `src/main/`：IPC、窗口管理、数据库仓储
  - `src/renderer/`：UI 组件、编辑器交互、应用状态
  - `src/shared/`：跨进程类型与 IPC 契约
  - 根目录文档：`PRD.md`、`plan.md`、`ASSUMPTIONS.md`、`PROJECT_STATUS.md`、`Records.md`

## 已完成功能
- P0 主流程：任务树管理、搜索、编辑器基础块、块转子任务、链接块导航。
- 多窗口与 sticky 状态共享：路径化打开、共享书签/皮肤、窗口状态恢复。
- 回收站递归删除/恢复、归档与完成状态管理。
- 子任务交互增强（M0.12）：
  - 链接块内联卡片化（含 checkbox、完成划线）
  - 链接块 checkbox 与任务完成态双向同步
  - markdown checkbox 与子任务完成态双向同步（关联项）
  - `Library` 详情页与 `Sticky` 顶部标题可双击重命名
  - 重命名后同步更新 taskLink、关联 markdown checkbox、sticky 书签标题
  - 任务标题唯一性校验（创建/重命名）
- 完成态同步一致性修复（M0.12-R1）：
  - `loadTask` / `refreshLibrary` 请求竞态保护（仅最新响应生效）
  - 编辑器聚焦态下也实时回写远端完成态变更（Library/Sticky 一致）
- 重命名样式保留修复（M0.12-R2）：
  - 修复 `taskItem` 内 `taskLink` 在重命名同步时被降级为纯文本的问题
  - 保证任务树重命名后父任务正文仍保持链接块卡片样式与可点击能力
- checkbox 视觉统一修复（M0.12-R3）：
  - `taskLink` checkbox 去除黑底白勾的自绘风格，恢复系统默认 checkbox 外观
  - `Library` 与 `Sticky` 两个场景保持一致视觉
- 便签书签可移除修复（M0.12-R4）：
  - sticky 根任务书签仅在首次无书签时默认注入，后续允许用户手动删除
  - 修复点击 `×` 删除后被主进程强制回填的问题

## 当前进度
- 已完成：M0 ~ M0.11。
- 已完成：M0.12（子任务交互增强 #1.1~1.3）、M0.12-R1（完成态实时同步修复）、M0.12-R2（重命名样式保留修复）、M0.12-R3（checkbox 视觉统一）、M0.12-R4（便签根任务书签可移除）。
- 待开始：M1 ~ M4。

## 已知问题 & 技术债
- 当前标题唯一性采用全库未删除任务范围；若后续需切换为“同父级唯一”，需调整校验与同步映射策略。
- markdown checkbox 关联为“标题完全匹配”；复杂文本或模糊匹配场景未覆盖。

## 关键配置 & 环境信息
- 包管理：npm（含 `npm run dev` / `npm run test`）。
- 主要本地数据：SQLite（`tasks`、`edges`、`window_states`、`tasks_fts`）。
- IPC 关键事件：`task:updated`、`task:deleted`、`window:settings-updated`、`window:sticky-shared-updated`。
