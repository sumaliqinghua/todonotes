# PRD（需求文档）

## 变更历史
- 2026-06-08：优化 Codex App 模式 prompt 与 AI 状态切换：App 模式不再把完整 `codex-session` / `codex-done` / `codex-failed` 命令直接拼进用户问题正文，而是生成 `todonotes-callback` Codex skill，并在 prompt 末尾只附加短小的 `todonotes_callback` 元数据块；Codex 对话结束前由该 skill 执行本地 CLI 回调。发起新的文本块 AI 时会清理本页旧的 AI 专用状态（`AI处理中`、`AI已返回结果`、`失败`），但保留人工等待原因；旧 AI 回调如果目标块已不再处于 `AI处理中`，不会重新把旧块标为 AI 已返回。
- 2026-06-08：新增 Codex 双模式与 CLI 回调：Library 标题栏可在 `Terminal` 与 `Codex App` 模式之间切换；Terminal 模式保留现有 `codex exec` / `codex resume` 流程；Codex App 模式通过 `codex://threads/new?path=<项目路径>&prompt=<提示词>` 或 `codex://threads/<sessionId>` 打开 Codex App，并把带 todonotes CLI 回调命令的 prompt 写入剪贴板；Codex 可运行 `codex-session` 写回当前子页 `sessionId`，运行 `codex-done` / `codex-failed` 更新对应文本块状态。
- 2026-06-06：修复 mac 安装包体积异常膨胀：electron-builder 最终输出目录从 `dist` 改为 `release`；打包输入从 `dist/**/*` 收敛为 `dist/main`、`dist/preload`、`dist/renderer`、`dist/shared` 和 `package.json`，避免旧 `.dmg`、`.blockmap`、`mac-arm64` 再次进入 `app.asar`。
- 2026-06-04：修复 Electron 主进程找不到 Codex CLI 的问题：后台执行不再直接 `spawn("codex")`，而是先解析 Codex CLI 绝对路径；查找顺序为 `CODEX_CLI_PATH`、当前 `PATH`、`~/.nvm/versions/node/*/bin/codex`、Homebrew 常见路径和 Codex App 资源路径。
- 2026-06-02：新增 AI 返回结果的进行中徽标与底部快捷入口：Codex 成功返回后，当前块显示 `进行中.AI已返回结果:xxm`，其中 `xxm` 是距离 AI 返回结果的分钟数；Sticky 底部快捷状态按钮组新增 `AI` 按钮，可直接对当前块执行“用当前块追问 Codex”。
- 2026-06-02：新增 AI 完成后刷新已打开 Codex 终端：由于 `codex resume` TUI 不会自动感知后台 `codex exec resume` 追加的新 turn，后台 AI 成功完成后会查找同一 `sessionId` 的已打开 Terminal tab，结束旧 TUI 并在同一 tab 重新执行 `codex resume`，让终端显示最新对话；未打开终端时不自动弹出。
- 2026-06-02：修正“打开本页 Codex 会话”的 Terminal 复用策略：不再依赖 Terminal 标题，因为 Codex TUI 会把标题改成运行命令；现在改为查找正在运行的 `codex resume ... <sessionId>` 进程，按该进程所在 TTY 激活对应 Terminal tab，避免继续新开窗口。
- 2026-06-02：优化“打开本页 Codex 会话”的 Terminal 行为：同一个 `codexSessionId` 使用固定标题 `todonotes-codex-<sessionId>` 复用已有 Terminal tab，避免重复点击时不断新开终端窗口。
- 2026-06-02：修复 Sticky 便签页 Codex 路径弹窗缺失与 `codex exec` 会话打开方式：Sticky 窗口现在也挂载项目路径输入框；由于 `codex exec` 创建的是非交互式会话，官方 `codex://threads/<SESSION_UUID>` 在当前实测中可能打开 Codex App 后一直 loading，第一版“打开本页 Codex 会话”改为 macOS Terminal 执行 `codex resume --include-non-interactive --cd <项目路径> <sessionId>`。
- 2026-06-02：修正 Codex App 指定会话 deep link：根据当前 Codex manual 官方 “Deep links” 小节，打开本地线程的格式为 `codex://threads/<SESSION_UUID>`，不再使用非官方的 `codex://session/<sessionId>`；终端降级路径 `codex resume <sessionId>` 保持不变。
- 2026-06-02：新增 Codex 子页会话第一版：每个子页可保存一个项目路径 `codexCwd` 和一个 Codex 会话 ID `codexSessionId`；Library 详情页和 Sticky 便签普通文本块右键新增“用当前块追问 Codex”；首次追问前要求输入项目路径；同一子页首次执行创建 Codex 会话，后续追问通过 `codex exec resume` 续聊；AI 运行中复用 `waiting`（等待中）状态，成功后转为 `doing`（进行中），失败时保持 `waiting` 且等待原因写为“失败”；已有会话可从右键菜单打开，优先尝试 Codex App 跳转，失败时降级为终端执行 `codex resume <sessionId>`。
- 2026-04-29：修复 Sticky / Library 切换页面后父任务内容被子任务内容覆盖的问题：编辑器保存现在在更新发生时绑定当时的任务 ID 与 blocks，延迟保存不再读取切页后的编辑器内容；任务切换会重建编辑器实例，避免撤销栈跨页面污染。
- 2026-04-29：统一状态时间弹窗快捷选项：进行中预计持续时长、待开始预计持续时长、等待中回看时间均提供 5 / 10 / 15 / 20 / 30 / 45 / 60 / 90 / 120 分钟快捷按钮；等待回看快捷按钮表示“当前时间 + 对应分钟”。
- 2026-04-29：移除 Sticky 根页默认页面书签：新建或打开 Sticky 时不再自动添加 `rootTaskId` 对应的“最上一级”书签；历史遗留的根页页面书签会在加载/同步时被过滤；Sticky 根页右键不再显示“添加当前页到书签”，子任务页仍保留该入口。
- 2026-04-29：新增等待回看逾期分段系统通知：等待中块从 `waitReviewAt` 起算，0 分钟保留原有到点提醒，应用运行期间跨过 5 / 10 / 30 / 60 分钟且仍为等待中时各提醒一次；关闭期间错过的分段提醒不在启动时补发。
- 2026-04-29：新增待开始逾期分段系统通知：从 `plannedStartAt` 起算，待开始块如果仍未转成其他状态，会在应用运行期间跨过 5 / 10 / 30 / 60 分钟阈值时各提醒一次；应用关闭期间错过的分段提醒不在启动时补发。
- 2026-04-28：修复状态切换重复问题：同一视觉文本块如果存在父子状态节点，后设置的状态会覆盖前一个状态，避免同时出现多个状态徽标或多个状态工作台条目；本轮不做历史重复状态清洗。
- 2026-04-28：修复开发启动环境污染：`npm run dev` 启动 Electron 前会清理 `ELECTRON_RUN_AS_NODE`，避免 Electron 被当成 Node 运行导致 `app.whenReady()` 不存在。
- 2026-04-28：明确等待中暂停/恢复计时规则：进行中切到等待中时保存剩余预计时长；等待中切回进行中时从该剩余时长重新开始倒计时。
- 2026-04-28：修复 Sticky 底部快捷状态按钮目标行错乱：底部 `进行中 / 等待中 / 待开始 / 已完成` 按钮现在优先使用最后一次用户真实点击到的正文块 DOM 目标，并以选区事件兜底；点击状态工作台跳转不会覆盖这个快捷设置目标。
- 2026-04-27：完成状态工作台改造：Sticky 的“待处理”升级为“状态工作台”，只保留 `进行中 / 等待中 / 待开始` 三个 Tab；块级状态改用 `workStatus`、`plannedStartAt`、`plannedDurationMinutes`、`waitReason`、`waitReviewAt`；旧 `dueAt` 截止时间和旧手动待处理入口不再作为工作台依据。
- 2026-04-07：确认采用“极简版：只保留截止时间”，移除开始时间语义，不兼容旧 `startAt` 数据；Sticky 时间入口统一收敛为“设置截止时间...”二级菜单，正文与待处理列表只展示截止相关状态。
- 2026-04-07：修正 M0.13-R21 首轮交互细节：Sticky 右键时间入口改为“设置截止时间... / 设置开始时间...”二级菜单；时间设置命中改为以右键块锚点为准，修复误记到下一行；快捷设时后倒计时立即按当前时刻刷新，修复“10 分钟显示成 11 分钟”。
- 2026-04-07：完成 M0.13-R21 首轮实现：正文块支持开始时间/截止时间互斥写入，Sticky 右键支持快捷设时与自定义时间窗口，待处理弹层支持 `全部 / 今天 / 1 小时内` 筛选与最近顺序切换。
- 2026-04-07：收敛“正文块开始时间/截止时间 + Sticky 待处理整合”需求，默认采用“一套带时间的待处理工作台”方案：时间挂正文块、开始/截止互斥、保留手动待处理、首轮仅在 Sticky 落地，不接提醒弹窗 UI。
- 2026-03-16：正文编辑器新增“标题折叠”，点击标题左侧小三角可在当前窗口临时收起该标题下内容，范围到下一个同级或更高级标题。
- 2026-02-07：基于当前代码基线重构文档，增加“已实现能力/待补齐范围/里程碑映射”。
- 2026-02-08：补充 sticky 便签“同父任务共享状态 + 按目标路径打开”规则。
- 2026-02-08：根据 `Docs/NEW_FEATURES.md` 锁定“子任务交互增强（1.1~1.3）”执行边界与交互规则。
- 2026-02-08：补充“完成态同步 latest-write-wins”规则，保证最新用户操作优先。
- 2026-02-08：修复“任务树重命名后父任务链接块退化为纯文本”问题，保证 taskLink 样式保留。
- 2026-02-09：调整 sticky 插入已有子任务交互：移除顶部按钮，改为右键菜单，且仅展示未被正文引用的子任务。
- 2026-02-09：修复任务树溢出显示问题：任务树区域支持垂直滚动条，超出高度可完整浏览。
- 2026-02-09：优化 sticky 右键插入子任务交互：先点“插入子任务”再展开候选；右键菜单支持内部滚动，避免长菜单被截断。
- 2026-02-09：修复右键菜单二级展开后的黑屏问题（Hook 调用顺序错误导致渲染崩溃）。
- 2026-02-09：将 sticky 右键菜单迁移为独立弹窗窗口（参考皮肤面板模式），彻底避免宿主便签裁切。
- 2026-02-10：修复 sticky 书签栏“待处理（n）”点击无响应问题，恢复待处理弹层展开与收起。
- 2026-02-10：优化 sticky 待处理弹层视觉适配（背景/边框/hover），并修复点击条目后定位与光标落点到该行末尾。
- 2026-02-11：修复 sticky 同页多文本块加入“待处理”异常，改为按右键点击块定位，支持同文档添加多个不同文本块。
- 2026-02-14：将任务重名校验范围由“全库唯一”调整为“同一父任务下的兄弟子任务不允许重名”。
- 2026-02-24：修复 sticky 右键“添加文本块到待处理”的光标锚点记录，改为记录对应行末并用于后续跳转恢复。
- 2026-02-24：修复待处理锚点在列表符号/块边界右键时的偏移异常，改为优先归一化到最近文本块后记录行末。
- 2026-02-24：进一步修复 checkbox 行右键场景：优先从 DOM 节点解析文本块锚点，避免 `posAtCoords` 边界命中导致跳到下一行末尾。
- 2026-02-26：修复容器块命中场景（`taskItem/taskList`）的待处理锚点记录，统一下钻到文本块并定位到添加行行末，避免回跳到文末。
- 2026-02-26：修复重复块 ID 导致待处理回跳误命中问题；添加待处理时对目标块执行唯一 ID 修复，回跳命中后不再被后续同 ID 节点覆盖。
- 2026-02-26：修复输入过程中光标偶发跳到文末：拦截本地保存回流导致的 `setContent` 重置，并将远端更新改为失焦后应用。
- 2026-03-02：面包屑兄弟级下拉与 sticky 待处理列表统一过滤已完成/已删除任务，避免无效导航项。
- 2026-03-02：sticky 待处理弹层增加序号展示并支持拖拽排序，排序结果持久化到书签顺序。
- 2026-03-02：sticky 增加待处理聚焦模式，支持底部左右按钮按待处理顺序跳转并聚焦目标文本块。
- 2026-03-05：sticky 右键菜单新增“显示/隐藏已打钩 checkbox 文本块”，支持快速聚焦未完成条目。

