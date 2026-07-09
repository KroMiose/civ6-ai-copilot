import { readFile } from "node:fs/promises";
import { validateSnapshotObject, type SnapshotValidationResult } from "../../snapshot/src/validate.js";

export interface SummarizeSnapshotOptions {
  question?: string;
  intents?: string[];
  requiredModules?: string[];
  allowInvalid?: boolean;
}

export interface SnapshotSummary {
  validation: SnapshotValidationResult;
  snapshot: {
    schemaVersion: string;
    exportedAt: string;
    exportType: string;
    visibilityMode: string;
    sessionId: string;
    gameTurn: number;
    ruleset: string;
    gameSpeed: string;
    mapSize: string;
    isMultiplayer: boolean;
  };
  localPlayer: {
    localPlayerId: number;
    civilizationType: string;
    leaderType: string;
    visibility: string;
    confidence: string;
  };
  coverage: {
    availableModules: string[];
    missingRecommendedModules: string[];
    counts: {
      cities: number;
      units: number;
      ownUnits: number;
      visibleForeignUnits: number;
      visibleTiles: number;
      metPlayers: number;
      attention: number;
    };
  };
  highlights: {
    cities: string[];
    units: string[];
    map: string[];
    progression: string[];
    government: string[];
    diplomacy: string[];
    attention: string[];
  };
  syncAdvice: {
    ok: boolean;
    question?: string;
    intents: string[];
    scenarios: string[];
    requiredModules: string[];
    missingModules: string[];
    lowConfidenceModules: string[];
    recommendation: string;
  };
  gaps: string[];
}

export class SnapshotSummaryError extends Error {
  constructor(
    message: string,
    public readonly validation: SnapshotValidationResult
  ) {
    super(message);
    this.name = "SnapshotSummaryError";
  }
}

const recommendedModules = [
  "meta",
  "localPlayer",
  "cities",
  "units",
  "techs",
  "civics",
  "government",
  "policies",
  "resources",
  "diplomacyPublic",
  "visibleMap"
];

const moduleLabels: Record<string, string> = {
  meta: "元信息",
  localPlayer: "本地玩家",
  cities: "城市运营",
  units: "军事态势",
  techs: "科技市政",
  civics: "科技市政",
  government: "政体政策",
  policies: "政体政策",
  resources: "资源库存",
  diplomacyPublic: "公开外交",
  visibleMap: "更新地图情报",
  notifications: "通知/待办"
};

const terrainLabels: Record<string, string> = {
  TERRAIN_GRASS: "草原",
  TERRAIN_GRASS_HILLS: "草原丘陵",
  TERRAIN_PLAINS: "平原",
  TERRAIN_PLAINS_HILLS: "平原丘陵",
  TERRAIN_DESERT: "沙漠",
  TERRAIN_DESERT_HILLS: "沙漠丘陵",
  TERRAIN_TUNDRA: "冻土",
  TERRAIN_TUNDRA_HILLS: "冻土丘陵",
  TERRAIN_SNOW: "雪地",
  TERRAIN_SNOW_HILLS: "雪地丘陵",
  TERRAIN_COAST: "海岸",
  TERRAIN_OCEAN: "海洋"
};

const featureLabels: Record<string, string> = {
  FEATURE_FOREST: "森林",
  FEATURE_JUNGLE: "雨林",
  FEATURE_MARSH: "沼泽",
  FEATURE_FLOODPLAINS: "泛滥平原",
  FEATURE_FLOODPLAINS_GRASSLAND: "草原泛滥平原",
  FEATURE_FLOODPLAINS_PLAINS: "平原泛滥平原",
  FEATURE_REEF: "礁石",
  FEATURE_OASIS: "绿洲",
  FEATURE_GEOTHERMAL_FISSURE: "地热裂缝",
  FEATURE_ICE: "冰"
};

const resourceLabels: Record<string, string> = {
  RESOURCE_BANANAS: "香蕉",
  RESOURCE_CRABS: "螃蟹",
  RESOURCE_FISH: "鱼",
  RESOURCE_HONEY: "蜂蜜",
  RESOURCE_CATTLE: "牛",
  RESOURCE_SHEEP: "羊",
  RESOURCE_WHEAT: "小麦",
  RESOURCE_RICE: "水稻",
  RESOURCE_COPPER: "铜",
  RESOURCE_STONE: "石材",
  RESOURCE_DEER: "鹿",
  RESOURCE_FURS: "毛皮",
  RESOURCE_SALT: "盐",
  RESOURCE_HORSES: "马",
  RESOURCE_IRON: "铁"
};

