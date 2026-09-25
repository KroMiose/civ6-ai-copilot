#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.dirname(scriptDir);
const query = readArg("--query") ?? readArg("--question") ?? "";
const passthrough = process.argv.slice(2).filter((_, index, args) => {
  if (args[index - 1] === "--query" || args[index - 1] === "--question") return false;
  return args[index] !== "--query" && args[index] !== "--question";
});

const runtime = await readRuntimeConfig();
const args = ["run", "--silent", "context", "--", ...(query ? ["--query", query] : []), ...passthrough];

if (runtime?.toolingDir) {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(command, args, {
    cwd: runtime.toolingDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  forward(result);
}

const direct = spawnSync("civ6-ai-copilot-context", [...(query ? ["--query", query] : []), ...passthrough], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  shell: process.platform === "win32"
});
if (!direct.error) forward(direct);

console.log(JSON.stringify({
  contractVersion: "1",
  status: "runtime-error",
  readyForCopilot: false,
  exitCode: 1,
  generatedAt: new Date().toISOString(),
  query: query || undefined,
  userActions: [
    "civ6-ai-copilot Runtime 未注册。请从项目 checkout 或 release tooling 重新运行 skill:install。",
    "不要搜索或阅读项目源码来猜测运行路径。"
  ]
}, null, 2));
process.exitCode = 1;

async function readRuntimeConfig() {
  try {
    return JSON.parse(await readFile(path.join(skillDir, "runtime.json"), "utf8"));
  } catch {
    return undefined;
  }
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function forward(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.status ?? 1;
  process.exit();
}
