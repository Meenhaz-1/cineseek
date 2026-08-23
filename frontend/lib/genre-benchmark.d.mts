export type GenreNomination = { source: string; rank: number };
export type GenreReview = {
  queryId: string;
  docId: string;
  reviewerId: string;
  grade: number;
  notes: string;
  reviewedAt: string;
};
export type GenreAdjudication = {
  queryId: string;
  docId: string;
  finalGrade: number;
  adjudicatorId: string;
  notes: string;
  adjudicatedAt: string;
};
export type GenrePoolQuery = {
  queryId: string;
  queryText: string;
  intendedGenres: string[];
  documents: { docId: string; nominations: GenreNomination[] }[];
};
export type GenreReviewState = {
  version: number;
  status: "frozen" | "published";
  createdAt: string;
  publishedAt?: string;
  corpusKey: string;
  queryIds: string[];
  pool: GenrePoolQuery[];
  reviews: GenreReview[];
  adjudications: GenreAdjudication[];
};
export type GenreRecord = {
  id: string;
  title: string;
  year: number | null;
  genres: string[];
  tags: string[];
  overview: string;
  averageRating: number | null;
  ratingCount: number;
};
export const GENRE_QUERY_IDS: string[];
export const GENRE_REVIEW_VERSION: number;
export const POOL_LIMIT: number;
export const STRATEGY_DEPTH: number;
export function reviewRevision(state: unknown): string;
export function buildGenreReviewPool(input: {
  queries: { id: string; text: string }[];
  qrels: { queryId: string; corpusId: string; score: number }[];
  records: Map<string, GenreRecord>;
  currentResultsByQuery: Map<string, string[]>;
  baselineResultsByQuery: Map<string, string[]>;
  corpusKey: string;
  createdAt?: string;
}): GenreReviewState;
export function upsertReview(
  state: GenreReviewState,
  input: {
    queryId: string;
    docId: string;
    reviewerId: string;
    grade: number;
    notes?: string;
  },
  reviewedAt?: string,
): GenreReviewState;
export function upsertAdjudication(
  state: GenreReviewState,
  input: {
    queryId: string;
    docId: string;
    adjudicatorId: string;
    finalGrade: number;
    notes?: string;
  },
  adjudicatedAt?: string,
): GenreReviewState;
export function judgmentStatus(
  state: GenreReviewState,
  queryId: string,
  docId: string,
): {
  reviews: GenreReview[];
  conflict: boolean;
  adjudication?: GenreAdjudication;
  finalGrade: number | null;
};
export function reviewProgress(state: GenreReviewState): {
  queryId: string;
  poolSize: number;
  twiceReviewed: number;
  conflicts: number;
  finalized: number;
}[];
export type GenrePublicationQueryReadiness = {
  queryId: string;
  top10Count: number;
  inPoolCount: number;
  finalizedCount: number;
  missingFromPool: { docId: string; title: string }[];
  awaitingReviews: {
    docId: string;
    title: string;
    reviewCount: number;
    conflict: boolean;
  }[];
  actionRequired: "expand_pool" | "complete_reviews" | "none";
  ready: boolean;
};
export function genrePublicationReadiness(
  state: GenreReviewState,
  currentResultsByQuery: Map<string, string[]>,
  records: Map<string, GenreRecord>,
): {
  publishable: boolean;
  poolReviewComplete: boolean;
  queries: GenrePublicationQueryReadiness[];
};
export function serializeGenreReviewedV1(
  state: GenreReviewState,
  queries: { id: string; text: string }[],
): { queries: string; qrels: string; audit: string; pool: string };
