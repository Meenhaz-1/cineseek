import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const frontendRoot = path.resolve(import.meta.dirname, "..");
const reportPath = path.resolve(
  frontendRoot,
  process.argv[2] ??
    "../outputs/query-planner-migration/genre-benchmark-regression.report.json",
);
const outputPath = path.join(frontendRoot, "data", "benchmark-summary.json");
const report = JSON.parse(await readFile(reportPath, "utf8"));

const summary = {
  label: "82-query provisional benchmark",
  evaluatedQueries: report.evaluated_queries,
  candidateRecall: report.candidate_recall,
  mrr: report.mrr,
  ndcgAt10: report.ndcg_at_k,
  p95LatencyMs: report.p95_latency_ms,
  missingQueries: report.missing_queries,
  methodology:
    "Warm local runs over MovieLens Latest Small with provisional relevance judgments.",
};

await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: outputPath, ...summary }, null, 2));