const yieldLabels: Record<string, string> = {
  YIELD_FOOD: "食物",
  YIELD_PRODUCTION: "生产力",
  YIELD_GOLD: "金币",
  YIELD_SCIENCE: "科技",
  YIELD_CULTURE: "文化",
  YIELD_FAITH: "信仰"
};

const improvementLabels: Record<string, string> = {
  IMPROVEMENT_FARM: "农场",
  IMPROVEMENT_MINE: "矿山",
  IMPROVEMENT_QUARRY: "采石场",
  IMPROVEMENT_PASTURE: "牧场",
  IMPROVEMENT_PLANTATION: "种植园",
  IMPROVEMENT_CAMP: "营地",
  IMPROVEMENT_FISHING_BOATS: "渔船",
  IMPROVEMENT_LUMBER_MILL: "伐木场"
};

const routeLabels: Record<string, string> = {
  ROUTE_ANCIENT_ROAD: "远古道路",
  ROUTE_MEDIEVAL_ROAD: "中世纪道路",
  ROUTE_INDUSTRIAL_ROAD: "工业道路",
  ROUTE_MODERN_ROAD: "现代道路",
  ROUTE_RAILROAD: "铁路"
};

const districtLabels: Record<string, string> = {
  DISTRICT_CITY_CENTER: "市中心",
  DISTRICT_CAMPUS: "学院",
  DISTRICT_HOLY_SITE: "圣地",
  DISTRICT_ENCAMPMENT: "军营",
  DISTRICT_HARBOR: "港口",
  DISTRICT_COTHON: "U型港",
  DISTRICT_COMMERCIAL_HUB: "商业中心",
  DISTRICT_THEATER: "剧院广场",
  DISTRICT_INDUSTRIAL_ZONE: "工业区",
  DISTRICT_AQUEDUCT: "水渠",
  DISTRICT_ENTERTAINMENT_COMPLEX: "娱乐中心",
  DISTRICT_GOVERNMENT: "市政广场",
  DISTRICT_PRESERVE: "保护区"
};

const intentRules = [
  {
    id: "war",
    modules: ["meta", "localPlayer", "cities", "units", "visibleMap", "diplomacyPublic"]
  },
  {
    id: "navy",
    modules: ["meta", "localPlayer", "cities", "units", "visibleMap", "resources", "techs"]
  },
  {
    id: "exploration",
    modules: ["meta", "localPlayer", "units", "visibleMap"]
  },
  {
    id: "city-production",
    modules: ["meta", "localPlayer", "cities", "resources"]
  },
  {
    id: "tech-civic",
    modules: ["meta", "localPlayer", "cities", "techs", "civics", "resources"]
  },
  {
    id: "policy",
    modules: ["meta", "localPlayer", "government", "policies", "resources"]
  },
  {
    id: "settling",
    modules: ["meta", "localPlayer", "cities", "units", "visibleMap", "resources"]
  },
  {
    id: "turn-priority",
    modules: ["meta", "localPlayer", "cities", "units", "techs", "civics", "government", "policies", "resources", "diplomacyPublic", "visibleMap"]
  }
];

const questionRules = [
  { id: "war", patterns: [/战争/, /开战/, /打仗/, /进攻/, /防守/, /前线/, /围城/, /\bwar\b/i, /\battack\b/i, /\bdefen[cs]e\b/i] },
  { id: "navy", patterns: [/海军/, /舰队/, /港口/, /岛/, /海岸/, /\bnavy\b/i, /\bcoast/i] },
  { id: "exploration", patterns: [/探索/, /侦察/, /探路/, /开图/, /探图/, /勇士/, /斥候/, /走哪/, /往哪里/, /\bexplor/i, /\bscout/i] },
  { id: "city-production", patterns: [/城市/, /建造/, /生产/, /区域/, /住房/, /宜居度/, /\bcit(y|ies)\b/i, /\bproduction\b/i] },
  { id: "tech-civic", patterns: [/科技/, /市政/, /尤里卡/, /鼓舞/, /路线/, /\btech\b/i, /\bcivic\b/i, /\beureka\b/i] },
  { id: "policy", patterns: [/政策/, /政体/, /换卡/, /卡槽/, /\bpolicy\b/i, /\bgovernment\b/i] },
  { id: "settling", patterns: [/铺城/, /定居/, /移民/, /坐城/, /资源岛/, /\bsettle\b/i, /\bsettler\b/i] }
];

const defaultQuestionModules = ["meta", "localPlayer", "cities", "units", "techs", "civics", "government", "policies", "resources"];

export async function summarizeSnapshotFile(snapshotPath: string, options: SummarizeSnapshotOptions = {}): Promise<SnapshotSummary> {
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as SnapshotLike;
  return summarizeSnapshotObject(snapshot, options);
}

