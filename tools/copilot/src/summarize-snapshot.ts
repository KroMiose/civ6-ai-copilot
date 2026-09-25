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
    localPlayerId: number | undefined;
    civilizationType: string;
    leaderType: string;
    visibility: string;
    confidence: string;
  };
  coverage: {
    availableModules: string[];
    staleModules: string[];
    notApplicableModules: string[];
    unavailableModules: string[];
    moduleStatus: NonNullable<SnapshotLike["moduleStatus"]>;
    unitsScope?: "own-only" | "own-and-visible";
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
    selection: string[];
    map: string[];
    governors: string[];
    trade: string[];
    cityStates: string[];
    progression: string[];
    government: string[];
    economy: string[];
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
    staleModules: string[];
    unavailableModules: string[];
    notApplicableModules: string[];
    limitedModules: string[];
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
  "selection",
  "cities",
  "units",
  "governors",
  "trade",
  "cityStates",
  "techs",
  "civics",
  "government",
  "policies",
  "resources",
  "economy",
  "diplomacyPublic"
];

const moduleLabels: Record<string, string> = {
  meta: "元信息",
  localPlayer: "本地玩家",
  selection: "当前选择",
  cities: "城市",
  units: "单位",
  governors: "总督",
  trade: "商路",
  cityStates: "已遇见城邦",
  techs: "科技",
  civics: "市政",
  government: "政体",
  policies: "政策",
  resources: "资源",
  economy: "经济",
  diplomacyPublic: "公开外交",
  visibleMap: "地图"
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
    modules: ["meta", "localPlayer", "selection", "cities", "units", "visibleMap", "diplomacyPublic"]
  },
  {
    id: "navy",
    modules: ["meta", "localPlayer", "selection", "cities", "units", "visibleMap", "resources", "techs", "trade"]
  },
  {
    id: "exploration",
    modules: ["meta", "localPlayer", "selection", "units", "visibleMap"]
  },
  {
    id: "city-production",
    modules: ["meta", "localPlayer", "selection", "cities", "resources", "governors", "trade"]
  },
  {
    id: "district-planning",
    modules: ["meta", "localPlayer", "cities", "visibleMap", "resources"]
  },
  {
    id: "tech-civic",
    modules: ["meta", "localPlayer", "cities", "techs", "civics", "resources"]
  },
  {
    id: "policy",
    modules: ["meta", "localPlayer", "selection", "government", "policies", "resources", "governors"]
  },
  {
    id: "settling",
    modules: ["meta", "localPlayer", "selection", "cities", "units", "visibleMap", "resources"]
  },
  {
    id: "turn-priority",
    modules: ["meta", "localPlayer", "selection", "cities", "units", "governors", "trade", "cityStates", "techs", "civics", "government", "policies", "resources", "economy", "diplomacyPublic", "visibleMap"]
  }
];

const questionRules = [
  { id: "turn-priority", patterns: [/本回合/, /这回合/, /这一回合/, /优先级/, /先做什么/, /该做什么/, /做什么/, /怎么行动/, /what.*turn/i, /this turn/i, /priority/i] },
  { id: "war", patterns: [/战争/, /开战/, /打仗/, /进攻/, /防守/, /前线/, /围城/, /\bwar\b/i, /\battack\b/i, /\bdefen[cs]e\b/i] },
  { id: "navy", patterns: [/海军/, /舰队/, /港口/, /岛/, /海岸/, /\bnavy\b/i, /\bcoast/i] },
  { id: "exploration", patterns: [/探索/, /侦察/, /探路/, /开图/, /探图/, /勇士/, /斥候/, /走哪/, /往哪里/, /\bexplor/i, /\bscout/i] },
  { id: "district-planning", patterns: [/区域/, /选址/, /district.?planning/i] },
  { id: "city-production", patterns: [/城市/, /建造/, /生产/, /住房/, /宜居度/, /\bcit(y|ies)\b/i, /\bproduction\b/i] },
  { id: "tech-civic", patterns: [/科技/, /市政/, /尤里卡/, /鼓舞/, /路线/, /\btech\b/i, /\bcivic\b/i, /\beureka\b/i] },
  { id: "policy", patterns: [/政策/, /政体/, /换卡/, /卡槽/, /\bpolicy\b/i, /\bgovernment\b/i] },
  { id: "settling", patterns: [/铺城/, /定居/, /移民/, /坐城/, /资源岛/, /\bsettle\b/i, /\bsettler\b/i] }
];

const defaultQuestionModules = ["meta", "localPlayer", "selection", "cities", "units", "governors", "trade", "cityStates", "techs", "civics", "government", "policies", "resources", "economy"];

export async function summarizeSnapshotFile(snapshotPath: string, options: SummarizeSnapshotOptions = {}): Promise<SnapshotSummary> {
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as SnapshotLike;
  return summarizeSnapshotObject(snapshot, options);
}

