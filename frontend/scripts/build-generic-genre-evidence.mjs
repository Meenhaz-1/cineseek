import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getSearchRuntime } from "../lib/search-runtime.mjs";
import { planQuery } from "../lib/query-planner.mjs";
import { runTitleSearch } from "../lib/title-search-pipeline.mjs";

const query = process.argv[2] ?? "comedy";
const outputPath = path.resolve(
  process.cwd(),
  process.argv[3] ?? "../outputs/generic-genre/comedy-focused-pool.v1.json",
);
const runtime = await getSearchRuntime();
const plan = planQuery(query, runtime.plannerIndexes);

if (!plan.routes.structuredGenreRanking || plan.filters.genres.length !== 1) {
  throw new Error("The evidence builder requires a pure single-genre query.");
}

const records = [...runtime.searchIndexes.tokens.records.values()].filter(
  (record) => record.genres.includes(plan.filters.genres[0]),
);
const legacy = [...records]
  .sort(
    (left, right) =>
      (right.averageRating ?? 0) - (left.averageRating ?? 0) ||
      (right.ratingCount ?? 0) - (left.ratingCount ?? 0) ||
      left.title.localeCompare(right.title),
  )
  .slice(0, 10)
  .map(({ id }) => id);

function rankedResults(genreWeights) {
  return runTitleSearch(runtime.searchIndexes, plan, {
    rankLimit: 20,
    genreWeights,
  }).evaluation.rankedResults;
}

const balancedResults = rankedResults(undefined);
const strategies = {
  legacy_raw_average: legacy,
  balanced_15_55_30: balancedResults.map(({ id }) => id),
  popularity_heavy_10_20_70: rankedResults({
    genreFocus: 10,
    bayesianRating: 20,
    ratingEvidence: 70,
  }).map(({ id }) => id),
  quality_heavy_10_80_10: rankedResults({
    genreFocus: 10,
    bayesianRating: 80,
    ratingEvidence: 10,
  }).map(({ id }) => id),
};
const nominations = new Map();
for (const [source, ids] of Object.entries(strategies)) {
  ids.slice(0, 10).forEach((id, index) => {
    const entries = nominations.get(id) ?? [];
    entries.push({ source, rank: index + 1 });
    nominations.set(id, entries);
  });
}
const pool = [...nominations].slice(0, 40).map(([id, nominationSources]) => {
  const record = runtime.searchIndexes.tokens.records.get(id);
  return {
    id,
    title: record.title,
    year: record.year,
    genres: record.genres,
    averageRating: record.averageRating,
    ratingCount: record.ratingCount,
    nominationSources,
    judgment: "unjudged",
  };
});
const balancedTop20 = balancedResults.map(({ id, score }, index) => {
  const record = runtime.searchIndexes.tokens.records.get(id);
  return {
    rank: index + 1,
    id,
    title: record.title,
    score,
    averageRating: record.averageRating,
    ratingCount: record.ratingCount,
  };
});
const evidence = {
  version: "generic-genre-comedy-v1",
  frozenAgainstCommit: "979149d",
  generatedAt: new Date().toISOString(),
  query,
  queryPlan: plan,
  profile: {
    genreFocus: 15,
    bayesianRating: 55,
    ratingEvidence: 30,
    bayesianPrior: 20,
  },
  checks: {
    poolSize: pool.length,
    lowEvidenceInBalancedTop20: balancedTop20.filter(
      ({ ratingCount }) => ratingCount <= 2,
    ).length,
  },
  strategies,
  balancedTop20,
  pool,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(
  `Wrote ${pool.length} pooled candidates to ${outputPath}; ${evidence.checks.lowEvidenceInBalancedTop20} have at most two ratings in the balanced top 20.`,
);
