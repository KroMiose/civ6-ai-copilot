export interface AdjacentTileView {
  direction: string;
  x: number;
  y: number;
  terrainType?: string;
  featureType?: string;
  resourceType?: string;
  isFreshWater?: boolean;
  isRiver?: boolean;
  isHills?: boolean;
  isMountain?: boolean;
  isWater?: boolean;
  improvementType?: string;
  routeType?: string;
  districtType?: string;
  appeal?: number;
  yields?: Record<string, number>;
}

export interface AdjacentUnitView {
  id?: string;
  name?: string;
  type?: string;
  x: number;
  y: number;
  movesRemaining?: number;
  adjacentTiles: AdjacentTileView[];
}

interface UnitLike {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  ownerPlayerId?: unknown;
  x?: unknown;
  y?: unknown;
  movesRemaining?: unknown;
}

interface TileLike {
  x?: unknown;
  y?: unknown;
  terrainType?: unknown;
  featureType?: unknown;
  resourceType?: unknown;
  isFreshWater?: unknown;
  isRiver?: unknown;
  isHills?: unknown;
  isMountain?: unknown;
  isWater?: unknown;
  improvementType?: unknown;
  routeType?: unknown;
  districtType?: unknown;
  appeal?: unknown;
  yields?: unknown;
}

export function adjacentOwnUnits(snapshot: {
  localPlayer?: { localPlayerId?: unknown };
  units?: unknown;
  visibleMap?: { tiles?: unknown };
}): AdjacentUnitView[] {
  const localPlayerId = snapshot.localPlayer?.localPlayerId;
  const units = Array.isArray(snapshot.units) ? snapshot.units as UnitLike[] : [];
  const tiles = Array.isArray(snapshot.visibleMap?.tiles) ? snapshot.visibleMap.tiles as TileLike[] : [];
  const tileByCoord = new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
  return units
    .filter((unit) => unit.ownerPlayerId === localPlayerId && Number.isInteger(unit.x) && Number.isInteger(unit.y))
    .map((unit) => ({
      id: text(unit.id),
      name: text(unit.name),
      type: text(unit.type),
      x: unit.x as number,
      y: unit.y as number,
      movesRemaining: Number.isInteger(unit.movesRemaining) ? unit.movesRemaining as number : undefined,
      adjacentTiles: screenAdjacentCoordinates(unit.x as number, unit.y as number).map((neighbor) =>
        describeAdjacentTile(neighbor, tileByCoord.get(`${neighbor.x},${neighbor.y}`))
      )
    }));
}

export function screenAdjacentCoordinates(x: number, y: number): Array<{ direction: string; x: number; y: number }> {
  const oddRow = Math.abs(y) % 2 === 1;
  return oddRow
    ? [
        { direction: "左上", x, y: y + 1 },
        { direction: "右上", x: x + 1, y: y + 1 },
        { direction: "左侧", x: x - 1, y },
        { direction: "右侧", x: x + 1, y },
        { direction: "左下", x, y: y - 1 },
        { direction: "右下", x: x + 1, y: y - 1 }
      ]
    : [
        { direction: "左上", x: x - 1, y: y + 1 },
        { direction: "右上", x, y: y + 1 },
        { direction: "左侧", x: x - 1, y },
        { direction: "右侧", x: x + 1, y },
        { direction: "左下", x: x - 1, y: y - 1 },
        { direction: "右下", x, y: y - 1 }
      ];
}

function describeAdjacentTile(
  neighbor: { direction: string; x: number; y: number },
  tile: TileLike | undefined
): AdjacentTileView {
  const view: AdjacentTileView = { direction: neighbor.direction, x: neighbor.x, y: neighbor.y };
  if (!tile) return view;
  assignText(view, "terrainType", tile.terrainType);
  assignText(view, "featureType", tile.featureType);
  assignText(view, "resourceType", tile.resourceType);
  assignText(view, "improvementType", tile.improvementType);
  assignText(view, "routeType", tile.routeType);
  assignText(view, "districtType", tile.districtType);
  assignBoolean(view, "isFreshWater", tile.isFreshWater);
  assignBoolean(view, "isRiver", tile.isRiver);
  assignBoolean(view, "isHills", tile.isHills);
  assignBoolean(view, "isMountain", tile.isMountain);
  assignBoolean(view, "isWater", tile.isWater);
  if (typeof tile.appeal === "number") view.appeal = tile.appeal;
  if (tile.yields && typeof tile.yields === "object") view.yields = tile.yields as Record<string, number>;
  return view;
}

function assignText(view: AdjacentTileView, key: "terrainType" | "featureType" | "resourceType" | "improvementType" | "routeType" | "districtType", value: unknown): void {
  if (typeof value === "string" && value.length > 0) view[key] = value;
}

function assignBoolean(view: AdjacentTileView, key: "isFreshWater" | "isRiver" | "isHills" | "isMountain" | "isWater", value: unknown): void {
  if (typeof value === "boolean") view[key] = value;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
