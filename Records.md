# 实现记录（Records）

## [2026-02-08] M0.12 子任务交互增强立项与计划落盘
- **What（做了什么）**：
  - 基于 `Docs/NEW_FEATURES.md` 第 1 节完成执行前澄清，并将决策同步到根目录 `PRD.md`。
  - 在 `plan.md` 新增 `M0.12` 里程碑，拆分 #1.1~1.3 的详细 checklist、执行步骤、验收标准与依赖关系。
  - 新建 `PROJECT_STATUS.md` 与 `Records.md`，补齐项目文档体系。
- **Why（为什么这么做）**：
  - 按规则先完成需求边界与计划确认，降低执行阶段反复返工风险。
  - 保证后续编码阶段可“按清单推进 + 对照验收”。
- **How（怎么实现的）**：
  - 阅读并对齐现有代码实现（`TaskDetail`、`StickyView`、`TaskLinkNode`、`App`、`tasksRepo` 等）。
  - 将你确认的关键决策（NEW_FEATURES 为准、内联卡片、双窗口一致、不支持同名、双标题栏可编辑、引用全量同步）写入 `PRD.md` 与 `plan.md`。
- **已知限制**：
  - 本记录仅覆盖“澄清 + 文档 + 计划”，尚未进入代码实现。
- **关联假设**：
  - 无（本轮关键边界已由用户明确决策）。

## [2026-02-08] M0.12 子任务交互增强（1.1~1.3）实现
- **What（做了什么）**：
  - 完成 `taskLink` 内联卡片化升级：新增 checkbox、完成态划线、`Library`/`Sticky` 一致样式。
  - 打通链接块 checkbox ↔ 任务完成状态 ↔ 任务树展示的双向同步链路。
  - 打通 markdown checkbox 与子任务完成状态的双向同步（关联项生效，非关联项不影响）。
  - 新增 `Library` 详情页顶部标题与 `Sticky` 顶部标题双击重命名能力。
  - 完成重命名联动：同步更新正文 `taskLink` 标题、关联 markdown checkbox 文本、sticky 书签标题。
  - 增加任务标题唯一性校验（创建/重命名全链路提示），阻止新增同名任务。
  - 增加 `taskBlocksSync` 逻辑与单元测试。
- **Why（为什么这么做）**：
  - 满足 `Docs/NEW_FEATURES.md` 1.1~1.3 的交付目标，并保证“可编辑入口多、状态一致性强”。
  - 通过统一同步逻辑减少多窗口/多入口状态漂移。
- **How（怎么实现的）**：
  - 共享同步层：新增 `src/shared/taskBlocksSync.ts`，负责解析 blocks diff 与回写引用内容。
  - 主进程：`src/main/ipc/handlers.ts` 在 `task:update` 前后插入同步逻辑，联动更新父任务 blocks 与书签。
  - 数据层：`src/main/db/tasksRepo.ts` 增加标题唯一性查询与父任务查询能力；`src/main/windowManager.ts` 与 `src/main/db/windowStateRepo.ts` 增加书签标题存储回写。
  - 渲染层：
    - `src/renderer/components/TaskLinkNode.ts` 扩展 `isCompleted` 属性与 checkbox 渲染。
    - `src/renderer/components/TaskDetail.tsx`、`src/renderer/components/StickyView.tsx` 增加链接块 checkbox 点击同步与顶部标题重命名。
    - `src/renderer/App.tsx` 统一封装 `validateUniqueTitle`、`renameTask`、`toggleLinkedTaskComplete`。
    - `src/renderer/styles/app.css` 更新卡片化样式。
  - 测试：新增 `src/renderer/utils/__tests__/taskBlocksSync.test.ts`。
- **已知限制**：
  - 唯一性当前采用全库未删除任务范围，若后续只要求“同父级唯一”需调整校验策略。
  - markdown 映射为完全匹配，不做模糊匹配。
- **关联假设**：
  - `[2026-02-08/M0.12] 任务标题唯一性按“全库未删除任务”校验`
  - `[2026-02-08/M0.12] 关联 markdown checkbox 采用“标题完全匹配 + 独占匹配”`

## [2026-02-08] M0.12-R1 完成态实时同步修复（latest-write-wins）
- **What（做了什么）**：
  - 修复 `task checkbox` 与主窗口任务树在快速切换时的状态回退/延迟问题。
  - 在 `App` 中为 `loadTask` 与 `refreshLibrary` 增加请求序号保护，避免旧请求晚到覆盖新状态。
  - 在 `TaskDetail` 与 `StickyView` 移除“编辑器聚焦时禁止回写 blocks”的限制，确保跨窗口完成态变更立即渲染。
- **Why（为什么这么做）**：
  - 现网存在并发刷新与异步回包竞态，导致“最新一次用户勾选”偶发被旧数据覆盖，造成体感不同步。
- **How（怎么实现的）**：
  - `src/renderer/App.tsx`：新增 `loadTaskRequestIdRef`、`refreshLibraryRequestIdRef`，仅允许最新请求落库到 Zustand。
  - `src/renderer/components/TaskDetail.tsx`：统一按 `blocks` 差异回写编辑器内容，不再受 `editor.isFocused` 阻断。
  - `src/renderer/components/StickyView.tsx`：与 `TaskDetail` 采用一致策略，保证 sticky 与主窗口行为一致。
- **已知限制**：
  - 高频远端同步时，编辑器仍可能发生位置轻微跳动（由 `setContent` 触发），后续可评估做最小差异 patch 以优化体验。
- **关联假设**：
  - 无新增假设。

## [2026-02-08] M0.12-R2 重命名后 taskLink 样式保留修复
- **What（做了什么）**：
  - 修复“任务树重命名后，父任务中的子任务链接块退化为纯文本”的问题。
  - 调整 `syncChildStateInBlocks`：当 `taskItem` 内存在目标子任务的 `taskLink` 时，不再执行纯文本替换，只同步 `taskLink` 属性与 `checked` 状态。
  - 新增回归测试，覆盖 `taskItem` 内嵌 `taskLink` 的重命名场景。
- **Why（为什么这么做）**：
  - 原逻辑按标题匹配直接重写 `taskItem` 段落文本，会意外抹掉已有 `taskLink` 节点结构，导致 UI 样式丢失与交互退化。
- **How（怎么实现的）**：
  - `src/shared/taskBlocksSync.ts`：新增 `taskItemContainsTaskLink` 检测，区分“文本映射”与“链接映射”路径。
  - `src/shared/taskBlocksSync.ts`：在 `taskItem` 分支中改为“存在链接时仅同步 checked，不做文本替换”。
  - `src/renderer/utils/__tests__/taskBlocksSync.test.ts`：新增“重命名时保留 taskItem 内 taskLink 节点样式”测试。
- **已知限制**：
  - 复杂混合文本（`taskLink + 自由文本`）仍按当前简化规则同步，后续可按需要增加更细粒度编辑策略。
- **关联假设**：
  - 无新增假设。
