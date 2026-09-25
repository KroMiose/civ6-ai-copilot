import { adjacentOwnUnits } from "./adjacent-units.js";

export type GapKind = "confirmed-empty" | "not-collected" | "unavailable" | "not-applicable" | "truncated" | "partial" | "ambiguous";

export interface CoverageGap {
  kind: GapKind;
  subject: string;
  effect: string;
}

export interface DecisionBrief {
  player: {
    id?: number;
    leader?: string;
    civilization?: string;
  };
  counts: {
    cities: string;
    ownUnits: string;
    visibleForeignUnits: string;
  };
  cities: Array<Record<string, unknown>>;
  units: {
    own: Array<Record<string, unknown>>;
    visible: Array<Record<string, unknown>>;
  };
  research: {
    tech?: Record<string, unknown>;
    civic?: Record<string, unknown>;
  };
  policies: {
    government?: string;
    equipped: Array<Record<string, unknown>>;
    canChangePolicies?: boolean;
  };
  economy: Record<string, unknown>;
  resources: Array<Record<string, unknown>>;
  diplomacy: Array<Record<string, unknown>>;
  map: {
    exportedTiles: number;
    truncated: boolean;
    tileLimit?: number;
    worldCities: number;
    worldResources: number;
  };
  session: Record<string, unknown>;
  selection?: { city?: string; unit?: string };
  limits: string[];
}

export function buildDecisionBrief(snapshot: Record<string, any>): { brief: DecisionBrief; gaps: CoverageGap[] } {
  const localPlayerId = snapshot.localPlayer?.localPlayerId;
  const cities = arrayOf(snapshot.cities);
  const units = arrayOf(snapshot.units);
  const ownUnits = units.filter((unit) => unit.ownerPlayerId === localPlayerId);
  const visibleUnits = units.filter((unit) => unit.ownerPlayerId !== localPlayerId);
  const gaps: CoverageGap[] = [
    ...domainGaps(snapshot),
    ...mapGaps(snapshot),
    ...sessionGaps(snapshot.session),
    {
      kind: "not-collected",
      subject: "greatWorks",
      effect: "巨作和奇观槽位未采集，不能写成 0 件或空槽。"
    },
    {
      kind: "partial",
      subject: "diplomacy",
      effect: "战争和公开关系只覆盖已遇见的主要文明，不含城邦、蛮族和未遇见文明。"
    }
  ];
  const equipped = arrayOf(snapshot.government?.policies).map((policy) => ({
    id: policy.type,
    name: policy.name,
    slotType: policy.slotType
  }));
  if (equipped.some((policy) => policy.slotType === undefined)) {
    gaps.push({
      kind: "not-collected",
      subject: "policySlots",
      effect: "已装备政策缺少槽位，不能断言某张卡位于经济槽、军事槽或外交槽。"
    });
  }

  return {
    brief: {
      player: {
        id: typeof localPlayerId === "number" ? localPlayerId : undefined,
        leader: text(snapshot.localPlayer?.leaderType),
        civilization: text(snapshot.localPlayer?.civilizationType)
      },
      counts: {
        cities: `${cities.length}/${cities.length}`,
        ownUnits: `${ownUnits.length}/${ownUnits.length}`,
        visibleForeignUnits: `${visibleUnits.length} 当前可见，未看见的单位不在此列`
      },
      cities: cities.map(cityRow),
      units: {
        own: ownUnits.map((unit) => unitRow(snapshot, unit, true)),
        visible: visibleUnits.map((unit) => unitRow(snapshot, unit, false))
      },
      research: {
        tech: progressionRow(snapshot.techs),
        civic: progressionRow(snapshot.civics)
      },
      policies: {
        government: text(snapshot.government?.currentGovernment?.name) ?? text(snapshot.government?.currentGovernment?.type),
        equipped,
        canChangePolicies: snapshot.government?.canChangePolicies === true
      },
      economy: pickNumbers(snapshot.economy, ["goldBalance", "goldPerTurn", "faithBalance", "faithPerTurn", "sciencePerTurn", "culturePerTurn"]),
      resources: arrayOf(snapshot.resources?.items).map((item) => ({ id: item.type, name: item.name, amount: item.amount })),
      diplomacy: arrayOf(snapshot.diplomacy?.metPlayers).map((player) => ({
        playerId: player.playerId,
        civilization: player.civilizationType,
        leader: player.leaderType,
        relationship: player.relationship
      })),
      map: {
        exportedTiles: arrayOf(snapshot.visibleMap?.tiles).length,
        truncated: snapshot.visibleMap?.truncated === true,
        tileLimit: typeof snapshot.visibleMap?.tileLimit === "number" ? snapshot.visibleMap.tileLimit : undefined,
        worldCities: arrayOf(snapshot.visibleMap?.worldIndex?.cities).length,
        worldResources: arrayOf(snapshot.visibleMap?.worldIndex?.resources).length
      },
      session: sessionRow(snapshot.session),
      selection: {
        city: snapshot.selection?.city?.status === "selected" ? text(snapshot.selection.city.id) : undefined,
        unit: snapshot.selection?.unit?.status === "selected" ? text(snapshot.selection.unit.id) : undefined
      },
      limits: [
        "缺口里的事项保持未知，不能补成 0、空或安全。",
        "upgradeCost 为 0 只是记录值：不是免费升级，也不是已经升到最高级。缺少该字段表示未记录。",
        "resources 是库存数量，不是境内已改良的资源点数。",
        "当前生产队列和文明特性不是玩家已经选定的长期路线。",
        "几何距离不是已经验证的移动或攻击许可。"
      ]
    },
    gaps
  };
}

