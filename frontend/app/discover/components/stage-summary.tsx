export function StageSummary({
  number,
  title,
  description,
  takeaway,
  outcome,
}: {
  number: number | string;
  title: string;
  description: string;
  takeaway: string;
  outcome: string;
}) {
  return (
    <summary className="stageSummary">
      <span className="stageSummaryInner">
        <span className="stageNumber">{number}</span>
        <span className="stageSummaryCopy">
          <b>{title}</b>
          <small>{description}</small>
          <small className="stageTakeaway">
            <em>Key takeaway</em>
            {takeaway}
          </small>
        </span>
        <span className="stageOutcome">{outcome}</span>
        <span className="stageChevron" aria-hidden="true">
          ⌄
        </span>
      </span>
    </summary>
  );
}
