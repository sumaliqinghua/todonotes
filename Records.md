# 实现记录（Records）

## [2026-03-05] M0.13-R17 便签右键显示/隐藏已打钩 checkbox 文本块
- **What（做了什么）**：
  - 在 sticky 右键菜单新增“显示已打钩checkbox文本块 / 隐藏已打钩checkbox文本块”切换项。
  - 新增便签视图样式开关，关闭时隐藏已打钩的 checkbox 文本块，开启时恢复显示。
  - 完成回归测试验证（`npm run test` 通过）。
- **Why（为什么这么做）**：
  - 便签编辑场景中，已完成项会干扰当前聚焦；提供一键隐藏可提升“只看未完成项”的处理效率。
- **How（怎么实现的）**：
  - `src/renderer/components/StickyView.tsx`：新增 `showCheckedCheckboxBlocks` 状态，并在 `handleContextMenu` 菜单项中接入切换动作。
  - `src/renderer/components/StickyView.tsx`：在便签根容器按状态挂载 `sticky-hide-checked-blocks` 类名。
  - `src/renderer/styles/app.css`：新增规则，命中 `sticky-hide-checked-blocks` 时隐藏 `taskList` 下 `data-checked="true"` 的项。
- **已知限制**：
  - 当前开关为便签窗口内存态，重启窗口后会恢复默认“显示”。
- **关联假设**：
  - 无。

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

## [2026-02-08] M0.12-R3 taskLink checkbox 视觉对齐系统默认样式
- **What（做了什么）**：
  - 调整 `taskLink` 内 checkbox 样式，去掉自绘外观（黑底 + 白勾），恢复为系统默认 checkbox 视觉。
  - 保持 `Library` 与 `Sticky` 两个场景下的 checkbox 外观一致。
- **Why（为什么这么做）**：
  - 当前自绘 checkbox 与普通任务 checkbox 风格不一致，影响视觉统一性与可读性。
- **How（怎么实现的）**：
  - `src/renderer/styles/app.css`：在 `.task-link-checkbox` 中改为 `appearance: auto`、`-webkit-appearance: checkbox`、`accent-color: auto`。
  - `src/renderer/styles/app.css`：将 `.sticky-surface .task-link-checkbox` 的强制强调色改为 `auto`，避免便签场景出现深色定制勾选样式。
  - 运行 `npm run test` 完成回归验证（10/10 通过）。
- **已知限制**：
  - 不同操作系统对默认 checkbox 的细节渲染存在差异（尺寸/边角/勾形），但风格会与系统原生控件保持一致。
- **关联假设**：
  - 无新增假设。

## [2026-02-08] M0.12-R4 便签根任务书签可移除修复
- **What（做了什么）**：
  - 修复便签书签栏中“默认父任务书签点击 `×` 后会被立即加回，无法删除”的问题。
  - 调整 sticky 书签初始化策略：仅在“首次无任何书签”时注入根任务书签，后续允许用户移除并保持为空。
- **Why（为什么这么做）**：
  - 现有逻辑在多个持久化/同步路径都强制执行“根任务书签保底存在”，导致用户删除操作被覆盖，和预期不符。
- **How（怎么实现的）**：
  - `src/main/windowManager.ts`：将 `ensureRootTaskBookmark` 替换为 `getInitialStickyBookmarks`，仅用于首次初始化默认书签。
  - `src/main/windowManager.ts`：`pickSharedStickyPatch` 不再自动补回根任务书签，尊重前端传入的删除结果。
  - `src/main/windowManager.ts`：关闭窗口、更新状态、标题替换后的持久化流程均改为直接写入当前书签数组，不再强制回填根任务。
  - 运行 `npm run test` 完成回归验证（10/10 通过）。
- **已知限制**：
  - 该修复只针对 sticky 书签“可删除性”与“首次默认注入”策略，不改变其它共享同步机制。
- **关联假设**：
  - 无新增假设。

## [2026-02-08] M0.13（1.4~1.7）子任务交互扩展首轮落地
- **What（做了什么）**：
  - 实现“插入已有子任务链接”（1.4）：支持在详情页/便签右键菜单插入当前父任务已有子任务的链接入口。
  - 实现“拖拽子任务改层级”（1.5）：任务树支持拖到某节点作为子级，或拖到空白区成为根级。
  - 实现“移动子任务引用”（1.6）：`taskLink` 右键新增“移动到...”，支持从当前父任务移动到目标父任务，并同步更新原/目标正文链接。
  - 实现“一键归档已完成子任务”（1.7）：详情页按钮 + 便签工具按钮触发批量归档，归档后自动清理父任务正文相关链接。
  - 补充 blocks 工具函数与测试：新增 taskLink 追加/删除能力及对应单测。
- **Why（为什么这么做）**：
  - 按 `Docs/NEW_FEATURES.md` 1.4~1.7 直接补齐“子任务入口恢复、层级调整、跨父移动、正文瘦身”四个高频管理动作，减少手工维护成本。
- **How（怎么实现的）**：
  - 共享逻辑：`src/shared/taskBlocksSync.ts` 新增 `appendTaskLinkToBlocksEnd`、`removeTaskLinksByTaskId`、`hasTaskLinkByTaskId`。
  - IPC 契约：`src/shared/ipc.ts` 新增 `task:listChildrenFlat`、`task:listParents`、`task:insertExistingChildLink`、`task:moveChildReference`、`task:archiveCompletedChildren`、`edge:reparent`。
  - 主进程：
    - `src/main/ipc/handlers.ts` 新增 1.4~1.7 对应 handler 与 `assertValidParenting` 防循环校验。
    - `src/main/db/tasksRepo.ts` 新增 `listChildTasksByCreatedAt`。
    - `src/main/db/edgesRepo.ts` 新增 `deleteEdgesByChildId` 供重挂接使用。
  - 渲染层：
    - `src/renderer/App.tsx` 新增选择子任务/父任务、插入链接、移动引用、批量归档、拖拽重挂接逻辑。
    - `src/renderer/components/TaskDetail.tsx`、`src/renderer/components/StickyView.tsx` 增加“插入已有子任务链接”“移动到...”及归档入口。
    - `src/renderer/components/LibraryPanel.tsx` 新增拖拽交互。
    - `src/renderer/styles/app.css` 新增拖拽落点高亮样式。
  - 测试：`src/renderer/utils/__tests__/taskBlocksSync.test.ts` 从 6 条扩展到 9 条，覆盖插入/幂等/删除引用。
