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
