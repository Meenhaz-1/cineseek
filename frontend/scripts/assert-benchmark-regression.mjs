import { readFile } from "node:fs/promises";
import path from "node:path";

const reportPath = process.argv[2];
const thresholdsPath =
  process.argv[3] ?? "../benchmark/regression-thresholds.json";
if (!reportPath)
  throw new Error(
    "Usage: node assert-benchmark-regression.mjs <report> [thresholds]",
  );

const [report, thresholds] = await Promise.all([
  readFile(path.resolve(process.cwd(), reportPath), "utf8").then(JSON.parse),
  readFile(path.resolve(process.cwd(), thresholdsPath), "utf8").then(
    JSON.parse,
  ),
]);

const metricNames = {
  candidate_recall: "Candidate Recall",
  precision_at_k: "Precision@10",
  recall_at_k: "Recall@10",
  recall_at_recall_k: "Recall@100",
  mrr: "MRR",
  ndcg_at_k: "nDCG@10",
  p95_latency_ms: "p95 latency (ms)",
  missing_queries: "Missing query runs",
};
const failures = [];
for (const [field, minimum] of Object.entries(thresholds)) {
  const actual = Number(report[field]);
  const passed =
    field === "p95_latency_ms" || field === "missing_queries"
      ? actual <= Number(minimum)
      : actual >= Number(minimum);
  if (!Number.isFinite(actual) || !passed) {
    const comparison =
      field === "p95_latency_ms" || field === "missing_queries" ? "<=" : ">=";
    failures.push(
      `${metricNames[field] ?? field}: ${actual} (required ${comparison} ${minimum})`,
    );
  }
}

const lines = [
  "### Benchmark regression gate",
  "",
  "| Metric | Actual | Threshold |",
  "| --- | ---: | ---: |",
  ...Object.entries(thresholds).map(([field, threshold]) => {
    const actual = Number(report[field]);
    return `| ${metricNames[field] ?? field} | ${actual} | ${threshold} |`;
  }),
  "",
  failures.length ? `**FAILED**: ${failures.join("; ")}` : "**PASSED**",
  "",
  "These are provisional benchmark regression signals, not human relevance judgments.",
];
console.log(lines.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) {
  await import("node:fs/promises").then(({ appendFile }) =>
    appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`),
  );
}
if (failures.length) process.exitCode = 1;
