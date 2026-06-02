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

export async function openCodexSession(sessionId: string, cwd?: string | null) {
  const cdArg = cwd?.trim() ? ` --cd ${shellQuote(cwd.trim())}` : "";
  const command = `codex resume --include-non-interactive${cdArg} ${shellQuote(sessionId)}`;
  const terminalScript = `tell application "Terminal"\n  activate\n  do script ${JSON.stringify(command)}\nend tell`;
  await new Promise<void>((resolve, reject) => {
    const child = spawn("osascript", ["-e", terminalScript], { stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`打开终端失败，退出码 ${code ?? "未知"}`));
    });
  });
  return { opened: true, method: "terminal" as const };
}