---

## 1. 产品定位

Electron 桌面任务笔记应用，采用“库面板（Library）+ 置顶便签（Sticky）”双窗口形态：
- `Library` 负责任务树管理、搜索与任务状态管理。
- `Sticky` 负责沉浸式编辑、快速导航和置顶便签工作流。
- 任务正文使用块编辑器（Tiptap），通过链接块承载“子任务入口”。

---

## 2. 当前代码基线（截至 2026-02-07）

### 2.1 技术栈
- 主进程：Electron + TypeScript
- 渲染进程：React 18 + Zustand
- 编辑器：Tiptap（StarterKit + TaskList + TaskItem + 自定义 TaskLink）
- 数据层：better-sqlite3 + FTS5

### 2.2 数据模型
- `tasks`：任务主表（含 `blocks` JSON、完成/归档/回收状态）
  - `codexCwd`：子页绑定的 Codex 项目路径，对应数据库列 `codex_cwd`；它表示 Codex 命令在哪个项目目录下执行。
  - `codexSessionId`：子页绑定的 Codex 会话 ID，对应数据库列 `codex_session_id`；同一子页永远复用这一个会话 ID。
- `edges`：父子关系表（关系独立于正文链接块）
- `window_states`：窗口状态与导航路径
- `sticky_bookmarks`：便签书签栏
- `reminders`：提醒
- `attachments`：附件元数据
- `tasks_fts`：全文检索索引（应用层写入维护）

