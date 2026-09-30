import { performance } from "node:perf_hooks";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  evaluationCases,
  evaluationRuntime,
} from "../lib/hindi-search/evaluation-cases.mjs";
import { planHindiQuery } from "../lib/hindi-search/planner.mjs";
import { searchHindiPlan } from "../lib/hindi-search/retrieval.mjs";
import { PROMPT_VERSION } from "../lib/hindi-search/model.mjs";
import {
  createJudge,
  catalogueMatcher,
  filmCard,
  judgedMetrics,
  shuffled,
  JUDGE_PROMPT_VERSION,
} from "../lib/hindi-search/judge.mjs";
import { judgeQueries } from "../lib/hindi-search/judge-queries.mjs";

// calibration: judge the 38 synthetic cases, whose correct films are known, to measure
//   judge-vs-gold agreement before trusting it. Metadata only; no planner calls.
// real: run approved queries through the page's entry point on the real corpus and
//   grade the top 10 results. Uses the planner configured in .env.local.
const args = process.argv.slice(2);
const argument = (name, fallback) => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--"))
    throw new Error(`${name} requires a value`);
  return args[index + 1];
};
const set = argument("--set", "calibration");
if (!["calibration", "real"].includes(set))
  throw new Error("--set must be calibration or real");
const judgeModel = argument("--judge-model", "gpt-5.4-mini-2026-03-17");
const reps = Number(argument("--reps", 1));
const concurrency = Number(argument("--concurrency", 2));
const maxRetries = Number(argument("--retries", 3));
const timeoutMs = Number(argument("--timeout-s", 60)) * 1000;
const dryRun = args.includes("--dry-run");
if (
  ![reps, concurrency, maxRetries].every(Number.isInteger) ||
  reps < 1 ||
  reps > 10 ||
  concurrency < 1 ||
  concurrency > 4 ||
  maxRetries < 0 ||
  maxRetries > 5 ||
  !(timeoutMs > 0)
)
  throw new Error(
    "--reps 1-10; --concurrency 1-4; --retries 0-5; --timeout-s > 0",
  );
if (!dryRun && !process.env.OPENAI_API_KEY)
  throw new Error(
    "Judge runs require OPENAI_API_KEY (use --env-file=.env.local).",
  );
const caseIds = argument("--case", "").split(",").filter(Boolean);
const kind = argument("--kind", "");
// Re-judge the search results saved by an earlier real run, without searching again.
const replay = argument("--replay", "");
if (replay && set !== "real") throw new Error("--replay requires --set real");
if (kind && !["grade", "empty"].includes(kind))
  throw new Error("--kind must be grade or empty");
const pick = (items) =>
  items
    .filter((c) => !caseIds.length || caseIds.includes(c.id))
    .slice(0, Number(argument("--limit", items.length)));

const judge = createJudge({
  apiKey: process.env.OPENAI_API_KEY,
  model: judgeModel,
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const retryable = (status) =>
  status === null || status === 408 || status === 429 || status >= 500;
const servedMatches = (served) =>
  served === judgeModel || served?.startsWith(`${judgeModel}-`);

// Retries with jittered backoff; a hard wall-clock ceiling per attempt.
async function callJudge(request) {
  for (let retries = 0; ; retries++) {
    const controller = new AbortController();
    let timer;
    const started = performance.now();
    try {
      const verdict = await Promise.race([
        judge({ ...request, signal: controller.signal }),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(Object.assign(new Error("judge_timeout"), { call: {} }));
          }, timeoutMs);
        }),
      ]);
      if (!servedMatches(verdict.call.servedModel))
        throw Object.assign(new Error("served_model_mismatch"), verdict);
      return { ...verdict, retries, judgeMs: performance.now() - started };
    } catch (error) {
      const status = error.call?.httpStatus;
      if (retries < maxRetries && status !== undefined && retryable(status)) {
        await sleep(1000 * 2 ** retries * (0.5 + Math.random()));
        continue;
      }
      throw Object.assign(error, { retries });
    } finally {
      clearTimeout(timer);
    }
  }
}

