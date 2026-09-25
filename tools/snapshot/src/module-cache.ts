/** Whole-module replacement only. Never combine players, sessions or turns. */
export const MODULE_FIELDS: Record<string, string | undefined> = {
  meta: undefined, localPlayer: "localPlayer", selection: "selection", cities: "cities", units: "units",
  governors: "governors", trade: "trade", cityStates: "cityStates",
  visibleMap: "visibleMap", techs: "techs", civics: "civics", government: "government",
  policies: "government", resources: "resources", diplomacyPublic: "diplomacy", economy: "economy"
};

export interface ModuleCapture {
  capturedTurn: number;
  capturedAt: string;
  exportId: string;
  scope?: "own-only" | "own-and-visible";
}

export interface ModuleSnapshot {
  schemaVersion?: string;
  source?: { compatVersion?: string; exportId?: string };
  session?: { sessionId?: string; gameTurn?: number };
  localPlayer?: { localPlayerId?: number };
  modules?: string[];
  moduleStatus?: Record<string, ModuleCapture>;
  [key: string]: unknown;
}

/** The completed export just read from the game replaces the previous briefing, including an earlier turn after a reload. */
export function mergeSnapshotModules(previous: ModuleSnapshot | undefined, incoming: ModuleSnapshot): ModuleSnapshot {
  void previous;
  return structuredClone(incoming);
}

export function moduleContractErrors(snapshot: ModuleSnapshot): string[] {
  const errors: string[] = [];
  const modules = Array.isArray(snapshot.modules) ? snapshot.modules : [];
  const status = snapshot.moduleStatus;
  if (!status || typeof status !== "object") return ["$.moduleStatus is required"];
  for (const moduleName of modules) {
    const capture = status[moduleName];
    if (!capture || capture.capturedTurn !== snapshot.session?.gameTurn) {
      errors.push(`$.moduleStatus.${moduleName} must capture the current snapshot turn`);
    }
    const field = MODULE_FIELDS[moduleName];
    if (field && snapshot[field] === undefined) errors.push(`$.${field} is required for module ${moduleName}`);
  }
  for (const [moduleName, capture] of Object.entries(status)) {
    if (capture && capture.capturedTurn > (snapshot.session?.gameTurn ?? -1)) {
      errors.push(`$.moduleStatus.${moduleName} cannot be from a future turn`);
    }
  }
  if (modules.includes("government") !== modules.includes("policies")) {
    errors.push("government and policies share one payload and must be refreshed together");
  }
  if (modules.includes("government") && ["capturedTurn", "capturedAt", "exportId"].some((key) =>
    status.government?.[key as keyof ModuleCapture] !== status.policies?.[key as keyof ModuleCapture])) {
    errors.push("government and policies must have the same capture provenance");
  }
  return errors;
}