---

## 3. P0 需求与实现状态

### 3.1 已实现
- 任务 CRUD、递归删除/恢复、30 天回收站清理。
- 任务树与搜索（标题 + 正文文本，支持归档/回收站筛选）。
- 任务树在内容超出面板高度时支持垂直滚动浏览，避免节点被裁切。
- 块编辑器基础能力（段落/标题/列表/待办/引用/代码块）与自定义链接块。
- 正文标题折叠：
  - 在 `Library` 详情页与 `Sticky` 便签正文中，标题左侧显示折叠按钮。
  - 点击后可临时隐藏该标题下的内容，隐藏范围到下一个同级标题或更高级标题。
  - 折叠状态仅保留在当前窗口会话内，不写入任务 `blocks` 数据，不跨重启保留。
- “文本块 → 子任务”转换：
  - 快捷键：`Ctrl/Cmd + Shift + T`
  - 右键菜单：`转换为子任务`
- 链接块行为：打开子任务 / 新窗口打开 / 删除链接块（不删子任务）。
- 子任务入口恢复：
  - `Library` 详情页：顶部下拉插入已有子任务链接
  - `Sticky` 便签：右键菜单“插入子任务”二级列表插入已有子任务链接
  - `Sticky` 右键菜单以独立弹窗窗口渲染（非宿主内层浮层），不受便签可视区域裁切
  - 插入候选仅包含“当前任务下尚未在正文引用”的子任务
  - 右键菜单在候选过多时支持内部滚动，确保可访问全部候选项
