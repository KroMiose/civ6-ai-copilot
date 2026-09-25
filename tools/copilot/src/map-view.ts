import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderHexPng } from "../../render-map/src/map-png.js";
import { readableName, renderSnapshotMapObject, resourceClass } from "../../render-map/src/render-map.js";
import { describeOwner } from "./decision-brief.js";

export const MAX_MAP_RADIUS = 20;
export const DEFAULT_MAP_RADIUS = { region: 8, local: 5 } as const;

export type MapLevel = "world" | "region" | "local";
export type FocusKind = "city" | "unit" | "coord" | "selection";

export interface ParsedMapSpec {
  level: MapLevel;
  focus?: { kind: FocusKind; value: string };
  radius?: number;
  mark?: { kind: FocusKind; value: string };
}

export interface MapView {
  level: MapLevel;
  radius?: number;
  focus?: { kind: FocusKind; name?: string; id?: string; x: number; y: number };
  image: { path: string; svgPath: string; tiles: number; missingTiles: number };
  places: Record<string, unknown>;
}

interface ResolvedFocus {
  kind: FocusKind;
  name?: string;
  id?: string;
  x: number;
  y: number;
}

export function parseMapSpec(spec: string): ParsedMapSpec | { error: string } {
  const parts = spec.split(":").map((part) => part.trim()).filter((part) => part.length > 0);
  const level = parts[0];
  if (level !== "world" && level !== "region" && level !== "local") return { error: `未知地图层级 ${spec}` };
  if (level === "world") {
    if (parts.length === 1) return { level };
    const marked = parts[1] === "mark";
    const kind = marked ? parts[2] : parts[1];
    if (!isFocusKind(kind)) return { error: `world 标记无法解析：${spec}` };
    return { level, mark: { kind, value: parts.slice(marked ? 3 : 2).join(":") } };
  }
  if (parts.length === 1) return { level };
  const kind = parts[1];
  if (!isFocusKind(kind)) return { error: `地图焦点无法解析：${spec}` };
  let rest = parts.slice(2);
  let radius: number | undefined;
  const last = rest[rest.length - 1];
  if (last && /^\d+$/.test(last) && !(kind === "coord" && rest.length === 1 && last.includes(",") === false && rest.length < 2)) {
    const radiusToken = kind !== "coord" || rest.length >= 2;
    if (radiusToken && (kind !== "coord" || !last.includes(","))) {
      radius = Number(last);
      rest = rest.slice(0, -1);
    }
  }
  return { level, focus: { kind, value: rest.join(":") }, radius };
}

export function hexDistance(left: { x: number; y: number }, right: { x: number; y: number }): number {
  const a = oddRToCube(left.x, left.y);
  const b = oddRToCube(right.x, right.y);
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}

