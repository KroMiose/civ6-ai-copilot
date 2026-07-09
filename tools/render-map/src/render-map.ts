import { readFile, writeFile } from "node:fs/promises";
import { validateSnapshotObject, type SnapshotValidationResult } from "../../snapshot/src/validate.js";

export interface RenderMapOptions {
  allowInvalid?: boolean;
  tileSize?: number;
}

export interface RenderedMap {
  svg: string;
  validation: SnapshotValidationResult;
  counts: {
    tiles: number;
    cities: number;
    units: number;
  };
}

export class RenderMapError extends Error {
  constructor(
    message: string,
    public readonly validation: SnapshotValidationResult
  ) {
    super(message);
    this.name = "RenderMapError";
  }
}

export async function renderSnapshotMapFile(snapshotPath: string, options: RenderMapOptions = {}): Promise<RenderedMap> {
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as SnapshotLike;
  return renderSnapshotMapObject(snapshot, options);
}

export async function renderSnapshotMapToFile(
  snapshotPath: string,
  outputPath: string,
  options: RenderMapOptions = {}
): Promise<RenderedMap> {
  const rendered = await renderSnapshotMapFile(snapshotPath, options);
  await writeFile(outputPath, rendered.svg, "utf8");
  return rendered;
}

export async function renderSnapshotMapObject(snapshot: SnapshotLike, options: RenderMapOptions = {}): Promise<RenderedMap> {
  const validation = await validateSnapshotObject(snapshot);
  if (!validation.ok && !options.allowInvalid) {
    throw new RenderMapError("snapshot failed schema or multiplayer fairness validation", validation);
  }

  const tiles = Array.isArray(snapshot.visibleMap?.tiles) ? snapshot.visibleMap.tiles : [];
  const cities = Array.isArray(snapshot.cities) ? snapshot.cities : [];
  const units = Array.isArray(snapshot.units) ? snapshot.units : [];
  const bounds = getBounds(snapshot.visibleMap?.bounds, tiles);
  const tileSize = options.tileSize ?? 34;
  const layout = createHexLayout(bounds, tileSize);
  const padding = 24;
  const headerHeight = 54;
  const legendHeight = 140;
  const width = Math.max(520, layout.mapWidth + padding * 2);
  const height = Math.max(260, headerHeight + layout.mapHeight + padding + legendHeight);
  const cityById = new Map(cities.map((city) => [city.id, city]));
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));
  const unitsByCoord = groupUnitsByCoord(units);
  const exportedTileKeys = new Set(tiles.map((tile) => coordKey(tile.x, tile.y)));

  const tileElements = tiles.map((tile) => renderTile(tile, bounds, layout, padding, headerHeight)).join("\n");
  const coordinateOnlyTiles = renderCoordinateOnlyTiles({
    values: [...cities, ...units],
    exportedTileKeys,
    bounds,
    layout,
    padding,
    headerHeight
  });
  const cityElements = cities
    .filter((city) => isWithinBounds(city, bounds))
    .map((city) => renderCity(city, bounds, layout, padding, headerHeight))
    .join("\n");
  const unitElements = renderUnits({ tiles, unitsByCoord, unitsById, bounds, layout, padding, headerHeight });
  const tileLabels = tiles.map((tile) => renderTileLabel(tile, cityById, bounds, layout, padding, headerHeight)).join("\n");
  const title = `civ6-ai-copilot visible map turn ${snapshot.session?.gameTurn ?? "?"}`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">
  <title>${escapeXml(title)}</title>
  <desc>Player-visible hex map generated from civ6-ai-copilot snapshot. Hidden, unrevealed, unknown, or unexported data is not rendered.</desc>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#f8f7f2"/>
  <text x="${padding}" y="22" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#1f2933">${escapeXml(title)}</text>
  <text x="${padding}" y="42" font-family="Arial, sans-serif" font-size="11" fill="#52606d">visibility=${escapeXml(snapshot.source?.visibilityMode ?? "unknown")} · tiles=${tiles.length} · cities=${cities.length} · units=${units.length}</text>
  <g id="tiles">
${indent(tileElements, 4)}
${indent(coordinateOnlyTiles, 4)}
${indent(tileLabels, 4)}
${indent(cityElements, 4)}
${indent(unitElements, 4)}
  </g>
