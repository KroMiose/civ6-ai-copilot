#!/usr/bin/env tsx
import { readFile, writeFile } from "node:fs/promises";
import { program } from "commander";
import { buildSnapshotLogLinesWithCompletionDiagnostic } from "./parser.js";
import { PROTOCOL_VERSION, VERSION } from "../../project/src/version.js";

program
  .name("civ6-ai-copilot-create-fixture-log")
  .description("Create a fake Lua.log chunk stream from a sample snapshot fixture.")
  .requiredOption("-s, --snapshot <path>", "Path to snapshot JSON.")
  .requiredOption("-o, --output <path>", "Path to write fake Lua.log text.")
  .option("--export-id <id>", "Export id to embed.", "fixture-export-0001")
  .option("--chunk-size <bytes>", "Base64 characters per chunk.", "512")
  .parse();

const options = program.opts<{
  snapshot: string;
  output: string;
  exportId: string;
  chunkSize: string;
}>();

const snapshot = JSON.parse(await readFile(options.snapshot, "utf8"));
const lines = [
  "[Civ6] unrelated log line before export",
  `CIV6_AI_COPILOT_LOADED version=${VERSION}`,
  `CIV6_AI_COPILOT_DIAGNOSTIC ${JSON.stringify({
    modVersion: VERSION,
    protocolVersion: PROTOCOL_VERSION,
    reason: "loaded",
    hasBitlib: true,
    base64SelfTest: true,
    sha256SelfTest: true,
    hasControls: true,
    hasGame: true,
    hasPlayers: true,
    hasMap: true,
    hasUnitsInPlot: true,
    emittedAt: new Date(0).toISOString()
  })}`,
  ...buildSnapshotLogLinesWithCompletionDiagnostic(snapshot, {
    exportId: options.exportId,
    chunkSize: Number.parseInt(options.chunkSize, 10)
  }),
  "[Civ6] unrelated log line after export"
];

await writeFile(options.output, `${lines.join("\n")}\n`, "utf8");
console.log(JSON.stringify({ ok: true, output: options.output, lineCount: lines.length }, null, 2));
