import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";

const reportArgument = process.argv[2];
if (!reportArgument) {
  throw new Error("Pass the evaluation report path as the first argument.");
}

const reportPath = path.resolve(process.cwd(), reportArgument);
const report = JSON.parse(await readFile(reportPath, "utf8"));
const metricNames = report.metric_names ?? {};

function decimal(value) {
  return typeof value === "number" ? value.toFixed(4) : "n/a";
}

function milliseconds(value) {
  return typeof value === "number" ? `${value.toFixed(2)} ms` : "n/a";
}

const rows = [
  ["Evaluated queries", String(report.evaluated_queries ?? "n/a")],
  ["Candidate recall", decimal(report.candidate_recall)],
  [metricNames.precision ?? "Precision@10", decimal(report.precision_at_k)],
  [metricNames.recall ?? "Recall@10", decimal(report.recall_at_k)],
  [metricNames.deep_recall ?? "Recall@100", decimal(report.recall_at_recall_k)],
  [metricNames.mrr ?? "MRR", decimal(report.mrr)],
  [metricNames.ndcg ?? "nDCG@10", decimal(report.ndcg_at_k)],
  [metricNames.judged ?? "Judged@10", decimal(report.judged_at_k)],
  ["Mean latency", milliseconds(report.mean_latency_ms)],
  ["p95 latency", milliseconds(report.p95_latency_ms)],
  ["Missing query runs", String(report.missing_queries ?? "n/a")],
];

const markdown = [
  "## CineSeek evaluation metrics",
  "",
  "These scores use the 82-query provisional benchmark and public MovieLens data. They are regression signals, not human relevance judgments.",
  "",
  "| Metric | Result |",
  "| --- | ---: |",
  ...rows.map(([name, value]) => `| ${name} | ${value} |`),
  "",
].join("\n");

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) {
  await appendFile(summaryPath, markdown, "utf8");
} else {
  console.log(markdown);
}