function catalogueNote(plan, size, allFilms) {
  return {
    catalogueSize: size,
    closestNames: (plan.interpretation.catalogueContext ?? [])
      .slice(0, 5)
      .map(({ type, name, roles, year }) => ({ type, name, roles, year })),
    // Only the small synthetic catalogue is listed in full.
    ...(allFilms ? { allFilms } : {}),
  };
}

async function calibrationJobs() {
  const runtime = evaluationRuntime();
  const planned = [];
  const pool = new Map();
  for (const item of evaluationCases) {
    const plan = await planHindiQuery(item.query, runtime, {
      model: "fixture",
      interpret: async () => ({ interpretation: item.value }),
    });
    for (const film of searchHindiPlan(runtime, plan, 100).items)
      pool.set(film.id, film);
    planned.push({ item, plan });
  }
  const cards = [...pool.values()].map((film) => ({
    id: film.id,
    card: filmCard(film),
  }));
  const allFilms = cards.map((c) => c.card);
  const verify = catalogueMatcher(allFilms);
  const jobs = [];
  const nonEmpty = planned.filter(({ item }) => item.expectedIds.length);
  const emptyNegatives = new Set(
    nonEmpty.filter((_, i) => i % 4 === 0).map(({ item }) => item.id),
  );
  for (const { item, plan } of pick(
    planned.map((p) => ({ ...p, id: p.item.id })),
  )) {
    const base = {
      id: item.id,
      query: item.query,
      script: item.script,
      category: item.category,
      // Gold follows supported semantics; the rubric grades the full query.
      unresolved: Boolean(item.expected.unresolvedKind),
    };
    if (item.expectedIds.length) {
      const expected = new Set(item.expectedIds);
      const distractors = shuffled(
        cards.filter((c) => !expected.has(c.id)),
        item.id,
      ).slice(0, Math.min(4, 10 - expected.size));
      jobs.push({
        ...base,
        kind: "grade",
        films: shuffled(
          [...cards.filter((c) => expected.has(c.id)), ...distractors],
          `${item.id}:order`,
        ),
        expected,
        note: catalogueNote(plan, cards.length, allFilms),
        verify,
      });
    }
    // Known-negative probes: an empty list is wrong when correct films exist.
    if (!item.expectedIds.length || emptyNegatives.has(item.id))
      jobs.push({
        ...base,
        kind: "empty",
        films: [],
        emptyExpected: !item.expectedIds.length,
        note: catalogueNote(plan, cards.length, allFilms),
        verify,
      });
  }
  return jobs;
}

// Same shape as a searchHindiPlan result item, for replayed results.
const documentItem = (document) => ({
  id: document._id,
  title: document.title,
  year: document.metadata?.year,
  genres: document.metadata?.genres,
  cast: document.metadata?.cast,
  directors: document.metadata?.directors,
  averageRating: document.metadata?.average_rating,
  ratingCount: document.metadata?.rating_count,
});

async function realJobs() {
  const { getHindiRuntime, submittedHindiSearch } =
    await import("../lib/hindi-search/runtime.mjs");
  const runtime = await getHindiRuntime();
  // Empty-result candidates proposed by the judge must exist in the real catalogue.
  const verify = catalogueMatcher(
    runtime.documents.map((d) => ({
      title: d.title,
      year: d.metadata?.year,
      cast: d.metadata?.cast,
      directors: d.metadata?.directors,
    })),
  );
  if (replay) {
    const byId = new Map(runtime.documents.map((d) => [d._id, d]));
    const saved = (await readFile(replay, "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    return pick(saved).map((row) => ({
      id: row.id,
      query: row.query,
      script: row.script,
      category: row.category,
      kind: "real",
      replayKind: row.films.length ? "grade" : "empty",
      sourceRep: row.rep,
      verify,
      async search() {
        return {
          films: row.films.map((f) => ({
            id: f.id,
            card: filmCard(documentItem(byId.get(f.id))),
          })),
          plan: row.plan,
          note: row.note ?? {
            catalogueSize: runtime.documents.length,
            closestNames: [],
          },
          searchMs: row.searchMs,
        };
      },
      clearCache() {},
    }));
  }
  return pick(judgeQueries).map((q) => ({
    ...q,
    kind: "real",
    verify,
    // The page's own entry point; its cache is cleared per rep so each rep plans afresh.
    async search() {
      const started = performance.now();
      const response = await submittedHindiSearch(q.query, 10);
      const plan = response.queryPlan;
      return {
        films: response.results.items.map((film) => ({
          id: film.id,
          card: filmCard(film),
        })),
        plan: {
          mode: plan.interpretation.mode,
          fallbackReason: plan.interpretation.fallbackReason ?? null,
          usage: plan.interpretation.usage ?? null,
          blocked: plan.multilingual.blocked,
          unresolved: plan.unavailableFilters,
        },
        note: catalogueNote(plan, runtime.documents.length),
        searchMs: performance.now() - started,
      };
    },
    clearCache: () => runtime.interpretationCache.clear(),
  }));
}

