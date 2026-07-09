import { mkdir, mkdtemp, writeFile, cp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { runPrivacyCheck } from "../tools/privacy/src/privacy-check.js";

test("privacy check passes the repository fixture state", async () => {
  const result = await runPrivacyCheck({ rootDir: path.resolve(".") });
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
});

test("privacy check rejects real-looking Civ6 logs, saves, and unapproved snapshots", async () => {
  const tempDir = await createPrivacyTestRoot();
  try {
    await writeFile(path.join(tempDir, "Lua.log"), "real log", "utf8");
    await writeFile(path.join(tempDir, "turn-0001-player-0.snapshot.json"), "{}", "utf8");
    await writeFile(path.join(tempDir, "example.Civ6Save"), "save", "utf8");

    const result = await runPrivacyCheck({ rootDir: tempDir });
    assert.equal(result.ok, false);
    assert.equal(result.issues.some((issue) => issue.path === "Lua.log"), true);
    assert.equal(result.issues.some((issue) => issue.path === "turn-0001-player-0.snapshot.json"), true);
    assert.equal(result.issues.some((issue) => issue.path === "example.Civ6Save"), true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("privacy check allows sample snapshot fixtures but validates them", async () => {
  const tempDir = await createPrivacyTestRoot();
  try {
    await mkdir(path.join(tempDir, "tests", "fixtures"), { recursive: true });
    await cp(
      path.resolve("tests/fixtures/minimal-player-visible.snapshot.json"),
      path.join(tempDir, "tests", "fixtures", "minimal-player-visible.snapshot.json")
    );

    const result = await runPrivacyCheck({ rootDir: tempDir });
    assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("privacy check rejects secret assignments and current-user home paths", async () => {
  const tempDir = await createPrivacyTestRoot();
  try {
    const fakeSecretName = "OPENAI" + "_API" + "_KEY";
    const fakeSecretValue = "sk-" + "abcdefghijklmnopqrstuvwxyz";
    await writeFile(path.join(tempDir, "notes.md"), `${fakeSecretName}=${fakeSecretValue}\n/Users/realuser/secret`, "utf8");

    const result = await runPrivacyCheck({ rootDir: tempDir, homeDir: "/Users/realuser" });
    assert.equal(result.ok, false);
    assert.equal(result.issues.some((issue) => issue.message.includes("credential")), true);
    assert.equal(result.issues.some((issue) => issue.message.includes("home path")), true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

async function createPrivacyTestRoot(): Promise<string> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-privacy-"));
  await writeFile(
    path.join(tempDir, ".gitignore"),
    ["*.Civ6Save", "Lua.log", "snapshots/", "*.snapshot.json"].join("\n"),
    "utf8"
  );
  return tempDir;
}
