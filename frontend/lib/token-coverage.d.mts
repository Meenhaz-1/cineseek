import type { TitleTokenRecord } from "./title-token-index.mjs";

export type TokenCoverageCandidate = TitleTokenRecord & {
  queryTokens: string[];
  candidateTokens: string[];
  matchedTokens: string[];
  missingTokens: string[];
  matchedTokenCount: number;
  queryTokenCount: number;
  coverage: number;
};

export function scoreTokenCoverageCandidate(
  normalizedQuery: string,
  record: TitleTokenRecord,
): TokenCoverageCandidate;
export function scoreTokenCoverageCandidates(
  records: Map<string, TitleTokenRecord>,
  candidateIds: string[],
  normalizedQuery: string,
  previewLimit?: number,
): {
  method: "exact_query_token_coverage";
  candidateCount: number;
  queryTokens: string[];
  candidatesPreview: TokenCoverageCandidate[];
  truncated: boolean;
};