- 面包屑导航与历史前进后退（含 `Alt + ←/→`）。
  - 面包屑同级下拉仅展示未完成、未归档、未删除任务。
- 多窗口体系：
  - 支持同一任务开多个置顶便签
  - sticky 便签按“顶层父任务”共享书签与皮肤状态
  - 右键“打开置顶便签/在新便签中打开”时，默认落在被打开任务路径
  - sticky 书签栏“状态（n）”点击可展开/收起状态工作台弹层
  - 状态工作台只展示 `进行中 / 等待中 / 待开始` 三个 Tab
  - 右键菜单通过 `状态标记...` 设置块级状态：进行中、等待中、待开始、已完成、清除状态
  - 底部快捷状态按钮支持对当前正文目标行快速设置 `进行中`、`等待中`、`待开始`、`已完成`
  - 底部快捷状态按钮的目标行以最后一次用户真实点击到的正文块为准；状态工作台跳转、按钮抢焦、弹窗打开不应把目标行改成上一行或其他行
  - 同一视觉文本块只允许保留一个状态：如果列表项或 checkbox 行同时存在外层 `listItem/taskItem` 和内层 `paragraph`，后写入的状态会清除同一父子链路上的旧状态
  - 点击状态条目后可跳转并定位到对应文本块；底部左右按钮可在当前 Tab 的状态块间连续跳转
  - 正文块支持块级状态：
    - `workStatus`：人工状态，取值为 `todo`（待开始）、`doing`（进行中）、`waiting`（等待中）、`done`（已完成）
    - `plannedStartAt`：预计开始时间，毫秒时间戳
    - `plannedDurationMinutes`：预计持续时长，单位分钟
    - `waitReason`：等待原因文本
    - `waitReviewAt`：等待回看时间，毫秒时间戳，可为空
  - 已完成状态只影响当前文本块：正文显示已完成徽标并划掉，不同步完成整个任务页，也不进入状态工作台
  - 等待中是进行中计时的暂停状态：如果从进行中切到等待中，会保存剩余预计时长；从等待中切回进行中，会从保存的剩余时长恢复倒计时
  - 待开始块从 `plannedStartAt` 起算，如果应用运行期间跨过 5 / 10 / 30 / 60 分钟仍保持 `todo`，会分别发送一次 macOS 系统通知；应用关闭期间错过的分段提醒不会在启动时补发
  - 等待中块从 `waitReviewAt` 起算，0 分钟保留“等待回看时间到了”通知；如果运行期间跨过 5 / 10 / 30 / 60 分钟仍保持 `waiting`，会分别发送一次 macOS 系统通知；应用关闭期间错过的分段提醒不会在启动时补发
  - 状态条目汇总范围为“当前共享根任务及其未完成、未归档、未删除的子孙任务”
  - 窗口状态持久化与重启恢复
  - 窗口贴边吸附（20px）与最小可见保护
