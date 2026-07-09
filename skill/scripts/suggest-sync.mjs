#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

const moduleLabels = {
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

export function inferRequiredModules(question = "") {
  const matchedIntentIds = questionRules
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(question)))
    .map((rule) => rule.id);
  return inferRequiredModulesForIntents(matchedIntentIds.length > 0 ? matchedIntentIds : ["turn-priority"]);
}

export function inferRequiredModulesForIntents(intents = ["turn-priority"]) {
  const normalizedIntents = normalizeIntents(intents);
  const matched = intentRules.filter((rule) => normalizedIntents.includes(rule.id));
  const modules = new Set(matched.flatMap((rule) => rule.modules));
  return {
    intents: matched.map((rule) => rule.id),
    scenarios: matched.map((rule) => rule.id),
    requiredModules: [...modules]
  };
}

export function buildSyncSuggestion({ question = "", intents = [], requiredModules = [], snapshot = undefined } = {}) {
  const explicitModules = uniqueStrings(requiredModules);
  const analysis = explicitModules.length > 0
    ? {
        intents: normalizeIntents(intents),
        scenarios: normalizeIntents(intents),
        requiredModules: explicitModules
      }
    : intents.length > 0
    ? inferRequiredModulesForIntents(intents)
    : question.trim().length > 0
    ? inferRequiredModules(question)
    : inferRequiredModulesForIntents(["turn-priority"]);
  const availableModules = new Set(Array.isArray(snapshot?.modules) ? snapshot.modules : []);
  const missingModules = analysis.requiredModules.filter((moduleName) => !availableModules.has(moduleName));
  const lowConfidenceModules = analysis.requiredModules.filter((moduleName) =>
    availableModules.has(moduleName) && isLowConfidence(moduleConfidence(snapshot, moduleName))
  );
  const commandArgs = formatCopilotCommandArgs(analysis.intents, explicitModules.length > 0 ? explicitModules : []);

  if (!snapshot) {
    return {
      ok: false,
      intents: analysis.intents,
      scenarios: analysis.scenarios,
      requiredModules: analysis.requiredModules,
      missingModules: analysis.requiredModules,
      lowConfidenceModules: [],
      recommendation:
        `尚未读取到 snapshot。请先在 Civ6 启用 civ6-ai-copilot Mod，点击左上副官入口打开「战情简报」，点击「汇总本回合」。看到“简报已汇总，可继续由AI副官分析。”和“最近汇总：…”后，重新运行标准入口：npm run copilot -- ${commandArgs} --clean。`
    };
  }

  if (missingModules.length === 0 && lowConfidenceModules.length === 0) {
    return {
      ok: true,
      intents: analysis.intents,
      scenarios: analysis.scenarios,
      requiredModules: analysis.requiredModules,
      missingModules: [],
      lowConfidenceModules: [],
      recommendation: "当前 snapshot 已覆盖当前分析意图，可以继续分析。"
    };
  }

  const labels = [...new Set(missingModules.map((moduleName) => moduleLabels[moduleName] ?? moduleName))];
  const lowConfidenceLabels = [...new Set(lowConfidenceModules.map((moduleName) => moduleLabels[moduleName] ?? moduleName))];
  const mapWindowOnly = missingModules.includes("visibleMap") && analysis.requiredModules.every((moduleName) =>
    ["meta", "localPlayer", "units", "visibleMap"].includes(moduleName)
  );
  const useMapWindow = missingModules.includes("visibleMap");
  const action = mapWindowOnly
    ? "点击「更新地图情报」"
    : useMapWindow
    ? "点击「更新地图情报」；如仍需城市运营、科技市政或政体政策信息，再选择对应专题情报"
    : `选择「${labels.join("」「")}」`;
  const missingText = missingModules.length > 0 ? `当前分析需要 ${labels.join("、")}。` : "当前意图所需情报已声明存在，但部分模块置信度偏低。";
  const lowConfidenceText = lowConfidenceModules.length > 0
    ? `；另外 ${lowConfidenceLabels.join("、")} 置信度偏低，请重新汇总对应情报${lowConfidenceModules.includes("visibleMap") ? "或点击「更新地图情报」" : ""}。若置信度仍偏低，我会按低置信度来源处理`
    : "";

  return {
    ok: false,
    intents: analysis.intents,
    scenarios: analysis.scenarios,
    requiredModules: analysis.requiredModules,
    missingModules,
    lowConfidenceModules,
    recommendation: `${missingText}请在 Civ6 点击左上副官入口打开「战情简报」，${missingModules.length > 0 ? action : "重新汇总对应情报"}${lowConfidenceText}。看到“简报已汇总，可继续由AI副官分析。”和“最近汇总：…”后，重新运行标准入口：npm run copilot -- ${commandArgs} --clean。`
  };
}

function moduleConfidence(snapshot, moduleName) {
  if (!snapshot) {
    return undefined;
  }
  if (moduleName === "visibleMap") {
    return snapshot.visibleMap?.confidence;
  }
  if (moduleName === "diplomacyPublic") {
    return snapshot.diplomacy?.confidence;
  }
  return undefined;
}

function isLowConfidence(confidence) {
  return confidence !== undefined && confidence !== "confirmed";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const question = args.question ?? "";
  const intents = args.intent ?? [];
  const requiredModules = args.module ?? [];
  const snapshot = args.snapshot ? JSON.parse(await readFile(path.resolve(args.snapshot), "utf8")) : undefined;
  const result = buildSyncSuggestion({ question, intents, requiredModules, snapshot });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exitCode = 2;
  }
}

function parseArgs(args) {
  const parsed = { intent: [], module: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--snapshot") {
      parsed.snapshot = args[index + 1];
      index += 1;
    } else if (arg === "--intent") {
      parsed.intent.push(...splitList(args[index + 1]));
      index += 1;
    } else if (arg === "--module") {
      parsed.module.push(...splitList(args[index + 1]));
      index += 1;
    } else if (arg === "--question") {
      parsed.question = args[index + 1];
      index += 1;
    }
  }
  return parsed;
}

function normalizeIntents(intents = []) {
  const normalized = uniqueStrings(intents).map((intent) => intent === "general" ? "turn-priority" : intent);
  const known = normalized.filter((intent) => intentRules.some((rule) => rule.id === intent));
  return known.length > 0 ? known : ["turn-priority"];
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

function splitList(value = "") {
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function formatCopilotCommandArgs(intents, modules) {
  const stableIntents = normalizeIntents(intents);
  const explicitModules = uniqueStrings(modules);
  return [
    ...stableIntents.flatMap((intent) => ["--intent", JSON.stringify(intent)]),
    ...explicitModules.flatMap((moduleName) => ["--module", JSON.stringify(moduleName)])
  ].join(" ");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
