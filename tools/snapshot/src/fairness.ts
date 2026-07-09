export interface FairnessIssue {
  path: string;
  message: string;
}

const forbiddenKeyPatterns = [
  /hidden/i,
  /allPlayersPrivateState/i,
  /unmetPlayers/i,
  /secretDiplomacy/i,
  /privateDiplomacy/i,
  /otherPlayerPolicies/i,
  /otherPlayerTechs/i,
  /otherPlayerCivics/i,
  /invisibleUnits/i,
  /allKnowledge/i
];

export function runFairnessChecks(snapshot: unknown): FairnessIssue[] {
  const issues: FairnessIssue[] = [];
  const root = asRecord(snapshot);

  if (!root) {
    return [{ path: "$", message: "snapshot must be an object" }];
  }

  walkForbiddenKeys(root, "$", issues);

  if (asRecord(root.source)?.visibilityMode !== "player-visible") {
    issues.push({ path: "$.source.visibilityMode", message: "visibilityMode must be player-visible" });
  }

  const localPlayerId = asRecord(root.localPlayer)?.localPlayerId;
  const units = Array.isArray(root.units) ? root.units : [];
  for (const [index, value] of units.entries()) {
    const unit = asRecord(value);
    if (!unit) {
      continue;
    }
    const isOwnUnit = unit.ownerPlayerId === localPlayerId;
    if (!isOwnUnit && unit.visibility !== "visible-now") {
      issues.push({
        path: `$.units[${index}].visibility`,
        message: "non-local units must be currently visible"
      });
    }
  }

  const cities = Array.isArray(root.cities) ? root.cities : [];
  for (const [index, value] of cities.entries()) {
    const city = asRecord(value);
    const production = asRecord(city?.currentProduction);
    if (!production) {
      continue;
    }
    if (typeof production.type === "string" && /^-?\d+$/.test(production.type)) {
      issues.push({
        path: `$.cities[${index}].currentProduction.type`,
        message: "currentProduction.type must be a UNIT_*, BUILDING_*, DISTRICT_*, PROJECT_*, or UNKNOWN_PRODUCTION identifier, not a raw production hash"
      });
    }
    if (typeof production.name === "string" && /^-?\d+$/.test(production.name)) {
      issues.push({
        path: `$.cities[${index}].currentProduction.name`,
        message: "currentProduction.name must be localized text or UNKNOWN_PRODUCTION, not a raw production hash"
      });
    }
  }

  const visibleMap = asRecord(root.visibleMap);
  const tiles = Array.isArray(visibleMap?.tiles) ? visibleMap.tiles : [];
  for (const [index, value] of tiles.entries()) {
    const tile = asRecord(value);
    if (!tile) {
      continue;
    }
    if (tile.revealed !== true) {
      issues.push({
        path: `$.visibleMap.tiles[${index}].revealed`,
        message: "snapshot must not include unrevealed tiles"
      });
    }
    if (Array.isArray(tile.unitIds) && tile.visibleNow !== true) {
      issues.push({
        path: `$.visibleMap.tiles[${index}].unitIds`,
        message: "tiles with units must be currently visible"
      });
    }
    if (typeof tile.terrainType === "string" && /^-?\d+$/.test(tile.terrainType)) {
      issues.push({
        path: `$.visibleMap.tiles[${index}].terrainType`,
        message: "terrainType must be a TERRAIN_* identifier, not a raw plot terrain index"
      });
    }
    if (typeof tile.featureType === "string" && /^-?\d+$/.test(tile.featureType)) {
      issues.push({
        path: `$.visibleMap.tiles[${index}].featureType`,
        message: "featureType must be a FEATURE_* identifier, not a raw plot feature index"
      });
    }
    if (typeof tile.resourceType === "string" && /^-?\d+$/.test(tile.resourceType)) {
      issues.push({
        path: `$.visibleMap.tiles[${index}].resourceType`,
        message: "resourceType must be a visible RESOURCE_* identifier, not a raw plot resource index"
      });
    }
  }

  const metPlayers = asRecord(root.diplomacy);
  const diplomacyRows = Array.isArray(metPlayers?.metPlayers) ? metPlayers.metPlayers : [];
  for (const [index, value] of diplomacyRows.entries()) {
    const row = asRecord(value);
    if (!row) {
      continue;
    }
    if (row.visibility !== "public-known") {
      issues.push({
        path: `$.diplomacy.metPlayers[${index}].visibility`,
        message: "other-player diplomacy rows must be public-known"
      });
    }
  }

  return issues;
}

function walkForbiddenKeys(value: unknown, currentPath: string, issues: FairnessIssue[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkForbiddenKeys(item, `${currentPath}[${index}]`, issues));
    return;
  }

  const record = asRecord(value);
  if (!record) {
    return;
  }

  for (const [key, child] of Object.entries(record)) {
    const childPath = `${currentPath}.${key}`;
    if (forbiddenKeyPatterns.some((pattern) => pattern.test(key))) {
      issues.push({
        path: childPath,
        message: `forbidden multiplayer/private field key: ${key}`
      });
    }
    walkForbiddenKeys(child, childPath, issues);
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}
