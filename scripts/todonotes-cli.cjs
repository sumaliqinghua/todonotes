#!/usr/bin/env node

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
        console.error(response || `todonotes callback failed: ${res.statusCode}`);
        process.exit(1);
      });
    }
  );
  req.on("error", (error) => {
    console.error(`todonotes callback failed: ${error.message}`);
    process.exit(1);
  });
  req.write(body);
  req.end();
}

const args = parseArgs(process.argv.slice(2));
if (!args.command || !["codex-done", "codex-failed", "codex-session"].includes(args.command)) {
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
