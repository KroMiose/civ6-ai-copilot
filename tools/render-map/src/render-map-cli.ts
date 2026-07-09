#!/usr/bin/env tsx
import { program } from "commander";
import { RenderMapError, renderSnapshotMapToFile } from "./render-map.js";

program
  .name("civ6-ai-copilot-render-map")
  .description("Render snapshot.visibleMap as a player-visible SVG map.")
  .requiredOption("--snapshot <path>", "Path to snapshot JSON, usually latest.json from the bridge.")
  .requiredOption("--output <path>", "Path to write the SVG map.")
  .option("--tile-size <px>", "Tile size in SVG pixels.", (value) => Number.parseInt(value, 10), 34)
  .option("--allow-invalid", "Render even if schema or fairness validation fails.", false)
  .parse();

const options = program.opts<{
  snapshot: string;
  output: string;
  tileSize: number;
  allowInvalid: boolean;
}>();

if (!Number.isFinite(options.tileSize) || options.tileSize < 12 || options.tileSize > 96) {
  program.error("--tile-size must be a number from 12 to 96");
}

try {
  const result = await renderSnapshotMapToFile(options.snapshot, options.output, {
    allowInvalid: options.allowInvalid,
    tileSize: options.tileSize
  });
  console.log(
    JSON.stringify(
      {
        ok: true,
        output: options.output,
        counts: result.counts,
        validation: result.validation
      },
      null,
      2
    )
  );
} catch (error) {
  if (error instanceof RenderMapError) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: error.message,
          validation: error.validation
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  } else {
    throw error;
  }
}
