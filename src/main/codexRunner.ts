import { spawn } from "child_process";
import { app, clipboard, shell } from "electron";
import fs from "fs";
import os from "os";
import path from "path";

interface CodexRunResult {
  sessionId: string | null;
  finalMessage: string;
}

export const TODO_NOTES_CALLBACK_PORT = 17373;

const TODO_NOTES_CLI_BRIDGE = `#!/usr/bin/env node

const http = require("node:http");

const PORT = 17373;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (!item.startsWith("--")) {
      continue;
    }
    const key = item.slice(2);
    const value = rest[index + 1];
    options[key] = value;
    index += 1;
  }
  return options;
}

function postCallback(payload) {
  const body = JSON.stringify(payload);
  const req = http.request(
    {
      hostname: "127.0.0.1",
      port: PORT,
      path: "/codex/callback",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    },
    (res) => {
      let response = "";
      res.on("data", (chunk) => {
        response += chunk.toString("utf8");
      });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          console.log("todonotes callback ok");
          return;
        }
        console.error(response || \`todonotes callback failed: \${res.statusCode}\`);
        process.exit(1);
      });
    }
  );
  req.on("error", (error) => {
    console.error(\`todonotes callback failed: \${error.message}\`);
    process.exit(1);
  });
  req.write(body);
  req.end();
}

const args = parseArgs(process.argv.slice(2));
const allowedCommands = ["codex-done", "codex-failed", "codex-session"];
if (!args.command || !allowedCommands.includes(args.command)) {
  console.error("Usage: todonotes-cli codex-done|codex-failed|codex-session --task <taskId> [--block <blockId>] [--session <sessionId>] [--reason <reason>]");
  process.exit(1);
}
if (!args.task) {
  console.error("Missing required --task");
  process.exit(1);
}
if (args.command !== "codex-session" && !args.block) {
  console.error("Missing required --block");
  process.exit(1);
}
if (args.command === "codex-session" && !args.session) {
  console.error("Missing required --session");
  process.exit(1);
}

postCallback({
  event: args.command === "codex-done" ? "done" : args.command === "codex-failed" ? "failed" : "session",
  taskId: args.task,
  blockId: args.block,
  sessionId: args.session,
  reason: args.reason
});
`;

const TODO_NOTES_CALLBACK_SKILL = `---
name: todonotes-callback
description: 当用户提示词包含 todonotes_callback 上下文块时使用；在本次 Codex 任务结束前，执行 todonotes 本地 CLI 回调命令，把源文本块状态更新回正在运行的 todonotes 桌面应用。
---

# todonotes 回调

当用户提示词包含 \`todonotes_callback\` 块时，把它视为 todonotes 桌面应用传入的任务元数据。

## 必须执行

1. 正常完成用户提出的实际任务。
2. 在结束本次回复前，读取 \`todonotes_callback\` 块。
3. 如果 \`sessionId\` 为空，先运行 \`/status\` 或用其他方式取得当前 Codex thread ID，然后执行：
   \`node <cliPath> codex-session --task <taskId> --session <threadId>\`
4. 如果任务成功完成，执行：
   \`node <cliPath> codex-done --task <taskId> --block <blockId> --session <threadId>\`
5. 如果任务失败或被阻塞，执行：
   \`node <cliPath> codex-failed --task <taskId> --block <blockId> --reason "失败"\`

## 字段说明

- \`cliPath\` 是 todonotes 本地 CLI 桥接脚本的绝对路径。
- \`taskId\` 是 todonotes 子页 ID。
- \`blockId\` 是发起本次 AI 的文本块 ID。
- \`sessionId\` 是已保存的 Codex thread ID；如果它存在，就把它作为 \`<threadId>\`。
- CLI 会请求 \`127.0.0.1:17373\`，所以 todonotes 必须保持运行。
- 除非回调失败且需要用户手动重试，否则不要把这些回调命令写进面向用户的最终回答。
`;

function parseCodexJsonLine(line: string, current: CodexRunResult): CodexRunResult {
  try {
    const event = JSON.parse(line) as {
      type?: string;
      thread_id?: string;
      item?: { type?: string; text?: string };
    };
    const sessionId = typeof event.thread_id === "string" && event.thread_id ? event.thread_id : current.sessionId;
    const finalMessage =
      event.item?.type === "agent_message" && typeof event.item.text === "string" && event.item.text.trim()
        ? event.item.text
        : current.finalMessage;
    return { sessionId, finalMessage };
  } catch {
    return current;
  }
}

function buildCodexArgs(input: { sessionId?: string | null; cwd: string; prompt: string }) {
  if (input.sessionId) {
    return ["exec", "resume", "--json", input.sessionId, input.prompt];
  }
  return ["exec", "--json", "--cd", input.cwd, input.prompt];
}

