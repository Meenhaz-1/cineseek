import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  evaluationCases,
  evaluationRuntime,
} from "../lib/hindi-search/evaluation-cases.mjs";
import {
  assessCase,
  summarizeCases,
  renderEvaluation,
} from "../lib/hindi-search/evaluation.mjs";
import { planHindiQuery } from "../lib/hindi-search/planner.mjs";
import { searchHindiPlan } from "../lib/hindi-search/retrieval.mjs";
import {
  createInterpreter,
  modelConfiguration,
  PROMPT_VERSION,
} from "../lib/hindi-search/model.mjs";

const args = process.argv.slice(2);
const live = args.includes("--live");
const argument = (name, fallback) => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--"))
    throw new Error(`${name} requires a value`);
  return args[index + 1];
};
const config = modelConfiguration();
config.model = argument("--model", config.model);
const reasoning = argument("--reasoning", "");
if (
  reasoning &&
  !["none", "minimal", "low", "medium", "high"].includes(reasoning)
)
  throw new Error("Unsupported --reasoning value");
if (live && !config.enabled)
  throw new Error(
    "Live evaluation requires local mode, CINESEEK_HINDI_MODEL_ENABLED=true, OPENAI_API_KEY and OPENAI_MODEL.",
  );
const limit = Number(argument("--limit", evaluationCases.length));
const concurrency = Number(argument("--concurrency", live ? 2 : 1));
if (
  !Number.isInteger(limit) ||
  limit < 1 ||
  !Number.isInteger(concurrency) ||
  concurrency < 1 ||
  concurrency > 4
)
  throw new Error("--limit must be positive; --concurrency must be 1-4");
const caseIds = argument("--case", "").split(",").filter(Boolean);
const category = argument("--category", "");
if (caseIds.some((id) => !evaluationCases.some((c) => c.id === id)))
  throw new Error("Unknown case ID");
const selected = evaluationCases
  .filter(
    (c) =>
      (!caseIds.length || caseIds.includes(c.id)) &&
      (!category || c.category === category),
  )
  .slice(0, limit);
if (!selected.length) throw new Error("No cases selected");
const runtime = evaluationRuntime();
const rows = new Array(selected.length);
let next = 0;
async function worker() {
  while (next < selected.length) {
    const index = next++,
      item = selected[index];
    const started = performance.now();
    let observed;
    const provider = live
      ? createInterpreter({
          apiKey: process.env.OPENAI_API_KEY,
          model: config.model,
          fetchImpl: (url, init) =>
            fetch(
              url,
              reasoning
                ? {
                    ...init,
                    body: JSON.stringify({
                      ...JSON.parse(init.body),
                      reasoning: { effort: reasoning },
                    }),
                  }
                : init,
            ),
        })
      : async () => ({ interpretation: item.value });
    const plan = await planHindiQuery(item.query, runtime, {
      model: live ? config.model : "fixture",
      interpret: async (query, context) => {
        observed = await provider(query, context);
        return observed;
      },
    });
    const result = searchHindiPlan(runtime, plan, 100);
    rows[index] = {
      id: item.id,
      query: item.query,
      script: item.script,
      category: item.category,
      fastPath: item.expected.fastPath === true,
      mode: plan.interpretation.mode,
      fallbackReason: plan.interpretation.fallbackReason ?? null,
      ...assessCase(item, plan, result, { live }),
      expected: { ...item.expected, resultIds: item.expectedIds },
      rawInterpretation: observed?.interpretation ?? null,
      plannerMs: plan.planner.planningMs,
      endToEndMs: performance.now() - started,
      evidence: plan.interpretation.originalSpans,
      catalogueContext: plan.interpretation.catalogueContext ?? [],
      usage:
        observed?.usage ??
        plan.interpretation.usage ??
        (live && !item.expected.fastPath
          ? null
          : { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 }),
    };
    console.error(
      `${index + 1}/${selected.length} ${item.id}: ${rows[index].passed ? "PASS" : `FAIL (${rows[index].failedChecks.join(", ")})`} · ${plan.interpretation.mode}${plan.interpretation.fallbackReason ? `/${plan.interpretation.fallbackReason}` : ""} · ${rows[index].endToEndMs.toFixed(0)} ms`,
    );
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
const summary = summarizeCases(rows);
const groupBy = (key) =>
  Object.fromEntries(
    [...new Set(rows.map((r) => r[key]))].map((value) => [
      value,
      summarizeCases(rows.filter((r) => r[key] === value)),
    ]),
  );
const rates = [
  "CINESEEK_MODEL_INPUT_USD_PER_MILLION",
  "CINESEEK_MODEL_OUTPUT_USD_PER_MILLION",
  "CINESEEK_MODEL_CACHED_INPUT_USD_PER_MILLION",
].map((key) =>
  process.env[key] === undefined ? NaN : Number(process.env[key]),
);
const usage = summary.usage;
const estimatedCostUSD =
  live && rates.every((r) => Number.isFinite(r) && r >= 0)
    ? ((usage.inputTokens - usage.cachedInputTokens) * rates[0] +
        usage.outputTokens * rates[1] +
        usage.cachedInputTokens * rates[2]) /
      1e6
    : null;
const report = {
  generatedAt: new Date().toISOString(),
  mode: live ? "live-model-on-synthetic-catalogue" : "fixture-pipeline-only",
  model: live ? config.model : "fixture",
  promptVersion: PROMPT_VERSION,
  reasoning: reasoning || "model default",
  note: `${selected.length} curated synthetic cases, not a representative production relevance study. Fixture mode injects interpretations and cannot measure model accuracy. Live fallback counts as failure even when fallback results happen to be correct. Empty expected-result cases have null relevance metrics.`,
  summary,
  byScript: groupBy("script"),
  byCategory: groupBy("category"),
  estimatedCostUSD,
  rows,
};
const directory = path.resolve(
  argument(
    "--output",
    path.join(
      import.meta.dirname,
      "../../outputs/hindi-search-evaluation",
      `${live ? "live" : "fixture"}-${new Date().toISOString().replaceAll(":", "-")}`,
    ),
  ),
);
await mkdir(directory, { recursive: true });
await writeFile(
  path.join(directory, "report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
await writeFile(path.join(directory, "report.md"), renderEvaluation(report));
console.log(
  JSON.stringify(
    { output: directory, mode: report.mode, model: report.model, summary },
    null,
    2,
  ),
);
if (rows.some((r) => !r.passed)) process.exitCode = 1;
