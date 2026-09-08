const sorted = (values) => [...values].sort();
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function assessCase(item, plan, result, { live = false } = {}) {
  const expected = item.expected;
  const actualIds = result.items.map((r) => r.id);
  const checks = {
    execution:
      !live ||
      (expected.fastPath
        ? plan.interpretation.mode === (expected.localMode ?? "exact_alias")
        : plan.interpretation.mode === "model"),
    people: equal(
      sorted(plan.entities.people.map((p) => p.id)),
      sorted(expected.people),
    ),
    roles: Object.entries(expected.roles ?? {}).every(
      ([id, role]) =>
        plan.entities.people.find((p) => p.id === id)?.role === role,
    ),
    title: equal(
      sorted(plan.multilingual.titleMatches.map((m) => m.id)),
      sorted(expected.titleIds),
    ),
    genres: equal(sorted(plan.filters.genres), sorted(expected.genres)),
    genreMode:
      expected.genres.length < 2 ||
      plan.filters.genreMode === expected.genreMode,
    filters: ["yearMin", "yearMax", "ratingMin", "ratingCountMin"].every(
      (key) => (plan.filters[key] ?? null) === (expected.filters[key] ?? null),
    ),
    sort:
      (plan.sort?.field ?? null) === (expected.sort?.field ?? null) &&
      (plan.sort?.direction ?? null) === (expected.sort?.direction ?? null),
    blocked: plan.multilingual.blocked === expected.blocked,
    unresolved:
      expected.unresolvedKind === "explicit"
        ? plan.unavailableFilters.length > 0
        : expected.unresolvedKind
          ? plan.unavailableFilters.some((s) =>
              s.startsWith(expected.unresolvedKind),
            )
          : plan.unavailableFilters.length === 0,
    results: equal(sorted(actualIds), sorted(item.expectedIds)),
    order: !expected.ordered || equal(actualIds, item.expectedIds),
  };
  const relevant = new Set(item.expectedIds);
  const hits = actualIds.filter((id) => relevant.has(id)).length;
  const first = actualIds.findIndex((id) => relevant.has(id));
  const dcg = actualIds
    .slice(0, 10)
    .reduce(
      (sum, id, index) =>
        sum + (relevant.has(id) ? 1 / Math.log2(index + 2) : 0),
      0,
    );
  const ideal = item.expectedIds
    .slice(0, 10)
    .reduce((sum, _, i) => sum + 1 / Math.log2(i + 2), 0);
  return {
    passed: Object.values(checks).every(Boolean),
    checks,
    failedChecks: Object.entries(checks)
      .filter(([, pass]) => !pass)
      .map(([name]) => name),
    recall: relevant.size ? hits / relevant.size : null,
    precision: actualIds.length
      ? hits / actualIds.length
      : relevant.size
        ? 0
        : null,
    mrr: relevant.size ? (first === -1 ? 0 : 1 / (first + 1)) : null,
    ndcg10: ideal ? dcg / ideal : null,
    actual: {
      people: plan.entities.people,
      titleIds: plan.multilingual.titleMatches.map((m) => m.id),
      filters: plan.filters,
      sort: plan.sort,
      blocked: plan.multilingual.blocked,
      unresolved: plan.unavailableFilters,
      resultIds: actualIds,
    },
  };
}
const average = (rows, select) => {
  const values = rows.map(select).filter((n) => n !== null && n !== undefined);
  return values.length
    ? values.reduce((sum, n) => sum + Number(n), 0) / values.length
    : null;
};
export function summarizeCases(rows) {
  const times = rows.map((r) => r.endToEndMs).sort((a, b) => a - b);
  const modelRows = rows.filter((r) => !r.fastPath);
  return {
    count: rows.length,
    passed: rows.filter((r) => r.passed).length,
    passRate: average(rows, (r) => r.passed),
    modelRequiredCount: modelRows.length,
    modelResponseRate: average(modelRows, (r) => r.mode === "model"),
    modelCasePassRate: average(modelRows, (r) => r.passed),
    entityAccuracy: average(
      rows,
      (r) => r.checks.people && r.checks.title && r.checks.roles,
    ),
    constraintAccuracy: average(
      rows,
      (r) =>
        r.checks.filters &&
        r.checks.genres &&
        r.checks.genreMode &&
        r.checks.sort,
    ),
    resultAccuracy: average(rows, (r) => r.checks.results && r.checks.order),
    recall: average(rows, (r) => r.recall),
    precision: average(rows, (r) => r.precision),
    mrr: average(rows, (r) => r.mrr),
    ndcg10: average(rows, (r) => r.ndcg10),
    p50Ms: times[Math.ceil(times.length * 0.5) - 1] ?? null,
    p95Ms: times[Math.ceil(times.length * 0.95) - 1] ?? null,
    fallbackReasons: Object.fromEntries(
      [...new Set(rows.map((r) => r.fallbackReason).filter(Boolean))].map(
        (reason) => [
          reason,
          rows.filter((r) => r.fallbackReason === reason).length,
        ],
      ),
    ),
    usage: rows.reduce(
      (sum, row) => ({
        inputTokens: sum.inputTokens + (row.usage?.inputTokens ?? 0),
        outputTokens: sum.outputTokens + (row.usage?.outputTokens ?? 0),
        cachedInputTokens:
          sum.cachedInputTokens + (row.usage?.cachedInputTokens ?? 0),
        unreportedCalls:
          sum.unreportedCalls + Number(!row.fastPath && !row.usage),
      }),
      {
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        unreportedCalls: 0,
      },
    ),
  };
}
export function renderEvaluation(report) {
  const percent = (value) =>
    value == null ? "N/A" : `${(value * 100).toFixed(1)}%`;
  const cell = (value) =>
    String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
  return (
    `# Hindi / Hinglish search evaluation\n\n${report.note}\n\nMode: **${report.mode}** · Model: **${report.model}** · Effort: **${report.reasoning ?? "model default"}** · Prompt: **${report.promptVersion}**\n\nPassed **${report.summary.passed}/${report.summary.count}** cases. Model response rate: **${percent(report.summary.modelResponseRate)}**. P95: **${report.summary.p95Ms?.toFixed(0)} ms**.\n\n` +
    `| Script | Passed | Model response rate | Constraint accuracy |\n| --- | --- | --- | --- |\n` +
    Object.entries(report.byScript)
      .map(
        ([script, s]) =>
          `| ${script} | ${s.passed}/${s.count} | ${percent(s.modelResponseRate)} | ${percent(s.constraintAccuracy)} |`,
      )
      .join("\n") +
    `\n\n## Cases\n\n| ID | Query | Outcome | Mode | Failed checks |\n| --- | --- | --- | --- | --- |\n` +
    report.rows
      .map(
        (row) =>
          `| ${cell(row.id)} | ${cell(row.query)} | ${row.passed ? "PASS" : "FAIL"} | ${cell(row.mode + (row.fallbackReason ? ` (${row.fallbackReason})` : ""))} | ${row.failedChecks.join(", ")} |`,
      )
      .join("\n") +
    `\n\n## Failures\n\n` +
    (report.rows
      .filter((r) => !r.passed)
      .map(
        (row) =>
          `### ${row.id}\n\n${row.query}\n\nExpected:\n\n\`\`\`json\n${JSON.stringify(row.expected, null, 2)}\n\`\`\`\n\nActual:\n\n\`\`\`json\n${JSON.stringify(row.actual, null, 2)}\n\`\`\`\n`,
      )
      .join("\n") || "None.\n") +
    `\nToken usage: ${report.summary.usage.inputTokens} input, ${report.summary.usage.outputTokens} output. ${report.summary.usage.unreportedCalls} calls have unreported usage; timeouts can still incur provider charges. Estimated cost: ${report.estimatedCostUSD === null ? "not available" : `$${report.estimatedCostUSD.toFixed(6)}`} (reported usage only).\n`
  );
}