function isExecutable(filePath: string) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findExecutableOnPath(command: string) {
  const pathValue = process.env.PATH ?? "";
  const match = pathValue
    .split(path.delimiter)
    .filter(Boolean)
    .map((dir) => path.join(dir, command))
    .find((candidate) => isExecutable(candidate));
  return match ?? null;
}

function findNvmCodexExecutable() {
  const nvmVersionsDir = path.join(os.homedir(), ".nvm", "versions", "node");
  try {
    return fs
      .readdirSync(nvmVersionsDir)
      .map((version) => path.join(nvmVersionsDir, version, "bin", "codex"))
      .filter((candidate) => isExecutable(candidate))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
      .at(-1) ?? null;
  } catch {
    return null;
  }
}

function resolveCodexExecutable() {
  const configuredPath = process.env.CODEX_CLI_PATH?.trim();
  if (configuredPath && isExecutable(configuredPath)) {
    return configuredPath;
  }
  return (
    findExecutableOnPath("codex") ??
    findNvmCodexExecutable() ??
    ["/opt/homebrew/bin/codex", "/usr/local/bin/codex", "/Applications/Codex.app/Contents/Resources/codex"]
      .find((candidate) => isExecutable(candidate)) ??
    null
  );
}

export function runCodexBlockPrompt(input: { sessionId?: string | null; cwd: string; prompt: string }): Promise<CodexRunResult> {
  const args = buildCodexArgs(input);
  return new Promise((resolve, reject) => {
    const codexExecutable = resolveCodexExecutable();
    if (!codexExecutable) {
      reject(new Error("找不到 Codex CLI。请确认终端里可以执行 codex，或设置 CODEX_CLI_PATH 指向 codex 可执行文件。"));
      return;
    }
    const child = spawn(codexExecutable, args, {
      cwd: input.cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let result: CodexRunResult = { sessionId: input.sessionId ?? null, finalMessage: "" };
    let stdoutBuffer = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBuffer += chunk.toString("utf8");
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      lines.forEach((line) => {
        if (line.trim()) {
          result = parseCodexJsonLine(line, result);
        }
      });
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (stdoutBuffer.trim()) {
        result = parseCodexJsonLine(stdoutBuffer.trim(), result);
      }
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Codex 执行失败，退出码 ${code ?? "未知"}`));
        return;
      }
      resolve(result);
    });
  });
}

function buildCodexAppPrompt(input: { taskId: string; blockId: string; prompt: string; sessionId?: string | null }) {
  const cliPath = ensureTodonotesCliBridge();
  ensureTodonotesCallbackSkill();
  return [
    input.prompt,
    "",
    "请在本次对话结束前使用 todonotes-callback skill，把处理结果回写到 todonotes；如果 skill 未自动加载，请读取 ~/.codex/skills/todonotes-callback/SKILL.md。",
    "",
    "<todonotes_callback>",
    `cliPath: ${cliPath}`,
    `taskId: ${input.taskId}`,
    `blockId: ${input.blockId}`,
    `sessionId: ${input.sessionId ?? ""}`,
    "</todonotes_callback>"
  ].join("\n");
}

export async function startCodexAppPrompt(input: { taskId: string; blockId: string; sessionId?: string | null; cwd?: string | null; prompt: string }) {
  const prompt = buildCodexAppPrompt(input);
  clipboard.writeText(prompt);
  if (input.sessionId) {
    await shell.openExternal(`codex://threads/${encodeURIComponent(input.sessionId)}`);
    return { sessionId: input.sessionId, message: "已打开 Codex App，会话 prompt 已复制到剪贴板，请粘贴发送。" };
  }
  const pathParam = input.cwd?.trim() ? `path=${encodeURIComponent(input.cwd.trim())}&` : "";
  const url = `codex://threads/new?${pathParam}prompt=${encodeURIComponent(prompt)}`;
  await shell.openExternal(url);
  const scopeText = input.cwd?.trim() ? "项目会话" : "纯对话";
  return { sessionId: null, message: `已打开 Codex App 新${scopeText}，并复制了 prompt。首次完成前请让 Codex 使用 todonotes-callback skill 写入 sessionId 和任务状态。` };
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function ensureTodonotesCliBridge() {
  const bridgePath = path.join(app.getPath("userData"), "todonotes-cli.cjs");
  try {
    fs.writeFileSync(bridgePath, TODO_NOTES_CLI_BRIDGE, { mode: 0o755 });
  } catch {
    // 如果 userData 写入失败，退回开发态脚本路径，后续命令失败时会由 CLI 自己报错。
    return path.join(app.getAppPath(), "scripts", "todonotes-cli.cjs");
  }
  return bridgePath;
}

function ensureTodonotesCallbackSkill() {
  const skillPath = path.join(os.homedir(), ".codex", "skills", "todonotes-callback", "SKILL.md");
  try {
    fs.mkdirSync(path.dirname(skillPath), { recursive: true });
    fs.writeFileSync(skillPath, TODO_NOTES_CALLBACK_SKILL);
  } catch {
    // skill 写入失败时仍可发起 Codex App 会话，只是回调说明会退化为普通 prompt 文本。
  }
}

interface RunningCodexResume {
  tty: string;
  pids: number[];
}

function findRunningCodexResumes(sessionId: string): Promise<RunningCodexResume[]> {
  return new Promise((resolve) => {
    const child = spawn("ps", ["-axo", "pid=,tty=,command="], {
      env: { ...process.env, COLUMNS: "4096" },
      stdio: ["ignore", "pipe", "ignore"]
    });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.on("error", () => resolve([]));
    child.on("close", () => {
      const byTty = new Map<string, number[]>();
      stdout
        .split(/\r?\n/)
        .forEach((entry) => {
          const trimmed = entry.trim();
          if (!trimmed.includes(sessionId) || !trimmed.includes("codex") || !trimmed.includes("resume")) {
            return;
          }
          const match = trimmed.match(/^(\d+)\s+(\S+)\s+(.+)$/);
          if (!match) {
            return;
          }
          const pid = Number(match[1]);
          const tty = match[2];
          if (!Number.isFinite(pid) || tty === "??") {
            return;
          }
          const key = `/dev/${tty}`;
          byTty.set(key, [...(byTty.get(key) ?? []), pid]);
        });
      resolve([...byTty.entries()].map(([tty, pids]) => ({ tty, pids })));
    });
  });
}

async function activateTerminalTabByTty(tty: string) {
  const terminalScript = [
    `set targetTty to ${JSON.stringify(tty)}`,
    'tell application "Terminal"',
    "  activate",
    "  repeat with terminalWindow in windows",
    "    repeat with terminalTab in tabs of terminalWindow",
    "      set tabTty to \"\"",
    "      try",
    "        set tabTty to tty of terminalTab",
    "      end try",
    "      if tabTty is targetTty then",
    "        set selected tab of terminalWindow to terminalTab",
    "        set index of terminalWindow to 1",
    "        return",
    "      end if",
    "    end repeat",
    "  end repeat",
    "end tell"
  ].join("\n");
  await runOsaScript(terminalScript);
}

async function runCommandInTerminalTabByTty(tty: string, command: string) {
  const terminalScript = [
    `set targetTty to ${JSON.stringify(tty)}`,
    'tell application "Terminal"',
    "  activate",
    "  repeat with terminalWindow in windows",
    "    repeat with terminalTab in tabs of terminalWindow",
    "      set tabTty to \"\"",
    "      try",
    "        set tabTty to tty of terminalTab",
    "      end try",
    "      if tabTty is targetTty then",
    "        set selected tab of terminalWindow to terminalTab",
    "        set index of terminalWindow to 1",
    `        do script ${JSON.stringify(command)} in terminalTab`,
    "        return",
    "      end if",
    "    end repeat",
    "  end repeat",
    "end tell"
  ].join("\n");
  await runOsaScript(terminalScript);
}

function runOsaScript(script: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("osascript", ["-e", script], { stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`打开终端失败，退出码 ${code ?? "未知"}`));
    });
  });
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function stopCodexResumeProcesses(resumes: RunningCodexResume[]) {
  const pids = resumes.flatMap((resume) => resume.pids);
  pids.forEach((pid) => {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // 进程可能已经自然退出，忽略即可。
    }
  });
  if (pids.length > 0) {
    await wait(500);
  }
}