export async function summarizeSnapshotObject(snapshot: SnapshotLike, options: SummarizeSnapshotOptions = {}): Promise<SnapshotSummary> {
  const validation = await validateSnapshotObject(snapshot);
  if (!validation.ok && !options.allowInvalid) {
    throw new SnapshotSummaryError("snapshot failed schema or multiplayer fairness validation", validation);
  }

  const moduleState = resolveModuleState(snapshot);
  const availableModules = moduleState.availableModules;
  const localPlayerData = availableModules.includes("localPlayer") ? snapshot.localPlayer : undefined;
  const localPlayerId = localPlayerData?.localPlayerId;
  const cities = availableModules.includes("cities") && Array.isArray(snapshot.cities)
    ? snapshot.cities.filter((city) => city.ownerPlayerId === localPlayerId)
    : [];
  const units = availableModules.includes("units") && Array.isArray(snapshot.units) ? snapshot.units : [];
  const ownUnits = units.filter((unit) => unit.ownerPlayerId === localPlayerId);
  const visibleForeignUnits = units.filter((unit) => localPlayerId !== undefined && unit.ownerPlayerId !== localPlayerId && unit.visibility === "visible-now");
  const usableMap = availableModules.includes("visibleMap") ? snapshot.visibleMap : undefined;
  const tiles = Array.isArray(usableMap?.tiles) ? usableMap.tiles : [];
  const metPlayers = availableModules.includes("diplomacyPublic") && Array.isArray(snapshot.diplomacy?.metPlayers)
    ? snapshot.diplomacy.metPlayers
    : [];
  const attention = Array.isArray(snapshot.attention) ? snapshot.attention : [];
  const missingRecommendedModules = recommendedModules.filter((moduleName) =>
    !availableModules.includes(moduleName) && !moduleState.notApplicableModules.includes(moduleName)
  );

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
      civilizationType: text(localPlayerData?.civilizationType),
      leaderType: text(localPlayerData?.leaderType),
      visibility: text(localPlayerData?.visibility),
      confidence: text(localPlayerData?.confidence)
    },
    coverage: {
      availableModules,
      staleModules: moduleState.staleModules,
      notApplicableModules: moduleState.notApplicableModules,
      unavailableModules: moduleState.unavailableModules,
      moduleStatus: structuredClone(snapshot.moduleStatus ?? {}),
      unitsScope: snapshot.moduleStatus?.units?.scope,
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
      selection: availableModules.includes("selection") ? summarizeSelection(snapshot.selection, cities, ownUnits) : [],
      map: summarizeMap(usableMap, ownUnits, cities),
      governors: summarizeGovernors(moduleState.currentModules.includes("governors") ? snapshot.governors : undefined),
      trade: summarizeTrade(moduleState.currentModules.includes("trade") ? snapshot.trade : undefined),
      cityStates: summarizeCityStates(moduleState.currentModules.includes("cityStates") ? snapshot.cityStates : undefined),
      progression: summarizeProgression(
        availableModules.includes("techs") ? snapshot.techs : undefined,
        availableModules.includes("civics") ? snapshot.civics : undefined
      ),
      government: summarizeGovernment(
        availableModules.includes("government") ? snapshot.government : undefined,
        availableModules.includes("resources") ? snapshot.resources : undefined
      ),
      economy: summarizeEconomy(availableModules.includes("economy") ? snapshot.economy : undefined),
      diplomacy: summarizeDiplomacy(metPlayers),
      attention: summarizeAttention(attention)
    },
    syncAdvice: buildSyncAdvice(snapshot, availableModules, moduleState.staleModules, moduleState.notApplicableModules, options),
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
    `- 本地玩家：${summary.localPlayer.leaderType || "未记录"} / ${summary.localPlayer.civilizationType || "未记录"}（player ${summary.localPlayer.localPlayerId ?? "?"}）`,
    `- 导出：${summary.snapshot.exportType}，${summary.snapshot.visibilityMode}，${summary.snapshot.exportedAt}`,
    `- 校验：${summary.validation.ok ? "通过" : "未通过，需要先处理校验问题"}`,
    "",
    "## 模块覆盖",
    `- 已覆盖：${labelModules(summary.coverage.availableModules).join("、") || "无"}`,
    `- 当前规则不适用：${labelModules(summary.coverage.notApplicableModules).join("、") || "无"}`,
    `- 本次采集不可用：${labelModules(summary.coverage.unavailableModules).join("、") || "无"}`,
    `- 已过期：${labelModules(summary.coverage.staleModules).join("、") || "无"}`,
    ...Object.entries(summary.coverage.moduleStatus).sort(([a], [b]) => compareText(a, b)).map(([name, capture]) =>
      `- ${name} 采集：第 ${capture.capturedTurn} 回合，${capture.capturedAt}${capture.scope ? `，${capture.scope}` : ""}`),
    `- 建议更新：${labelModules(summary.coverage.missingRecommendedModules).join("、") || "无"}`,
    `- 计数：${summary.coverage.counts.cities} 城，${summary.coverage.counts.ownUnits} 个自有单位，${summary.coverage.counts.visibleForeignUnits} 个当前可见外方单位，${summary.coverage.counts.visibleTiles} 个可见/已揭示地块`,
    "",
    "## 关键内容",
    "- 位置说明：下列坐标只用于内部核对和 SVG 对齐；回复玩家时请改写成相对位置、屏幕方向和可见锚点。",
    ...sectionBullets("城市", summary.highlights.cities),
    ...sectionBullets("单位", summary.highlights.units),
    ...sectionBullets("当前选择", summary.highlights.selection),
    ...sectionBullets("总督", summary.highlights.governors),
    ...sectionBullets("商路", summary.highlights.trade),
    ...sectionBullets("已遇见城邦", summary.highlights.cityStates),
    ...sectionBullets("可见地图", summary.highlights.map),
    ...sectionBullets("科技/市政", summary.highlights.progression),
    ...sectionBullets("政体/资源", summary.highlights.government),
    ...sectionBullets("经济态势", summary.highlights.economy),
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

  return [...cities].sort(compareCitiesByPriority).slice(0, 8).map((city) => {
    const production = city.currentProduction?.name ?? city.currentProduction?.type ?? "未记录生产";
    const turns = typeof city.turnsUntilComplete === "number" ? `，${city.turnsUntilComplete} 回合完成` : "";
    const productionProgress = typeof city.currentProductionProgress === "number" && typeof city.currentProductionCost === "number"
      ? `，生产进度 ${city.currentProductionProgress}/${city.currentProductionCost}`
      : "";
    const growth = typeof city.turnsUntilGrowth === "number" ? `，${city.turnsUntilGrowth} 回合增长` : "";
    const food = typeof city.foodStock === "number" || typeof city.foodSurplus === "number"
      ? `，粮食 ${city.foodStock ?? "?"}${typeof city.foodSurplus === "number" ? `（每回合 ${city.foodSurplus >= 0 ? "+" : ""}${city.foodSurplus}` : ""}${typeof city.growthThreshold === "number" ? `/${city.growthThreshold}` : ""}${typeof city.foodSurplus === "number" ? "）" : ""}`
      : "";
    const housing = typeof city.housing === "number" ? `，住房 ${city.housing}` : "";
    const amenities = typeof city.amenities === "number"
      ? `，宜居度 ${city.amenities}${typeof city.amenitiesNeeded === "number" ? `/${city.amenitiesNeeded}` : ""}`
      : "";
    const yields = city.yields
      ? `，产出 ${compactYields(city.yields)}`
      : "";
    const siege = city.underSiege === true ? "，正在被围城" : "";
    const infrastructure = [
      city.districts?.length ? `区域 ${formatDistrictItems(city.districts, 3)}` : "",
      city.buildings?.length ? `建筑 ${formatNamedItems(city.buildings, 3)}` : "",
      typeof city.populationLimitedDistrictsUsed === "number" && typeof city.populationLimitedDistrictsCapacity === "number"
        ? `人口限制区域 ${city.populationLimitedDistrictsUsed}/${city.populationLimitedDistrictsCapacity}`
        : ""
    ].filter(Boolean).join("，");
    const infrastructureText = infrastructure ? `，${infrastructure}` : "";
    const priorities = cityPriorityLabels(city);
    const priorityText = priorities.length > 0 ? `，优先事项：${priorities.join("、")}` : "";
    return `${city.name ?? city.id ?? "Unnamed city"}：人口 ${city.population ?? "?"}，正在 ${production}${turns}${productionProgress}${growth}${food}${housing}${amenities}${yields}${siege}${infrastructureText}${priorityText}`;
  });
}