export async function buildMapViews(
  snapshot: Record<string, any>,
  specs: string[],
  outputDir: string
): Promise<{ views: MapView[]; gaps: string[] }> {
  const views: MapView[] = [];
  const gaps: string[] = [];
  await mkdir(outputDir, { recursive: true });
  for (const [index, spec] of specs.entries()) {
    const parsed = parseMapSpec(spec);
    if ("error" in parsed) {
      gaps.push(parsed.error);
      continue;
    }
    const focus = parsed.level === "world"
      ? (parsed.mark ? resolveFocus(snapshot, parsed.mark) : undefined)
      : resolveFocus(snapshot, parsed.focus ?? { kind: "selection", value: "" });
    if (focus && "error" in focus) {
      gaps.push(focus.error);
      continue;
    }
    const radiusResult = parsed.level === "world" ? undefined : clampRadius(parsed.radius, parsed.level);
    if (radiusResult && radiusResult.note) gaps.push(radiusResult.note);
    const radius = radiusResult?.radius;
    const disk = focus && radius !== undefined && "x" in focus ? coordsInRadius(focus, radius) : undefined;
    const tiles = tilesIn(snapshot, disk);
    const cities = entitiesIn(arrayOf(snapshot.cities), disk);
    const units = entitiesIn(arrayOf(snapshot.units), disk);
    const rings = disk && parsed.level !== "world" ? settleRings(snapshot, disk, parsed.level, focus && "x" in focus ? focus : undefined) : [];
    const worldIndex = parsed.level === "world" ? worldIndexOf(snapshot) : { cities: [], resources: [] };
    const bounds = disk ? boundsOf(disk) : unionBounds(
      exportedBounds(snapshot) ?? boundsOf(tiles.flatMap((tile) => Number.isInteger(tile.x) && Number.isInteger(tile.y) ? [{ x: tile.x as number, y: tile.y as number }] : [])),
      [...worldIndex.cities, ...worldIndex.resources]
    );
    const stem = path.join(outputDir, `${parsed.level}-${index + 1}`);
    const pngPath = `${stem}.png`;
    const svgPath = `${stem}.svg`;
    const rendered = await renderSnapshotMapObject(snapshot, {
      level: parsed.level,
      bounds,
      disk,
      rings,
      tileSize: parsed.level === "world" ? 18 : parsed.level === "region" ? 28 : 42
    });
    await writeFile(svgPath, rendered.svg, "utf8");
    await writeFile(pngPath, renderHexPng({
      bounds,
      tileSize: parsed.level === "world" ? 18 : parsed.level === "region" ? 28 : 42,
      hexes: pngHexes(tiles, cities, units, disk ?? [], rings, worldIndex)
    }));
    const missingTiles = disk ? disk.length - tiles.length : 0;
    views.push({
      level: parsed.level,
      radius,
      focus: focus && "x" in focus ? focus : undefined,
      image: { path: pngPath, svgPath, tiles: tiles.length, missingTiles },
      places: placesFor(snapshot, parsed.level, tiles, cities, units, focus && "x" in focus ? focus : undefined, worldIndex)
    });
  }
  return { views, gaps };
}

function clampRadius(radius: number | undefined, level: "region" | "local"): { radius: number; note?: string } {
  const requested = radius ?? DEFAULT_MAP_RADIUS[level];
  if (!Number.isInteger(requested) || requested < 1) return { radius: DEFAULT_MAP_RADIUS[level], note: `半径 ${String(radius)} 无效，已改用 ${DEFAULT_MAP_RADIUS[level]}。` };
  if (requested > MAX_MAP_RADIUS) return { radius: MAX_MAP_RADIUS, note: `半径 ${requested} 超过单次上限，已改为 ${MAX_MAP_RADIUS}。` };
  return { radius: requested };
}

function resolveFocus(snapshot: Record<string, any>, focus: { kind: FocusKind; value: string }): ResolvedFocus | { error: string } {
  if (focus.kind === "coord") {
    const match = focus.value.match(/^(-?\d+)\s*,\s*(-?\d+)$/);
    if (!match) return { error: `坐标无法解析：${focus.value}` };
    return { kind: "coord", x: Number(match[1]), y: Number(match[2]) };
  }
  if (focus.kind === "selection") {
    const selectedUnit = snapshot.selection?.unit?.status === "selected" ? snapshot.selection.unit.id : undefined;
    const selectedCity = snapshot.selection?.city?.status === "selected" ? snapshot.selection.city.id : undefined;
    const unit = selectedUnit ? arrayOf(snapshot.units).find((item) => item.id === selectedUnit) : undefined;
    const city = selectedCity ? arrayOf(snapshot.cities).find((item) => item.id === selectedCity) : undefined;
    const entity = unit ?? city;
    if (!entity || !Number.isInteger(entity.x) || !Number.isInteger(entity.y)) return { error: "当前没有选中的城市或单位。" };
    return { kind: unit ? "unit" : "city", id: text(entity.id), name: text(entity.name), x: entity.x, y: entity.y };
  }
  const entities = focus.kind === "city" ? arrayOf(snapshot.cities) : arrayOf(snapshot.units);
  const found = matchEntity(entities, focus.value);
  if ("error" in found) return found;
  return { kind: focus.kind, id: text(found.entity.id), name: text(found.entity.name), x: numberOf(found.entity.x), y: numberOf(found.entity.y) };
}

