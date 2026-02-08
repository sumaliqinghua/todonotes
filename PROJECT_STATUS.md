# 项目现状（最后更新：2026-02-08）

## 项目概述
- 当前处于 M0.12 立项阶段：已完成“子任务交互增强（1.1~1.3）”需求澄清与执行计划落盘，待进入编码实现。

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

## 当前进度
- 已完成：M0 ~ M0.11。
- 进行中：M0.12（子任务交互增强 #1.1~1.3）已完成澄清与计划，等待执行。
- 待开始：M1 ~ M4。

## 已知问题 & 技术债
- `taskLink` 仍为基础展示，尚未支持卡片化 checkbox 双向同步。
- markdown checkbox 与子任务关联同步尚未落地。
- 子任务同名约束尚未建立。

## 关键配置 & 环境信息
- 包管理：npm（含 `npm run dev` / `npm run test`）。
- 主要本地数据：SQLite（`tasks`、`edges`、`window_states`、`tasks_fts`）。
- IPC 关键事件：`task:updated`、`task:deleted`、`window:settings-updated`、`window:sticky-shared-updated`。
