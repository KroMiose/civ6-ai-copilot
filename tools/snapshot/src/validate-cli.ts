#!/usr/bin/env tsx
import { program } from "commander";
import { validateSnapshotFile } from "./validate.js";

program
  .name("civ6-ai-copilot-validate")
  .description("Validate a civ6-ai-copilot snapshot against schema and multiplayer fairness checks.")
  .argument("<snapshot>", "Path to snapshot JSON.")
  .parse();

const [snapshotPath] = program.args;
const result = await validateSnapshotFile(snapshotPath);
console.log(JSON.stringify(result, null, 2));

if (!result.ok) {
  process.exitCode = 1;
}