export async function summarizeSnapshotObject(snapshot: SnapshotLike, options: SummarizeSnapshotOptions = {}): Promise<SnapshotSummary> {
  const validation = await validateSnapshotObject(snapshot);
  if (!validation.ok && !options.allowInvalid) {
    throw new SnapshotSummaryError("snapshot failed schema or multiplayer fairness validation", validation);
  }

  const availableModules = Array.isArray(snapshot.modules) ? snapshot.modules : [];
  const localPlayerId = snapshot.localPlayer?.localPlayerId;
  const cities = Array.isArray(snapshot.cities) ? snapshot.cities : [];
  const units = Array.isArray(snapshot.units) ? snapshot.units : [];
  const ownUnits = units.filter((unit) => unit.ownerPlayerId === localPlayerId);
  const visibleForeignUnits = units.filter((unit) => unit.ownerPlayerId !== localPlayerId && unit.visibility === "visible-now");
  const tiles = Array.isArray(snapshot.visibleMap?.tiles) ? snapshot.visibleMap.tiles : [];
  const metPlayers = Array.isArray(snapshot.diplomacy?.metPlayers) ? snapshot.diplomacy.metPlayers : [];
  const attention = Array.isArray(snapshot.attention) ? snapshot.attention : [];
  const missingRecommendedModules = recommendedModules.filter((moduleName) => !availableModules.includes(moduleName));

  const summary: SnapshotSummary = {
    validation,
    snapshot: {
      schemaVersion: text(snapshot.schemaVersion),
      exportedAt: text(snapshot.exportedAt),
      exportType: text(snapshot.source?.exportType ?? "turn"),
      visibilityMode: text(snapshot.source?.visibilityMode),
      sessionId: text(snapshot.session?.sessionId),
      gameTurn: number(snapshot.session?.gameTurn),
      ruleset: text(snapshot.session?.ruleset),
      gameSpeed: text(snapshot.session?.gameSpeed),
      mapSize: text(snapshot.session?.mapSize),
      isMultiplayer: Boolean(snapshot.session?.isMultiplayer)
    },
    localPlayer: {
      localPlayerId: number(localPlayerId),
      civilizationType: text(snapshot.localPlayer?.civilizationType),
      leaderType: text(snapshot.localPlayer?.leaderType),
      visibility: text(snapshot.localPlayer?.visibility),
      confidence: text(snapshot.localPlayer?.confidence)
    },
    coverage: {
      availableModules,
      missingRecommendedModules,
      counts: {
        cities: cities.length,
        units: units.length,
        ownUnits: ownUnits.length,
        visibleForeignUnits: visibleForeignUnits.length,
        visibleTiles: tiles.length,
        metPlayers: metPlayers.length,
        attention: attention.length
      }
    },
    highlights: {
      cities: summarizeCities(cities),
      units: summarizeUnits(ownUnits, visibleForeignUnits),
      map: summarizeMap(snapshot.visibleMap, ownUnits),
      progression: summarizeProgression(snapshot.techs, snapshot.civics),
      government: summarizeGovernment(snapshot.government, snapshot.resources),
      diplomacy: summarizeDiplomacy(metPlayers),
      attention: summarizeAttention(attention)
    },
    syncAdvice: buildSyncAdvice(snapshot, availableModules, options),
    gaps: []
  };

  summary.gaps = buildGaps(summary);
  return summary;
}

export function formatSnapshotSummaryMarkdown(summary: SnapshotSummary): string {
  const lines = [
    "# Civ6 AI Copilot 快照摘要",
    "",
    "## 我已确认的信息",
    `- 第 ${summary.snapshot.gameTurn} 回合，${summary.snapshot.isMultiplayer ? "多人局" : "单人局"}，${summary.snapshot.ruleset} / ${summary.snapshot.gameSpeed} / ${summary.snapshot.mapSize}`,
    `- 本地玩家：${summary.localPlayer.leaderType} / ${summary.localPlayer.civilizationType}（player ${summary.localPlayer.localPlayerId}）`,
    `- 导出：${summary.snapshot.exportType}，${summary.snapshot.visibilityMode}，${summary.snapshot.exportedAt}`,
    `- 校验：${summary.validation.ok ? "通过" : "未通过，需要先处理校验问题"}`,
    "",
    "## 模块覆盖",
    `- 已覆盖：${labelModules(summary.coverage.availableModules).join("、") || "无"}`,
    `- 建议更新：${labelModules(summary.coverage.missingRecommendedModules).join("、") || "无"}`,
    `- 计数：${summary.coverage.counts.cities} 城，${summary.coverage.counts.ownUnits} 个自有单位，${summary.coverage.counts.visibleForeignUnits} 个当前可见外方单位，${summary.coverage.counts.visibleTiles} 个可见/已揭示地块`,
    "",
    "## 关键内容",
    "- 位置说明：下列坐标只用于内部核对和 SVG 对齐；回复玩家时请改写成相对位置、屏幕方向和可见锚点。",
    ...sectionBullets("城市", summary.highlights.cities),
    ...sectionBullets("单位", summary.highlights.units),
    ...sectionBullets("可见地图", summary.highlights.map),
    ...sectionBullets("科技/市政", summary.highlights.progression),
    ...sectionBullets("政体/资源", summary.highlights.government),
    ...sectionBullets("外交", summary.highlights.diplomacy),
    ...sectionBullets("注意事项", summary.highlights.attention),
    "",
    "## 下一步情报建议",
    `- ${summary.syncAdvice.recommendation}`,
    ...summary.gaps.map((gap) => `- ${gap}`)
  ];

  return `${lines.join("\n")}\n`;
}

