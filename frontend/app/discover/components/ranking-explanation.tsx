import type { ReactNode } from "react";

export function RankingExplanation({
  candidateCount,
  children,
  error,
  loading,
  query,
  topTitle,
}: {
  candidateCount?: number;
  children: ReactNode;
  error?: string;
  loading: boolean;
  query: string;
  topTitle?: string;
}) {
  const outcome = loading
    ? "Working…"
    : error
      ? "Details unavailable"
      : candidateCount !== undefined
        ? `${candidateCount.toLocaleString()} possible movies`
        : "Ready to explain";

  return (
    <section
      className="titleLookupLab rankingExplanation"
      aria-labelledby="ranking-explanation-heading"
    >
      <p className="srOnly" role="status" aria-live="polite">
        {loading
          ? `Building the ranking explanation for ${query}.`
          : error
            ? `The ranking explanation for ${query} is unavailable.`
            : `The ranking explanation for ${query} is ready${topTitle ? `. The top result is ${topTitle}.` : "."}`}
      </p>
      <details className="rankingExplanationDisclosure">
        <summary className="rankingExplanationSummary">
          <span className="rankingExplanationIcon" aria-hidden="true">
            ?
          </span>
          <span>
            <small className="sectionKicker">Results, explained</small>
            <b id="ranking-explanation-heading">
              How CineSeek found and ranked these movies
            </b>
            <small>
              CineSeek found possible movies, compared each match, and combined
              the evidence to choose the order.
            </small>
          </span>
          <span className="rankingExplanationOutcome">{outcome}</span>
          <span className="stageChevron" aria-hidden="true">
            ⌄
          </span>
        </summary>
        <div className="rankingExplanationContent">
          {error ? (
            <p className="lookupMessage error" role="alert">
              {error}
            </p>
          ) : (
            children
          )}
        </div>
      </details>
    </section>
  );
}

export function RankingStageGroup({
  children,
  description,
  number,
  technicalLabel,
  title,
}: {
  children: ReactNode;
  description: string;
  number: string;
  technicalLabel: string;
  title: string;
}) {
  return (
    <details className="rankingStageGroup">
      <summary>
        <span className="rankingGroupNumber">{number}</span>
        <span>
          <b>{title}</b>
          <small>{description}</small>
          <small className="technicalLabel">Technical: {technicalLabel}</small>
        </span>
        <span className="stageChevron" aria-hidden="true">
          ⌄
        </span>
      </summary>
      <div className="rankingStageGroupContent">{children}</div>
    </details>
  );
}
