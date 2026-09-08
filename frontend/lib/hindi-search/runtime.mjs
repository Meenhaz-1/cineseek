import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { getSearchRuntime } from "../search-runtime.mjs";
import { buildAliasCatalog, suggestAliases } from "./catalog.mjs";
import { modelConfiguration, createInterpreter } from "./model.mjs";
import { planHindiQuery } from "./planner.mjs";
import { searchHindiPlan } from "./retrieval.mjs";

let cache;
async function optionalRead(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}
export async function getHindiRuntime() {
  const base = await getSearchRuntime();
  const aliasPath =
    process.env.CINESEEK_HINDI_ALIASES_PATH ||
    path.join(path.dirname(base.corpusPath), "hindi-aliases.json");
  const fullRegistryPath = path.join(
    path.dirname(base.registryPath),
    "entity-registry.json",
  );
  const fileStamp = async (file) => {
    try {
      const value = await stat(file);
      return `${file}:${value.size}:${value.mtimeMs}`;
    } catch (error) {
      if (error.code === "ENOENT") return `${file}:missing`;
      throw error;
    }
  };
  const sourceKey = (
    await Promise.all([fileStamp(aliasPath), fileStamp(fullRegistryPath)])
  ).join("|");
  if (cache?.base === base.searchIndexes && cache.sourceKey === sourceKey)
    return cache.promise;
  const promise = Promise.all([
    readFile(base.corpusPath, "utf8"),
    optionalRead(fullRegistryPath),
    optionalRead(aliasPath),
  ]).then(async ([corpus, fullRegistry, aliases]) => {
    const registryText =
      fullRegistry || (await readFile(base.registryPath, "utf8"));
    const registry = JSON.parse(registryText);
    const documents = corpus
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const version = createHash("sha256")
      .update(corpus)
      .update(registryText)
      .update(aliases)
      .digest("hex");
    return {
      ...base,
      documents,
      registry,
      catalog: buildAliasCatalog(
        documents,
        registry,
        aliases ? JSON.parse(aliases) : {},
      ),
      catalogueVersion: version,
      interpretationCache: new Map(),
    };
  });
  cache = { base: base.searchIndexes, sourceKey, promise };
  try {
    return await promise;
  } catch (error) {
    if (cache?.promise === promise) cache = undefined;
    throw error;
  }
}
export async function submittedHindiSearch(query, limit = 24) {
  const started = performance.now();
  const runtime = await getHindiRuntime(),
    config = modelConfiguration();
  const plan = await planHindiQuery(query, runtime, {
    model: config.model,
    disabledReason: config.reason,
    interpret: config.enabled
      ? createInterpreter({
          apiKey: process.env.OPENAI_API_KEY,
          model: config.model,
        })
      : undefined,
  });
  const results = searchHindiPlan(runtime, plan, limit);
  return {
    queryPlan: plan,
    results,
    coverage: runtime.catalog.coverage,
    modelEnabled: config.enabled,
    timings: {
      plannerMs: plan.planner.planningMs,
      retrievalMs: results.retrievalMs,
      endToEndMs: Number((performance.now() - started).toFixed(3)),
    },
  };
}
export async function hindiSuggestions(query) {
  return suggestAliases((await getHindiRuntime()).catalog, query);
}
