import { access, stat } from "node:fs/promises";
import path from "node:path";
import { loadPlannerIndexes } from "./query-planner.mjs";
import { loadTitleSearchPipeline } from "./title-search-pipeline.mjs";

let runtimePromise;
let runtimeSourceKey;

async function firstAvailable(paths) {
  for (const candidate of paths) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next supported project layout.
    }
  }
  throw new Error(`No readable data source found: ${paths.join(", ")}`);
}

export async function getSearchRuntime() {
  const corpusPath = await firstAvailable([
    path.join(
      process.cwd(),
      "..",
      "data",
      "movielens",
      "corpus.enriched.jsonl",
    ),
    path.join(process.cwd(), "..", "data", "movielens", "corpus.jsonl"),
    path.join(process.cwd(), "data", "movielens", "corpus.enriched.jsonl"),
    path.join(process.cwd(), "data", "movielens", "corpus.jsonl"),
  ]);
  const registryPath = await firstAvailable([
    path.join(process.cwd(), "..", "data", "movielens", "entity-registry.json"),
    path.join(process.cwd(), "data", "movielens", "entity-registry.json"),
  ]);
  const [corpusStats, registryStats] = await Promise.all([
    stat(/* turbopackIgnore: true */ corpusPath),
    stat(/* turbopackIgnore: true */ registryPath),
  ]);
  const sourceKey = [
    corpusPath,
    corpusStats.size,
    corpusStats.mtimeMs,
    registryPath,
    registryStats.size,
    registryStats.mtimeMs,
  ].join(":");
  const cached = Boolean(runtimePromise && runtimeSourceKey === sourceKey);
  if (!cached) {
    runtimeSourceKey = sourceKey;
    runtimePromise = Promise.all([
      loadTitleSearchPipeline(corpusPath),
      loadPlannerIndexes(corpusPath, registryPath),
    ]).then(([searchIndexes, plannerIndexes]) => ({
      searchIndexes,
      plannerIndexes,
      corpusPath,
      registryPath,
    }));
  }
  const runtime = await runtimePromise;
  return { ...runtime, cached };
}