- **已知限制**：
  - 当前选择交互基于输入序号/完整标题（非可视化搜索列表）。
  - 拖拽先支持“作为子级/根级”两种层级变更，不含同级前后排序。
  - 归档操作保留 `edges` 关系，仅移除正文链接块。
- **关联假设**：
  - `[2026-02-08/M0.13] 子任务选择流程先使用“序号/完整标题输入”`
  - `[2026-02-08/M0.13] 任务树拖拽目标先支持“作为子级”与“拖回根级”`
  - `[2026-02-08/M0.13] 归档已完成子任务不删除父子边，仅做“子任务归档 + 父正文移除链接”`

## [2026-02-09] M0.13-R1 插入子任务改下拉 + 归档入口迁移
- **What（做了什么）**：
  - 将“插入已有子任务链接”从输入弹窗改为顶部下拉选择，详情页与便签页统一。
  - 移除任务详情页顶部“归档已完成子任务”按钮。
  - 将“归档已完成子任务”迁移到任务树右键菜单。
- **Why（为什么这么做）**：
  - 用户要求交互与“兄弟级面包屑下拉”一致，减少输入负担。
  - 归档动作更适合放在任务树管理入口，避免详情页顶部控件拥挤。
- **How（怎么实现的）**：
  - 新增 `src/renderer/components/TaskPickerDropdown.tsx`，复用 `breadcrumb-popover` 风格实现浮层下拉。
  - `src/renderer/components/TaskDetail.tsx`：顶部接入 `TaskPickerDropdown`；移除右键中的“插入已有子任务链接”快捷动作，避免绕过下拉。
  - `src/renderer/components/StickyView.tsx`：顶部 controls 接入 `TaskPickerDropdown`（light 变体）；移除 sticky 顶部归档按钮。
  - `src/renderer/App.tsx`：新增 `loadInsertableChildren` 与参数化 `insertExistingChildLink(childId)`；任务树右键菜单新增“归档已完成子任务”。
  - 验证：`tsc`（main/preload/renderer）+ `npm run test` 全部通过。
- **已知限制**：
  - 便签右键菜单仍保留“插入已有子任务链接”入口，但当前实现会默认选首项（后续可按需要完全移除该右键项）。
