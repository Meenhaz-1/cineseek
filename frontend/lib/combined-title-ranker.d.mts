import type { TitleTokenRecord } from "./title-token-index.mjs";
import type { FieldMatchSummary } from "./field-aware-index.mjs";

export type CombinedWeightKey =
  | "tokenCoverage"
  | "orderedCoverage"
  | "phraseMatch"
  | "proximity"
  | "dice"
  | "editSimilarity";
export type CombinedWeights = Record<CombinedWeightKey, number>;
export type GenreWeightKey = "genreFocus" | "bayesianRating" | "ratingEvidence";
export type GenreWeights = Record<GenreWeightKey, number>;
export type PersonPopularityBoost = {
  entityId: string;
  name: string;
  role: "actor" | "director";
  movieCount: number;
  roleMovieCount: number;
  occurrence: number;
  signal: number;
  decay: number;
  contribution: number;
};
export type CombinedTitleCandidate = TitleTokenRecord & {
  signals: CombinedWeights;
  contributions: CombinedWeights;
  titleScore: number;
  fieldScore: number;
  fieldMatch?: FieldMatchSummary;
  combinedScore: number;
  metadataGenreMatchCount: number;
  genreFocus: number;
  averageRatingEligible: boolean;
  bayesianRating: number;
  ratingEvidence: number;
  structuredGenreSignals: GenreWeights;
  structuredGenreContributions: GenreWeights;
  structuredGenreScore: number;
  isExactTitleMatch: boolean;
  baseCombinedScore?: number;
  personPopularityBoost?: PersonPopularityBoost;
};

export const COMBINED_WEIGHT_KEYS: CombinedWeightKey[];
export const DEFAULT_COMBINED_WEIGHTS: CombinedWeights;
export const GENRE_WEIGHT_KEYS: GenreWeightKey[];
export const SINGLE_GENRE_DISCOVERY_WEIGHTS: GenreWeights;
export const COMPOUND_GENRE_DISCOVERY_WEIGHTS: GenreWeights;
export const BAYESIAN_RATING_PRIOR: number;
export const MIN_RATING_COUNT_FOR_AVERAGE: number;
export const PERSON_POPULARITY_WEIGHT: number;
export function validateCombinedWeights(input?: Partial<CombinedWeights>): {
  weights: CombinedWeights;
  effectiveWeights: CombinedWeights;
  totalWeight: number;
};
export function validateGenreWeights(
  input?: Partial<GenreWeights>,
  defaults?: GenreWeights,
): {
  weights: GenreWeights;
  effectiveWeights: GenreWeights;
  totalWeight: number;
};
export function scoreCombinedTitleCandidate(
  record: TitleTokenRecord,
  normalizedQuery: string,
  queryTrigrams: string[],
  effectiveWeights: CombinedWeights,
): CombinedTitleCandidate;
export function scoreCombinedTitleCandidates(
  records: Map<string, TitleTokenRecord>,
  candidateIds: string[],
  normalizedQuery: string,
  inputWeights?: Partial<CombinedWeights>,
  previewLimit?: number,
  rankingContext?: {
    genres?: string[];
    fieldMatches?: Map<string, FieldMatchSummary>;
    exactTitleIds?: Set<string>;
    genreFallbackCandidateIds?: Set<string>;
    genreFallbackQuery?: string;
    structuredGenreRanking?: boolean;
    genreWeights?: Partial<GenreWeights>;
    ratingStats?: {
      ratingVotes: number;
      corpusRatingMean: number;
      maxRatingCount: number;
      ratingById: Map<
        string,
        {
          averageRatingEligible: boolean;
          bayesianRating: number;
          ratingEvidence: number;
        }
      >;
    };
    personCandidates?: {
      id: string;
      name: string;
      roles: ("actor" | "director")[];
      role: "actor" | "director";
      movieCount: number;
      roleMovieCount: number;
    }[];
    personRole?: "actor" | "director";
  },
): {
  method:
    | "weighted_explainable_title_ranker"
    | "weighted_explainable_multifield_ranker"
    | "weighted_structured_genre_ranker";
  weights: CombinedWeights;
  effectiveWeights: CombinedWeights;
  totalWeight: number;
  rankingContext: {
    requestedGenres: string[];
    genreOverlapPrecedesTitleScore: boolean;
    titleWeight: number;
    fieldWeight: number;
    structuredGenreDiscovery: boolean;
    structuredGenreProfile:
      "single_genre_balanced" | "compound_genre_focus" | null;
    structuredGenreInputWeights: GenreWeights | null;
    structuredGenreWeights: GenreWeights | null;
    structuredGenreWeightTotal: number | null;
    bayesianPrior: number;
    minimumAverageRatingCount: number;
    personPopularityWeight: number;
    personPopularityApplied: boolean;
  };
  candidateCount: number;
  candidatesPreview: CombinedTitleCandidate[];
  truncated: boolean;
};