const jobs = (
  set === "real" ? await realJobs() : await calibrationJobs()
).filter((job) => !kind || job.kind === kind || job.replayKind === kind);
if (!jobs.length) throw new Error("No cases selected");
const directory = path.resolve(
  argument(
    "--output",
    path.join(
      import.meta.dirname,
      "../../outputs/hindi-search-judge",
      `${set}-${new Date().toISOString().replaceAll(":", "-")}`,
    ),
  ),
);
await mkdir(directory, { recursive: true });
if (dryRun) {
  for (const job of jobs.filter((j) => j.kind !== "real"))
    console.log(
      JSON.stringify({
        id: job.id,
        kind: job.kind,
        query: job.query,
        films: job.films.map((f) => f.card.title),
        note: job.note,
      }),
    );
  console.log(`${jobs.length} judge calls per rep; dry run made no requests.`);
  process.exit(0);
}

const rows = [];
const errors = [];
for (let rep = 0; rep < reps; rep++) {
  if (set === "real") jobs[0].clearCache();
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        const label = `rep ${rep} ${job.id}${job.kind === "empty" ? " [empty probe]" : ""}`;
        const searched = job.kind === "real" ? await job.search() : job;
        try {
          const verdict = await callJudge({
            query: job.query,
            films: searched.films,
            mode: set === "real" ? "knowledge" : "metadata",
            catalogueNote: searched.note,
            verify: job.verify,
          });
          const films = verdict.grades.map((g) => {
            const film = searched.films.find((f) => f.id === g.id);
            return {
              id: g.id,
              title: film.card.title,
              year: film.card.year,
              grade: g.grade,
              reason: g.reason,
              ...(job.expected
                ? {
                    expected: job.expected.has(g.id),
                    agree: g.grade >= 2 === job.expected.has(g.id),
                  }
                : {}),
            };
          });
          const row = {
            id: job.id,
            rep,
            kind: job.kind,
            query: job.query,
            script: job.script,
            category: job.category,
            unresolved: job.unresolved,
            films,
            emptyResult: verdict.emptyResult,
            ...(job.kind === "empty"
              ? {
                  emptyExpected: job.emptyExpected,
                  agree: verdict.emptyResult.appropriate === job.emptyExpected,
                }
              : {}),
            ...(job.kind === "real"
              ? {
                  plan: searched.plan,
                  note: searched.note,
                  searchMs: searched.searchMs,
                  ...(job.sourceRep !== undefined
                    ? { sourceRep: job.sourceRep }
                    : {}),
                  ...judgedMetrics(
                    films.map((f) => f.grade),
                    verdict.emptyResult,
                  ),
                }
              : {}),
            judgeModel: verdict.call.servedModel,
            judgeUsage: verdict.usage,
            judgeMs: verdict.judgeMs,
            retries: verdict.retries,
          };
          rows.push(row);
          await appendFile(
            path.join(directory, "rows.jsonl"),
            `${JSON.stringify(row)}\n`,
          );
          const agreeText =
            job.kind === "grade"
              ? ` · agree ${films.filter((f) => f.agree).length}/${films.length}`
              : job.kind === "empty"
                ? ` · ${row.agree ? "agree" : "DISAGREE"}`
                : "";
          console.error(
            `${label}: ${films.map((f) => f.grade).join(",") || `empty ok=${verdict.emptyResult.appropriate}`}${agreeText}`,
          );
        } catch (error) {
          const failure = {
            id: job.id,
            rep,
            kind: job.kind,
            failureClass: error.message,
            retries: error.retries ?? 0,
            judgeModel: error.call?.servedModel ?? null,
            judgeUsage: error.usage ?? null,
          };
          errors.push(failure);
          await appendFile(
            path.join(directory, "errors.jsonl"),
            `${JSON.stringify(failure)}\n`,
          );
          console.error(`${label}: ERROR ${error.message}`);
        }
      }
    }),
  );
}