function resolveModuleState(snapshot: SnapshotLike): { availableModules: string[]; currentModules: string[]; staleModules: string[]; notApplicableModules: string[]; unavailableModules: string[] } {
  const declaredModules = new Set(Array.isArray(snapshot.modules) ? snapshot.modules : []);
  const moduleStatus = snapshot.moduleStatus ?? {};
  const gameTurn = snapshot.session?.gameTurn;
  const currentModules = [...declaredModules].filter((moduleName) =>
    gameTurn !== undefined && moduleStatus[moduleName]?.capturedTurn === gameTurn
  );
  const notApplicableModules = currentModules.filter((moduleName) => moduleAvailability(snapshot, moduleName) === "not-applicable").sort(compareText);
  const unavailableModules = currentModules.filter((moduleName) =>
    isDomainModule(moduleName) && moduleAvailability(snapshot, moduleName) !== "available" && moduleAvailability(snapshot, moduleName) !== "not-applicable"
  ).sort(compareText);
  const availableModules = currentModules.filter((moduleName) =>
    !isDomainModule(moduleName) || moduleAvailability(snapshot, moduleName) === "available"
  ).sort(compareText);
  const staleModules = Object.entries(moduleStatus)
    .filter(([, status]) => status.capturedTurn !== gameTurn)
    .map(([moduleName]) => moduleName)
    .sort(compareText);
  return { availableModules, currentModules: currentModules.sort(compareText), staleModules, notApplicableModules, unavailableModules };
}

function isDomainModule(moduleName: string): boolean {
  return ["governors", "trade", "cityStates"].includes(moduleName);
}

function moduleAvailability(snapshot: SnapshotLike, moduleName: string): string | undefined {
  if (moduleName === "governors") return snapshot.governors?.availability;
  if (moduleName === "trade") return snapshot.trade?.availability;
  if (moduleName === "cityStates") return snapshot.cityStates?.availability;
  return undefined;
}

function formatNamedItems(items: NamedTypeLike[], limit: number): string {
  const values = items.slice(0, limit).map((item) => item.name ?? item.type ?? "未知");
  return `${values.join("、")}${items.length > limit ? `等${items.length}项` : ""}`;
}

function formatDistrictItems(items: DistrictLike[], limit: number): string {
  const values = items.slice(0, limit).map((item) => {
    const status = item.isBuilt === true ? "（已建）" : item.isBuilt === false ? "（在建）" : "";
    return `${item.name ?? item.type ?? "未知区域"}${status}`;
  });
  return `${values.join("、")}${items.length > limit ? `等${items.length}项` : ""}`;
}

function summarizeSelection(selection: SelectionLike | undefined, cities: CityLike[], ownUnits: UnitLike[]): string[] {
  if (!selection) return ["未记录当前选择状态。"];
  const describe = (label: string, entry: SelectionEntityLike): string => {
    if (entry.status === "selected" && entry.id) {
      const entity = label === "城市"
        ? cities.find((city) => city.id === entry.id)
        : ownUnits.find((unit) => unit.id === entry.id);
      const entityLabel = entity?.name ?? (entity && "type" in entity ? entity.type : undefined);
      return `${label}：${entityLabel ?? "已选择本方对象"}`;
    }
    const states: Record<string, string> = {
      none: "当前未选择",
      unsupported: "当前 API 不支持读取",
      error: "读取失败"
    };
    return `${label}：${states[entry.status] ?? "状态未知"}`;
  };
  return [`${describe("城市", selection.city)}；${describe("单位", selection.unit)}`];
}

function summarizeGovernors(data: GovernorDataLike | undefined): string[] {
  if (!data) return ["模块未刷新或已过期。"];
  if (data.availability === "not-applicable") return ["当前规则不适用。"];
  if (data.availability !== "available") return ["本次采集不可用；不能据此判断没有总督或头衔。"];
  const titles = typeof data.titlesAvailable === "number" ? `可用头衔 ${data.titlesAvailable}` : "可用头衔未知";
  const spent = typeof data.titlesSpent === "number" ? `，已用 ${data.titlesSpent}` : "";
  const canAppoint = data.canAppoint === true ? "，当前可任命" : "";
  const governorRows = [...(data.governors ?? [])].sort((left, right) => {
    const rank = (item: NonNullable<GovernorDataLike["governors"]>[number]): number => {
      const status = item.status;
      if (status === "needs-assignment" || (status === undefined && item.assigned === false && item.appointed === true)) return 0;
      if (status === "transitioning" || (status === undefined && item.appointed === true && item.established === false)) return 1;
      if (status === "neutralized") return 2;
      if (status === "established" || item.established === true) return 3;
      if (item.appointed === false) return 4;
      return 5;
    };
    return rank(left) - rank(right) ||
      compareOptionalNumbers(left.turnsUntilEstablished, right.turnsUntilEstablished) ||
      compareText(left.type ?? left.name ?? "", right.type ?? right.name ?? "");
  });
  const entries = governorRows.slice(0, 6).map((governor) => {
    const statusLabels: Record<string, string> = {
      "needs-assignment": "待派驻",
      transitioning: "派驻中",
      established: "已就职",
      neutralized: "被压制"
    };
    const state = statusLabels[governor.status ?? ""] ??
      (governor.assigned === false && governor.appointed === true ? "待派驻" :
        governor.appointed === true && governor.established === false ? "派驻中" :
          governor.established === true ? "已就职" :
            governor.appointed === false ? "待任命" : "状态未知");
    const city = governor.assignedCityName ? `至${governor.assignedCityName}` : "";
    const title = governor.title ? `（${governor.title}）` : "";
    const promotions = governor.promotions?.length ? `，晋升 ${formatNamedItems(governor.promotions, 3)}` : "";
    const turns = state === "派驻中" && typeof governor.turnsUntilEstablished === "number"
      ? `，剩余 ${governor.turnsUntilEstablished} 回合就职`
      : state === "派驻中" && typeof governor.turnsToEstablish === "number"
      ? `，基础就职耗时 ${governor.turnsToEstablish} 回合`
      : "";
    return `${governor.name ?? governor.type ?? "未知总督"}${title}：${state}${city}${turns}${promotions}`;
  });
  const appointment = data.canAppoint === false ? "，当前不可任命" : "";
  const entryText = entries.length > 0
    ? `；${entries.join("；")}`
    : data.governors === undefined ? "；总督名单未知" : "；当前没有总督条目";
  return [`${titles}${spent}${canAppoint}${appointment}${entryText}`];
}

