import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contextScript = path.join(repoRoot, "skill", "scripts", "context.mjs");

// 含 cmd.exe 元字符的 query：一旦这个入口通过 shell 启动，参数会被截断或改写。
const trickyQuery = 'cities & units "quoted" %PATH% ^caret';

test("skill context runtime forwards the query to the tooling entry without mangling it", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-context-"));
  const toolingDir = path.join(tempDir, "tooling");
  const skillRoot = path.join(tempDir, "skill");
  try {
    // 复制真实入口到临时 skill 目录，并写入指向临时 tooling 的 runtime.json。
    await mkdir(path.join(skillRoot, "scripts"), { recursive: true });
    await cp(contextScript, path.join(skillRoot, "scripts", "context.mjs"));
    await writeFile(
      path.join(skillRoot, "runtime.json"),
      `${JSON.stringify({ contractVersion: "1", toolingDir }, null, 2)}\n`,
      "utf8"
    );

    // 假 tooling：把收到的 argv 原样回显，用于断言参数是否被 shell 破坏。
    await mkdir(toolingDir, { recursive: true });
    await writeFile(
      path.join(toolingDir, "package.json"),
      `${JSON.stringify(
        { name: "civ6-ai-copilot-fake-tooling", version: "0.0.0", scripts: { context: "node echo-argv.mjs" } },
        null,
        2
      )}\n`,
      "utf8"
    );
    await writeFile(
      path.join(toolingDir, "echo-argv.mjs"),
      'console.log(JSON.stringify({ argv: process.argv.slice(2) }));\n',
      "utf8"
    );

    const result = spawnSync(
      process.execPath,
      [path.join(skillRoot, "scripts", "context.mjs"), "--query", trickyQuery],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );

    // 在 Windows 上，入口若用不带 shell 的 npm.cmd 启动会得到 EINVAL 并被静默吞掉：
    // stdout 为空、stderr 为空、退出码 1。这条断言专门拦住这种形态。
    assert.equal(result.error, undefined, String(result.error));
    assert.notEqual(result.stdout.trim(), "", `context runtime produced no output; stderr=${result.stderr}`);

    const forwarded = JSON.parse(result.stdout) as { argv: string[] };
    const queryIndex = forwarded.argv.indexOf("--query");
    assert.notEqual(queryIndex, -1, `--query should survive forwarding: ${result.stdout}`);
    assert.equal(forwarded.argv[queryIndex + 1], trickyQuery, "query must not be truncated or rewritten");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