function matchEntity(entities: Array<Record<string, any>>, value: string): { entity: Record<string, any> } | { error: string } {
  const exactId = entities.find((entity) => entity.id === value);
  if (exactId) return { entity: exactId };
  const exactName = entities.filter((entity) => entity.name === value);
  if (exactName.length === 1) return { entity: exactName[0]! };
  const contains = entities.filter((entity) => typeof entity.name === "string" && entity.name.includes(value));
  if (contains.length === 1) return { entity: contains[0]! };
  const matched = exactName.length > 1 ? exactName : contains;
  const label = (entity: Record<string, any>) => `${entity.name ?? entity.type ?? "未命名"} id=${entity.id ?? "?"} (${entity.x},${entity.y}) owner=${entity.ownerPlayerId ?? "?"}`;
  if (matched.length > 1) return { error: `「${value}」对应多个目标：${matched.map(label).join("；")}` };
  return { error: `找不到「${value}」。可选：${entities.map(label).join("；") || "无"}` };
}

function placesFor(
  snapshot: Record<string, any>,
  level: MapLevel,
  tiles: Array<Record<string, any>>,
  cities: Array<Record<string, any>>,
  units: Array<Record<string, any>>,
  focus?: ResolvedFocus,
  worldIndex: { cities: Array<Record<string, any>>; resources: Array<Record<string, any>> } = { cities: [], resources: [] }
): Record<string, unknown> {
  const indexedCities = level === "world" && worldIndex.cities.length > 0 ? worldIndex.cities : cities;
  const places: Record<string, unknown> = {
    cities: indexedCities.map((city, index) => ({
      marker: index + 1,
      name: city.name,
      id: city.id,
      x: city.x,
      y: city.y,
      population: city.population,
      owner: describeOwner(city.ownerPlayerId, snapshot)
    })),
    units: units.map((unit) => ({
      name: unit.name,
      id: unit.id,
      type: readableName(text(unit.type)),
      x: unit.x,
      y: unit.y,
      owner: describeOwner(unit.ownerPlayerId, snapshot),
      own: unit.visibility === "own",
      ...(level === "local" && unit.visibility === "own" ? { movesRemaining: unit.movesRemaining, combatStrength: unit.combatStrength, promotions: unit.promotions } : {})
    })),
    resources: (level === "world" && worldIndex.resources.length > 0 ? worldIndex.resources : tiles.filter((tile) => resourceClass(text(tile.resourceType)) && (level !== "world" || resourceClass(text(tile.resourceType)) !== "bonus"))).map((tile, index) => ({
      marker: index + 1,
      name: readableName(text(tile.resourceType)),
      class: resourceClass(text(tile.resourceType)),
      x: tile.x,
      y: tile.y,
      ...(level === "local" ? { amount: tile.resourceAmount } : {})
    }))
  };
  if (level === "world") {
    places.wonders = tiles.filter((tile) => tile.isNaturalWonder === true).map((tile) => ({ name: readableName(text(tile.featureType)), x: tile.x, y: tile.y }));
    return places;
  }
  places.tiles = tiles.map((tile) => compactTile(tile, level));
  if (level === "local") {
    const city = focus?.kind === "city" ? cities.find((item) => item.id === focus.id) ?? cities[0] : undefined;
    if (city) {
      places.cityCard = {
        name: city.name,
        population: city.population,
        housing: city.housing,
        amenities: city.amenities,
        districts: city.districts,
        buildings: city.buildings,
        currentProduction: city.currentProduction
      };
    }
  }
  return places;
}

function compactTile(tile: Record<string, any>, level: MapLevel): Record<string, unknown> {
  const compact: Record<string, unknown> = {
    x: tile.x,
    y: tile.y,
    terrain: readableName(text(tile.terrainType)),
    feature: readableName(text(tile.featureType)),
    resource: readableName(text(tile.resourceType)),
    freshWater: tile.isFreshWater === true,
    river: tile.isRiver === true,
    hills: tile.isHills === true,
    mountain: tile.isMountain === true,
    improvement: readableName(text(tile.improvementType)),
    route: readableName(text(tile.routeType)),
    district: readableName(text(tile.districtType)),
    ownerPlayerId: tile.ownerPlayerId
  };
  if (level === "local") {
    compact.yields = tile.yields;
    compact.appeal = tile.appeal;
    compact.riverEdges = tile.riverEdges;
    compact.cliffEdges = tile.cliffEdges;
    compact.resourceAmount = tile.resourceAmount;
  }
  return compact;
}

