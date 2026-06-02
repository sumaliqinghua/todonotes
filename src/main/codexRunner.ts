import { spawn } from "child_process";

interface CodexRunResult {
  sessionId: string | null;
  finalMessage: string;
}

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

export function runCodexBlockPrompt(input: { sessionId?: string | null; cwd: string; prompt: string }): Promise<CodexRunResult> {
  const args = buildCodexArgs(input);
  return new Promise((resolve, reject) => {
    const child = spawn("codex", args, {
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

function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
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
  const cdArg = cwd?.trim() ? ` --cd ${shellQuote(cwd.trim())}` : "";
  return `codex resume --include-non-interactive${cdArg} ${shellQuote(sessionId)}`;
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
