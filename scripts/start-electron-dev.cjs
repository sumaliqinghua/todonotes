#!/usr/bin/env node

const { spawn } = require("node:child_process");
const electron = require("electron");

const args = process.argv.slice(2);
const electronArgs = args.length > 0 ? args : ["."];
const env = { ...process.env };

delete env.ELECTRON_RUN_AS_NODE;
env.NODE_ENV = "development";

const child = spawn(electron, electronArgs, {
  stdio: "inherit",
  env,
  windowsHide: false
});

child.on("close", (code, signal) => {
  if (code === null) {
    process.exit(signal ? 1 : 0);
    return;
  }
  process.exit(code);
});

const forwardSignal = (signal) => {
  process.on(signal, () => {
    if (!child.killed) {
      child.kill(signal);
    }
  });
};

forwardSignal("SIGINT");
forwardSignal("SIGTERM");