function pngHexes(
  tiles: Array<Record<string, any>>,
  cities: Array<Record<string, any>>,
  units: Array<Record<string, any>>,
  disk: Array<{ x: number; y: number }>,
  rings: Array<{ x: number; y: number; kind: string }>,
  worldIndex: { cities: Array<Record<string, any>>; resources: Array<Record<string, any>> } = { cities: [], resources: [] }
): Array<{ x: number; y: number; fill: string; stroke?: string; missing?: boolean; mark?: "city" | "own-unit" | "foreign-unit" | "strategic" | "luxury"; marker?: number }> {
  const tileByKey = new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
  const cityKeys = new Set([...cities, ...worldIndex.cities].map((city) => `${city.x},${city.y}`));
  const cityMarkers = new Map(worldIndex.cities.map((city, index) => [`${city.x},${city.y}`, index + 1]));
  const resourceMarkers = new Map(worldIndex.resources.map((resource, index) => [`${resource.x},${resource.y}`, index + 1]));
  const unitByKey = new Map(units.map((unit) => [`${unit.x},${unit.y}`, unit]));
  const ringByKey = new Map(rings.map((ring) => [`${ring.x},${ring.y}`, ring.kind]));
  const coords = disk.length > 0 ? disk : tiles.map((tile) => ({ x: numberOf(tile.x), y: numberOf(tile.y) }));
  const seen = new Set(coords.map((coord) => `${coord.x},${coord.y}`));
  for (const marker of [...worldIndex.cities, ...worldIndex.resources]) {
    const key = `${marker.x},${marker.y}`;
    if (!seen.has(key) && Number.isInteger(marker.x) && Number.isInteger(marker.y)) {
      coords.push({ x: marker.x, y: marker.y });
      seen.add(key);
    }
  }
  return coords.map((coord) => {
    const tile = tileByKey.get(`${coord.x},${coord.y}`);
    const unit = unitByKey.get(`${coord.x},${coord.y}`);
    const resource = resourceClass(text(tile?.resourceType));
    const ring = ringByKey.get(`${coord.x},${coord.y}`);
    return {
      x: coord.x,
      y: coord.y,
      fill: tile ? terrainColor(text(tile.terrainType), tile.isMountain === true) : "#d9d9d9",
      stroke: ring === "settle" ? "#2f9e44" : ring === "blocked" ? "#e8590c" : typeof tile?.ownerPlayerId === "number" ? ownerColor(tile.ownerPlayerId) : undefined,
      missing: !tile,
      mark: cityKeys.has(`${coord.x},${coord.y}`) ? "city"
        : unit?.visibility === "own" ? "own-unit"
        : unit ? "foreign-unit"
        : resource === "strategic" ? "strategic"
        : resource === "luxury" ? "luxury"
        : undefined,
      marker: cityMarkers.get(`${coord.x},${coord.y}`) ?? resourceMarkers.get(`${coord.x},${coord.y}`)
    };
  });
}

function worldIndexOf(snapshot: Record<string, any>): { cities: Array<Record<string, any>>; resources: Array<Record<string, any>> } {
  return {
    cities: arrayOf(snapshot.visibleMap?.worldIndex?.cities),
    resources: arrayOf(snapshot.visibleMap?.worldIndex?.resources).filter((resource) => resourceClass(text(resource.resourceType)) !== "bonus")
  };
}

function unionBounds(
  base: { minX: number; maxX: number; minY: number; maxY: number },
  extra: Array<Record<string, any>>
): { minX: number; maxX: number; minY: number; maxY: number } {
  const coords = extra.flatMap((item) => Number.isInteger(item.x) && Number.isInteger(item.y) ? [{ x: item.x as number, y: item.y as number }] : []);
  if (coords.length === 0) return base;
  return boundsOf([
    { x: base.minX, y: base.minY },
    { x: base.maxX, y: base.maxY },
    ...coords
  ]);
}