export function expandCity(snapshot: Record<string, any>, query: string): { detail?: Record<string, unknown>; gap?: CoverageGap } {
  const cities = arrayOf(snapshot.cities);
  const found = matchNamed(cities, query);
  if ("error" in found) return { gap: { kind: "ambiguous", subject: "city", effect: found.error } };
  const index = cities.findIndex((city) => city.id === found.id);
  return {
    detail: {
      kind: "city",
      coverage: `${index + 1}/${cities.length}`,
      city: {
        id: found.id,
        name: found.name,
        x: found.x,
        y: found.y,
        population: found.population,
        housing: found.housing,
        amenities: found.amenities,
        amenitiesNeeded: found.amenitiesNeeded,
        yields: found.yields,
        districts: found.districts,
        buildings: found.buildings,
        currentProduction: found.currentProduction,
        currentProductionProgress: found.currentProductionProgress,
        currentProductionCost: found.currentProductionCost,
        turnsUntilComplete: found.turnsUntilComplete,
        foodStock: found.foodStock,
        foodSurplus: found.foodSurplus,
        underSiege: found.underSiege
      }
    }
  };
}

export function expandUnit(snapshot: Record<string, any>, query: string): { detail?: Record<string, unknown>; gap?: CoverageGap } {
  const units = arrayOf(snapshot.units);
  const found = matchNamed(units, query);
  if ("error" in found) return { gap: { kind: "ambiguous", subject: "unit", effect: found.error } };
  const index = units.findIndex((unit) => unit.id === found.id);
  const adjacent = adjacentOwnUnits(snapshot).find((unit) => unit.id === found.id);
  return {
    detail: {
      kind: "unit",
      coverage: `${index + 1}/${units.length}`,
      unit: unitRow(snapshot, found, found.ownerPlayerId === snapshot.localPlayer?.localPlayerId),
      adjacentTiles: adjacent?.adjacentTiles,
      upgradeNote: "upgradeCost 只表示记录值，不表示已经满足升级目标、资源或金币条件。"
    }
  };
}

function cityRow(city: Record<string, any>): Record<string, unknown> {
  return {
    id: city.id,
    name: city.name,
    x: city.x,
    y: city.y,
    population: city.population,
    production: city.currentProduction?.name ?? city.currentProduction?.type,
    turnsRemaining: city.turnsUntilComplete,
    housingTight: typeof city.housing === "number" && typeof city.population === "number" ? city.population > city.housing : undefined,
    amenitiesTight: typeof city.amenities === "number" && typeof city.amenitiesNeeded === "number" ? city.amenities < city.amenitiesNeeded : undefined
  };
}

function unitRow(snapshot: Record<string, any>, unit: Record<string, any>, own: boolean): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: unit.id,
    name: unit.name ?? unit.type,
    type: unit.type,
    x: unit.x,
    y: unit.y,
    ownerPlayerId: unit.ownerPlayerId,
    owner: describeOwner(unit.ownerPlayerId, snapshot),
    own,
    damage: unit.damage,
    originalOwner: typeof unit.originalOwnerPlayerId === "number" ? describeOwner(unit.originalOwnerPlayerId, snapshot) : undefined,
    isLevied: unit.isLevied === true,
    levyTurnsRemaining: unit.levyTurnsRemaining,
    combatStrength: unit.combatStrength,
    rangedStrength: unit.rangedStrength,
    combatStrengthMeaning: "combatStrength 是满编基础战斗力。damage 是已受伤害，不能把只有基础战斗力当成满血。"
  };
  if (own) {
    row.movesRemaining = unit.movesRemaining;
    row.maxMoves = unit.maxMoves;
    row.buildCharges = unit.buildCharges;
    row.level = unit.level;
    row.experience = unit.experience;
    row.range = unit.range;
    row.upgradeCost = unit.upgradeCost;
    row.upgradeCostMeaning = upgradeCostMeaning(unit.upgradeCost);
    row.promotions = unit.promotions;
  }
  return row;
}