function summarizeCities(cities: CityLike[]): string[] {
  if (cities.length === 0) {
    return ["没有城市条目。"];
  }

  return cities.slice(0, 8).map((city) => {
    const production = city.currentProduction?.name ?? city.currentProduction?.type ?? "未记录生产";
    const turns = typeof city.turnsUntilComplete === "number" ? `，${city.turnsUntilComplete} 回合完成` : "";
    const yields = city.yields
      ? `，产出 ${compactYields(city.yields)}`
      : "";
    return `${city.name ?? city.id ?? "Unnamed city"}：人口 ${city.population ?? "?"}，正在 ${production}${turns}${yields}`;
  });
}

function summarizeUnits(ownUnits: UnitLike[], visibleForeignUnits: UnitLike[]): string[] {
  const lines: string[] = [];
  if (ownUnits.length === 0) {
    lines.push("没有自有单位条目。");
  } else {
    lines.push(
      ...ownUnits.slice(0, 8).map((unit) => {
        const damage = typeof unit.damage === "number" ? `，伤害 ${unit.damage}` : "";
        const moves = typeof unit.movesRemaining === "number" ? `，剩余移动 ${unit.movesRemaining}` : "";
        return `自有 ${unit.name ?? unit.type ?? unit.id} @ (${unit.x ?? "?"}, ${unit.y ?? "?"})${damage}${moves}`;
      })
    );
  }

  if (visibleForeignUnits.length > 0) {
    lines.push(
      ...visibleForeignUnits.slice(0, 8).map((unit) => {
        const damage = typeof unit.damage === "number" ? `，伤害 ${unit.damage}` : "";
        return `当前可见外方 ${unit.name ?? unit.type ?? unit.id} @ (${unit.x ?? "?"}, ${unit.y ?? "?"})${damage}`;
      })
    );
  }

  return lines;
}

function summarizeMap(visibleMap: VisibleMapLike | undefined, ownUnits: UnitLike[] = []): string[] {
  const tiles = Array.isArray(visibleMap?.tiles) ? visibleMap.tiles : [];
  const bounds = visibleMap?.bounds;
  const visibleNow = tiles.filter((tile) => tile.visibleNow === true).length;
  const withUnits = tiles.filter((tile) => Array.isArray(tile.unitIds) && tile.unitIds.length > 0).length;
  const boundsText = bounds ? `范围 x=${bounds.minX ?? "?"}..${bounds.maxX ?? "?"}, y=${bounds.minY ?? "?"}..${bounds.maxY ?? "?"}` : "未记录范围";
  const revealedText = typeof visibleMap?.revealedTileCount === "number" ? `，已揭示 ${visibleMap.revealedTileCount}` : "";
  const truncationText = visibleMap?.truncated === true ? `；地图视野导出已截断，上限 ${visibleMap.tileLimit ?? "未知"}` : "";
  const lines = [`${boundsText}；导出地块 ${tiles.length}${revealedText}，当前可见 ${visibleNow}，含单位地块 ${withUnits}${truncationText}`];
  const tileByCoord = new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
  const unitTiles = ownUnits
    .filter((unit) => typeof unit.x === "number" && typeof unit.y === "number")
    .slice(0, 8)
    .map((unit) => {
      const tile = tileByCoord.get(`${unit.x},${unit.y}`);
      return `${unit.name ?? unit.type ?? unit.id} @ (${unit.x}, ${unit.y})：${describeTile(tile)}`;
    });
  if (unitTiles.length > 0) {
    lines.push(`单位所在地块：${unitTiles.join("；")}`);
  }

  const adjacentTiles = summarizeAdjacentUnitTiles(ownUnits, tileByCoord);
  if (adjacentTiles.length > 0) {
    lines.push(`单位相邻地块：${adjacentTiles.join("；")}`);
  }

  const resourceTiles = tiles
    .filter((tile) => typeof tile.resourceType === "string")
    .slice(0, 12)
    .map((tile) => `${labelResource(tile.resourceType)} @ (${tile.x ?? "?"}, ${tile.y ?? "?"})：${describeTile(tile, { includeResource: false })}`);
  if (resourceTiles.length > 0) {
    lines.push(`可见资源：${resourceTiles.join("；")}`);
  }

  const planningTiles = tiles
    .filter((tile) => hasPlanningFacts(tile))
    .slice(0, 12)
    .map((tile) => `(${tile.x ?? "?"}, ${tile.y ?? "?"})：${describeTile(tile)}`);
  if (planningTiles.length > 0) {
    lines.push(`规划地块：${planningTiles.join("；")}`);
  }

  return lines;
}

