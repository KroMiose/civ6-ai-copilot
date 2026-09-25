#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
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

const bundledRuntime = path.join(scriptDir, "context-runtime.mjs");
if (existsSync(bundledRuntime)) {
  const bundled = spawnSync(process.execPath, [bundledRuntime, ...process.argv.slice(2)], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  forward(bundled);
}

const runtime = await readRuntimeConfig();
const args = ["run", "--silent", "context", "--", ...(query ? ["--query", query] : []), ...passthrough];

if (runtime?.toolingDir) {
  const npm = resolveNpmInvocation();
  const result = spawnSync(npm.command, [...npm.args, ...args], {
    cwd: runtime.toolingDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: npm.shell
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

// Windows 上 npm 只有 npm.cmd 这个批处理入口，而 Node >= 20 起（CVE-2024-27980 加固）
// 不允许在不启用 shell 的情况下启动 .cmd/.bat，spawnSync 会直接返回 EINVAL。
// 启用 shell 虽然能启动，但 cmd.exe 会破坏参数：含 & ^ % " 等字符的 query 会被截断，
// 例如 "cities & units" 只传成 "cities"。
// 因此优先用当前 Node 直接执行 npm 自带的 JS 入口，既绕开 .cmd 限制，也保住参数原样传递。
function resolveNpmInvocation() {
  if (process.platform !== "win32") {
    return { command: "npm", args: [], shell: false };
  }
  const npmCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (existsSync(npmCli)) {
    return { command: process.execPath, args: [npmCli], shell: false };
  }
  // 找不到 npm 自带入口时只能退回 .cmd，此时必须启用 shell 才能启动。
  return { command: "npm.cmd", args: [], shell: true };
}

function forward(result) {
  // 启动失败（如 ENOENT/EINVAL）时不要静默退出，交给下一个入口兜底，
  // 否则调用方只会看到「无输出 + 退出码 1」，无法判断失败原因。
  if (result.error) return;
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.status ?? 1;
  process.exit();
}