- Codex 子页会话第一版：
  - Library 窗口标题栏提供 Codex 模式切换按钮，按钮文案为 `Codex: Terminal` 或 `Codex: App`；该设置是全局设置，保存在 `app_settings` 表中，默认值为 `terminal`。
  - `terminal` 模式表示由 todonotes 后台执行 Codex CLI：首次使用 `codex exec --json --cd <DIR> <prompt>` 创建会话，后续使用 `codex exec resume --json <SESSION_ID> <prompt>` 继续会话，查看时打开 macOS Terminal 执行 `codex resume --include-non-interactive --cd <DIR> <SESSION_ID>`。
  - `app` 模式表示由 Codex App 承担完整对话 UI：首次追问打开 `codex://threads/new?path=<DIR>&prompt=<URL_ENCODED_PROMPT>`，已有会话打开 `codex://threads/<SESSION_ID>`；同时把完整 prompt 写入剪贴板，方便用户在 Codex App 中粘贴继续。
  - `app` 模式的 prompt 会追加 todonotes CLI 回调命令：
    - `codex-session --task <taskId> --session <sessionId>`：把当前子页绑定到 Codex App 的本地 thread ID；首次会话可让 Codex 先执行 `/status`，再用看到的 thread ID 替换命令中的占位符。
    - `codex-done --task <taskId> --block <blockId> --session <sessionId>`：表示 AI 已返回结果；todonotes 会把对应文本块设为 `doing`，等待原因写成 `AI已返回结果`，并保存 `codexSessionId`。
    - `codex-failed --task <taskId> --block <blockId> --reason 失败`：表示 AI 处理失败；todonotes 会让对应文本块保持 `waiting`，等待原因写成 `失败`。
  - todonotes CLI 回调只调用本机 `127.0.0.1:17373/codex/callback`，要求 todonotes 应用正在运行；它不会访问外网。
  - 子页第一次右键文本块选择“用当前块追问 Codex”时，如果当前子页没有 `codexCwd`，会先弹出文本输入框要求配置项目绝对路径。
  - `codexCwd` 是 Codex 运行目录，主进程会用它作为 `codex exec --cd <DIR>` 的项目路径。
  - Codex CLI 可执行文件会自动查找；如果自动查找失败，可以设置环境变量 `CODEX_CLI_PATH`，它表示 `codex` 命令的绝对路径。
  - 当前子页没有 `codexSessionId` 时，首次追问通过 `codex exec --json --cd <DIR> <prompt>` 创建新会话，并从 JSONL 事件里的 `thread_id` 保存会话 ID。
  - 当前子页已有 `codexSessionId` 时，后续文本块通过 `codex exec resume --json <SESSION_ID> <prompt>` 继续同一对话。
  - 追问文本来自右键命中的当前文本块；空文本块不发送。
  - AI 处理中复用块状态 `waiting`，等待原因写为 `AI处理中`；AI 成功结束后转为 `doing`，并显示 `进行中.AI已返回结果:xxm`；AI 失败后保持 `waiting`，等待原因写为 `失败`。
  - Sticky 底部快捷按钮组提供 `AI` 按钮，作用等同于右键菜单“用当前块追问 Codex”；当前块为空时不发送。
  - 右键菜单提供“打开本页 Codex 会话”；没有 `codexSessionId` 时禁用；有会话时在 macOS Terminal 中执行 `codex resume --include-non-interactive --cd <DIR> <SESSION_ID>`。
  - `--include-non-interactive` 表示允许继续 `codex exec` 创建的非交互式会话；`--cd <DIR>` 表示续聊时把 Codex 工作目录设为当前子页保存的 `codexCwd`。
  - 同一个 `codexSessionId` 重复打开时，会先查找正在运行的 `codex resume ... <SESSION_ID>` 进程；如果找到，就按该进程所在 TTY 激活对应 Terminal tab，找不到时才新建 tab。
  - 后台 AI 成功完成后，如果同一个 `codexSessionId` 已经有 Terminal tab 打开，会在同一个 tab 中重新执行 `codex resume` 来刷新对话内容；如果没有打开过终端，则不自动弹出 Terminal。
  - 官方 `codex://threads/<SESSION_ID>` deep link 格式仍然有效，但当前第一版由 `codex exec` 创建的会话实测会出现 Codex App 打开后一直 loading，因此暂不作为默认打开路径。
  - 第一版不引入 worktree，不新增 AI 工作台，不内嵌完整对话和 diff 展示。
  - 透明度、置顶、便签皮肤面板
