import { readFile } from "node:fs/promises";
import path from "node:path";

function argument(name, required = true) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (required && !value) throw new Error(`--${name} is required.`);
  return value;
}

function json(pathValue) {
  return readFile(path.resolve(process.cwd(), pathValue), "utf8").then(
    JSON.parse,
  );
}

function jsonl(pathValue) {
  return readFile(path.resolve(process.cwd(), pathValue), "utf8").then(
    (contents) => contents.split(/\r?\n/).filter(Boolean).map(JSON.parse),
  );
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

const [baseline, current, baselineRows, currentRows] = await Promise.all([
  json(argument("baseline")),
  json(argument("current")),
  jsonl(argument("baseline-run")),
  jsonl(argument("current-run")),
]);
const metricFields = [
  "candidate_recall",
  "precision_at_k",
  "recall_at_k",
  "recall_at_recall_k",
  "mrr",
  "ndcg_at_k",
];
const tolerance = 0.0001;
const failures = [];
const metrics = Object.fromEntries(
  metricFields.map((field) => {
    const before = Number(baseline[field] ?? 0);
    const after = Number(current[field] ?? 0);
    const delta = after - before;
    if (delta < -tolerance)
      failures.push(`${field} regressed by ${delta.toFixed(4)}`);
    return [
      field,
      {
        baseline: before,
        current: after,
        delta: Number(delta.toFixed(6)),
        relative: before ? Number((delta / before).toFixed(6)) : null,
      },
    ];
  }),
);
if (Number(current.missing_queries ?? 0) !== 0)
  failures.push(`missing query runs: ${current.missing_queries}`);

const baselineByQuery = new Map(
  (baseline.per_query ?? []).map((row) => [row.query_id, row]),
);
const lostReciprocalRank = (current.per_query ?? [])
  .filter(
    (row) =>
      Number(baselineByQuery.get(row.query_id)?.reciprocal_rank ?? 0) > 0 &&
      Number(row.reciprocal_rank ?? 0) === 0,
  )
  .map(({ query_id }) => query_id);
if (lostReciprocalRank.length)
  failures.push(
    `reciprocal rank fell to zero for ${lostReciprocalRank.join(", ")}`,
  );

const baselineP95 = Number(baseline.p95_latency_ms ?? 0);
const currentP95 = Number(current.p95_latency_ms ?? 0);
if (baselineP95 && currentP95 > baselineP95 * 1.2)
  failures.push(
    `end-to-end p95 grew more than 20% (${baselineP95} -> ${currentP95})`,
  );
const baselineRetrievalP95 = percentile(
  baselineRows.map(({ timings }) =>
    Number(timings?.retrievalMs ?? timings?.totalMs ?? 0),
  ),
  0.95,
);
const currentRetrievalP95 = percentile(
  currentRows.map(({ timings }) =>
    Number(timings?.retrievalMs ?? timings?.totalMs ?? 0),
  ),
  0.95,
);
if (baselineRetrievalP95 && currentRetrievalP95 > baselineRetrievalP95 * 1.1)
  failures.push(
    `retrieval p95 grew more than 10% (${baselineRetrievalP95} -> ${currentRetrievalP95})`,
  );

const categoryRows = new Map();
for (const row of currentRows) {
  const metricsForQuery = (current.per_query ?? []).find(
    ({ query_id }) => query_id === row.query_id,
  );
  const baselineForQuery = baselineByQuery.get(row.query_id);
  const category = row.category ?? "uncategorized";
  const values = categoryRows.get(category) ?? [];
  values.push({
    mrrDelta:
      Number(metricsForQuery?.reciprocal_rank ?? 0) -
      Number(baselineForQuery?.reciprocal_rank ?? 0),
    recallDelta:
      Number(metricsForQuery?.recall_at_recall_k ?? 0) -
      Number(baselineForQuery?.recall_at_recall_k ?? 0),
  });
  categoryRows.set(category, values);
}
const categories = Object.fromEntries(
  [...categoryRows].map(([category, values]) => [
    category,
    {
      queries: values.length,
      meanMrrDelta: Number(
        (
          values.reduce((sum, value) => sum + value.mrrDelta, 0) / values.length
        ).toFixed(6),
      ),
      meanRecallAt100Delta: Number(
        (
          values.reduce((sum, value) => sum + value.recallDelta, 0) /
          values.length
        ).toFixed(6),
      ),
    },
  ]),
);

console.log(
  JSON.stringify(
    {
      passed: failures.length === 0,
      metrics,
      latency: {
        baselineP95,
        currentP95,
        baselineRetrievalP95,
        currentRetrievalP95,
      },
      lostReciprocalRank,
      categories,
      failures,
    },
    null,
    2,
  ),
);
if (failures.length) process.exitCode = 1;