function summarizeTrade(data: TradeDataLike | undefined): string[] {
  if (!data) return ["模块未刷新或已过期。"];
  if (data.availability === "not-applicable") return ["当前规则不适用。"];
  if (data.availability !== "available") return ["本次采集不可用；不能据此判断没有商路。"];
  const capacity = typeof data.capacity === "number" ? data.capacity : undefined;
  const active = data.activeCount;
  const counts = capacity !== undefined && active !== undefined
    ? `已用 ${active}/${capacity}${Math.max(0, capacity - active) > 0 ? `，空位 ${capacity - active}` : ""}`
    : capacity !== undefined ? `容量 ${capacity}，已用数量未知` : "容量或已用数量未知";
  const routeRows = [...(data.routes ?? [])].sort((left, right) =>
    compareOptionalNumbers(left.turnsRemaining, right.turnsRemaining) ||
    compareText(left.originCityId ?? left.originCityName ?? "", right.originCityId ?? right.originCityName ?? "") ||
    compareText(left.destinationCityId ?? left.destinationCityName ?? "", right.destinationCityId ?? right.destinationCityName ?? "")
  );
  const routes = routeRows.slice(0, 5).map((route) =>
    `${route.originCityName ?? route.originCityId ?? "来源未知"}→${route.destinationCityName ?? route.destinationCityId ?? "目的地未知"}${typeof route.turnsRemaining === "number" ? `（${route.turnsRemaining} 回合）` : ""}`
  );
  const routeText = routes.length > 0
    ? `；现有路线：${routes.join("；")}`
    : data.routes === undefined ? "；路线列表未知" : "；当前没有现有路线条目";
  return [`${counts}${routeText}`];
}

function summarizeCityStates(data: CityStatesDataLike | undefined): string[] {
  if (!data) return ["模块未刷新或已过期。"];
  if (data.availability === "not-applicable") return ["当前规则不适用。"];
  if (data.availability !== "available") return ["本次采集不可用；不能据此判断没有已遇见城邦。"];
  const envoys = typeof data.availableEnvoys === "number" ? `可用使者 ${data.availableEnvoys}` : "可用使者数量未知";
  const cityStateRows = [...(data.cityStates ?? [])].sort((left, right) => {
    const earliestQuest = (quests: CityStateQuestLike[] | undefined): number | undefined => {
      const turns = (quests ?? []).flatMap((quest) => typeof quest.turnsRemaining === "number" ? [quest.turnsRemaining] : []);
      return turns.length > 0 ? Math.min(...turns) : undefined;
    };
    const questRank = (quests: CityStateQuestLike[] | undefined): number => quests === undefined ? 2 : quests.length > 0 ? 0 : 1;
    return questRank(left.quests) - questRank(right.quests) ||
      compareOptionalNumbers(earliestQuest(left.quests), earliestQuest(right.quests)) ||
      (right.envoys ?? -1) - (left.envoys ?? -1) ||
      compareOptionalNumbers(left.playerId, right.playerId) ||
      compareText(left.type ?? left.name ?? "", right.type ?? right.name ?? "") ||
      compareText(canonicalString(left), canonicalString(right));
  });
  const entries = cityStateRows.slice(0, 6).map((cityState) => {
    const quests = cityState.quests === undefined
      ? undefined
      : [...cityState.quests].sort((left, right) =>
        compareOptionalNumbers(left.turnsRemaining, right.turnsRemaining) ||
        compareText(left.type ?? left.name ?? "", right.type ?? right.name ?? "")
      ).slice(0, 2).map((quest) => `${quest.name ?? quest.type ?? "未知任务"}${typeof quest.turnsRemaining === "number" ? `（${quest.turnsRemaining} 回合）` : ""}`).join("、");
    const rewardLabels = [["oneEnvoy", "1使者"], ["threeEnvoys", "3使者"], ["sixEnvoys", "6使者"], ["suzerain", "宗主"]] as const;
    const rewards = rewardLabels.filter(([key]) => Boolean(cityState.rewards?.[key]))
      .map(([key, label]) => `${label}：${cityState.rewards?.[key]}`).join("；");
    const suzerain = cityState.isSuzerain === true ? "，当前宗主" : cityState.isSuzerain === false ? "，当前非宗主" : "，宗主状态未知";
    const questText = quests === undefined ? "任务状态未知" : quests ? `任务 ${quests}` : "无已记录任务";
    return `${cityState.name ?? cityState.type ?? `已遇见城邦 ${cityState.playerId ?? "?"}`}：${cityState.envoys ?? "?"} 使者${suzerain}${rewards ? `，奖励 ${rewards}` : ""}，${questText}`;
  });
  const entryText = entries.length > 0
    ? `；${entries.join("；")}`
    : data.cityStates === undefined ? "；城邦列表未知" : "；当前没有已遇见城邦条目";
  return [`${envoys}${entryText}`];
}