- 提醒触发链路：运行中轮询 + 启动时过期检查 + 合并弹窗提示。
- 数据变更广播：`task:updated` / `task:deleted` / `window:settings-updated`。

### 3.2 部分实现（有后端能力，缺前端闭环）
- 提醒：已具备数据与调度能力，但缺“创建/管理提醒”UI 入口。
- 附件：已具备存储与查询 API，但缺渲染层附件面板/文件块交互。

### 3.3 未实现（相对原目标）
- 粘贴 Markdown 自动解析（当前仅实现复制为 Markdown、图片粘贴为 base64）。
- 并发编辑冲突提示（当前策略仍为 Last-write-wins + 自动覆盖刷新）。
- Snooze（5/10/30 分钟）。
- 搜索摘要高亮。

---

## 4. 核心业务规则（当前有效）

- 父子关系以 `edges` 为准，链接块仅为入口展示。
- 删除链接块不会影响 `edges` 与子任务实体。
- 删除父任务会递归进入回收站；恢复父任务会递归恢复子任务。
- 进入回收站时清除归档标记，避免状态叠加混乱。
- 多窗口编辑一致性：写入后广播，其他窗口自动刷新覆盖。
- sticky 共享根规则：同一顶层父任务下多个便签共享书签与皮肤状态。
- sticky 打开规则：新开便签定位到目标任务路径，但共享根保持顶层父任务。
- 会话恢复按窗口实例恢复，包含 `rootTaskId + navPathTaskIds`。

---

## 5. 下一阶段目标（用于 plan 对齐）

### 5.1 P0 闭环补齐
1. 提醒设置 UI（创建、删除、列表）。
2. 附件 UI（上传、列表、定位文件）。
3. Markdown 粘贴解析（常见块结构）。

### 5.2 P1 增强
1. 提醒 Snooze。
2. 并发冲突提示与更细粒度刷新策略。
3. 搜索高亮摘要与过滤增强。

### 5.3 状态工作台（M0.13-R22 已实现）
1. 目标与统一入口
   - 本轮目标是把 Sticky 的“待处理”升级为“状态工作台”，不再使用旧手动待处理书签作为文本块工作流入口。
   - Sticky 继续作为“执行工作台”：
     - `进行中`：当前正在处理的文本块。
     - `等待中`：被外部事项卡住的文本块，可填写等待原因和可选回看时间。
     - `待开始`：已经安排预计开始时间和预计持续时长的文本块。
   - `已完成` 只在正文中显示完成样式，不进入工作台。
2. 数据范围与字段定义
   - 状态挂在“正文块”上，不挂在整个任务上。
   - 这里的“正文块”指编辑器中的单条内容块，首轮包含：
     - `paragraph`：普通段落
     - `heading`：标题
     - `listItem`：普通列表项
     - `taskItem`：checkbox 任务项
   - 首轮不支持对子任务链接卡片 `taskLink` 直接设置状态。
   - 每个正文块最多只有一个 `workStatus`：
     - `todo`：待开始。保存时同时写入 `plannedStartAt` 和 `plannedDurationMinutes`。
     - `doing`：进行中。按最近设置/更新时间排序。
     - `waiting`：等待中。保存时写入 `waitReason`，可选写入 `waitReviewAt`。
     - `done`：已完成。正文划掉，不进入工作台。