const mean = (values) => {
  const v = values.filter((x) => x !== null && x !== undefined).map(Number);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
// Interval over per-query means: reps of one query are correlated.
function perCaseCI(rowsIn, select) {
  const byCase = new Map();
  for (const row of rowsIn) {
    const value = select(row);
    if (value === null || value === undefined) continue;
    byCase.set(row.id, [...(byCase.get(row.id) ?? []), Number(value)]);
  }
  const means = [...byCase.values()].map(mean);
  const m = mean(means);
  if (means.length < 2) return { mean: m, ci95: null, n: means.length };
  const sd = Math.sqrt(
    means.reduce((s, x) => s + (x - m) ** 2, 0) / (means.length - 1),
  );
  const half = (1.96 * sd) / Math.sqrt(means.length);
  return {
    mean: m,
    ci95: [Math.max(0, m - half), Math.min(1, m + half)],
    n: means.length,
  };
}
const usage = [...rows, ...errors].reduce(
  (sum, r) => ({
    inputTokens: sum.inputTokens + (r.judgeUsage?.inputTokens ?? 0),
    outputTokens: sum.outputTokens + (r.judgeUsage?.outputTokens ?? 0),
    cachedInputTokens:
      sum.cachedInputTokens + (r.judgeUsage?.cachedInputTokens ?? 0),
  }),
  { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
);
const rates = ["INPUT", "OUTPUT", "CACHED_INPUT"].map((k) =>
  Number(process.env[`CINESEEK_JUDGE_${k}_USD_PER_MILLION`] ?? NaN),
);
const judgeCostUSD = rates.every((r) => Number.isFinite(r) && r >= 0)
  ? ((usage.inputTokens - usage.cachedInputTokens) * rates[0] +
      usage.outputTokens * rates[1] +
      usage.cachedInputTokens * rates[2]) /
    1e6
  : null;
// Judge variance: films whose grade differs between reps of the same case.
const gradesByFilm = new Map();
for (const row of rows)
  for (const film of row.films) {
    const key = `${row.id}:${film.id}`;
    gradesByFilm.set(key, [...(gradesByFilm.get(key) ?? []), film.grade]);
  }
const repeated = [...gradesByFilm.values()].filter((g) => g.length > 1);
const common = {
  attempts: rows.length + errors.length,
  errors: errors.length,
  retries: [...rows, ...errors].reduce((n, r) => n + (r.retries ?? 0), 0),
  judgeGradeInstability: repeated.length
    ? repeated.filter((g) => new Set(g).size > 1).length / repeated.length
    : null,
  judgeUsage: usage,
  judgeCostUSD,
  p95JudgeMs:
    rows.map((r) => r.judgeMs).sort((a, b) => a - b)[
      Math.ceil(rows.length * 0.95) - 1
    ] ?? null,
};
let summary;
if (set === "calibration") {
  const graded = rows.filter((r) => r.kind === "grade");
  const films = (filter = () => true) =>
    graded.filter(filter).flatMap((r) => r.films);
  const rate = (list, test) =>
    list.length ? list.filter(test).length / list.length : null;
  const clean = films((r) => !r.unresolved);
  summary = {
    ...common,
    filmAgreement: rate(films(), (f) => f.agree),
    filmAgreementSupportedOnly: rate(clean, (f) => f.agree),
    filmAgreementCI95: perCaseCI(graded, (r) =>
      mean(r.films.map((f) => f.agree)),
    ).ci95,
    positiveRecall: rate(
      films().filter((f) => f.expected),
      (f) => f.grade >= 2,
    ),
    negativeSpecificity: rate(
      films().filter((f) => !f.expected),
      (f) => f.grade <= 1,
    ),
    emptyProbeAgreement: rate(
      rows.filter((r) => r.kind === "empty"),
      (r) => r.agree,
    ),
    emptyProbeAgreementSupportedOnly: rate(
      rows.filter((r) => r.kind === "empty" && !r.unresolved),
      (r) => r.agree,
    ),
    disagreements: [
      ...graded.flatMap((r) =>
        r.films
          .filter((f) => !f.agree)
          .map(
            (f) =>
              `${r.id}#${r.rep}: ${f.title} graded ${f.grade}, gold ${f.expected ? "relevant" : "not relevant"}${r.unresolved ? " (unsupported-constraint case)" : ""}`,
          ),
      ),
      ...rows
        .filter((r) => r.kind === "empty" && !r.agree)
        .map(
          (r) =>
            `${r.id}#${r.rep}: empty result judged ${r.emptyResult.appropriate ? "appropriate" : "wrong"}, gold ${r.emptyExpected ? "appropriate" : "wrong"}${r.unresolved ? " (unsupported-constraint case)" : ""}`,
        ),
    ],
  };
} else {
  const shown = rows.filter((r) => r.films.length);
  summary = {
    ...common,
    plannerModel: process.env.OPENAI_MODEL ?? null,
    ndcg10: perCaseCI(shown, (r) => r.ndcg10),
    precision5: perCaseCI(shown, (r) => r.precision5),
    top1Relevant: perCaseCI(shown, (r) => r.top1Relevant),
    zeroRelevantRate: perCaseCI(shown, (r) => r.zeroRelevant),
    emptyCount: rows.length - shown.length,
    correctEmptyRate: mean(
      rows.filter((r) => !r.films.length).map((r) => r.emptyCorrect),
    ),
    plannerFallbacks: rows.filter((r) => r.plan.mode === "fallback").length,
    byScript: Object.fromEntries(
      [...new Set(rows.map((r) => r.script))].map((s) => {
        const sub = shown.filter((r) => r.script === s);
        return [
          s,
          {
            queries: sub.length,
            ndcg10: mean(sub.map((r) => r.ndcg10)),
            precision5: mean(sub.map((r) => r.precision5)),
          },
        ];
      }),
    ),
  };
}
const report = {
  generatedAt: new Date().toISOString(),
  set,
  judgeModel,
  judgePromptVersion: JUDGE_PROMPT_VERSION,
  plannerPromptVersion: PROMPT_VERSION,
  reps,
  note:
    set === "calibration"
      ? "Judge graded synthetic fixture films (metadata only) against gold expected IDs: grade >= 2 counts as relevant. Unsupported-constraint cases are reported separately because gold follows supported semantics while the rubric grades the full query."
      : "Judge graded the top 10 results of approved drafted queries on the real corpus using catalogue metadata plus its own film knowledge. Judged nDCG@10 uses only returned films as the ideal ranking, so relevant films that were never retrieved are invisible to it; read it alongside precision@5 and the zero-relevant rate.",
  summary,
  rows,
  errors,
};
await writeFile(
  path.join(directory, "report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
await writeFile(path.join(directory, "report.md"), renderReport(report));
console.log(
  JSON.stringify(
    {
      output: directory,
      set,
      judgeModel,
      summary: { ...summary, disagreements: undefined, byScript: undefined },
    },
    null,
    2,
  ),
);

function renderReport(r) {
  const pct = (v) => (v == null ? "N/A" : `${(v * 100).toFixed(1)}%`);
  const ci = (s) =>
    s?.ci95 ? ` (95% CI ${pct(s.ci95[0])}-${pct(s.ci95[1])})` : "";
  const cell = (v) =>
    String(v ?? "")
      .replaceAll("|", "\\|")
      .replaceAll("\n", " ");
  const s = r.summary;
  let head = `# Hindi search LLM judge: ${r.set}\n\n${r.note}\n\nJudge: **${r.judgeModel}** (${r.judgePromptVersion}) · Reps: **${r.reps}** · Attempts: **${s.attempts}** · Errors excluded: **${s.errors}** · Retries: ${s.retries} · Judge grade instability across reps: ${pct(s.judgeGradeInstability)}\n\n`;
  if (r.set === "calibration")
    head +=
      `Film-level agreement with gold: **${pct(s.filmAgreement)}**${s.filmAgreementCI95 ? ` (95% CI ${pct(s.filmAgreementCI95[0])}-${pct(s.filmAgreementCI95[1])})` : ""}; supported-constraint cases only: **${pct(s.filmAgreementSupportedOnly)}**. Relevant films graded >= 2: ${pct(s.positiveRecall)}. Irrelevant films graded <= 1: ${pct(s.negativeSpecificity)}. Empty-result probes: ${pct(s.emptyProbeAgreement)} (supported-constraint only: ${pct(s.emptyProbeAgreementSupportedOnly)}).\n\n` +
      `## Disagreements\n\n${s.disagreements.map((d) => `- ${cell(d)}`).join("\n") || "None."}\n\n`;
  else
    head +=
      `Judged nDCG@10: **${s.ndcg10.mean?.toFixed(3) ?? "N/A"}**${s.ndcg10.ci95 ? ` (95% CI ${s.ndcg10.ci95[0].toFixed(3)}-${s.ndcg10.ci95[1].toFixed(3)})` : ""} · Precision@5: **${pct(s.precision5.mean)}**${ci(s.precision5)} · Top-1 relevant: **${pct(s.top1Relevant.mean)}** · Zero-relevant queries: **${pct(s.zeroRelevantRate.mean)}** · Empty results: ${s.emptyCount} (judged correct: ${pct(s.correctEmptyRate)}) · Planner fallbacks: ${s.plannerFallbacks}\n\n` +
      `| Script | Queries | nDCG@10 | P@5 |\n| --- | --- | --- | --- |\n${Object.entries(
        s.byScript,
      )
        .map(
          ([k, v]) =>
            `| ${k} | ${v.queries} | ${v.ndcg10?.toFixed(3) ?? "N/A"} | ${pct(v.precision5)} |`,
        )
        .join("\n")}\n\n`;
  head += `Judge tokens: ${s.judgeUsage.inputTokens} input, ${s.judgeUsage.outputTokens} output. Judge cost: ${s.judgeCostUSD == null ? "set CINESEEK_JUDGE_*_USD_PER_MILLION to price" : `$${s.judgeCostUSD.toFixed(4)}`}.\n\n## Queries\n\n`;
  return (
    head +
    r.rows
      .map((row) => {
        const meta = row.plan
          ? `Planner: ${row.plan.mode}${row.plan.fallbackReason ? ` (${row.plan.fallbackReason})` : ""}${row.plan.unresolved.length ? ` · unresolved: ${cell(row.plan.unresolved.join(", "))}` : ""} · nDCG@10 ${row.ndcg10?.toFixed(3) ?? "N/A"} · P@5 ${pct(row.precision5)}\n\n`
          : row.unresolved
            ? "Unsupported-constraint case.\n\n"
            : "";
        const body = row.films.length
          ? `| # | Film | Grade | ${row.films[0].expected !== undefined ? "Gold | " : ""}Reason |\n| --- | --- | --- | ${row.films[0].expected !== undefined ? "--- | " : ""}--- |\n` +
            row.films
              .map(
                (f, i) =>
                  `| ${i + 1} | ${cell(f.title)} (${f.year ?? "?"}) | ${f.grade} | ${f.expected !== undefined ? `${f.expected ? "relevant" : "-"}${f.agree ? "" : " ✗"} | ` : ""}${cell(f.reason)} |`,
              )
              .join("\n")
          : `No results. Judge: empty result ${row.emptyResult.appropriate ? "appropriate" : "NOT appropriate"}${row.emptyExpected !== undefined ? ` (gold: ${row.emptyExpected ? "appropriate" : "not appropriate"}${row.agree ? "" : " ✗"})` : ""}. Judge candidates: ${cell(row.emptyResult.candidateFilms.map((c) => `${c.title} (${c.year ?? "?"})`).join(", ") || "none")}; found in catalogue: ${cell(row.emptyResult.satisfyingFilm ?? "none")}. ${cell(row.emptyResult.reason)}`;
        return `### ${cell(row.id)} (rep ${row.rep}${row.kind === "empty" ? ", empty probe" : ""})\n\n\`${cell(row.query)}\`\n\n${meta}${body}\n`;
      })
      .join("\n") +
    `\n## Errors\n\n${r.errors.map((e) => `- ${cell(e.id)} rep ${e.rep}: ${e.failureClass} after ${e.retries} retries`).join("\n") || "None."}\n`
  );
}