function buildCodexResumeCommand(sessionId: string, cwd?: string | null) {
  const codexExecutable = resolveCodexExecutable();
  const command = codexExecutable ? shellQuote(codexExecutable) : "codex";
  const cdArg = cwd?.trim() ? ` --cd ${shellQuote(cwd.trim())}` : "";
  return `${command} resume --include-non-interactive${cdArg} ${shellQuote(sessionId)}`;
}

export async function refreshOpenCodexSession(sessionId: string, cwd?: string | null) {
  const runningResumes = await findRunningCodexResumes(sessionId);
  const targetTty = runningResumes[0]?.tty;
  if (!targetTty) {
    return { refreshed: false };
  }
  await stopCodexResumeProcesses(runningResumes);
  await runCommandInTerminalTabByTty(targetTty, buildCodexResumeCommand(sessionId, cwd));
  return { refreshed: true };
}

export async function openCodexSession(sessionId: string, cwd?: string | null) {
  const runningResume = (await findRunningCodexResumes(sessionId))[0];
  if (runningResume) {
    await activateTerminalTabByTty(runningResume.tty);
    return { opened: true, method: "terminal" as const };
  }

  const command = buildCodexResumeCommand(sessionId, cwd);
  const terminalScript = [
    'tell application "Terminal"',
    "  activate",
    `  do script ${JSON.stringify(command)}`,
    "end tell"
  ].join("\n");
  await runOsaScript(terminalScript);
  return { opened: true, method: "terminal" as const };
}