function settleRings(snapshot: Record<string, any>, disk: Array<{ x: number; y: number }>, level: MapLevel, focus?: ResolvedFocus): Array<{ x: number; y: number; kind: "blocked" | "settle" | "workable" }> {
  const cities = arrayOf(snapshot.cities).filter((city) => Number.isInteger(city.x) && Number.isInteger(city.y));
  const rings: Array<{ x: number; y: number; kind: "blocked" | "settle" | "workable" }> = [];
  for (const coord of disk) {
    if (level === "local" && focus?.kind === "city" && hexDistance(coord, focus) <= 3) {
      rings.push({ ...coord, kind: "workable" });
      continue;
    }
    const nearest = cities.reduce((best, city) => Math.min(best, hexDistance(coord, { x: city.x, y: city.y })), Number.POSITIVE_INFINITY);
    if (nearest === 3) rings.push({ ...coord, kind: "blocked" });
    if (nearest === 4) rings.push({ ...coord, kind: "settle" });
  }
  return rings;
}

function coordsInRadius(center: { x: number; y: number }, radius: number): Array<{ x: number; y: number }> {
  const coords: Array<{ x: number; y: number }> = [];
  for (let y = center.y - radius; y <= center.y + radius; y += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      if (hexDistance(center, { x, y }) <= radius) coords.push({ x, y });
    }
  }
  return coords;
}

function tilesIn(snapshot: Record<string, any>, disk?: Array<{ x: number; y: number }>): Array<Record<string, any>> {
  const tiles = arrayOf(snapshot.visibleMap?.tiles);
  if (!disk) return tiles;
  const keys = new Set(disk.map((coord) => `${coord.x},${coord.y}`));
  return tiles.filter((tile) => keys.has(`${tile.x},${tile.y}`));
}

function entitiesIn(entities: Array<Record<string, any>>, disk?: Array<{ x: number; y: number }>): Array<Record<string, any>> {
  if (!disk) return entities;
  const keys = new Set(disk.map((coord) => `${coord.x},${coord.y}`));
  return entities.filter((entity) => keys.has(`${entity.x},${entity.y}`));
}

function exportedBounds(snapshot: Record<string, any>): { minX: number; maxX: number; minY: number; maxY: number } | undefined {
  const bounds = snapshot.visibleMap?.bounds;
  if (!bounds || ![bounds.minX, bounds.maxX, bounds.minY, bounds.maxY].every((value: unknown) => Number.isInteger(value))) return undefined;
  return bounds;
}

function boundsOf(coords: Array<{ x: number; y: number }>): { minX: number; maxX: number; minY: number; maxY: number } {
  if (coords.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  return {
    minX: Math.min(...coords.map((coord) => coord.x)),
    maxX: Math.max(...coords.map((coord) => coord.x)),
    minY: Math.min(...coords.map((coord) => coord.y)),
    maxY: Math.max(...coords.map((coord) => coord.y))
  };
}

function terrainColor(terrain: string | undefined, mountain: boolean): string {
  if (mountain || terrain?.includes("MOUNTAIN") || terrain?.includes("HILL")) return "#b7b7a4";
  if (terrain?.includes("COAST") || terrain?.includes("OCEAN")) return "#8ecae6";
  if (terrain?.includes("DESERT")) return "#e9d8a6";
  if (terrain?.includes("TUNDRA") || terrain?.includes("SNOW")) return "#d9e2ec";
  if (terrain?.includes("PLAINS")) return "#c9d787";
  if (terrain?.includes("GRASS")) return "#a7d489";
  return "#d7d2c8";
}

function ownerColor(playerId: number): string {
  return ["#2f80ed", "#d64545", "#9b51e0", "#27ae60", "#f2994a", "#2d9cdb"][Math.abs(playerId) % 6]!;
}

function oddRToCube(col: number, row: number): { x: number; y: number; z: number } {
  const parity = Math.abs(row) % 2;
  const x = col - Math.floor((row - parity) / 2);
  const z = row;
  return { x, y: -x - z, z };
}

function arrayOf(value: unknown): Array<Record<string, any>> {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") as Array<Record<string, any>> : [];
}

function isFocusKind(value: string | undefined): value is FocusKind {
  return value === "city" || value === "unit" || value === "coord" || value === "selection";
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberOf(value: unknown): number {
  return typeof value === "number" ? value : Number.NaN;
}
