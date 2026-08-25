import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { buildPlannerIndexes } from "./query-planner.mjs";
import { RUNTIME_FILES, resolveRuntimeFile } from "./runtime-data.mjs";
import { buildTitleSearchPipeline } from "./title-search-pipeline.mjs";

let runtimePromise;
let runtimeSourceKey;

export async function getSearchRuntime() {
  const corpusPath = await resolveRuntimeFile(RUNTIME_FILES.corpus, [
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
  const registryPath = await resolveRuntimeFile(RUNTIME_FILES.plannerRegistry, [
    path.join(
      process.cwd(),
      "..",
      "data",
      "movielens",
      "planner-registry.json",
    ),
    path.join(process.cwd(), "data", "movielens", "planner-registry.json"),
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
      readFile(/* turbopackIgnore: true */ corpusPath, "utf8"),
      readFile(/* turbopackIgnore: true */ registryPath, "utf8"),
    ]).then(([corpusContents, registryContents]) => {
      const documents = corpusContents
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      const searchIndexes = buildTitleSearchPipeline(documents);
      const plannerIndexes = buildPlannerIndexes(
        documents,
        JSON.parse(registryContents),
        {
          exactTitles: searchIndexes.exact,
          titleTrigrams: searchIndexes.trigrams,
        },
      );
      return { searchIndexes, plannerIndexes, corpusPath, registryPath };
    });
  }
  const runtime = await runtimePromise;
  return { ...runtime, cached };
}