function summarizeUnits(ownUnits: UnitLike[], visibleForeignUnits: UnitLike[]): string[] {
  const lines: string[] = [];
  if (ownUnits.length === 0) {
    lines.push("没有自有单位条目。");
  } else {
    lines.push(
      ...sortUnitsByPriority(ownUnits, visibleForeignUnits).slice(0, 8).map((unit) => {
        const damage = typeof unit.damage === "number" ? `，伤害 ${unit.damage}` : "";
        const moves = typeof unit.movesRemaining === "number" ? `，剩余移动 ${unit.movesRemaining}` : "";
        const strength = unitStrengthText(unit);
        const details = unitDetailText(unit);
        const priorities = unitPriorityLabels(unit, visibleForeignUnits);
        const priorityText = priorities.length > 0 ? `，优先事项：${priorities.join("、")}` : "";
        return `自有 ${unit.name ?? unit.type ?? unit.id} @ (${unit.x ?? "?"}, ${unit.y ?? "?"})${damage}${moves}${strength}${details}${priorityText}`;
      })
    );
  }

  if (visibleForeignUnits.length > 0) {
    lines.push(
      ...sortUnitsByPriority(visibleForeignUnits, ownUnits).slice(0, 8).map((unit) => {
        const damage = typeof unit.damage === "number" ? `，伤害 ${unit.damage}` : "";
        const strength = unitStrengthText(unit);
        const priorities = unitPriorityLabels(unit, ownUnits);
        const priorityText = priorities.length > 0 ? `，优先事项：${priorities.join("、")}` : "";
        return `当前可见外方 ${unit.name ?? unit.type ?? unit.id} @ (${unit.x ?? "?"}, ${unit.y ?? "?"})${damage}${strength}${priorityText}`;
      })
    );
  }

  return lines;
}

function compareCitiesByPriority(left: CityLike, right: CityLike): number {
  const priorityDifference = cityPriorityRank(left) - cityPriorityRank(right);
  if (priorityDifference !== 0) return priorityDifference;

  const rank = cityPriorityRank(left);
  if (rank === 2) {
    const turnsDifference = compareOptionalNumbers(left.turnsUntilComplete, right.turnsUntilComplete);
    if (turnsDifference !== 0) return turnsDifference;
  } else if (rank === 3) {
    const housingDifference = compareOptionalNumbers(cityHousingRemaining(left), cityHousingRemaining(right));
    if (housingDifference !== 0) return housingDifference;
  } else if (rank === 4) {
    const shortageDifference = amenityShortage(right) - amenityShortage(left);
    if (shortageDifference !== 0) return shortageDifference;
  }

  return compareCityIdentity(left, right);
}

function cityPriorityRank(city: CityLike): number {
  if (city.underSiege === true) return -2;
  if (typeof city.turnsUntilStarvation === "number") return -1;
  if (typeof city.foodSurplus === "number" && city.foodSurplus < 0) return 0;
  if (hasNoProduction(city)) return 1;
  if (hasProduction(city) && typeof city.turnsUntilComplete === "number" && city.turnsUntilComplete <= 1) return 2;
  const housingRemaining = cityHousingRemaining(city);
  if (typeof housingRemaining === "number" && housingRemaining <= 1) return 3;
  if (amenityShortage(city) > 0) return 4;
  if (typeof city.turnsUntilGrowth === "number" && city.turnsUntilGrowth <= 1) return 5;
  return 6;
}

function cityPriorityLabels(city: CityLike): string[] {
  const labels: string[] = [];
  if (city.underSiege === true) labels.push("正在被围城");
  if (typeof city.turnsUntilStarvation === "number") labels.push(`${city.turnsUntilStarvation} 回合后饥荒`);
  if (typeof city.foodSurplus === "number" && city.foodSurplus < 0) labels.push(`粮食每回合减少 ${Math.abs(city.foodSurplus)}`);
  if (hasNoProduction(city)) labels.push("待选生产");
  if (hasProduction(city) && typeof city.turnsUntilComplete === "number" && city.turnsUntilComplete <= 1) labels.push("即将完成");
  const housingRemaining = cityHousingRemaining(city);
  if (typeof housingRemaining === "number") labels.push(`住房余量 ${housingRemaining}`);
  if (amenityShortage(city) > 0) labels.push(`宜居度不足 ${city.amenities}/${city.amenitiesNeeded}`);
  return labels;
}

function hasProduction(city: CityLike): boolean {
  const type = (city.currentProduction?.type ?? "").trim().toUpperCase();
  const name = (city.currentProduction?.name ?? "").trim();
  if (!type && !name) return false;
  return !["NONE", "NO_PRODUCTION", "BUILDING_NONE", "UNIT_NONE", "PROJECT_NONE", "UNKNOWN", "UNKNOWN_PRODUCTION"].includes(type) && name.toUpperCase() !== "UNKNOWN";
}

function hasNoProduction(city: CityLike): boolean {
  const type = (city.currentProduction?.type ?? "").trim().toUpperCase();
  const name = (city.currentProduction?.name ?? "").trim().toUpperCase();
  return ["NONE", "NO_PRODUCTION", "BUILDING_NONE", "UNIT_NONE", "PROJECT_NONE"].includes(type) ||
    ["NONE", "NO PRODUCTION"].includes(name);
}

function cityHousingRemaining(city: CityLike): number | undefined {
  if (typeof city.housing === "number" && typeof city.population === "number") return city.housing - city.population;
  return undefined;
}

function amenityShortage(city: CityLike): number {
  return typeof city.amenities === "number" && typeof city.amenitiesNeeded === "number"
    ? Math.max(0, city.amenitiesNeeded - city.amenities)
    : 0;
}

function compareUnitsByPriority(left: UnitLike, right: UnitLike, opposingUnits: UnitLike[]): number {
  const priorityDifference = unitPriorityRank(left, opposingUnits) - unitPriorityRank(right, opposingUnits);
  if (priorityDifference !== 0) return priorityDifference;
  const damageDifference = compareOptionalNumbers(right.damage, left.damage);
  if (damageDifference !== 0) return damageDifference;
  const movesDifference = compareOptionalNumbers(right.movesRemaining, left.movesRemaining);
  if (movesDifference !== 0) return movesDifference;
  return compareUnitIdentity(left, right);
}

function unitPriorityRank(unit: UnitLike, opposingUnits: UnitLike[]): number {
  if (typeof unit.damage === "number" && unit.damage >= 50) return 0;
  if (isInVisibleContact(unit, opposingUnits)) return 1;
  if ((unit.promotions?.length ?? 0) > 0 || typeof unit.upgradeCost === "number") return 2;
  if (typeof unit.movesRemaining === "number" && unit.movesRemaining > 0) return 3;
  if (typeof unit.buildCharges === "number" || isSettlerOrBuilder(unit)) return 4;
  return 5;
}

function unitPriorityLabels(unit: UnitLike, opposingUnits: UnitLike[]): string[] {
  const labels: string[] = [];
  if (typeof unit.damage === "number" && unit.damage >= 50) labels.push("重伤");
  if (isInVisibleContact(unit, opposingUnits)) labels.push("邻近可见外方单位");
  if (typeof unit.movesRemaining === "number" && unit.movesRemaining > 0) labels.push("尚有移动力");
  if (unit.promotions?.length) labels.push(`已获晋升 ${formatNamedItems(unit.promotions, 2)}`);
  if (typeof unit.upgradeCost === "number") labels.push(`升级费用 ${unit.upgradeCost}`);
  if (typeof unit.buildCharges === "number") labels.push(`建造次数 ${unit.buildCharges}`);
  const role = unitRole(unit);
  if (role) labels.push(role);
  return labels;
}

