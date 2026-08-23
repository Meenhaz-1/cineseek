import type { ExactTitleDocument } from "./exact-title-index.mjs";

export type CharacterTrigramRecord = {
  id: string;
  title: string;
  year: number | null;
  trigramCount: number;
};
export type CharacterTrigramIndex = {
  byTrigram: Map<string, string[]>;
  records: Map<string, CharacterTrigramRecord>;
  titleCount: number;
  trigramCount: number;
  postingCount: number;
};
export type CharacterTrigramLookup = {
  trigrams: string[];
  minimumMatches: number;
  postings: {
    trigram: string;
    documentFrequency: number;
    movieIdsPreview: string[];
    truncated: boolean;
  }[];
  candidateIds: string[];
  candidateCount: number;
  candidatesPreview: (CharacterTrigramRecord & {
    matchedTrigrams: number;
    queryTrigramCount: number;
    unionTrigramCount: number;
    coverage: number;
    jaccard: number;
    dice: number;
  })[];
  truncated: boolean;
};
export type CharacterTrigramScore = CharacterTrigramRecord & {
  matchedTrigrams: number;
  queryTrigramCount: number;
  unionTrigramCount: number;
  jaccard: number;
  dice: number;
};
export type CharacterTrigramScoring = {
  method: "dice";
  candidateCount: number;
  candidatesPreview: CharacterTrigramScore[];
  truncated: boolean;
};

export function characterTrigrams(value: unknown): string[];
export function buildCharacterTrigramIndex(
  documents: ExactTitleDocument[],
): CharacterTrigramIndex;
export function lookupCharacterTrigrams(
  index: CharacterTrigramIndex,
  normalizedQuery: string,
  previewLimit?: number,
): CharacterTrigramLookup;
export function scoreCharacterTrigramCandidate(
  queryTrigrams: string[],
  record: CharacterTrigramRecord,
): CharacterTrigramScore;
export function scoreCharacterTrigramCandidates(
  index: CharacterTrigramIndex,
  candidateIds: string[],
  normalizedQuery: string,
  previewLimit?: number,
): CharacterTrigramScoring;