${indent(renderLegend(padding, height - legendHeight + 20), 2)}
</svg>
`;

  return {
    svg,
    validation,
    counts: {
      tiles: tiles.length,
      cities: cities.length,
      units: units.length
    }
  };
}

function renderTile(tile: TileLike, bounds: Bounds, layout: HexLayout, padding: number, headerHeight: number): string {
  const { cx, cy } = hexCenter(tile, bounds, layout, padding, headerHeight);
  const fill = terrainFill(tile.terrainType);
  const stroke = tile.visibleNow ? "#243b53" : "#9fb3c8";
  const opacity = tile.visibleNow ? "1" : "0.62";
  const className = tile.visibleNow ? "tile visible-now" : "tile revealed-only";
  const ownerRing = typeof tile.ownerPlayerId === "number"
    ? `<polygon points="${hexPoints(cx, cy, layout.radius * 0.78)}" fill="none" stroke="${ownerStroke(tile.ownerPlayerId)}" stroke-width="2" opacity="0.9"/>`
    : "";
  return `<g class="${className}" data-tile="${tile.x},${tile.y}"><polygon points="${hexPoints(cx, cy, layout.radius)}" fill="${fill}" stroke="${stroke}" stroke-width="1.2" opacity="${opacity}">${tileTitle(tile)}</polygon>${ownerRing}</g>`;
}

function renderTileLabel(
  tile: TileLike,
  cityById: Map<string | undefined, CityLike>,
  bounds: Bounds,
  layout: HexLayout,
  padding: number,
  headerHeight: number
): string {
  const { cx, cy } = hexCenter(tile, bounds, layout, padding, headerHeight);
  const city = tile.cityId ? cityById.get(tile.cityId) : undefined;
  const resource = shortResource(tile.resourceType);
  const label = city?.name ?? resource;
  const resourceAttr = tile.resourceType ? ` data-resource-type="${escapeXml(tile.resourceType)}"` : "";
  const labelText = label
    ? `<text x="${cx}" y="${cy + 3}" text-anchor="middle" font-family="Arial, sans-serif" font-size="8" font-weight="700" fill="#102a43">${escapeXml(label)}</text>`
    : "";
  return `<g class="tile-label" data-coord="${tile.x},${tile.y}"${resourceAttr}><title>${escapeXml(tileTitleText(tile, city))}</title>${labelText}<text x="${cx}" y="${cy + layout.radius * 0.56}" text-anchor="middle" font-family="Arial, sans-serif" font-size="8" fill="#102a43">${escapeXml(`${tile.x},${tile.y}`)}</text></g>`;
}

function renderCoordinateOnlyTiles(options: {
  values: Array<{ x?: number; y?: number }>;
  exportedTileKeys: Set<string>;
  bounds: Bounds;
  layout: HexLayout;
  padding: number;
  headerHeight: number;
}): string {
  const seen = new Set<string>();
  const elements: string[] = [];
  for (const value of options.values) {
    if (!isWithinBounds(value, options.bounds)) {
      continue;
    }
    const key = coordKey(value.x, value.y);
    if (options.exportedTileKeys.has(key) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    const { cx, cy } = hexCenter(value, options.bounds, options.layout, options.padding, options.headerHeight);
    elements.push(
      `<g class="tile not-exported-coordinate" data-tile="${key}"><polygon points="${hexPoints(cx, cy, options.layout.radius)}" fill="none" stroke="#6b7280" stroke-width="1.1" stroke-dasharray="3 3" opacity="0.78"><title>${escapeXml(`${key} · not in visibleMap.tiles`)}</title></polygon></g>`
    );
  }
  return elements.join("\n");
}

function renderCity(city: CityLike, bounds: Bounds, layout: HexLayout, padding: number, headerHeight: number): string {
  const { cx, cy } = hexCenter(city, bounds, layout, padding, headerHeight);
  return `<g data-city="${escapeXml(city.id ?? "")}"><circle cx="${cx}" cy="${cy}" r="${Math.max(6, layout.radius * 0.4)}" fill="#f7c948" stroke="#8d2b0b" stroke-width="2"/><text x="${cx}" y="${cy + 3}" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" font-weight="700" fill="#1f2933">C</text><text x="${cx}" y="${cy - layout.radius - 5}" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="700" fill="#1f2933">${escapeXml(city.name ?? city.id ?? "City")}</text></g>`;
}

