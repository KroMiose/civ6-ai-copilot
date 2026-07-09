import net from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSnapshotLogLinesWithCompletionDiagnostic } from "../tools/bridge/src/parser.js";
import { chooseDefaultState } from "../tools/tuner-bridge/src/nexus-client.js";
import { runTunerBridgeOnce } from "../tools/tuner-bridge/src/tuner-bridge.js";

const TAG_HANDSHAKE = 4;
const TAG_COMMAND = 3;
const TAG_OUTPUT = 0xffffffff;
const fixturePath = path.resolve("tests/fixtures/minimal-player-visible.snapshot.json");

test("tuner bridge defaults to the Mod-owned Lua state when it is available", () => {
  const states = new Map([
    ["Main State", 0],
    ["InGame", 119],
    ["civ6_ai_copilot", 123]
  ]);

  assert.equal(chooseDefaultState(states), "civ6_ai_copilot");
});

test("tuner bridge reads the cached Copilot export through a Nexus socket and writes latest.json", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-tuner-output-"));
  const server = await startFakeTunerServer({
    states: new Map([["InGame", 17]]),
    commandHandler: (command) => {
      assert.match(command, /ExposedMembers\.Civ6AICopilot/);
      assert.match(command, /latestExport/);
      assert.doesNotMatch(command, /collectSnapshot/);
      return buildSnapshotLogLinesWithCompletionDiagnostic(snapshot, {
        exportId: "tuner-export",
        chunkSize: 128
      });
    }
  });

  try {
    const result = await runTunerBridgeOnce({
      host: "127.0.0.1",
      ports: [server.port],
      outputDir,
      state: "InGame",
      timeoutMs: 1000
    });

    assert.equal(result.ok, true, JSON.stringify(result, null, 2));
    assert.equal("exportId" in result && result.exportId, "tuner-export");
    assert.equal("tuner" in result && result.tuner.port, server.port);
    assert.equal("tuner" in result && result.tuner.state, "InGame");

    if (!("written" in result) || !result.written) {
      assert.fail("expected tuner bridge to write snapshot outputs");
    }

    const latest = JSON.parse(await readFile(result.written.latestPath, "utf8"));
    assert.equal(latest.source.exportId, "tuner-export");
    assert.equal(latest.source.transport, "lua-log");
  } finally {
    await server.close();
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("tuner bridge reports a clear error when the requested Lua state is absent", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-tuner-missing-state-"));
  const server = await startFakeTunerServer({
    states: new Map([["Main State", 2]]),
    commandHandler: () => []
  });

  try {
    const result = await runTunerBridgeOnce({
      host: "127.0.0.1",
      ports: [server.port],
      outputDir,
      state: "InGame",
      timeoutMs: 1000
    });

    assert.equal(result.ok, false);
    assert.equal("error" in result && /unknown Lua state/.test(result.error), true);
  } finally {
    await server.close();
    await rm(outputDir, { recursive: true, force: true });
  }
});

async function startFakeTunerServer(options: {
  states: Map<string, number>;
  commandHandler: (command: string) => string[];
}): Promise<{ port: number; close: () => Promise<void> }> {
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.byteLength >= 8) {
        const length = buffer.readUInt32LE(0);
        const tag = buffer.readUInt32LE(4);
        if (buffer.byteLength < 8 + length) {
          break;
        }

        const payload = buffer.subarray(8, 8 + length);
        buffer = buffer.subarray(8 + length);
        const text = payload.toString("utf8").replace(/\0+$/g, "");

        if (tag === TAG_HANDSHAKE && text === "LSQ:") {
          sendFrame(socket, TAG_HANDSHAKE, encodeStates(options.states));
        }

        if (tag === TAG_COMMAND && text.startsWith("CMD:")) {
          const command = text.replace(/\nprint\("__CIV6_AI_COPILOT_TUNER_SENTINEL_[^"]+"\)$/, "");
          const lines = options.commandHandler(command);
          sendOutput(socket, lines.join("\n"));
          const sentinelMatch = text.match(/print\("([^"]+)"\)$/);
          sendOutput(socket, sentinelMatch?.[1] ?? "__CIV6_AI_COPILOT_TUNER_SENTINEL_MISSING__");
          sendFrame(socket, TAG_COMMAND, "ACK:");
        }
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    port: address.port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
}

function encodeStates(states: Map<string, number>): string {
  const tokens: string[] = [];
  for (const [name, index] of states) {
    tokens.push(String(index), name);
  }
  return `${tokens.join("\0")}\0`;
}

function sendOutput(socket: net.Socket, text: string): void {
  const payload = Buffer.from(`console\0${text}\0`, "utf8");
  const frame = Buffer.alloc(8 + payload.byteLength);
  frame.writeUInt32LE(payload.byteLength, 0);
  frame.writeUInt32LE(TAG_OUTPUT, 4);
  payload.copy(frame, 8);
  socket.write(frame);
}

function sendFrame(socket: net.Socket, tag: number, text: string): void {
  const payload = Buffer.from(`${text}\0`, "utf8");
  const frame = Buffer.alloc(8 + payload.byteLength);
  frame.writeUInt32LE(payload.byteLength, 0);
  frame.writeUInt32LE(tag, 4);
  payload.copy(frame, 8);
  socket.write(frame);
}
