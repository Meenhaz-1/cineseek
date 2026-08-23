export type EditDistanceRecord = {
  id: string;
  title: string;
  year: number | null;
};
export type EditDistanceScore = EditDistanceRecord & {
  queryText: string;
  titleText: string;
  editDistance: number;
  maximumLength: number;
  editSimilarity: number;
};
export type EditDistanceScoring = {
  method: "normalized_levenshtein";
  candidateCount: number;
  candidatesPreview: EditDistanceScore[];
  truncated: boolean;
};

export function normalizeForEditDistance(value: unknown): string;
export function levenshteinDistance(
  leftValue: unknown,
  rightValue: unknown,
): number;
export function scoreEditDistanceCandidate(
  normalizedQuery: string,
  record: EditDistanceRecord,
): EditDistanceScore;
export function scoreEditDistanceCandidates(
  records: Map<string, EditDistanceRecord>,
  candidateIds: string[],
  normalizedQuery: string,
  previewLimit?: number,
): EditDistanceScoring;
