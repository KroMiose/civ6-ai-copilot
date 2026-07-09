import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

interface SnapshotForPath {
  session?: {
    sessionId?: unknown;
    gameTurn?: unknown;
  };
  localPlayer?: {
    localPlayerId?: unknown;
  };
}

export interface WrittenSnapshot {
  snapshotPath: string;
  latestPath: string;
  manifestPath: string;
}

export async function writeSnapshotOutputs(
  snapshot: unknown,
  outputDir: string,
  metadata: { exportId: string; checksumSha256: string }
): Promise<WrittenSnapshot> {
  const typed = snapshot as SnapshotForPath;
  const sessionId = sanitizePathPart(String(typed.session?.sessionId ?? "unknown-session"));
  const gameTurn = Number.isInteger(typed.session?.gameTurn) ? String(typed.session?.gameTurn).padStart(4, "0") : "turn";
  const localPlayerId = Number.isInteger(typed.localPlayer?.localPlayerId)
    ? String(typed.localPlayer?.localPlayerId)
    : "unknown-player";
  const exportId = sanitizePathPart(metadata.exportId);
  const sessionDir = path.join(outputDir, sessionId);
  const snapshotPath = path.join(sessionDir, `turn-${gameTurn}-player-${localPlayerId}-${exportId}.snapshot.json`);
  const latestPath = path.join(outputDir, "latest.json");
  const manifestPath = path.join(outputDir, "latest-manifest.json");
  const jsonText = `${JSON.stringify(snapshot, null, 2)}\n`;
  const latestChecksumSha256 = createHash("sha256").update(Buffer.from(jsonText, "utf8")).digest("hex");

  await mkdir(sessionDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });
  await atomicWrite(snapshotPath, jsonText);
  await atomicWrite(latestPath, jsonText);
  await atomicWrite(
    manifestPath,
    `${JSON.stringify(
      {
        exportId: metadata.exportId,
        checksumSha256: latestChecksumSha256,
        transportChecksumSha256: metadata.checksumSha256,
        snapshotPath,
        latestPath,
        writtenAt: new Date().toISOString()
      },
      null,
      2
    )}\n`
  );

  return { snapshotPath, latestPath, manifestPath };
}

async function atomicWrite(targetPath: string, content: string): Promise<void> {
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, content, "utf8");
  await rename(tempPath, targetPath);
}

function sanitizePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}
