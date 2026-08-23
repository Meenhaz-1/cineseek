export type ExactTitleDocument = {
  _id: string | number;
  title: string;
  metadata?: { year?: number | null };
};
export type ExactTitleMatch = {
  id: string;
  title: string;
  sourceTitle: string;
  year: number | null;
};
export type ExactTitleIndex = {
  byKey: Map<string, ExactTitleMatch[]>;
  titleCount: number;
  keyCount: number;
  collisionCount: number;
};

export function exactTitleKey(value: unknown): string;
export function displayMovieLensTitle(title: string): string;
export function buildExactTitleIndex(
  documents: ExactTitleDocument[],
): ExactTitleIndex;
export function lookupExactTitle(
  index: ExactTitleIndex,
  normalizedQuery: string,
): { lookupKey: string; matches: ExactTitleMatch[] };