function renderUnits(options: {
  tiles: TileLike[];
  unitsByCoord: Map<string, UnitLike[]>;
  unitsById: Map<string | undefined, UnitLike>;
  bounds: Bounds;
  layout: HexLayout;
  padding: number;
  headerHeight: number;
}): string {
  const renderedUnitIds = new Set<string | undefined>();
  const elements: string[] = [];

  for (const tile of options.tiles) {
    const tileUnits = [
      ...coordUnits(tile, options.unitsByCoord),
      ...(Array.isArray(tile.unitIds) ? tile.unitIds.map((unitId) => options.unitsById.get(unitId)).filter(Boolean) : [])
    ] as UnitLike[];
    for (const unit of tileUnits) {
      if (renderedUnitIds.has(unit.id)) {
        continue;
      }
      renderedUnitIds.add(unit.id);
      elements.push(renderUnit(unit, options.bounds, options.layout, options.padding, options.headerHeight));
    }
  }

  for (const unit of [...options.unitsById.values()]) {
    if (renderedUnitIds.has(unit.id) || !isWithinBounds(unit, options.bounds)) {
      continue;
    }
    renderedUnitIds.add(unit.id);
    elements.push(renderUnit(unit, options.bounds, options.layout, options.padding, options.headerHeight));
  }

  return elements.join("\n");
}

function renderUnit(unit: UnitLike, bounds: Bounds, layout: HexLayout, padding: number, headerHeight: number): string {
  const center = hexCenter(unit, bounds, layout, padding, headerHeight);
  const cx = center.cx + layout.radius * 0.42;
  const cy = center.cy - layout.radius * 0.36;
  const own = unit.visibility === "own";
  const fill = own ? "#2f80ed" : "#d64545";
  const label = unit.name ?? unit.type ?? "Unit";
  const marker = shortUnit(unit.type);
  const unitTypeAttr = unit.type ? ` data-unit-type="${escapeXml(unit.type)}"` : "";
  return `<g data-unit="${escapeXml(unit.id ?? "")}"${unitTypeAttr}><circle cx="${cx}" cy="${cy}" r="${Math.max(5.8, layout.radius * 0.38)}" fill="${fill}" stroke="#102a43" stroke-width="1.5"/><text x="${cx}" y="${cy + 2.6}" text-anchor="middle" font-family="Arial, sans-serif" font-size="7" font-weight="700" fill="#ffffff">${escapeXml(marker)}</text><title>${escapeXml(label)} @ ${unit.x},${unit.y}</title></g>`;
}

function renderLegend(x: number, y: number): string {
  return `<g id="legend">
  <text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#1f2933">Legend</text>
  <polygon points="${hexPoints(x + 9, y + 22, 8)}" fill="#a7d489" stroke="#243b53"/><text x="${x + 24}" y="${y + 26}" font-family="Arial, sans-serif" font-size="11" fill="#334e68">currently visible</text>
  <polygon points="${hexPoints(x + 142, y + 22, 8)}" fill="#d7d2c8" stroke="#9fb3c8" opacity="0.62"/><text x="${x + 157}" y="${y + 26}" font-family="Arial, sans-serif" font-size="11" fill="#334e68">revealed only</text>
  <circle cx="${x + 248}" cy="${y + 22}" r="7" fill="#f7c948" stroke="#8d2b0b"/><text x="${x + 262}" y="${y + 26}" font-family="Arial, sans-serif" font-size="11" fill="#334e68">city</text>
  <circle cx="${x + 9}" cy="${y + 48}" r="7" fill="#2f80ed" stroke="#102a43"/><text x="${x + 24}" y="${y + 52}" font-family="Arial, sans-serif" font-size="11" fill="#334e68">own unit</text>
  <circle cx="${x + 100}" cy="${y + 48}" r="7" fill="#d64545" stroke="#102a43"/><text x="${x + 114}" y="${y + 52}" font-family="Arial, sans-serif" font-size="11" fill="#334e68">visible foreign unit</text>
  <polygon points="${hexPoints(x + 248, y + 48, 8)}" fill="none" stroke="#6b7280" stroke-dasharray="3 3"/><text x="${x + 263}" y="${y + 52}" font-family="Arial, sans-serif" font-size="11" fill="#334e68">coordinate only</text>
  <text x="${x}" y="${y + 78}" font-family="Arial, sans-serif" font-size="11" fill="#334e68">resource labels use compact codes; tile title/data-resource-type stores RESOURCE_*</text>
  <text x="${x}" y="${y + 96}" font-family="Arial, sans-serif" font-size="11" fill="#334e68">unrendered = unknown, unrevealed, or not exported</text>
</g>`;
}