function summarizeAdjacentUnitTiles(ownUnits: UnitLike[], tileByCoord: Map<string, TileLike>): string[] {
  return ownUnits
    .filter((unit) => typeof unit.x === "number" && typeof unit.y === "number")
    .slice(0, 6)
    .map((unit) => {
      const neighbors = screenAdjacentCoordinates(unit.x as number, unit.y as number)
        .map((neighbor) => {
          const tile = tileByCoord.get(`${neighbor.x},${neighbor.y}`);
          return `${neighbor.label} (${neighbor.x}, ${neighbor.y})：${describeTile(tile)}`;
        })
        .join("；");
      return `${unit.name ?? unit.type ?? unit.id} @ (${unit.x}, ${unit.y})：${neighbors}`;
    });
}

function screenAdjacentCoordinates(x: number, y: number): Array<{ label: string; x: number; y: number }> {
  const oddRow = Math.abs(y) % 2 === 1;
  return oddRow
    ? [
        { label: "左上", x, y: y + 1 },
        { label: "右上", x: x + 1, y: y + 1 },
        { label: "左侧", x: x - 1, y },
        { label: "右侧", x: x + 1, y },
        { label: "左下", x, y: y - 1 },
        { label: "右下", x: x + 1, y: y - 1 }
      ]
    : [
        { label: "左上", x: x - 1, y: y + 1 },
        { label: "右上", x, y: y + 1 },
        { label: "左侧", x: x - 1, y },
        { label: "右侧", x: x + 1, y },
        { label: "左下", x: x - 1, y: y - 1 },
        { label: "右下", x, y: y - 1 }
      ];
}

function summarizeProgression(techs: ProgressionLike | undefined, civics: ProgressionLike | undefined): string[] {
  const lines: string[] = [];
  lines.push(`当前科技：${techs?.current?.name ?? techs?.current?.type ?? "未记录"}`);
  lines.push(`当前市政：${civics?.current?.name ?? civics?.current?.type ?? "未记录"}`);
  if (Array.isArray(techs?.available) && techs.available.length > 0) {
    lines.push(`可选科技：${techs.available.map(named).join("、")}`);
  }
  if (Array.isArray(civics?.available) && civics.available.length > 0) {
    lines.push(`可选市政：${civics.available.map(named).join("、")}`);
  }
  if (Array.isArray(techs?.boosts) && techs.boosts.length > 0) {
    const missingBoosts = techs.boosts.filter((boost) => boost.boosted === false).map((boost) => boost.type);
    if (missingBoosts.length > 0) {
      lines.push(`未触发尤里卡：${missingBoosts.join("、")}`);
    }
  }
  return lines;
}

function summarizeGovernment(government: GovernmentLike | undefined, resources: ResourcesLike | undefined): string[] {
  const lines: string[] = [];
  lines.push(`政体：${government?.currentGovernment?.name ?? government?.currentGovernment?.type ?? "未记录"}`);
  const policies = Array.isArray(government?.policies) ? government.policies.map(named) : [];
  if (policies.length > 0) {
    lines.push(`政策卡：${policies.join("、")}`);
  }
  const resourceItems = Array.isArray(resources?.items) ? resources.items : [];
  if (resourceItems.length > 0) {
    lines.push(`资源：${resourceItems.map((item) => `${item.name ?? item.type}=${item.amount}`).join("、")}`);
  }
  return lines;
}

function summarizeDiplomacy(metPlayers: DiplomacyRowLike[]): string[] {
  if (metPlayers.length === 0) {
    return ["没有已遇见玩家公开外交条目。"];
  }

  return metPlayers.slice(0, 8).map((row) => {
    const score = typeof row.militaryScore === "number" ? `，军事分 ${row.militaryScore}` : "";
    return `player ${row.playerId}：${row.leaderType ?? "unknown leader"} / ${row.civilizationType}，关系 ${row.relationship}${score}`;
  });
}