function unitStrengthText(unit: UnitLike): string {
  const values: string[] = [];
  if (typeof unit.combatStrength === "number") values.push(`近战 ${unit.combatStrength}`);
  if (typeof unit.rangedStrength === "number") values.push(`远程 ${unit.rangedStrength}`);
  if (typeof unit.bombardStrength === "number") values.push(`轰炸 ${unit.bombardStrength}`);
  return values.length > 0 ? `，${values.join("/" )}` : "";
}

function unitDetailText(unit: UnitLike): string {
  const values: string[] = [];
  if (typeof unit.range === "number") values.push(`射程 ${unit.range}`);
  if (typeof unit.maxMoves === "number") values.push(`最大移动 ${unit.maxMoves}`);
  if (typeof unit.experience === "number") {
    const next = typeof unit.experienceForNextLevel === "number" ? `/${unit.experienceForNextLevel}` : "";
    values.push(`经验 ${unit.experience}${next}`);
  }
  if (typeof unit.level === "number") values.push(`等级 ${unit.level}`);
  if (unit.militaryFormation) values.push(`编队 ${compactGameType(unit.militaryFormation)}`);
  return values.length > 0 ? `，${values.join("，")}` : "";
}

function isSettlerOrBuilder(unit: UnitLike): boolean {
  return unitRole(unit) !== "";
}

function unitRole(unit: UnitLike): string {
  const type = (unit.type ?? "").toUpperCase();
  if (type.includes("SETTLER")) return "开拓者";
  if (type.includes("BUILDER")) return "建造者";
  return "";
}

function isInVisibleContact(unit: UnitLike, opposingUnits: UnitLike[]): boolean {
  if (typeof unit.x !== "number" || typeof unit.y !== "number") return false;
  return opposingUnits.some((other) =>
    other.visibility === "visible-now" &&
    typeof other.x === "number" && typeof other.y === "number" &&
    hexDistance(unit.x as number, unit.y as number, other.x, other.y) <= 1
  );
}

function sortUnitsByPriority(units: UnitLike[], opposingUnits: UnitLike[]): UnitLike[] {
  return [...units].sort((left, right) => compareUnitsByPriority(left, right, opposingUnits));
}

function compareCityIdentity(left: CityLike, right: CityLike): number {
  return compareText(left.id ?? left.name ?? "", right.id ?? right.name ?? "") ||
    compareCoordinates(left, right) ||
    compareText(canonicalString(left), canonicalString(right));
}

function compareUnitIdentity(left: UnitLike, right: UnitLike): number {
  return compareText(left.id ?? left.type ?? left.name ?? "", right.id ?? right.type ?? right.name ?? "") ||
    compareCoordinates(left, right) ||
    compareText(canonicalString(left), canonicalString(right));
}

function compareTilesByCoordinates(left: TileLike, right: TileLike): number {
  return compareCoordinates(left, right) || compareText(canonicalString(left), canonicalString(right));
}

function compareTilesByPlanningPriority(left: TileLike, right: TileLike, anchors: Array<{ x: number; y: number }>): number {
  const visibilityDifference = Number(right.visibleNow === true) - Number(left.visibleNow === true);
  if (visibilityDifference !== 0) return visibilityDifference;
  const distanceDifference = compareNumbers(nearestAnchorDistance(left, anchors), nearestAnchorDistance(right, anchors));
  if (distanceDifference !== 0) return distanceDifference;
  return compareTilesByCoordinates(left, right);
}

function nearestAnchorDistance(tile: TileLike, anchors: Array<{ x: number; y: number }>): number {
  if (typeof tile.x !== "number" || typeof tile.y !== "number" || anchors.length === 0) return Number.POSITIVE_INFINITY;
  return anchors.reduce((nearest, anchor) =>
    Math.min(nearest, hexDistance(tile.x as number, tile.y as number, anchor.x, anchor.y)), Number.POSITIVE_INFINITY);
}

function hexDistance(leftX: number, leftY: number, rightX: number, rightY: number): number {
  const leftQ = leftX - Math.floor(leftY / 2);
  const rightQ = rightX - Math.floor(rightY / 2);
  const deltaQ = leftQ - rightQ;
  const deltaR = leftY - rightY;
  return Math.max(Math.abs(deltaQ), Math.abs(deltaR), Math.abs(deltaQ + deltaR));
}

function compareCoordinates(left: { x?: number; y?: number }, right: { x?: number; y?: number }): number {
  return compareOptionalNumbers(left.y, right.y) || compareOptionalNumbers(left.x, right.x);
}

function compareOptionalNumbers(left: number | undefined, right: number | undefined): number {
  if (left === undefined) return right === undefined ? 0 : 1;
  if (right === undefined) return -1;
  return compareNumbers(left, right);
}

