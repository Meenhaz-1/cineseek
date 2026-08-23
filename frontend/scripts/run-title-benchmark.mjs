import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadPlannerIndexes, planQuery } from "../lib/query-planner.mjs";
import {
  loadTitleSearchPipeline,
  runTitleSearch,
} from "../lib/title-search-pipeline.mjs";

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function positiveInteger(name, fallback) {
  const value = Number(argument(name, fallback));
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`--${name} must be a positive integer.`);
  return value;
}

function parseJsonl(contents) {
  return contents
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(3));
}

const frontendRoot = process.cwd();
const enrichedCorpusPath = path.resolve(
  frontendRoot,
  "../data/movielens/corpus.enriched.jsonl",
);
const defaultCorpusPath = await access(enrichedCorpusPath)
  .then(() => enrichedCorpusPath)
  .catch(() => path.resolve(frontendRoot, "../data/movielens/corpus.jsonl"));
const corpusPath = path.resolve(
  frontendRoot,
  argument("corpus", defaultCorpusPath),
);
const registryPath = path.resolve(
  frontendRoot,
  argument("registry", "../data/movielens/entity-registry.json"),
);
const queriesPath = path.resolve(
  frontendRoot,
  argument("queries", "../data/movielens/benchmark/queries.provisional.jsonl"),
);
const outputPath = path.resolve(
  frontendRoot,
  argument(
    "output",
    "../outputs/title-ranking-evaluation/combined-default.run.jsonl",
  ),
);
const rankLimit = positiveInteger("rank-limit", 100);
const repeats = positiveInteger("repeats", 3);
const warmups = positiveInteger("warmups", 5);

const [pipeline, plannerIndexes] = await Promise.all([
  loadTitleSearchPipeline(corpusPath),
  loadPlannerIndexes(corpusPath, registryPath),
]);
const queries = parseJsonl(await readFile(queriesPath, "utf8"));
if (!queries.length) throw new Error("The benchmark query file is empty.");

for (const query of queries.slice(0, warmups)) {
  const plan = planQuery(query.text, plannerIndexes);
  runTitleSearch(pipeline, plan, { rankLimit });
}

const rows = [];
for (const query of queries) {
  const measured = Array.from({ length: repeats }, () => {
    const totalStartedAt = performance.now();
    const plan = planQuery(query.text, plannerIndexes);
    const result = runTitleSearch(pipeline, plan, {
      rankLimit,
      cacheStatus: "warm benchmark",
    });
    return {
      plan,
      result,
      endToEndMs: Number((performance.now() - totalStartedAt).toFixed(3)),
    };
  });
  const representative = measured[0].result;
  const representativePlan = measured[0].plan;
  const timingKeys = Object.keys(representative.timings);
  const timings = Object.fromEntries(
    timingKeys.map((key) => [
      key,
      median(measured.map(({ result }) => result.timings[key])),
    ]),
  );
  timings.plannerMs = median(
    measured.map(({ plan }) => plan.planner.planningMs),
  );
  timings.retrievalMs = timings.totalMs;
  timings.endToEndMs = median(measured.map(({ endToEndMs }) => endToEndMs));
  rows.push({
    query_id: String(query._id),
    query_text: String(query.text),
    category: query.metadata?.category ?? "uncategorized",
    input_mode: "shared_query_plan",
    planner_id: representativePlan.planner.id,
    planner_version: representativePlan.planner.version,
    query_plan: representativePlan,
    candidate_ids: representative.evaluation.candidateIds,
    results: representative.evaluation.rankedResults.map(({ id, score }) => ({
      doc_id: id,
      score,
    })),
    latency_ms: timings.endToEndMs,
    timings,
  });
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
  "utf8",
);
const candidateCounts = rows.map(({ candidate_ids: ids }) => ids.length);
const latencies = rows.map(({ latency_ms: latency }) => latency);
console.log(
  JSON.stringify(
    {
      output: outputPath,
      queries: rows.length,
      rankLimit,
      repeats,
      sources: { corpusPath, registryPath },
      indexBuildMs: pipeline.buildMs,
      plannerIndexBuildMs: plannerIndexes.buildMs,
      meanCandidates: Number(
        (
          candidateCounts.reduce((sum, count) => sum + count, 0) /
          candidateCounts.length
        ).toFixed(2),
      ),
      medianWarmLatencyMs: median(latencies),
    },
    null,
    2,
  ),
);