- **关联假设**：
  - `[2026-02-08/M0.13] 子任务选择流程先使用“序号/完整标题输入”（已推翻）

## [2026-02-09] M0.13-R2 兄弟级下拉过滤已删除/已归档任务
- **What（做了什么）**：
  - 调整面包屑兄弟级下拉的数据查询与结果过滤，排除已删除/已归档任务。
- **Why（为什么这么做）**：
  - 保持兄弟级跳转列表聚焦“可操作的进行中任务”，避免无效跳转项干扰。
- **How（怎么实现的）**：
  - `src/renderer/components/Breadcrumb.tsx`：`task:listChildren` 与 `task:listRoots` 查询参数统一改为 `includeArchived: false`、`includeDeleted: false`。
  - `src/renderer/components/Breadcrumb.tsx`：本地过滤条件补充 `!task.isArchived && !task.isDeleted`。
  - 回归验证：`tsc`（main/preload/renderer）+ `npm run test` 全通过。
- **已知限制**：
  - 若未来希望在下拉中显示“已归档”分组入口，需要在当前过滤基础上增加显式分组 UI。
- **关联假设**：
  - 无新增假设。

## [2026-02-09] M0.13-R3 便签插入已有子任务改右键 + 未引用过滤
- **What（做了什么）**：
  - 移除 sticky 顶部“插入已有子任务”下拉按钮。
  - 将 sticky 编辑区右键菜单中的“插入已有子任务链接”改为动态候选列表（`插入子任务：标题`）。
  - 插入候选改为仅展示“当前任务下尚未被正文 `taskLink` 引用”的子任务。
- **Why（为什么这么做）**：
  - 用户希望减少顶部控件占用，并将插入行为统一到右键上下文菜单。
  - 仅展示未引用子任务可以避免重复插入无效项，降低误操作成本。
- **How（怎么实现的）**：
  - `src/renderer/components/StickyView.tsx`：删除 `TaskPickerDropdown` 引用与渲染；将 `handleContextMenu` 改为异步加载候选，在非链接块场景注入多条“插入子任务：xxx”菜单项。
  - `src/renderer/App.tsx`：`loadInsertableChildren` 引入 `hasTaskLinkByTaskId` 过滤逻辑，仅返回未被当前正文引用的子任务。
  - 回归验证：执行 `npm run test` 与 `npx tsc -p tsconfig.main.json && npx tsc -p tsconfig.preload.json && npx tsc -p tsconfig.renderer.json`，全部通过。
- **已知限制**：
  - 右键菜单目前为扁平列表，候选较多时菜单会变长；后续可按需要升级为可搜索或分组菜单。
- **关联假设**：
  - `[2026-02-09/M0.13-R3] 便签右键插入入口采用“扁平列表”而非二级子菜单`

## [2026-02-09] M0.13-R4 任务树超长列表滚动修复
- **What（做了什么）**：
  - 修复任务树列表超出可视区域后无法完整查看的问题。
  - 为任务树容器新增专用滚动条样式，支持纵向滚动浏览。
  - 补齐主布局与 `LibraryPanel` 的 `min-h-0` 约束，保证滚动容器在 flex 布局下正确收缩。
- **Why（为什么这么做）**：
  - 用户反馈任务树节点较多时下方内容被裁切，影响基本浏览与操作。
- **How（怎么实现的）**：
  - `src/renderer/components/LibraryPanel.tsx`：外层面板增加 `min-h-0`，任务树容器改为 `task-tree-scrollbar flex-1 overflow-y-auto overflow-x-hidden`。
  - `src/renderer/App.tsx`：主布局容器与左右栏补充 `min-h-0`，消除 flex 默认最小高度导致的滚动失效。
  - `src/renderer/styles/app.css`：新增 `.task-tree-scrollbar` 及 WebKit 滚动条样式（细滚动条 + hover 增强）。
  - 回归验证：执行 `npm run test` 与 `npx tsc -p tsconfig.main.json && npx tsc -p tsconfig.preload.json && npx tsc -p tsconfig.renderer.json`，全部通过。
- **已知限制**：
  - 当前仅处理纵向滚动；长标题仍按 `truncate` 截断，不提供横向滚动。
- **关联假设**：
  - `[2026-02-09/M0.13-R4] 任务树滚动仅处理纵向溢出`

## [2026-02-09] M0.13-R5 右键插入子任务二级菜单 + 菜单防截断
- **What（做了什么）**：
  - 将 sticky 右键插入入口从“平铺多个 `插入子任务：xxx`”改为“插入子任务”二级展开列表。
  - 右键菜单支持内部滚动，长列表场景不再被便签窗口底部截断。
  - `ContextMenu` 升级支持 `children` 与 `disabled` 菜单项能力。
- **Why（为什么这么做）**：
  - 用户明确希望交互先聚合再展开，避免首层菜单过长影响可读性。
  - 需要在不调整菜单定位策略前提下，保证超长菜单可完整访问。
- **How（怎么实现的）**：
  - `src/renderer/components/ContextMenu.tsx`：新增 `children/disabled` 类型，支持折叠展开渲染、菜单最大高度与内部滚动。
  - `src/renderer/components/StickyView.tsx`：将“插入子任务”改为父菜单项，子任务作为 `children` 展开；空列表时展示禁用项“暂无可选子任务”。
  - `src/renderer/styles/app.css`：增强 `.context-menu` 滚动条样式与子菜单缩进样式。
  - 回归验证：执行 `npm run test` 与 `npx tsc -p tsconfig.main.json && npx tsc -p tsconfig.preload.json && npx tsc -p tsconfig.renderer.json`，全部通过。
- **已知限制**：
  - 当前为“单菜单折叠展开”而非悬浮级联子菜单；若后续需要级联跟随鼠标，可继续扩展定位逻辑。
- **关联假设**：
  - `[2026-02-09/M0.13-R5] 右键子任务列表采用“单菜单内折叠展开”`

## [2026-02-09] M0.13-R5-hotfix 右键菜单黑屏修复（Hook 顺序）
- **What（做了什么）**：
  - 修复 `ContextMenu` 在菜单打开/关闭切换时触发的 Hook 顺序变化问题，消除右键后黑屏。
- **Why（为什么这么做）**：
  - 用户反馈出现 React 报错：`Rendered more hooks than during the previous render`，导致渲染崩溃。
- **How（怎么实现的）**：
  - `src/renderer/components/ContextMenu.tsx`：移除 `useMemo` 并改为常量计算 `maxHeight`，确保所有 Hook 在每次渲染中调用顺序一致。
  - 回归验证：执行 `npm run test` 与 `npx tsc -p tsconfig.main.json && npx tsc -p tsconfig.preload.json && npx tsc -p tsconfig.renderer.json`，全部通过。
- **已知限制**：
  - 右键菜单高度仍按“点击点到窗口底部”的可用高度计算，如需支持上下双向自适应可后续扩展。
- **关联假设**：
  - 无新增假设。

## [2026-02-09] M0.13-R6 右键菜单独立弹窗化（防窗口裁切）
- **What（做了什么）**：
  - 将 sticky 右键菜单从宿主窗口内浮层改为独立 popup 窗口渲染。
  - 新增菜单弹窗窗口渲染组件，支持二级菜单展开、禁用项、内部滚动与 `Esc` 关闭。
  - 新增主窗口与菜单弹窗之间的菜单数据传递与点击回传协议。
- **Why（为什么这么做）**：
  - 用户反馈右下角右键时菜单仍被便签窗口裁切，宿主内浮层无法彻底规避边界限制。
  - 参考皮肤设置弹窗模式，独立窗口是最稳定的“永不被宿主裁切”方案。
- **How（怎么实现的）**：
  - `src/main/windowManager.ts`：新增 `contextMenuPanels` 管理、`showContextMenuPanel` / `hideContextMenuPanel` / `selectContextMenuItem` 与菜单窗口定位逻辑。
  - `src/main/ipc/handlers.ts`：新增 `window:showContextMenu` / `window:hideContextMenu` / `window:contextMenuSelect` IPC handler。
  - `src/shared/ipc.ts` / `src/shared/types.ts`：新增 `PopupMenuItem` 与对应 invoke/event 契约。
  - `src/renderer/App.tsx`：新增菜单序列化与动作映射，sticky 场景改为调用独立菜单窗口；通过事件回传执行真实 action。
  - `src/renderer/ContextMenuPanelWindow.tsx`：新增独立菜单窗口组件。
  - `src/renderer/main.tsx` / `src/renderer/styles/app.css`：新增 `contextMenu` 窗口路由与透明背景样式。
  - 验证：`npm run test` + 三端 `tsc` 全通过。
- **已知限制**：
  - 当前独立菜单窗口仅应用于 sticky；library 仍使用页面内菜单。
- **关联假设**：
  - `[2026-02-09/M0.13-R6] 独立右键菜单窗口先覆盖 sticky 场景`

## [2026-02-09] M0.13-R7 `Ctrl/Cmd+Shift+T` 无选中按当前行转子任务
- **What（做了什么）**：
  - 调整“转换为子任务”逻辑：当未选中文本时，自动读取光标所在当前行全文并执行转换。
  - 在 `Library` 详情页与 `Sticky` 两个编辑器视图保持一致行为。
- **Why（为什么这么做）**：
  - 用户期望 `Ctrl/Cmd+Shift+T` 在“仅光标态”下也能快速转子任务，避免先手动选中整行。
- **How（怎么实现的）**：
  - `src/renderer/components/TaskDetail.tsx`：在 `convertSelectionToChild` 中新增 `hasSelection` 分支；无选区时改用 `$from.start()` 与 `$from.end()` 作为替换范围。
  - `src/renderer/components/StickyView.tsx`：同步相同逻辑，确保双窗口交互一致。
  - 保留原单行约束：有选区时继续校验“同父节点且非多行”，跨行仍弹出“只能转换单行文本”。
- **已知限制**：
  - 当前“当前行”定义为光标所在父节点文本范围；复杂嵌套块中仍按该节点文本转换。
- **关联假设**：
  - 无新增假设。

## [2026-02-09] M0.13-R8 hover 便签路径提示改造
- **What（做了什么）**：
  - 将 sticky 书签 hover 提示从“书签标题”改为“层级路径”，格式为 `xx/xxx`。
  - 路径范围调整为“最父一级的下一级 → 当前页面”，不显示最顶层 root。
- **Why（为什么这么做）**：
  - 你希望 hover 时直接看到当前书签所处层级路径，便于快速定位上下文。
- **How（怎么实现的）**：
  - `src/renderer/components/StickyView.tsx`：
    - 新增 `buildBookmarkPathText`，通过 `ancestors + current` 拼接路径并去掉 root 段。
    - `showBookmarkTip` 改为异步：hover 时调用 `task:getAncestors` 与 `task:get` 获取链路与当前标题。
    - 新增 `bookmarkPathCacheRef` 缓存，重复 hover 直接命中，降低 IPC 请求频率。
    - 增加 hover 态跟踪 `bookmarkHoverTaskIdRef`，避免异步回包覆盖已离开项的 tooltip。
    - 书签列表变化时清空缓存，确保重命名/替换后路径不脏读。
- **已知限制**：
  - 首次 hover 某书签时会先短暂显示标题，再异步替换为路径。
- **关联假设**：
  - 无新增假设。

## [2026-02-10] M0.13-R9 便签“待处理”按钮点击无响应修复
- **What（做了什么）**：
  - 修复 sticky 书签栏“待处理（n）”点击后无响应的问题，恢复待处理弹层的展开与收起。
  - 优化“待处理（n）”按钮行为：支持再次点击收起弹层，保留点击空白处关闭弹层。
- **Why（为什么这么做）**：
  - 用户反馈点击“待处理（n）”没有任何反应，属于高频入口可用性问题，影响待处理条目快速回看与跳转。
- **How（怎么实现的）**：
  - `src/renderer/components/StickyView.tsx`：在“待处理（n）”按钮 `onClick` 中增加 `event.stopPropagation()`，阻断事件冒泡到外层容器。
  - `src/renderer/components/StickyView.tsx`：将 `setPendingPopup` 改为函数式更新，已打开时再次点击可收起，未打开时按按钮位置展开。
  - 验证：执行 `npm run test`（13/13 通过）；同时执行 `npx tsc -p tsconfig.renderer.json && npx tsc -p tsconfig.main.json && npx tsc -p tsconfig.preload.json`，发现 2 个既有类型错误（与本次改动无关）。
- **已知限制**：
  - `tsc` 当前仍存在历史类型错误：`StickyView.tsx` 的 `setNodeMarkup` 链式命令类型声明不匹配、`blockScroll.ts` 的参数类型不匹配；本次未扩大修复范围。
- **关联假设**：
  - 无新增假设。

## [2026-02-10] M0.13-R10 待处理弹层样式适配 + 点击定位与光标落点
- **What（做了什么）**：
  - 调整 sticky“待处理”弹层视觉：背景、边框、分割线与 hover 反馈改为与便签主题一致的浅黄系样式。
  - 修复点击待处理条目后的定位链路：支持跨页面定位到目标块，并将光标放到该行末尾。
  - 强化滚动定位工具：先设置编辑器选区再滚动高亮，避免“看起来滚到附近但光标不在目标行”的问题。
- **Why（为什么这么做）**：
  - 你反馈当前弹层白底与便签背景割裂，且点击条目后“应定位并把光标放到该行末尾”未稳定满足。
- **How（怎么实现的）**：
  - `src/renderer/styles/app.css`：重做 `.sticky-pending-*` 样式（主题背景混色、边框色、hover 色、删除按钮分隔线）以匹配便签背景。
  - `src/renderer/components/StickyView.tsx`：新增 `pendingFocusRef` 挂起定位目标；点击待处理条目时记录目标并在任务切换后自动定位，必要时短延迟重试一次。
  - `src/renderer/components/StickyView.tsx`：点击条目时同步清理 tooltip hover 状态，避免跳转后提示残留。
  - `src/renderer/utils/blockScroll.ts`：将光标位置改为“目标块行末（`pos + nodeSize - 1`）”，并优先通过 `nodeDOM` 定位元素后执行滚动与高亮。
  - 验证：`npm run test` 通过（13/13）；`npx tsc -p tsconfig.renderer.json` 仅剩 1 个既有错误（`StickyView.tsx` 中 `setNodeMarkup` 链式命令类型声明问题，与本次功能无关）。
- **已知限制**：
  - 跨页面定位当前采用“挂起 + 一次重试”策略；极端慢渲染场景若仍未命中，可后续增加编辑器 ready 事件驱动。
- **关联假设**：
  - `[2026-02-10/M0.13-R10] 待处理条目跨页面定位采用“挂起定位 + 重试一次”`

## [2026-02-11] M0.13-R11 同页多文本块加入“待处理”修复
- **What（做了什么）**：
  - 修复 sticky 右键“添加文本块到待处理”总是落在旧光标块的问题，改为优先使用右键点击位置定位块。
  - 允许同一文档不同位置的文本块连续加入待处理列表，不再表现为“同页只能加一条”。
  - 将块 ID 写回从链式命令改为 ProseMirror 事务，消除 `setNodeMarkup` 的类型报错。
- **Why（为什么这么做）**：
  - 用户反馈同页不同文本块无法都加入待处理，核心原因是新增动作读取的是历史 selection 而非右键实际点击块。
- **How（怎么实现的）**：
  - `src/renderer/components/StickyView.tsx`：新增 `pendingBlockBookmarkPosRef`，在 `handleContextMenu` 中通过 `editor.view.posAtCoords` 记录右键点击位置，并同步设置临时选区。
  - `src/renderer/components/StickyView.tsx`：`addBlockBookmark` 优先使用 `pendingBlockBookmarkPosRef` 定位块，使用后立即清空，避免污染后续操作。
  - `src/renderer/components/StickyView.tsx`：块缺少 `id` 时，改为 `tr.setNodeMarkup(...) + editor.view.dispatch(tr)` 写回属性。
  - 验证：`npm run test`（13/13）通过；`npx tsc -p tsconfig.main.json && npx tsc -p tsconfig.preload.json && npx tsc -p tsconfig.renderer.json` 通过。
- **已知限制**：
  - 右键定位依赖浏览器坐标命中，若未来引入复杂浮层遮罩，需确保 `posAtCoords` 仍能命中编辑区。
- **关联假设**：
  - `[2026-02-11/M0.13-R11] 待处理块锚点以右键点击位置为准`

## [2026-02-14] M0.13-R12 任务重名校验改为同父任务兄弟唯一
- **What（做了什么）**：
  - 将任务标题重名规则从“全库唯一”调整为“同一父任务下的兄弟子任务不允许重名”。
  - 补齐所有会改变父子挂接关系的入口校验：插入已有子任务、移动子任务引用、`edge:create`、`edge:reparent`。
  - 更新 `task:validateUniqueTitle` IPC 入参，支持按 `parentId` 做前置校验提示。
- **Why（为什么这么做）**：
  - 你明确指出当前全局禁止同名不符合预期，正确规则应为“仅兄弟级子任务去重”。
  - 仅改创建/重命名会留下挂接入口漏洞，因此需要统一收口保证规则一致。
- **How（怎么实现的）**：
  - `src/main/db/tasksRepo.ts`：新增 `hasSiblingTaskTitle`，改为按 `parent_task_id + title` 查询同级重名（排除已删除任务，可排除当前任务 ID）。
  - `src/main/ipc/handlers.ts`：新增父任务范围解析逻辑（`parentId` 或从 `excludeTaskId` 反查父任务），统一通过 `assertUniqueTaskTitle` 执行同级校验；并在 `task:createFromBlock`、`task:update(title)`、`task:insertExistingChildLink`、`task:moveChildReference`、`edge:create`、`edge:reparent` 中接入。
  - `src/shared/ipc.ts` 与 `src/renderer/App.tsx`：扩展 `task:validateUniqueTitle` 支持 `parentId`，在“创建子任务”路径传入当前父任务，重命名继续传 `excludeTaskId`。
  - 验证：`npm run test` 通过（13/13）；`npx tsc -p tsconfig.main.json --noEmit`、`npx tsc -p tsconfig.preload.json --noEmit`、`npx tsc -p tsconfig.renderer.json --noEmit` 全通过。
- **已知限制**：
  - 根任务（无父任务）不参与同级重名限制，允许同名根任务并存。
- **关联假设**：
  - `[2026-02-08/M0.12] 任务标题唯一性按“全库未删除任务”校验`（已推翻）
  - `[2026-02-14/M0.13-R12] 根任务名称允许同名`

## [2026-02-14] M0.13-Docs 面向用户的使用帮助文档补充完善
- **What（做了什么）**：
  - 重构并补充 `Docs/用户指南.md`，将现有内容升级为面向终端用户的完整使用帮助文档。
  - 新增“3 分钟快速上手、推荐工作流、数据与同步规则、FAQ”等章节，并校正与当前实现不一致的入口描述。
  - 同步更新 `plan.md`、`PROJECT_STATUS.md`、`ASSUMPTIONS.md`，将本次文档治理纳入项目记录闭环。
- **Why（为什么这么做）**：
  - 你提出该项目核心价值是“用任务拆分 + 面包屑/书签导航，解决传统便签记录混乱”，原文档已有基础但结构和覆盖面仍不足以支撑新用户快速上手。
  - 最近多个迭代已调整交互入口（例如 Library 顶部下拉插入、Sticky 右键插入、同父重名规则），需要统一对齐文档以避免使用偏差。
- **How（怎么实现的）**：
  - `Docs/用户指南.md`：按“价值说明 → 快速上手 → 窗口协作 → 任务管理 → 子任务拆分 → Sticky 导航专注 → 快捷键 → 工作流 → FAQ”重组文档骨架。
  - 结合当前实现细节补充用户路径：
    - Library 的四个视图 Tab（进行中/已完成/回收站/归档）
    - 子任务插入入口（Library 顶部下拉、Sticky 右键二级菜单）
    - 链接卡片的移动、删除入口与行为边界（删除入口不删任务）
    - 任务树拖拽的当前能力边界（仅层级变更，不含同级精排）
  - `ASSUMPTIONS.md`：补充“用户指南默认面向已可打开应用用户，不覆盖安装部署”的范围假设。
- **已知限制**：
  - 本轮仍未补充“安装/打包分发”内容；若后续对外发布，建议新增独立《安装与升级手册》。
- **关联假设**：
  - `[2026-02-14/用户文档] 使用帮助默认面向“已可打开应用”的终端用户`

## [2026-02-24] M0.13-R13 待处理右键锚点改为记录对应行末
- **What（做了什么）**：
  - 为 sticky 待处理条目新增 `blockCursorOffset` 字段，记录右键“添加文本块到待处理”时对应行末偏移。
  - 点击待处理条目时，定位逻辑从“仅按块末尾”升级为“优先按记录偏移恢复，缺省再块末兜底”。
  - 同步更新书签反序列化逻辑，确保持久化读写兼容新旧数据。
- **Why（为什么这么做）**：
  - 用户反馈当前“添加文本块到待处理”后光标定位记录不准，期望记录并恢复到对应那一行的末尾。
  - 仅靠 `blockId` 无法表达同一块内部更细粒度位置，导致回跳精度不足。
- **How（怎么实现的）**：
  - `src/shared/types.ts`：`WindowBookmark` 新增可选字段 `blockCursorOffset`。
  - `src/renderer/components/StickyView.tsx`：
    - `addBlockBookmark` 在解析右键位置后，额外计算“最近文本行末”相对块起始偏移并写入书签。
    - `handleBlockBookmarkClick` 与挂起定位状态 `pendingFocusRef` 传递该偏移用于回跳。
    - 待处理条目去重/删除键加入偏移维度，兼容历史无偏移书签。
  - `src/renderer/utils/blockScroll.ts`：`scrollToBlock` 支持可选偏移参数并执行边界裁剪。
  - `src/main/db/windowStateRepo.ts`：`parseStickyBookmarks` 增加 `blockCursorOffset` 解析与数值清洗。
  - 验证：`npm run test` 通过（13/13）；`npx tsc -p tsconfig.main.json --noEmit && npx tsc -p tsconfig.preload.json --noEmit && npx tsc -p tsconfig.renderer.json --noEmit` 通过。
- **已知限制**：
  - 当前位置偏移基于当前 ProseMirror 文本块结构计算；若后续引入更复杂内联结构（如跨节点嵌套），可再补充更细粒度锚点策略。
- **关联假设**：
  - `[2026-02-24/M0.13-R13] 待处理锚点按“块ID + 行末偏移”记录`

## [2026-02-24] M0.13-R13-hotfix 列表符号/块边界右键锚点偏移修复
- **What（做了什么）**：
  - 修复 sticky 在列表符号区或块边界右键“添加文本块到待处理”时的锚点偏移问题。
  - 记录锚点前新增位置归一化步骤，确保命中最近可编辑文本位置。
  - 锚点块选择策略改为“优先文本块”，再按文本块行末记录偏移。
- **Why（为什么这么做）**：
  - 用户复测反馈仍会跳到“下一行中间”，说明边界命中场景下锚点记录仍不稳定。
  - 仅使用 `posAtCoords` 原始坐标在结构边界会落到父块节点，导致回跳偏移。
- **How（怎么实现的）**：
  - `src/renderer/components/StickyView.tsx`：
    - 引入 `Selection`，在 `addBlockBookmark` 中使用 `Selection.near(doc.resolve(safeFrom), 1)` 归一化右键位置。
    - 块解析顺序调整为“先找 `isTextblock`，再找普通 `isBlock` 兜底”。
    - `blockCursorOffset` 优先按文本块行末计算，避免父块边界偏移。
  - 验证：`npm run test` 通过（13/13）；`npx tsc -p tsconfig.main.json --noEmit && npx tsc -p tsconfig.preload.json --noEmit && npx tsc -p tsconfig.renderer.json --noEmit` 通过。
- **已知限制**：
  - 极少数完全不可编辑区域（例如未来自定义不可选节点）仍可能走块级兜底逻辑，光标将回退到块末尾。
- **关联假设**：
  - `[2026-02-24/M0.13-R13-hotfix] 右键边界命中先归一化到最近文本位置`

## [2026-02-24] M0.13-R13-hotfix2 checkbox 行右键锚点 DOM 优先解析
- **What（做了什么）**：
  - 修复 checkbox 行（含列表符号区域）右键“添加文本块到待处理”后回跳落到下一行末尾的问题。
  - 右键命中逻辑升级为“DOM 祖先链优先解析文本块锚点 + 坐标兜底”。
- **Why（为什么这么做）**：
  - 用户复测仍出现“当前行添加，下一行落点”的偏移，说明仅靠 `Selection.near` 仍不能覆盖全部边界命中场景。
  - checkbox 与列表符号区域属于结构边界，DOM 语义节点比坐标命中更稳定。
- **How（怎么实现的）**：
  - `src/renderer/components/StickyView.tsx`：
    - `handleContextMenu` 新增 `data-node-id` 祖先链解析，优先定位文本块对应文档位置。
    - 当 DOM 无命中时才回退 `posAtCoords`，并统一使用 `Selection.near(..., -1)` 左偏归一化选区。
    - `addBlockBookmark` 增加对“直接命中块起始位置”的处理，避免边界位置再次漂移。
  - 验证：`npm run test` 通过（13/13）；`npx tsc -p tsconfig.main.json --noEmit && npx tsc -p tsconfig.preload.json --noEmit && npx tsc -p tsconfig.renderer.json --noEmit` 通过。
- **已知限制**：
  - 若未来引入不带 `data-node-id` 的复杂自定义可视节点，仍会走坐标兜底路径。
- **关联假设**：
  - `[2026-02-24/M0.13-R13-hotfix2] checkbox 行右键优先走 DOM 锚点解析`

## [2026-02-26] M0.13-R13-hotfix3 容器块命中导致回跳到文末修复
- **What（做了什么）**：
  - 修复右键“添加文本块到待处理”后，单击条目回跳到最后一行末尾的问题。
  - 新增统一锚点解析函数，在容器块命中场景下优先下钻文本块并记录该行行末。
  - 同步收敛右键取点与待处理记录两条路径，避免两边策略不一致导致漂移。
- **Why（为什么这么做）**：
  - 用户反馈“应跳到添加那一行的行末”，当前行为错误地回到了文末，直接影响待处理导航可用性。
  - 既有逻辑在 `taskItem/taskList` 命中时会记录容器块尾，导致恢复光标偏向结构尾部而非当前文本行。
- **How（怎么实现的）**：
  - `src/renderer/components/StickyView.tsx`：
    - 新增 `resolveBlockAnchor`，统一解析 `rawPos -> blockPos + lineEndPos`。
    - `handleContextMenu` 改为使用 `resolveBlockAnchor` 解析 DOM 候选位置与 `posAtCoords` 兜底位置，优先得到文本块位置。
    - `addBlockBookmark` 改为复用 `resolveBlockAnchor`；若命中容器块则先下钻文本块，再记录 `blockCursorOffset`。
    - 右键同步选区的归一化偏向改为 `Selection.near(..., 1)`，保证命中位置向当前块内部收敛。
  - 验证：`npm run test` 通过（13/13）；`npx tsc -p tsconfig.main.json --noEmit && npx tsc -p tsconfig.preload.json --noEmit && npx tsc -p tsconfig.renderer.json --noEmit` 通过。
- **已知限制**：
  - 当命中节点本身不包含文本块（如纯结构块/未来自定义不可编辑块）时，仍会回退到块级定位。
- **关联假设**：
  - `[2026-02-26/M0.13-R13-hotfix3] 容器块锚点优先下钻文本块`

## [2026-02-26] M0.13-R13-hotfix4 重复块ID导致待处理回跳误命中修复
- **What（做了什么）**：
  - 修复待处理回跳“命中到更靠后行/最末尾”的问题。
  - 新增块 ID 重复检测：添加待处理时若目标块 ID 缺失或重复，自动重置当前块为唯一 ID。
  - 优化回跳查找：命中首个目标后不再被后续同 ID 节点覆盖。
- **Why（为什么这么做）**：
  - 用户反馈在“安排solitare”“框架”处添加待处理后，单击仍跳到列表底部，说明当前锚点仍存在误命中。
  - 回跳链路以 `blockId` 为主键，若编辑器存在重复节点 ID，会导致定位漂移到错误节点。
- **How（怎么实现的）**：
  - `src/renderer/components/StickyView.tsx`：
    - 新增 `countNodeIdOccurrences` 统计文档中某 ID 出现次数。
    - 在 `addBlockBookmark` 中引入 `shouldResetId` 判断：ID 缺失或重复时，使用事务重置当前块 ID，并以新 ID 写入书签。
  - `src/renderer/utils/blockScroll.ts`：
    - `scrollToBlock` 遍历时改为“首次命中即锁定”，不再被后续同 ID 节点覆盖。
  - 验证：`npm run test` 通过（13/13）；`npx tsc -p tsconfig.main.json --noEmit && npx tsc -p tsconfig.preload.json --noEmit && npx tsc -p tsconfig.renderer.json --noEmit` 通过。
- **已知限制**：
  - 历史已保存的旧书签若绑定到重复 ID，仍可能指向旧冲突节点；重新添加该条待处理后会自动修复为唯一 ID。
- **关联假设**：
  - `[2026-02-26/M0.13-R13-hotfix4] 待处理锚点写入时优先修复重复块ID`

## [2026-02-26] M0.13-R13-hotfix5 输入时光标偶发跳到文末修复
- **What（做了什么）**：
  - 修复输入过程中光标偶发跳到文档末尾的问题，避免打断连续输入。
  - 在 `StickyView` 与 `TaskDetail` 统一加入“本地保存回流忽略 + 聚焦期间远端更新延迟应用”机制。
- **Why（为什么这么做）**：
  - 用户反馈输入时会频繁出现光标突然跳到文末，属于高频编辑链路稳定性问题。
  - 现有逻辑在收到 `task:updated` 后会触发 `setContent`，输入聚焦态下会重置选区。
- **How（怎么实现的）**：
  - `src/renderer/components/StickyView.tsx`：
    - 新增 `lastLocalBlocksHashRef`，记录本地发送 `task:update` 的最新块内容哈希。
    - `task.blocks` 同步时若命中本地回流哈希则跳过 `setContent`。
    - 聚焦输入期间收到非本地回流更新时写入 `pendingRemoteBlocksRef`，在 `blur` 事件再应用。
  - `src/renderer/components/TaskDetail.tsx`：
    - 同步上述策略，保证 Library/Sticky 两个编辑器行为一致。
  - 验证：`npm run test` 通过（13/13）；`npx tsc -p tsconfig.main.json --noEmit && npx tsc -p tsconfig.preload.json --noEmit && npx tsc -p tsconfig.renderer.json --noEmit` 通过。
- **已知限制**：
  - 若用户长期保持聚焦连续输入，远端更新会延后到失焦后再生效。
- **关联假设**：
  - `[2026-02-26/M0.13-R13-hotfix5] 输入聚焦期间延迟应用远端块更新`

## [2026-03-02] M0.13-R14 面包屑/待处理中隐藏已完成与已删除任务
- **What（做了什么）**：
  - 调整面包屑兄弟级下拉过滤，新增对已完成任务的排除。
  - 调整 sticky 书签栏“待处理（n）”的计数与弹层列表，仅展示来源任务未完成且未删除的条目。
  - 为待处理可见性增加任务更新/删除事件触发的自动重算，避免状态变化后列表不刷新。
- **Why（为什么这么做）**：
  - 你要求导航下拉与待处理列表都不再出现“已完成/已删除”项目，减少无效跳转与噪声信息。
- **How（怎么实现的）**：
  - `src/renderer/components/Breadcrumb.tsx`：兄弟级列表本地过滤条件补充 `!task.isCompleted`，并继续保留未归档/未删除约束。
  - `src/renderer/components/StickyView.tsx`：
    - 新增待处理任务可见性映射（按 `task:get` 查询任务状态并缓存隐藏集合）。
    - 监听 `task:updated` 与 `task:deleted` 事件触发重算，确保完成/删除后待处理列表自动同步。
    - 书签栏待处理按钮计数、弹层渲染统一改为基于过滤后的 `pendingBookmarks`。
  - 验证：`npm run test`、`npx tsc -p tsconfig.main.json --noEmit`、`npx tsc -p tsconfig.preload.json --noEmit`、`npx tsc -p tsconfig.renderer.json --noEmit` 全部通过。
- **已知限制**：
  - 待处理条目当前按任务完成/删除状态过滤；若后续希望同步过滤“已归档”任务，需要追加同类规则。
- **关联假设**：
  - 无。

## [2026-03-02] M0.13-R15 待处理增加序号并支持拖拽排序
- **What（做了什么）**：
  - 为 sticky 待处理弹层每条条目增加序号显示。
  - 实现待处理条目拖拽排序，拖拽后即时更新显示顺序并写回 `stickyBookmarks`。
  - 增加拖拽中的视觉反馈（拖动项、目标项高亮）。
- **Why（为什么这么做）**：
  - 你要求待处理列表具备更直观的阅读顺序和手动整理能力，便于优先级管理。
- **How（怎么实现的）**：
  - `src/renderer/components/StickyView.tsx`：
    - 新增待处理拖拽状态 `draggingPendingKey` / `dragOverPendingKey`。
    - 新增 `buildPendingBookmarkKey` 作为待处理条目稳定键值。
    - 在待处理弹层中为每条记录渲染序号，并接入 `dragstart/dragover/drop/dragend` 事件。
    - 新增 `reorderPendingBookmarks`，按拖拽结果重排可见待处理条目并通过 `onBookmarksChange` 持久化。
  - `src/renderer/styles/app.css`：
    - 新增 `.sticky-pending-index` 样式。
    - 为 `.sticky-pending-item` 增加拖拽态样式（`is-dragging` / `is-drag-over`）。
  - 验证：`npm run test`、`npx tsc -p tsconfig.main.json --noEmit`、`npx tsc -p tsconfig.preload.json --noEmit`、`npx tsc -p tsconfig.renderer.json --noEmit` 全部通过。
- **已知限制**：
  - 当前拖拽落点按“目标项位置重排”处理；如需“上半区前插/下半区后插”细粒度规则可后续增强。
- **关联假设**：
  - 无。

## [2026-03-02] M0.13-R16 待处理聚焦模式与底部左右跳转
- **What（做了什么）**：
  - 新增“待处理聚焦处理”能力：点击待处理条目后记录当前聚焦项，并在编辑器中定位显示对应文本块。
  - 在 sticky 底部新增左右两个跳转按钮，支持在待处理项间连续切换聚焦。
  - 在待处理弹层中为当前聚焦项增加高亮样式，提升连续处理时的上下文感知。
- **Why（为什么这么做）**：
  - 你希望把待处理条目变成连续处理流，减少反复打开弹层和手动查找目标项的成本。
- **How（怎么实现的）**：
  - `src/renderer/components/StickyView.tsx`：
    - 新增 `activePendingKey` 状态，记录当前聚焦待处理项。
    - 抽离 `focusPendingBookmark`，统一处理“设置聚焦项 + 当前页定位/跨页跳转定位”。
    - 新增 `focusPendingByDelta`，底部左/右按钮按当前待处理顺序循环跳转。
    - 待处理弹层项增加 `is-active` 状态样式标记。
  - `src/renderer/styles/app.css`：
    - 新增 `.sticky-pending-item.is-active` 高亮样式。
    - 新增底部导航样式：`.sticky-pending-focus-nav`、`.sticky-pending-focus-btn`、`.sticky-pending-focus-text`。
  - 验证：`npm run test`、`npx tsc -p tsconfig.main.json --noEmit`、`npx tsc -p tsconfig.preload.json --noEmit`、`npx tsc -p tsconfig.renderer.json --noEmit` 全部通过。
- **已知限制**：
  - 左右按钮当前采用循环跳转（首尾相连）；如需改为边界禁用可后续调整。
- **关联假设**：
  - `[2026-03-02/M0.13-R16] 待处理左右跳转默认循环（首尾相连）`

## [2026-03-02] M0.13-R17 子任务链接块前置输入光标修复
- **What（做了什么）**：
  - 修复子任务链接块难以在前方插入文字的问题。
  - 调整点击行为为“仅点标题跳转”，并在新增子任务链接时自动补尾随空格。
- **Why（为什么这么做）**：
  - 用户反馈无法把光标移动到子任务块前面，导致不能补空格或插入文本，影响高频编辑体验。
- **How（怎么实现的）**：
  - `src/renderer/components/TaskDetail.tsx` 与 `src/renderer/components/StickyView.tsx`：
    - 在 `handleClick` 中新增 `isTitleClick` 判断，仅当点击 `.task-link-title` 时执行 `onNavigate`。
    - 保留 checkbox 点击切换完成态逻辑不变。
    - “添加子任务”插入 `taskLink` 时改为插入 `[taskLink, 空格文本]`，确保后续可直接继续输入。
  - `src/renderer/styles/app.css`：
    - `task-link-block` 设置为 `cursor: text`，`task-link-title` 设置为 `cursor: pointer`，强化编辑与跳转意图。
  - 验证：`npm run test` 通过（13/13）；`npx tsc -p tsconfig.renderer.json --noEmit` 通过。
- **已知限制**：
  - 链接块边缘点击不再触发跳转，需点击标题文本进入子任务页面。
- **关联假设**：
  - 无。

## [2026-03-02] M0.13-R17-hotfix 子任务前置光标键盘与点击落点补丁
- **What（做了什么）**：
  - 修复 `taskLink` 前后光标无法通过键盘左右键稳定移动的问题。
  - 修复编辑器外层容器点击时无条件 `focus()` 抢占光标落点的问题。
- **Why（为什么这么做）**：
  - 你反馈上一轮修复后仍无法把光标移动到子任务前，说明仅调整点击跳转范围不足以覆盖真实操作路径。
- **How（怎么实现的）**：
  - `src/renderer/components/TaskDetail.tsx` 与 `src/renderer/components/StickyView.tsx`：
    - 在 `editorProps.handleKeyDown` 中新增 `ArrowLeft/ArrowRight` 对 `taskLink` 的显式处理：
      - 当选中 `taskLink` 节点（`NodeSelection`）时，左右键直接落到节点前/后文本位置；
      - 当光标紧邻 `taskLink` 时，左右键可跨过节点并定位到预期位置。
    - 调整编辑容器 `onClick`：仅当点击目标是容器空白区域时才调用 `focus()`，点击编辑内容不再覆盖原始落点。
  - 验证：`npm run test` 通过（13/13）；`npx tsc -p tsconfig.renderer.json --noEmit` 通过。
- **已知限制**：
  - 对于历史正文里“多个子任务紧贴且无可见空白”的场景，建议先把光标放到任一子任务后，再用 `←` 左移到目标前方插入。
- **关联假设**：
  - 无。