3. Sticky 右键入口
   - 在正文块右键菜单中提供 `状态标记...`：
     - `进行中`：写入 `workStatus: "doing"`。
     - `等待中...`：打开输入窗口，填写等待原因和可选回看时间，写入 `workStatus: "waiting"`。
     - `待开始...`：打开时间窗口，填写预计开始时间和预计持续时长，写入 `workStatus: "todo"`。
     - `已完成`：写入 `workStatus: "done"`。
     - `清除状态`：清除 `workStatus`、`workStatusUpdatedAt`、`plannedStartAt`、`plannedDurationMinutes`、`waitReason`、`waitReviewAt`。
   - 进行中预计持续时长、待开始预计持续时长、等待中回看时间统一提供 5 / 10 / 15 / 20 / 30 / 45 / 60 / 90 / 120 分钟快捷按钮，并支持手动输入或选择具体时间；等待中回看快捷按钮表示“当前时间 + 对应分钟”。
4. 正文块前的显示规则
   - 状态正文块在块前显示状态徽标：
     - `待开始 · 14:00 · 45m`
     - `进行中`
     - `等待: 客户确认`
     - `等待: 客户确认 · 15:00回看`
     - `已完成`
   - 已完成文本块显示已完成徽标，并划掉正文内容。
   - 待开始块如果当前时间超过 `plannedStartAt + plannedDurationMinutes * 60 * 1000`，显示 `超计划xxm/xxh`。
5. Sticky 状态工作台与排序
   - Sticky 书签栏提供一个 `状态 (n)` 入口。
   - 弹层只显示三个 Tab：`进行中 / 等待中 / 待开始`。
   - `进行中` 按 `workStatusUpdatedAt` 最近更新时间倒序。
   - `等待中` 先展示已到回看时间的块，再按未来回看时间从近到远排序，没有回看时间的排最后。
   - `待开始` 中，已超过计划结束时间的块排最前，其余按预计开始时间从近到远排序。
   - 点击工作台条目会跳转并定位到对应文本块；底部左右按钮按当前 Tab 的排序结果切换。
6. 本轮明确不做的范围
   - 不把该能力接到 `reminders` 表或提醒弹窗闭环里。
   - 不在 Library 新增独立状态工作台。
   - 不新增任务级状态字段。
   - 不支持对子任务链接卡片 `taskLink` 直接挂状态。
   - 不做旧 `dueAt` 和旧手动待处理书签的数据迁移。

### 5.4 子任务交互增强（`Docs/NEW_FEATURES.md` #1.1~1.3）
1. 链接块保持“内联形态”，增强为带 checkbox 的卡片样式，并在 `Library` 详情页与 `Sticky` 中一致支持。
2. 链接块 checkbox 与任务完成状态双向同步：卡片勾选可更新任务树，任务树/详情页勾选可回写卡片展示。
3. 便签正文 markdown checkbox 与子任务完成状态双向同步：仅对“已关联子任务”的 checkbox 生效，普通 checkbox 不受影响。
4. 子任务标题支持在 `Library` 详情页顶部与 `Sticky` 顶部直接编辑。
5. 重命名后同步更新所有引用位置：
   - 正文中的 `taskLink` 标题
   - 便签书签标题
   - 已关联 markdown checkbox 文本
6. 子任务标题在同一父任务下不支持同名（兄弟子任务唯一，跨父任务允许同名）。
7. 完成态同步遵循“最新用户操作优先”：跨窗口/多入口并发更新时，晚到响应不得覆盖最新勾选结果。
8. 任务树重命名子任务后，父任务正文中的对应链接节点需保持 `taskLink` 样式，不得退化为纯文本。

---

## 6. 验收基线（文档版本）

- 文档与当前仓库代码保持一致，不引入未实现功能作为“已完成”。
- 需求、计划、假设、决策四文档可以互相引用并追溯。
- 每次里程碑交付后同步更新 `plan.md` 与 `DECISIONS.md`。