function summarizeAttention(attention: AttentionLike[]): string[] {
  if (attention.length === 0) {
    return ["没有导出的提醒。"];
  }

  return attention.slice(0, 8).map((item) => `${item.severity ?? "info"}：${item.kind ?? "attention"} - ${item.message ?? ""}`.trim());
}

function buildSyncAdvice(
  snapshot: SnapshotLike,
  availableModules: string[],
  options: SummarizeSnapshotOptions
): SnapshotSummary["syncAdvice"] {
  const question = options.question;
  const requestedIntents = normalizeIntents(options.intents);
  const explicitModules = uniqueStrings(options.requiredModules);
  let matchedRules = requestedIntents.length > 0
    ? intentRules.filter((rule) => requestedIntents.includes(rule.id))
    : question
    ? questionRules
        .filter((rule) => rule.patterns.some((pattern) => pattern.test(question)))
        .map((rule) => intentRules.find((intentRule) => intentRule.id === rule.id))
        .filter((rule): rule is (typeof intentRules)[number] => Boolean(rule))
    : [];

  if (explicitModules.length === 0 && matchedRules.length === 0 && (!question || question.trim().length === 0)) {
    const defaultRule = intentRules.find((rule) => rule.id === "turn-priority");
    matchedRules = defaultRule ? [defaultRule] : [];
  }

  const requiredModules = explicitModules.length > 0
    ? explicitModules
    : [...new Set((matchedRules.length > 0 ? matchedRules.flatMap((rule) => rule.modules) : defaultQuestionModules))];
  const intents = matchedRules.map((rule) => rule.id);
  const missingModules = requiredModules.filter((moduleName) => !availableModules.includes(moduleName));
  const lowConfidenceRequiredModules = lowConfidenceModules(snapshot, requiredModules.filter((moduleName) => availableModules.includes(moduleName)));

  if (missingModules.length === 0 && lowConfidenceRequiredModules.length === 0) {
    return {
      ok: true,
      question,
      intents,
      scenarios: intents,
      requiredModules,
      missingModules: [],
      lowConfidenceModules: [],
      recommendation: "当前 snapshot 已覆盖当前分析意图，可以继续分析。"
    };
  }

  const labels = labelModules(missingModules);
  const lowConfidenceLabels = labelModules(lowConfidenceRequiredModules);
  const mapWindowOnly = missingModules.includes("visibleMap") && requiredModules.every((moduleName) =>
    ["meta", "localPlayer", "units", "visibleMap"].includes(moduleName)
  );
  const action = mapWindowOnly
    ? "点击「更新地图情报」"
    : missingModules.includes("visibleMap")
    ? "点击「更新地图情报」；如仍需城市运营、科技市政或政体政策信息，再选择对应专题情报"
    : `选择「${labels.join("」「")}」`;
  const lowConfidenceAction = lowConfidenceRequiredModules.length > 0
    ? `；另外 ${lowConfidenceLabels.join("、")} 置信度偏低，请重新汇总对应情报${lowConfidenceRequiredModules.includes("visibleMap") ? "或点击「更新地图情报」" : ""}。若置信度仍偏低，我会按低置信度来源处理`
    : "";
  const missingText = missingModules.length > 0 ? `当前分析需要 ${labels.join("、")}。` : "当前意图所需情报已声明存在，但部分模块置信度偏低。";

  return {
    ok: false,
    question,
    intents,
    scenarios: intents,
    requiredModules,
    missingModules,
    lowConfidenceModules: lowConfidenceRequiredModules,
    recommendation: `${missingText}请在 Civ6 点击左上副官入口打开「战情简报」，${missingModules.length > 0 ? action : "重新汇总对应情报"}${lowConfidenceAction}。看到“简报已汇总，可继续由AI副官分析。”和“最近汇总：…”后，重新运行标准入口。`
  };
}

function normalizeIntents(intents: string[] | undefined): string[] {
  return uniqueStrings(intents)
    .map((intent) => intent === "general" ? "turn-priority" : intent)
    .filter((intent) => intentRules.some((rule) => rule.id === intent));
}

