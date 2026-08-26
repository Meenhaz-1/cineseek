export function StageSummary({
  number,
  title,
  technicalTitle,
  description,
  takeaway,
  outcome,
}: {
  number: number | string;
  title: string;
  technicalTitle: string;
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
          <small className="technicalLabel">Technical: {technicalTitle}</small>
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