function getBounds(bounds: Bounds | undefined, tiles: TileLike[]): Bounds {
  if (bounds && Number.isFinite(bounds.minX) && Number.isFinite(bounds.maxX) && Number.isFinite(bounds.minY) && Number.isFinite(bounds.maxY)) {
    return bounds;
  }

  if (tiles.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }

  return {
    minX: Math.min(...tiles.map((tile) => tile.x ?? 0)),
    maxX: Math.max(...tiles.map((tile) => tile.x ?? 0)),
    minY: Math.min(...tiles.map((tile) => tile.y ?? 0)),
    maxY: Math.max(...tiles.map((tile) => tile.y ?? 0))
  };
}

function createHexLayout(bounds: Bounds, tileSize: number): HexLayout {
  const radius = tileSize / 2;
  const hexWidth = Math.sqrt(3) * radius;
  const hexHeight = radius * 2;
  const rowStep = radius * 1.5;
  const columns = bounds.maxX - bounds.minX + 1;
  const rows = bounds.maxY - bounds.minY + 1;
  return {
    radius,
    hexWidth,
    hexHeight,
    rowStep,
    mapWidth: columns * hexWidth + hexWidth / 2,
    mapHeight: rows <= 1 ? hexHeight : hexHeight + (rows - 1) * rowStep
  };
}

function hexCenter(
  value: { x?: number; y?: number },
  bounds: Bounds,
  layout: HexLayout,
  padding: number,
  headerHeight: number
): { cx: number; cy: number } {
  const x = value.x ?? bounds.minX;
  const y = value.y ?? bounds.minY;
  const column = x - bounds.minX;
  const row = bounds.maxY - y;
  const rowOffset = Math.abs(y) % 2 === 1 ? layout.hexWidth / 2 : 0;
  return {
    cx: padding + layout.hexWidth / 2 + column * layout.hexWidth + rowOffset,
    cy: headerHeight + layout.radius + row * layout.rowStep
  };
}

function isWithinBounds(value: { x?: number; y?: number }, bounds: Bounds): boolean {
  const x = value.x ?? Number.NaN;
  const y = value.y ?? Number.NaN;
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
}

function groupUnitsByCoord(units: UnitLike[]): Map<string, UnitLike[]> {
  const grouped = new Map<string, UnitLike[]>();
  for (const unit of units) {
    const key = coordKey(unit.x, unit.y);
    const current = grouped.get(key) ?? [];
    current.push(unit);
    grouped.set(key, current);
  }
  return grouped;
}

function coordUnits(tile: TileLike, grouped: Map<string, UnitLike[]>): UnitLike[] {
  return grouped.get(coordKey(tile.x, tile.y)) ?? [];
}

function coordKey(x: number | undefined, y: number | undefined): string {
  return `${x ?? "?"},${y ?? "?"}`;
}

function terrainFill(terrainType: string | undefined): string {
  const value = terrainType ?? "";
  if (value.includes("COAST") || value.includes("OCEAN")) {
    return "#8ecae6";
  }
  if (value.includes("DESERT")) {
    return "#e9d8a6";
  }
  if (value.includes("TUNDRA") || value.includes("SNOW")) {
    return "#d9e2ec";
  }
  if (value.includes("HILL") || value.includes("MOUNTAIN")) {
    return "#b7b7a4";
  }
  if (value.includes("PLAINS")) {
    return "#c9d787";
  }
  if (value.includes("GRASS")) {
    return "#a7d489";
  }
  return "#d7d2c8";
}

function ownerStroke(ownerPlayerId: number): string {
  const palette = ["#2f80ed", "#d64545", "#9b51e0", "#27ae60", "#f2994a", "#2d9cdb"];
  return palette[Math.abs(ownerPlayerId) % palette.length];
}

function hexPoints(cx: number, cy: number, radius: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = Math.PI / 180 * (60 * i - 30);
    points.push(`${round(cx + radius * Math.cos(angle))},${round(cy + radius * Math.sin(angle))}`);
  }
  return points.join(" ");
}

function tileTitle(tile: TileLike): string {
  return `<title>${escapeXml(tileTitleText(tile))}</title>`;
}

