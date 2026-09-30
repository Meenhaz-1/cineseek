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
// Repeated live trials expose run-to-run variance; fixture mode is deterministic.
const reps = Number(argument("--reps", live ? 3 : 1));
const maxRetries = Number(argument("--retries", 3));
if (
  !Number.isInteger(limit) ||
  limit < 1 ||
  !Number.isInteger(concurrency) ||
  concurrency < 1 ||
  concurrency > 4 ||
  !Number.isInteger(reps) ||
  reps < 1 ||
  reps > 10 ||
  !Number.isInteger(maxRetries) ||
  maxRetries < 0 ||
  maxRetries > 5
)
  throw new Error(
    "--limit must be positive; --concurrency must be 1-4; --reps 1-10; --retries 0-5",
  );
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
const jobs = selected.flatMap((item) =>
  Array.from({ length: reps }, (_, rep) => ({ item, rep })),
);
const rows = [];
const errors = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const retryable = (status) =>
  status === null || status === 408 || status === 429 || status >= 500;
// Served snapshots carry a date suffix; anything else is a silent substitution.
const servedMatches = (served) =>
  !served || served === config.model || served.startsWith(`${config.model}-`);
async function attempt(item) {
  const call = { httpStatus: undefined, servedModel: null };
  let observed;
  const provider = live
    ? createInterpreter({
        apiKey: process.env.OPENAI_API_KEY,
        model: config.model,
        fetchImpl: async (url, init) => {
          try {
            const response = await fetch(
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
            );
            call.httpStatus = response.status;
            if (response.ok)
              call.servedModel = (await response.clone().json()).model ?? null;
            return response;
          } catch (error) {
            if (error.name !== "AbortError") call.httpStatus = null;
            throw error;
          }
        },
      })
    : async () => ({ interpretation: item.value });
  const started = performance.now();
  // A fresh cache per attempt: otherwise every rep after the first is a cache hit.
  const plan = await planHindiQuery(
    item.query,
    { ...runtime, interpretationCache: new Map() },
    {
      model: live ? config.model : "fixture",
      interpret: async (query, context) => {
        observed = await provider(query, context);
        return observed;
      },
    },
  );
  return { plan, observed, call, ms: performance.now() - started };
}
let next = 0;
async function worker() {
  while (next < jobs.length) {
    const index = next++,
      { item, rep } = jobs[index];
    const label = `${index + 1}/${jobs.length} ${item.id}#${rep}`;
    const started = performance.now();
    let run,
      retries = 0;
    for (;;) {
      run = await attempt(item);
      const reason = run.plan.interpretation.fallbackReason;
      if (
        !live ||
        reason !== "provider_error" ||
        !retryable(run.call.httpStatus ?? null) ||
        retries >= maxRetries
      )
        break;
      retries++;
      await sleep(1000 * 2 ** (retries - 1) * (0.5 + Math.random()));
    }
    const { plan, observed, call } = run;
    const reason = plan.interpretation.fallbackReason ?? null;
    // HTTP/network failures and substituted models are plumbing, not model answers.
    const infra =
      live && reason === "provider_error"
        ? `http_${call.httpStatus ?? "network"}`
        : live && !servedMatches(call.servedModel)
          ? "served_model_mismatch"
          : null;
    if (infra) {
      errors.push({
        id: item.id,
        rep,
        failureClass: infra,
        retries,
        servedModel: call.servedModel,
        usage: observed?.usage ?? null,
      });
      console.error(`${label}: ERROR (${infra}) after ${retries} retries`);
      continue;
    }
    const row = {
      id: item.id,
      rep,
      query: item.query,
      script: item.script,
      category: item.category,
      fastPath: item.expected.fastPath === true,
      mode: plan.interpretation.mode,
      fallbackReason: reason,
      // Timeouts hit the page's own 5 s budget, so they stay graded but are counted apart.
      failureClass: null,
      ...assessCase(item, plan, searchHindiPlan(runtime, plan, 100), { live }),
      expected: { ...item.expected, resultIds: item.expectedIds },
      rawInterpretation: observed?.interpretation ?? null,
      servedModel: call.servedModel,
      retries,
      plannerMs: plan.planner.planningMs,
      endToEndMs: run.ms,
      wallMs: performance.now() - started,
      evidence: plan.interpretation.originalSpans,
      catalogueContext: plan.interpretation.catalogueContext ?? [],
      usage:
        observed?.usage ??
        plan.interpretation.usage ??
        (live && !item.expected.fastPath
          ? null
          : { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 }),
    };
    if (!row.passed)
      row.failureClass =
        reason === "timeout"
          ? "timeout"
          : reason
            ? `model_${reason}`
            : "wrong_answer";
    rows.push(row);
    console.error(
      `${label}: ${row.passed ? "PASS" : `FAIL (${row.failureClass}: ${row.failedChecks.join(", ")})`} · ${plan.interpretation.mode}${reason ? `/${reason}` : ""} · ${row.endToEndMs.toFixed(0)} ms${retries ? ` · ${retries} retries` : ""}`,
    );
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
const order = new Map(jobs.map(({ item, rep }, i) => [`${item.id}#${rep}`, i]));
rows.sort(
  (a, b) => order.get(`${a.id}#${a.rep}`) - order.get(`${b.id}#${b.rep}`),
);
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
const price = (usage) =>
  ((usage.inputTokens - usage.cachedInputTokens) * rates[0] +
    usage.outputTokens * rates[1] +
    usage.cachedInputTokens * rates[2]) /
  1e6;
const priced = live && rates.every((r) => Number.isFinite(r) && r >= 0);
const errorUsage = errors.reduce(
  (sum, e) => ({
    inputTokens: sum.inputTokens + (e.usage?.inputTokens ?? 0),
    outputTokens: sum.outputTokens + (e.usage?.outputTokens ?? 0),
    cachedInputTokens:
      sum.cachedInputTokens + (e.usage?.cachedInputTokens ?? 0),
  }),
  { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
);
// Billed-but-failed calls are still spend.
const estimatedCostUSD = priced
  ? price(summary.usage) + price(errorUsage)
  : null;
summary.reps = reps;
summary.errorCount = errors.length;
summary.retryCount =
  rows.reduce((n, r) => n + r.retries, 0) +
  errors.reduce((n, e) => n + e.retries, 0);
summary.costPerAttemptUSD =
  priced && rows.length
    ? estimatedCostUSD / (rows.length + errors.length)
    : null;
const report = {
  generatedAt: new Date().toISOString(),
  mode: live ? "live-model-on-synthetic-catalogue" : "fixture-pipeline-only",
  model: live ? config.model : "fixture",
  promptVersion: PROMPT_VERSION,
  reasoning: reasoning || "model default",
  note: `${selected.length} curated synthetic cases, not a representative production relevance study. Fixture mode injects interpretations and cannot measure model accuracy. Live fallback counts as failure even when fallback results happen to be correct. Empty expected-result cases have null relevance metrics. ${reps} rep(s) per case with a fresh interpretation cache per attempt; HTTP/network failures after retries and served-model mismatches are excluded from scores and listed as errors. Timeouts hit the page's 5 s budget and are graded as failures.`,
  summary,
  byScript: groupBy("script"),
  byCategory: groupBy("category"),
  estimatedCostUSD,
  rows,
  errors,
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
