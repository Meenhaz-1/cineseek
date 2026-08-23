import type { TitleTokenRecord } from "./title-token-index.mjs";

export type OrderedTokenAlignment = {
  token: string;
  queryIndex: number;
  titleIndex: number;
};
export type OrderedTokenProximityCandidate = TitleTokenRecord & {
  queryTokens: string[];
  candidateTokens: string[];
  alignment: OrderedTokenAlignment[];
  matchedTokens: string[];
  missingTokens: string[];
  matchedTitleIndexes: number[];
  matchedTokenCount: number;
  queryTokenCount: number;
  tokenCoverage: number;
  orderedCoverage: number;
  matchSpan: number;
  gapCount: number;
  proximity: number;
  phraseMatch: boolean;
};

export function orderedTitleTokens(value: unknown): string[];
export function alignOrderedTokens(
  queryTokens: string[],
  candidateTokens: string[],
): OrderedTokenAlignment[];
export function scoreOrderedTokenProximityCandidate(
  normalizedQuery: string,
  record: TitleTokenRecord,
): OrderedTokenProximityCandidate;
export function scoreOrderedTokenProximityCandidates(
  records: Map<string, TitleTokenRecord>,
  candidateIds: string[],
  normalizedQuery: string,
  previewLimit?: number,
): {
  method: "ordered_token_proximity";
  candidateCount: number;
  queryTokens: string[];
  candidatesPreview: OrderedTokenProximityCandidate[];
  truncated: boolean;
};