function tileTitleText(tile: TileLike, city?: CityLike): string {
  const visibility = tile.visibleNow ? "currently visible" : "revealed only";
  const parts = [
    `${tile.x},${tile.y}`,
    visibility,
    city?.name,
    tile.terrainType,
    tile.featureType,
    tile.resourceType,
    tile.isFreshWater === true ? "fresh water" : undefined,
    tile.isRiver === true ? `river${tile.riverEdges && tile.riverEdges.length > 0 ? ` ${tile.riverEdges.join("/")}` : ""}` : undefined,
    tile.isCoastalLand === true ? "coastal land" : undefined,
    tile.isHills === true ? "hills" : undefined,
    tile.isMountain === true ? "mountain" : undefined,
    tile.isImpassable === true ? "impassable" : undefined,
    tile.cliffEdges && tile.cliffEdges.length > 0 ? `cliff ${tile.cliffEdges.join("/")}` : undefined,
    tile.improvementType,
    tile.routeType,
    tile.districtType,
    typeof tile.appeal === "number" ? `appeal ${tile.appeal}` : undefined,
    tile.yields ? `yields ${Object.entries(tile.yields).map(([key, value]) => `${key}=${value}`).join("/")}` : undefined
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
  return parts.join(" · ");
}

function round(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function shortResource(resourceType: string | undefined): string | undefined {
  if (!resourceType || resourceType === "UNKNOWN_RESOURCE" || resourceType === "-1") {
    return undefined;
  }
  const normalized = resourceType.replace(/^RESOURCE_/, "");
  const knownCodes: Record<string, string> = {
    ALUMINUM: "ALU",
    AMBER: "AMB",
    BANANAS: "BAN",
    CATTLE: "CAT",
    CITRUS: "CIT",
    COAL: "COA",
    COPPER: "COP",
    CRABS: "CRA",
    DEER: "DEE",
    DIAMONDS: "DIA",
    FISH: "FIS",
    FURS: "FUR",
    GYPSUM: "GYP",
    HORSES: "HOR",
    IRON: "IRO",
    IVORY: "IVO",
    JADE: "JAD",
    MARBLE: "MAR",
    MERCURY: "MER",
    NITER: "NIT",
    OIL: "OIL",
    PEARLS: "PEA",
    RICE: "RIC",
    SALT: "SAL",
    SHEEP: "SHE",
    SILK: "SIL",
    SILVER: "SLV",
    STONE: "STO",
    TEA: "TEA",
    TOBACCO: "TOB",
    TRUFFLES: "TRU",
    TURTLES: "TUR",
    URANIUM: "URA",
    WHEAT: "WHE",
    WHALES: "WHA",
    WINE: "WIN"
  };
  if (knownCodes[normalized]) {
    return knownCodes[normalized];
  }
  return normalized
    .split("_")
    .map((part) => part.slice(0, 3))
    .join("/")
    .slice(0, 7);
}

function shortUnit(unitType: string | undefined): string {
  const normalized = unitType?.replace(/^UNIT_/, "") ?? "";
  const knownCodes: Record<string, string> = {
    ARCHER: "AR",
    BUILDER: "BD",
    GALLEY: "GA",
    SCOUT: "SC",
    SETTLER: "ST",
    SLINGER: "SL",
    WARRIOR: "WR"
  };
  if (knownCodes[normalized]) {
    return knownCodes[normalized];
  }
  return normalized.slice(0, 2) || "U";
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function indent(value: string, spaces: number): string {
  if (!value.trim()) {
    return "";
  }
  const prefix = " ".repeat(spaces);
  return value
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

interface SnapshotLike {
  source?: {
    visibilityMode?: string;
  };
  session?: {
    gameTurn?: number;
  };
  cities?: CityLike[];
  units?: UnitLike[];
  visibleMap?: {
    bounds?: Bounds;
    tiles?: TileLike[];
  };
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface HexLayout {
  radius: number;
  hexWidth: number;
  hexHeight: number;
  rowStep: number;
  mapWidth: number;
  mapHeight: number;
}

interface TileLike {
  x?: number;
  y?: number;
  visibleNow?: boolean;
  terrainType?: string;
  featureType?: string;
  resourceType?: string;
  isFreshWater?: boolean;
  isRiver?: boolean;
  riverEdges?: string[];
  isCoastalLand?: boolean;
  isHills?: boolean;
  isMountain?: boolean;
  isImpassable?: boolean;
  cliffEdges?: string[];
  improvementType?: string;
  routeType?: string;
  districtType?: string;
  appeal?: number;
  yields?: Record<string, number>;
  ownerPlayerId?: number;
  cityId?: string;
  unitIds?: string[];
}

interface CityLike {
  id?: string;
  name?: string;
  x?: number;
  y?: number;
}

interface UnitLike {
  id?: string;
  type?: string;
  name?: string;
  visibility?: string;
  x?: number;
  y?: number;
}