function uniqueStrings(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function lowConfidenceModules(snapshot: SnapshotLike, modules: string[]): string[] {
  return modules.filter((moduleName) => {
    const confidence = moduleConfidence(snapshot, moduleName);
    return confidence !== undefined && confidence !== "confirmed";
  });
}

function moduleConfidence(snapshot: SnapshotLike, moduleName: string): string | undefined {
  switch (moduleName) {
    case "visibleMap":
      return snapshot.visibleMap?.confidence;
    case "diplomacyPublic":
      return snapshot.diplomacy?.confidence;
    default:
      return undefined;
  }
}

function buildGaps(summary: SnapshotSummary): string[] {
  const gaps: string[] = [];

  if (!summary.validation.ok) {
    gaps.push("snapshot 未通过校验；请优先查看 schemaErrors/fairnessIssues，避免基于不合规数据分析。");
  }
  if (summary.coverage.counts.cities === 0) {
    gaps.push("城市列表为空；逐城生产、区域和住房建议需要在战情简报中选择「城市运营」。");
  }
  if (summary.coverage.counts.units === 0) {
    gaps.push("部队列表为空；战争、侦察和护送建议需要在战情简报中选择「军事态势」或点击「更新地图情报」。");
  }
  if (summary.coverage.counts.visibleTiles === 0) {
    gaps.push("地图视野为空；铺城、战线和海军路线需要点击「更新地图情报」。");
  }
  if (summary.syncAdvice.lowConfidenceModules.length > 0) {
    gaps.push(`低置信度模块：${labelModules(summary.syncAdvice.lowConfidenceModules).join("、")}；请重新汇总对应情报，或在回答中明确按低置信度处理。`);
  }
  if (!summary.coverage.availableModules.includes("notifications")) {
    gaps.push("通知/待办模块未覆盖；这不会阻止基础分析，但可能漏掉可立即处理的鼓舞、尤里卡或外交提醒。");
  }

  return gaps;
}

function labelModules(modules: string[]): string[] {
  return [...new Set(modules.map((moduleName) => moduleLabels[moduleName] ?? moduleName))];
}

function describeTile(tile: TileLike | undefined, options: { includeResource?: boolean } = {}): string {
  if (!tile) {
    return "当前情报未覆盖";
  }
  const parts = [
    labelTerrain(tile.terrainType),
    labelFeature(tile.featureType),
    options.includeResource === false ? "" : labelResourceWithAmount(tile.resourceType, tile.resourceAmount),
    ...tilePlanningFacts(tile)
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("，") : "未记录地形/地貌/资源";
}

function labelTerrain(value: string | undefined): string {
  return value ? terrainLabels[value] ?? compactGameType(value) : "";
}

function labelFeature(value: string | undefined): string {
  return value ? featureLabels[value] ?? compactGameType(value) : "";
}

function labelResource(value: string | undefined): string {
  return value ? resourceLabels[value] ?? compactGameType(value) : "";
}

function labelResourceWithAmount(value: string | undefined, amount: number | undefined): string {
  const label = labelResource(value);
  if (!label) {
    return "";
  }
  return typeof amount === "number" && amount > 1 ? `${label}x${amount}` : label;
}

function tilePlanningFacts(tile: TileLike): string[] {
  const facts: string[] = [];
  if (tile.isFreshWater === true) facts.push("淡水");
  if (tile.isRiver === true) facts.push(tile.riverEdges && tile.riverEdges.length > 0 ? `河流边 ${tile.riverEdges.join("/")}` : "临河");
  if (tile.isCoastalLand === true) facts.push("沿海陆地");
  if (tile.isLake === true) facts.push("湖泊");
  if (tile.isWater === true) facts.push("水域");
  if (tile.isHills === true) facts.push("丘陵");
  if (tile.isMountain === true) facts.push("山脉");
  if (tile.isImpassable === true) facts.push("不可通行");
  if (tile.isNaturalWonder === true) facts.push("自然奇观");
  if (tile.cliffEdges && tile.cliffEdges.length > 0) facts.push(`悬崖边 ${tile.cliffEdges.join("/")}`);
  if (tile.improvementType) facts.push(`改良 ${improvementLabels[tile.improvementType] ?? compactGameType(tile.improvementType)}`);
  if (tile.routeType) facts.push(routeLabels[tile.routeType] ?? `道路 ${compactGameType(tile.routeType)}`);
  if (tile.districtType) facts.push(`区域 ${districtLabels[tile.districtType] ?? compactGameType(tile.districtType)}`);
  if (tile.continentType) facts.push(`大陆 ${compactGameType(tile.continentType)}`);
  if (typeof tile.appeal === "number") facts.push(`吸引力 ${tile.appeal}`);
  const yields = compactTileYields(tile.yields);
  if (yields) facts.push(`产出 ${yields}`);
  return facts;
}

function hasPlanningFacts(tile: TileLike): boolean {
  return Boolean(
    tile.resourceType ||
    tile.improvementType ||
    tile.routeType ||
    tile.districtType ||
    tile.continentType ||
    tile.isFreshWater === true ||
    tile.isRiver === true ||
    tile.isCoastalLand === true ||
    tile.isLake === true ||
    tile.isHills === true ||
    tile.isMountain === true ||
    tile.isImpassable === true ||
    tile.isNaturalWonder === true ||
    (tile.riverEdges && tile.riverEdges.length > 0) ||
    (tile.cliffEdges && tile.cliffEdges.length > 0) ||
    typeof tile.appeal === "number" ||
    tile.yields
  );
}

function compactTileYields(yields: Record<string, unknown> | undefined): string {
  if (!yields) {
    return "";
  }
  return Object.entries(yields)
    .filter(([, value]) => typeof value === "number" && value !== 0)
    .map(([key, value]) => `${yieldLabels[key] ?? compactGameType(key)}=${value}`)
    .join("/");
}

function compactGameType(value: string): string {
  return value
    .replace(/^(TERRAIN|FEATURE|RESOURCE|IMPROVEMENT|ROUTE|DISTRICT|BUILDING|UNIT|TECH|CIVIC|CONTINENT|YIELD)_/, "")
    .toLowerCase()
    .replace(/_/g, " ");
}

function sectionBullets(title: string, items: string[]): string[] {
  return [`- ${title}：${items.length > 0 ? items.join("；") : "无"}`];
}

function compactYields(yields: Record<string, unknown>): string {
  return Object.entries(yields)
    .filter(([, value]) => typeof value === "number")
    .map(([key, value]) => `${key}=${value}`)
    .join("/");
}

function named(value: NamedTypeLike): string {
  return value.name ?? value.type ?? "unknown";
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

export interface SnapshotLike {
  schemaVersion?: string;
  exportedAt?: string;
  source?: {
    modId?: string;
    modVersion?: string;
    compatVersion?: string;
    exportId?: string;
    exportType?: string;
    visibilityMode?: string;
  };
  session?: {
    sessionId?: string;
    gameTurn?: number;
    ruleset?: string;
    gameSpeed?: string;
    mapSize?: string;
    isMultiplayer?: boolean;
  };
  localPlayer?: {
    localPlayerId?: number;
    civilizationType?: string;
    leaderType?: string;
    visibility?: string;
    confidence?: string;
  };
  modules?: string[];
  cities?: CityLike[];
  units?: UnitLike[];
  visibleMap?: VisibleMapLike;
  techs?: ProgressionLike;
  civics?: ProgressionLike;
  government?: GovernmentLike;
  resources?: ResourcesLike;
  diplomacy?: {
    confidence?: string;
    metPlayers?: DiplomacyRowLike[];
  };
  attention?: AttentionLike[];
}

interface CityLike {
  id?: string;
  name?: string;
  population?: number;
  currentProduction?: NamedTypeLike;
  turnsUntilComplete?: number;
  yields?: Record<string, unknown>;
}

interface UnitLike {
  id?: string;
  type?: string;
  name?: string;
  ownerPlayerId?: number;
  visibility?: string;
  x?: number;
  y?: number;
  damage?: number;
  movesRemaining?: number;
}

interface VisibleMapLike {
  confidence?: string;
  truncated?: boolean;
  tileLimit?: number;
  revealedTileCount?: number;
  bounds?: {
    minX?: number;
    maxX?: number;
    minY?: number;
    maxY?: number;
  };
  tiles?: TileLike[];
}

interface TileLike {
  x?: number;
  y?: number;
  visibleNow?: boolean;
  unitIds?: string[];
  terrainType?: string;
  featureType?: string;
  resourceType?: string;
  resourceAmount?: number;
  improvementType?: string;
  routeType?: string;
  districtType?: string;
  continentType?: string;
  isWater?: boolean;
  isLake?: boolean;
  isCoastalLand?: boolean;
  isFreshWater?: boolean;
  isRiver?: boolean;
  isHills?: boolean;
  isMountain?: boolean;
  isImpassable?: boolean;
  isNaturalWonder?: boolean;
  riverEdges?: string[];
  cliffEdges?: string[];
  appeal?: number;
  yields?: Record<string, unknown>;
}

interface ProgressionLike {
  current?: NamedTypeLike;
  available?: NamedTypeLike[];
  boosts?: Array<{
    type?: string;
    boosted?: boolean;
  }>;
}

interface GovernmentLike {
  currentGovernment?: NamedTypeLike;
  policies?: NamedTypeLike[];
}

interface ResourcesLike {
  items?: Array<{
    type?: string;
    name?: string;
    amount?: number;
  }>;
}

interface DiplomacyRowLike {
  playerId?: number;
  civilizationType?: string;
  leaderType?: string;
  relationship?: string;
  militaryScore?: number;
}

interface AttentionLike {
  kind?: string;
  message?: string;
  severity?: string;
}

interface NamedTypeLike {
  type?: string;
  name?: string;
}
