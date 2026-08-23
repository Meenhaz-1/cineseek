import { queryTitleTokens, titleTokens } from "./title-token-index.mjs";

export function scoreTokenCoverageCandidate(normalizedQuery, record) {
  const queryTokens = queryTitleTokens(normalizedQuery).tokens;
  const candidateTokens = titleTokens(record.title);
  const candidateTokenSet = new Set(candidateTokens);
  const matchedTokens = queryTokens.filter((token) =>
    candidateTokenSet.has(token),
  );
  const missingTokens = queryTokens.filter(
    (token) => !candidateTokenSet.has(token),
  );
  return {
    ...record,
    queryTokens,
    candidateTokens,
    matchedTokens,
    missingTokens,
    matchedTokenCount: matchedTokens.length,
    queryTokenCount: queryTokens.length,
    coverage: queryTokens.length
      ? Number((matchedTokens.length / queryTokens.length).toFixed(4))
      : 0,
  };
}

export function scoreTokenCoverageCandidates(
  records,
  candidateIds,
  normalizedQuery,
  previewLimit = 12,
) {
  const candidates = candidateIds
    .map((id) => records.get(id))
    .filter(Boolean)
    .map((record) => scoreTokenCoverageCandidate(normalizedQuery, record))
    .sort(
      (left, right) =>
        right.coverage - left.coverage ||
        right.matchedTokenCount - left.matchedTokenCount ||
        left.candidateTokens.length - right.candidateTokens.length ||
        left.title.localeCompare(right.title),
    );
  return {
    method: "exact_query_token_coverage",
    candidateCount: candidates.length,
    queryTokens: queryTitleTokens(normalizedQuery).tokens,
    candidatesPreview: candidates.slice(0, previewLimit),
    truncated: candidates.length > previewLimit,
  };
}
