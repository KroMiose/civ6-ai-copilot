import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderSnapshotMapFile, renderSnapshotMapObject, renderSnapshotMapToFile } from "../tools/render-map/src/render-map.js";

const fixturePath = path.resolve("tests/fixtures/minimal-player-visible.snapshot.json");

test("map renderer creates a player-visible SVG from fixture visibleMap", async () => {
  const rendered = await renderSnapshotMapFile(fixturePath);

  assert.equal(rendered.validation.ok, true, JSON.stringify(rendered.validation, null, 2));
  assert.equal(rendered.counts.tiles, 2);
  assert.equal(rendered.counts.cities, 1);
  assert.equal(rendered.counts.units, 2);
  assert.match(rendered.svg, /^<\?xml version="1.0"/);
  assert.match(rendered.svg, /<svg /);
  assert.match(rendered.svg, /<polygon /);
  assert.match(rendered.svg, /class="tile visible-now"/);
  assert.match(rendered.svg, /Capital/);
  assert.match(rendered.svg, /Archer/);
  assert.match(rendered.svg, /Visible enemy warrior/);
  assert.match(rendered.svg, /data-unit-type="UNIT_ARCHER"/);
  assert.match(rendered.svg, /fresh water/);
  assert.match(rendered.svg, /river W/);
  assert.match(rendered.svg, /yields YIELD_FOOD=2\/YIELD_PRODUCTION=1/);
  assert.match(rendered.svg, /class="tile not-exported-coordinate"/);
  assert.match(rendered.svg, />12,18</);
  assert.match(rendered.svg, /<rect x="0" y="0" width="\d+(?:\.\d+)?" height="\d+(?:\.\d+)?" fill="#f8f7f2"\/>/);
  assert.doesNotMatch(rendered.svg, /<rect width="100%" height="100%"/);
  assert.doesNotMatch(rendered.svg, /<script/i);
  assert.doesNotMatch(rendered.svg, /<rect[^>]+data-tile=/);
});

test("map renderer uses hex cells with coordinates, resources, and visibility metadata", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  snapshot.visibleMap.tiles.push({
    source: "fixture",
    visibility: "revealed",
    confidence: "confirmed",
    x: 13,
    y: 19,
    revealed: true,
    visibleNow: false,
    terrainType: "TERRAIN_COAST",
    resourceType: "RESOURCE_HORSES"
  });

  const rendered = await renderSnapshotMapObject(snapshot);

  assert.equal(rendered.validation.ok, true, JSON.stringify(rendered.validation, null, 2));
  assert.match(rendered.svg, /points="[0-9.,\s-]+"/);
  assert.match(rendered.svg, /data-tile="13,19"/);
  assert.match(rendered.svg, /data-resource-type="RESOURCE_HORSES"/);
  assert.doesNotMatch(rendered.svg, />RESOURCE_HORSES</);
});

test("map renderer matches Civ6 screen orientation with lower y rows drawn lower", async () => {
  const snapshot = JSON.parse(await readFile(fixturePath, "utf8"));
  snapshot.visibleMap.tiles = [
    {
      source: "fixture",
      visibility: "visible-now",
      confidence: "confirmed",
      x: 10,
      y: 10,
      revealed: true,
      visibleNow: true,
      terrainType: "TERRAIN_GRASS"
    },
    {
      source: "fixture",
      visibility: "visible-now",
      confidence: "confirmed",
      x: 10,
      y: 12,
      revealed: true,
      visibleNow: true,
      terrainType: "TERRAIN_GRASS"
    }
  ];

  const rendered = await renderSnapshotMapObject(snapshot);
  const lowerYRow = tileLabelY(rendered.svg, "10,10");
  const higherYRow = tileLabelY(rendered.svg, "10,12");

  assert.equal(rendered.validation.ok, true, JSON.stringify(rendered.validation, null, 2));
  assert.equal(
    lowerYRow > higherYRow,
    true,
    `expected y=10 to render lower than y=12, got ${lowerYRow} <= ${higherYRow}`
  );
});

test("map renderer writes SVG output file", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "civ6-ai-copilot-map-"));
  const outputPath = path.join(tempDir, "visible-map.svg");

  try {
    const rendered = await renderSnapshotMapToFile(fixturePath, outputPath);
    const fileStat = await stat(outputPath);
    const svg = await readFile(outputPath, "utf8");

    assert.equal(rendered.validation.ok, true);
    assert.equal(fileStat.size > 200, true);
    assert.match(svg, /id="tiles"/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

function tileLabelY(svg: string, coord: string): number {
  const match = svg.match(new RegExp(`data-coord="${coord}"[\\s\\S]*?<text[^>]+ y="([^"]+)"`));
  assert.ok(match, `missing tile label for ${coord}`);
  return Number(match[1]);
}
