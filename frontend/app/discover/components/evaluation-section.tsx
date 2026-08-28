import benchmarkSummary from "../../../data/benchmark-summary.json";
import type { ParserTestState } from "../search-contracts";

export function EvaluationSection({
  parserTests,
  onRunParserTests,
}: {
  parserTests: ParserTestState;
  onRunParserTests: () => void;
}) {
  return (
    <section className="metrics" id="evaluation">
      <div className="sectionHeading">
        <div>
          <span className="sectionKicker">Quality at a glance</span>
          <h2>Evaluation snapshot</h2>
        </div>
        <p>{benchmarkSummary.label}</p>
      </div>
      <div className="metricGrid">
        {[
          ["nDCG@10", benchmarkSummary.ndcgAt10.toFixed(3), "graded ranking"],
          ["MRR", benchmarkSummary.mrr.toFixed(3), "first relevant result"],
          [
            "Candidate recall",
            benchmarkSummary.candidateRecall.toFixed(3),
            "pooled relevance",
          ],
          [
            "p95 latency",
            `${benchmarkSummary.p95LatencyMs.toFixed(1)} ms`,
            "warm local run",
          ],
        ].map(([label, value, context]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{context}</small>
          </article>
        ))}
      </div>
      <p className="demoNotice">
        <span>i</span> Provisional evidence from{" "}
        {benchmarkSummary.evaluatedQueries} queries with incomplete human
        judgments; missing runs: {benchmarkSummary.missingQueries}.{" "}
        {benchmarkSummary.methodology}
      </p>
      <section
        className="parserTestWorkbench"
        aria-labelledby="parser-test-title"
      >
        <div className="parserTestHeader">
          <div>
            <h2 id="parser-test-title">Query parser verification</h2>
            <p>
              Runs every workbook case marked Supported against the same
              deterministic planner used by search.
            </p>
          </div>
          <button
            type="button"
            onClick={onRunParserTests}
            disabled={parserTests.status === "running"}
          >
            {parserTests.status === "running"
              ? "Running…"
              : parserTests.status === "ready"
                ? "Run again"
                : "Run parser cases"}
          </button>
        </div>
        <div className="parserTestOutput" aria-live="polite">
          {parserTests.status === "idle" && (
            <p className="parserTestEmpty">
              Run the cases to replace labels with measured pass and failure
              counts.
            </p>
          )}
          {parserTests.status === "running" && (
            <p className="parserTestEmpty">
              Reading the workbook and comparing expected fields…
            </p>
          )}
          {parserTests.status === "error" && (
            <p className="parserTestError">{parserTests.error}</p>
          )}
          {parserTests.status === "ready" && parserTests.report && (
            <>
              <div className="parserTestStats">
                <div>
                  <span>Passed</span>
                  <strong>{parserTests.report.totals.passed}</strong>
                  <small>
                    of {parserTests.report.totals.executed} executed
                  </small>
                </div>
                <div>
                  <span>Failed</span>
                  <strong>{parserTests.report.totals.failed}</strong>
                  <small>needs investigation</small>
                </div>
                <div>
                  <span>Planned</span>
                  <strong>{parserTests.report.totals.planned}</strong>
                  <small>not executed</small>
                </div>
                <div>
                  <span>Pass rate</span>
                  <strong>
                    {Math.round(
                      (parserTests.report.totals.passed /
                        Math.max(1, parserTests.report.totals.executed)) *
                        100,
                    )}
                    %
                  </strong>
                  <small>
                    {new Date(
                      parserTests.report.generatedAt,
                    ).toLocaleTimeString()}
                  </small>
                </div>
              </div>
              <details
                className="parserFailures"
                open={parserTests.report.totals.failed > 0}
              >
                <summary>
                  {parserTests.report.totals.failed
                    ? `${parserTests.report.totals.failed} failing cases`
                    : "All executed cases pass"}
                </summary>
                <div>
                  {parserTests.report.results
                    .filter((result) => !result.passed)
                    .map((result) => (
                      <article key={result.caseId}>
                        <header>
                          <code>{result.caseId}</code>
                          <span>{result.category}</span>
                        </header>
                        <p>“{result.query}”</p>
                        <ul>
                          {result.mismatches.map((mismatch) => (
                            <li key={mismatch.field}>
                              <b>{mismatch.field}</b>
                              <span>Expected: {mismatch.expected}</span>
                              <span>Actual: {mismatch.actual}</span>
                            </li>
                          ))}
                        </ul>
                      </article>
                    ))}
                </div>
              </details>
              <details className="parserPassed">
                <summary>
                  {parserTests.report.totals.passed} passing cases
                </summary>
                <div>
                  {parserTests.report.results
                    .filter((result) => result.passed)
                    .map((result) => (
                      <article key={result.caseId}>
                        <span className="caseStatus" aria-label="Passed">
                          ✓
                        </span>
                        <code>{result.caseId}</code>
                        <span>{result.category}</span>
                        <p>“{result.query}”</p>
                      </article>
                    ))}
                </div>
              </details>
            </>
          )}
        </div>
      </section>
    </section>
  );
}