export function describeOwner(playerId: unknown, snapshot: Record<string, any> | undefined): { playerId: unknown; kind: "own" | "major" | "not-major"; name?: string } {
  if (snapshot && playerId === snapshot.localPlayer?.localPlayerId) {
    return { playerId, kind: "own", name: text(snapshot.localPlayer?.civilizationType) };
  }
  const met = arrayOf(snapshot?.diplomacy?.metPlayers).find((player) => player.playerId === playerId);
  if (met) {
    return { playerId, kind: "major", name: text(met.civilizationType) ?? text(met.leaderType) };
  }
  return { playerId, kind: "not-major" };
}

function upgradeCostMeaning(value: unknown): string {
  if (value === 0) return "记录为 0。不是免费升级，也不是已经升到最高级。";
  if (typeof value !== "number") return "未记录。";
  return "记录的数字，不表示资源、科技或金币已经满足。";
}

function progressionRow(value: Record<string, any> | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  return {
    current: value.current?.name ?? value.current?.type,
    progress: value.currentProgress,
    cost: value.currentCost
  };
}

function domainGaps(snapshot: Record<string, any>): CoverageGap[] {
  const domains: Array<[string, string]> = [["governors", "总督"], ["trade", "商路"], ["cityStates", "城邦关系"]];
  return domains.flatMap(([field, label]): CoverageGap[] => {
    const value = snapshot[field];
    if (!value || typeof value !== "object") {
      return [{ kind: "not-collected" as const, subject: field, effect: `${label}未采集，不能当成没有或安全。` }];
    }
    if (value.availability === "unavailable") {
      return [{ kind: "unavailable" as const, subject: field, effect: `${label}这次没读到，不能据此判断有无、敌对或安全。` }];
    }
    if (value.availability === "not-applicable") {
      return [{ kind: "not-applicable" as const, subject: field, effect: `${label}在当前规则下不适用。` }];
    }
    return [];
  });
}

function sessionRow(session: Record<string, any> | undefined): Record<string, unknown> {
  return {
    gameTurn: session?.gameTurn,
    ruleset: session?.ruleset,
    gameSpeed: session?.gameSpeed,
    mapSize: session?.mapSize,
    isMultiplayer: session?.isMultiplayer,
    humanPlayerCount: session?.humanPlayerCount
  };
}

function sessionGaps(session: Record<string, any> | undefined): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  if (!session || looksUnresolved(session.gameSpeed)) {
    gaps.push({ kind: "not-collected", subject: "gameSpeed", effect: "游戏速度没有可读名称，不能把哈希或 UNKNOWN 当成标准、快速或史诗。" });
  }
  if (!session || looksUnresolved(session.mapSize)) {
    gaps.push({ kind: "not-collected", subject: "mapSize", effect: "地图大小没有可读名称。" });
  }
  if (typeof session?.humanPlayerCount !== "number") {
    gaps.push({ kind: "not-collected", subject: "humanPlayerCount", effect: "人类席位数量未记录。" });
  }
  return gaps;
}

function looksUnresolved(value: unknown): boolean {
  return typeof value !== "string" || value.length === 0 || value.startsWith("UNKNOWN") || /^-?\d+$/.test(value);
}

function mapGaps(snapshot: Record<string, any>): CoverageGap[] {
  if (snapshot.visibleMap?.truncated === true) {
    return [{
      kind: "truncated",
      subject: "visibleMap",
      effect: `可见地图已截断，上限 ${snapshot.visibleMap.tileLimit ?? "未知"}。不能把已见城市或单位说成完整战场。`
    }];
  }
  if (!Array.isArray(snapshot.visibleMap?.tiles)) {
    return [{ kind: "not-collected", subject: "visibleMap", effect: "地图未采集。铺城、移动和战线需要 --map。" }];
  }
  return [];
}

function matchNamed(entities: Array<Record<string, any>>, value: string): Record<string, any> | { error: string } {
  const exactId = entities.find((entity) => entity.id === value);
  if (exactId) return exactId;
  const exactName = entities.filter((entity) => entity.name === value);
  if (exactName.length === 1) return exactName[0]!;
  const contains = entities.filter((entity) => typeof entity.name === "string" && entity.name.includes(value));
  if (contains.length === 1) return contains[0]!;
  const matched = exactName.length > 1 ? exactName : contains;
  if (matched.length > 1) return { error: `「${value}」对应多个目标：${matched.map(entityLabel).join("；")}` };
  return { error: `找不到「${value}」。可选：${entities.map(entityLabel).join("；") || "无"}` };
}

function entityLabel(entity: Record<string, any>): string {
  return `${entity.name ?? entity.type ?? "未命名"} id=${entity.id ?? "?"} (${entity.x},${entity.y}) owner=${entity.ownerPlayerId ?? "?"}`;
}

function pickNumbers(source: Record<string, any> | undefined, keys: string[]): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const key of keys) {
    if (typeof source?.[key] === "number") picked[key] = source[key];
  }
  return picked;
}

function arrayOf(value: unknown): Array<Record<string, any>> {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") as Array<Record<string, any>> : [];
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