function compareNumbers(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalString(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalString).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => compareText(left, right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalString(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function summarizeMap(visibleMap: VisibleMapLike | undefined, ownUnits: UnitLike[] = [], ownCities: CityLike[] = []): string[] {
  const tiles = Array.isArray(visibleMap?.tiles) ? visibleMap.tiles : [];
  const bounds = visibleMap?.bounds;
  const visibleNow = tiles.filter((tile) => tile.visibleNow === true).length;
  const withUnits = tiles.filter((tile) => Array.isArray(tile.unitIds) && tile.unitIds.length > 0).length;
  const boundsText = bounds ? `范围 x=${bounds.minX ?? "?"}..${bounds.maxX ?? "?"}, y=${bounds.minY ?? "?"}..${bounds.maxY ?? "?"}` : "未记录范围";
  const revealedText = typeof visibleMap?.revealedTileCount === "number" ? `，已揭示 ${visibleMap.revealedTileCount}` : "";
  const truncationText = visibleMap?.truncated === true ? `；地图视野导出已截断，上限 ${visibleMap.tileLimit ?? "未知"}` : "";
  const lines = [`${boundsText}；导出地块 ${tiles.length}${revealedText}，当前可见 ${visibleNow}，含单位地块 ${withUnits}${truncationText}`];
  const orderedTiles = [...tiles].sort(compareTilesByCoordinates);
  const tileByCoord = new Map(orderedTiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
  const orderedOwnUnits = sortUnitsByPriority(ownUnits, []);
  const anchors: Array<{ x: number; y: number }> = [
    ...orderedOwnUnits
      .filter((unit): unit is UnitLike & { x: number; y: number } => typeof unit.x === "number" && typeof unit.y === "number")
      .map((unit) => ({ x: unit.x, y: unit.y })),
    ...ownCities
      .filter((city): city is CityLike & { x: number; y: number } => typeof city.x === "number" && typeof city.y === "number")
      .map((city) => ({ x: city.x, y: city.y }))
  ];
  const unitTiles = orderedOwnUnits
    .filter((unit) => typeof unit.x === "number" && typeof unit.y === "number")
    .slice(0, 8)
    .map((unit) => {
      const tile = tileByCoord.get(`${unit.x},${unit.y}`);
      return `${unit.name ?? unit.type ?? unit.id} @ (${unit.x}, ${unit.y})：${describeTile(tile)}`;
    });
  if (unitTiles.length > 0) {
    lines.push(`单位所在地块：${unitTiles.join("；")}`);
  }

  const adjacentTiles = summarizeAdjacentUnitTiles(orderedOwnUnits, tileByCoord);
  if (adjacentTiles.length > 0) {
    lines.push(`单位相邻地块：${adjacentTiles.join("；")}`);
  }

  const resourceTiles = tiles
    .filter((tile) => typeof tile.resourceType === "string")
    .sort((left, right) => compareTilesByPlanningPriority(left, right, anchors))
    .slice(0, 12)
    .map((tile) => `${labelResource(tile.resourceType)} @ (${tile.x ?? "?"}, ${tile.y ?? "?"})：${describeTile(tile, { includeResource: false })}`);
  if (resourceTiles.length > 0) {
    lines.push(`可见资源：${resourceTiles.join("；")}`);
  }

  const planningTiles = tiles
    .filter((tile) => hasPlanningFacts(tile))
    .sort((left, right) => compareTilesByPlanningPriority(left, right, anchors))
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
  for (const [label, data] of [["科技", techs], ["市政", civics]] as const) {
    if (typeof data?.currentProgress === "number" && typeof data.currentCost === "number") lines.push(`${label}进度：${data.currentProgress}/${data.currentCost}`);
  }
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
  if (government?.availablePolicies) {
    lines.push(`可用政策：${[...government.availablePolicies].sort((a, b) => compareText(a.type ?? "", b.type ?? "")).map((p) => `${named(p)} (${p.slotType ?? "槽位未知"})${p.description ? `：${p.description}` : ""}`).join("；")}`);
  }
  const resourceItems = Array.isArray(resources?.items) ? resources.items : [];
  if (resourceItems.length > 0) {
    lines.push(`资源：${resourceItems.map((item) => `${item.name ?? item.type}=${item.amount}`).join("、")}`);
  }
  return lines;
}

function summarizeEconomy(economy: SnapshotLike["economy"]): string[] {
  if (!economy) return ["经济模块未采集。"];
  const labels: Record<string, string> = { goldBalance: "金币", goldPerTurn: "净金币/回合", goldIncomePerTurn: "金币收入/回合", goldMaintenancePerTurn: "维护/回合", faithBalance: "信仰", faithPerTurn: "信仰/回合", sciencePerTurn: "科技/回合", culturePerTurn: "文化/回合" };
  return Object.entries(labels).filter(([key]) => typeof economy[key] === "number").map(([key, label]) => `${label}：${economy[key]}`);
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
  staleModuleNames: string[],
  notApplicableModuleNames: string[],
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

  const requiredModules = explicitModules.length > 0
    ? explicitModules
    : [...new Set((matchedRules.length > 0 ? matchedRules.flatMap((rule) => rule.modules) : defaultQuestionModules))];
  const intents = matchedRules.map((rule) => rule.id);
  const missingModules = requiredModules.filter((moduleName) =>
    !availableModules.includes(moduleName) && !notApplicableModuleNames.includes(moduleName)
  );
  const staleModules = requiredModules.filter((name) => staleModuleNames.includes(name));
  const unavailableModules = resolveModuleState(snapshot).unavailableModules.filter((name) => requiredModules.includes(name));
  const notApplicableModules = notApplicableModuleNames.filter((name) => requiredModules.includes(name));
  const limitedModules = intents.some((intent) => ["war", "navy"].includes(intent)) && availableModules.includes("units") && snapshot.moduleStatus?.units?.scope !== "own-and-visible" ? ["units"] : [];
  const lowConfidenceRequiredModules = lowConfidenceModules(snapshot, requiredModules.filter((moduleName) => availableModules.includes(moduleName)));

  if (missingModules.length === 0 && lowConfidenceRequiredModules.length === 0 && limitedModules.length === 0) {
    return {
      ok: true,
      question,
      intents,
      scenarios: intents,
      requiredModules,
      missingModules: [],
      staleModules,
      unavailableModules,
      notApplicableModules,
      limitedModules,
      lowConfidenceModules: [],
      recommendation: "当前 snapshot 已覆盖当前分析意图，可以继续分析。"
    };
  }

  const labels = labelModules(missingModules);
  const lowConfidenceLabels = labelModules(lowConfidenceRequiredModules);
  const action = "点击「更新战情」";
  const lowConfidenceAction = lowConfidenceRequiredModules.length > 0
    ? `；另外 ${lowConfidenceLabels.join("、")} 置信度偏低，若刷新后仍偏低，我会按低置信度来源处理`
    : "";
  const missingText = missingModules.length > 0 ? `当前分析需要 ${labels.join("、")}。` : "当前意图所需情报已声明存在，但部分模块置信度偏低。";
  const unavailableText = unavailableModules.length > 0
    ? `本次 ${labelModules(unavailableModules).join("、")} 采集不可用；不能将其当作空结果。`
    : "";

  return {
    ok: false,
    question,
    intents,
    scenarios: intents,
    requiredModules,
    missingModules,
    staleModules,
    unavailableModules,
    notApplicableModules,
    limitedModules,
    lowConfidenceModules: lowConfidenceRequiredModules,
    recommendation: `${missingText}${unavailableText}请在 Civ6 点击左上副官入口打开「战情简报」，${action}${lowConfidenceAction}。看到“简报已汇总，可继续由AI副官分析。”和“最近汇总：…”后，重新运行标准入口。`
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
    case "selection":
      return snapshot.selection?.confidence;
    case "visibleMap":
      return snapshot.visibleMap?.confidence;
    case "diplomacyPublic":
      return snapshot.diplomacy?.confidence;
    case "policies":
      return snapshot.government?.confidence;
    case "governors":
      return snapshot.governors?.confidence;
    case "trade":
      return snapshot.trade?.confidence;
    case "cityStates":
      return snapshot.cityStates?.confidence;
    case "government": case "resources": case "techs": case "civics": case "economy":
      return snapshot[moduleName]?.confidence;
    case "cities": case "units":
      return snapshot.confidence?.[moduleName];
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
    gaps.push("当前摘要没有城市条目；不能据此推断生产、区域和住房状态。");
  }
  if (summary.coverage.counts.units === 0) {
    gaps.push("当前摘要没有单位条目；不能据此推断周围没有可见威胁或可用单位。");
  }
  if (summary.coverage.counts.visibleTiles === 0) {
    gaps.push("当前摘要没有地图地块；铺城、战线和海军路线建议需要谨慎处理。");
  }
  if (summary.coverage.unavailableModules.length > 0) {
    gaps.push(`本回合采集不可用的模块：${labelModules(summary.coverage.unavailableModules).join("、")}；不得把未知状态当作没有相关对象。`);
  }
  if (summary.coverage.notApplicableModules.length > 0) {
    gaps.push(`当前规则不适用的模块：${labelModules(summary.coverage.notApplicableModules).join("、")}；该状态不阻塞本次分析。`);
  }
  if (summary.syncAdvice.lowConfidenceModules.length > 0) {
    gaps.push(`低置信度模块：${labelModules(summary.syncAdvice.lowConfidenceModules).join("、")}；请重新汇总对应情报，或在回答中明确按低置信度处理。`);
  }
  if (summary.coverage.unitsScope === "own-only") gaps.push("单位模块仅含己方单位；不能由外方单位计数为零推断周围没有敌军。");
  if (summary.coverage.staleModules.length > 0) gaps.push(`过期模块：${summary.coverage.staleModules.join("、")}；旧数据不参与摘要。`);

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
  moduleStatus?: Record<string, { capturedTurn: number; capturedAt: string; exportId: string; scope?: "own-only" | "own-and-visible" }>;
  economy?: { confidence?: string; [key: string]: number | string | undefined };
  confidence?: Record<string, string>;
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
  selection?: SelectionLike;
  cities?: CityLike[];
  units?: UnitLike[];
  governors?: GovernorDataLike;
  trade?: TradeDataLike;
  cityStates?: CityStatesDataLike;
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
  ownerPlayerId?: number;
  x?: number;
  y?: number;
  housing?: number;
  amenities?: number;
  amenitiesNeeded?: number;
  turnsUntilGrowth?: number;
  turnsUntilStarvation?: number;
  id?: string;
  name?: string;
  population?: number;
  currentProduction?: NamedTypeLike;
  currentProductionProgress?: number;
  currentProductionCost?: number;
  turnsUntilComplete?: number;
  foodStock?: number;
  foodSurplus?: number;
  growthThreshold?: number;
  underSiege?: boolean;
  buildings?: NamedTypeLike[];
  districts?: DistrictLike[];
  populationLimitedDistrictsUsed?: number;
  populationLimitedDistrictsCapacity?: number;
  yields?: Record<string, unknown>;
}

interface UnitLike {
  combatStrength?: number;
  rangedStrength?: number;
  bombardStrength?: number;
  id?: string;
  type?: string;
  name?: string;
  ownerPlayerId?: number;
  visibility?: string;
  x?: number;
  y?: number;
  damage?: number;
  movesRemaining?: number;
  range?: number;
  maxMoves?: number;
  buildCharges?: number;
  experience?: number;
  experienceForNextLevel?: number;
  level?: number;
  promotions?: NamedTypeLike[];
  militaryFormation?: string;
  upgradeCost?: number;
}

interface DistrictLike extends NamedTypeLike {
  isBuilt?: boolean;
}

interface SelectionLike {
  confidence?: string;
  city: SelectionEntityLike;
  unit: SelectionEntityLike;
}

interface SelectionEntityLike {
  status: "selected" | "none" | "unsupported" | "error";
  id: string | null;
}

interface GovernorDataLike {
  availability?: "available" | "not-applicable" | "unavailable";
  confidence?: string;
  titlesAvailable?: number;
  titlesSpent?: number;
  canAppoint?: boolean;
  governors?: Array<NamedTypeLike & {
    appointed?: boolean;
    assigned?: boolean;
    assignedCityId?: string;
    assignedCityName?: string;
    established?: boolean;
    turnsToEstablish?: number;
    turnsUntilEstablished?: number;
    neutralizedTurns?: number;
    status?: string;
    title?: string;
    promotions?: NamedTypeLike[];
  }>;
}

interface TradeDataLike {
  availability?: "available" | "not-applicable" | "unavailable";
  confidence?: string;
  capacity?: number;
  activeCount?: number;
  routes?: Array<{
    originCityId?: string;
    originCityName?: string;
    destinationCityId?: string;
    destinationCityName?: string;
    turnsRemaining?: number;
  }>;
}

interface CityStatesDataLike {
  availability?: "available" | "not-applicable" | "unavailable";
  confidence?: string;
  availableEnvoys?: number;
  cityStates?: Array<{
    playerId?: number;
    type?: string;
    name?: string;
    envoys?: number;
    isSuzerain?: boolean;
    rewards?: {
      oneEnvoy?: string;
      threeEnvoys?: string;
      sixEnvoys?: string;
      suzerain?: string;
    };
    quests?: CityStateQuestLike[];
  }>;
}

interface CityStateQuestLike {
  type?: string;
  name?: string;
  description?: string;
  turnsRemaining?: number;
  reward?: string;
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
  confidence?: string;
  currentProgress?: number;
  currentCost?: number;
  current?: NamedTypeLike;
  available?: NamedTypeLike[];
  boosts?: Array<{
    type?: string;
    boosted?: boolean;
  }>;
}

interface GovernmentLike {
  confidence?: string;
  availablePolicies?: Array<NamedTypeLike & { slotType?: string; description?: string }>;
  currentGovernment?: NamedTypeLike;
  policies?: NamedTypeLike[];
}

interface ResourcesLike {
  confidence?: string;
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
