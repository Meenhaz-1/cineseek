import type { QueryPlan } from "../../lib/query-planner.mjs";

export type Mode = "lexical" | "semantic" | "hybrid";
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
export type CoachState = {
  status: "loading" | "ready" | "unavailable";
  paragraph?: string;
  detail?: string;
  model?: string;
};
export type ParserMismatch = {
  field: string;
  expected: string;
  actual: string;
};
export type ParserTestReport = {
  generatedAt: string;
  totals: {
    all: number;
    executed: number;
    passed: number;
    failed: number;
    planned: number;
  };
  results: {
    caseId: string;
    category: string;
    query: string;
    passed: boolean;
    mismatches: ParserMismatch[];
  }[];
};
export type ParserTestState = {
  status: "idle" | "running" | "ready" | "error";
  report?: ParserTestReport;
  error?: string;
};
export type FullSearchResult = {
  id: string;
  title: string;
  year: number | null;
  genres: string[];
  averageRating: number | null;
  ratingCount: number;
  tags: string[];
  imdbId: string | null;
  tmdbId: number | null;
  posterPath: string | null;
  overview: string;
  cast: string[];
  directors: string[];
  score: number;
  titleScore?: number;
  fieldScore?: number;
  matchReason?: {
    field: string;
    label: string;
    value: string;
    matchType: string;
  };
  personPopularityBoost?: {
    name: string;
    role: "actor" | "director";
    movieCount: number;
    roleMovieCount: number;
    occurrence: number;
    signal: number;
    decay: number;
    contribution: number;
  };
};
export type TitleRetrieval = {
  normalizedQuery: string;
  retrievalQuery: string;
  metadataFilter: {
    active: boolean;
    filters: {
      genres: string[];
      genreMode: "any" | "all";
      yearMin?: number;
      yearMax?: number;
      ratingMin?: number;
      ratingCountMin?: number;
    };
    corpusCount: number;
    candidateCount: number;
    excludedCount: number;
    candidatesPreview: {
      id: string;
      title: string;
      year: number | null;
      genres: string[];
      averageRating: number | null;
      ratingCount: number;
    }[];
    filterMs: number;
  };
  exact: {
    lookupKey: string;
    hit: boolean;
    matches: {
      id: string;
      title: string;
      sourceTitle: string;
      year: number | null;
    }[];
    lookupMs: number;
  };
  tokenLookup:
    | { skipped: true; reason: string }
    | {
        skipped: false;
        tokens: string[];
        ignoredTokens: string[];
        postings: {
          token: string;
          documentFrequency: number;
          movieIdsPreview: string[];
          truncated: boolean;
        }[];
        candidateCount: number;
        candidateIdsPreview: string[];
        intersectionCount: number;
        intersectionIdsPreview: string[];
        candidatesPreview: { id: string; title: string; year: number | null }[];
        truncated: boolean;
        lookupMs: number;
      };
  fieldLookup:
    | { skipped: true; reason: string }
    | {
        skipped: false;
        tokens: string[];
        ignoredTokens: string[];
        postings: { field: string; token: string; documentFrequency: number }[];
        candidateCount: number;
        candidatesPreview: {
          id: string;
          title: string;
          year: number | null;
          fieldMatch: {
            bestMatch: {
              field: string;
              label: string;
              value: string;
              matchType: string;
              score: number;
            };
          };
        }[];
        truncated: boolean;
        lookupMs: number;
      };
  trigramLookup:
    | { skipped: true; reason: string }
    | {
        skipped: false;
        trigrams: string[];
        minimumMatches: number;
        postings: {
          trigram: string;
          documentFrequency: number;
          movieIdsPreview: string[];
          truncated: boolean;
        }[];
        candidateCount: number;
        candidatesPreview: {
          id: string;
          title: string;
          year: number | null;
          matchedTrigrams: number;
          queryTrigramCount: number;
          trigramCount: number;
          unionTrigramCount: number;
          coverage: number;
          jaccard: number;
          dice: number;
        }[];
        truncated: boolean;
        lookupMs: number;
      };
  combinedCandidates:
    | { skipped: true; reason: string }
    | {
        skipped: false;
        candidateCount: number;
        candidatesPreview: {
          id: string;
          title: string;
          year: number | null;
          sources: ("metadata" | "token" | "trigram" | "field")[];
        }[];
        truncated: boolean;
      };
  fuzzyScoring:
    | { skipped: true; reason: string }
    | {
        skipped: false;
        method: "dice";
        candidateCount: number;
        candidatesPreview: {
          id: string;
          title: string;
          year: number | null;
          matchedTrigrams: number;
          queryTrigramCount: number;
          trigramCount: number;
          unionTrigramCount: number;
          jaccard: number;
          dice: number;
        }[];
        truncated: boolean;
      };
  editScoring:
    | { skipped: true; reason: string }
    | {
        skipped: false;
        method: "normalized_levenshtein";
        candidateCount: number;
        candidatesPreview: {
          id: string;
          title: string;
          year: number | null;
          queryText: string;
          titleText: string;
          editDistance: number;
          maximumLength: number;
          editSimilarity: number;
        }[];
        truncated: boolean;
      };
  tokenCoverageScoring:
    | { skipped: true; reason: string }
    | {
        skipped: false;
        method: "exact_query_token_coverage";
        candidateCount: number;
        queryTokens: string[];
        candidatesPreview: {
          id: string;
          title: string;
          year: number | null;
          queryTokens: string[];
          candidateTokens: string[];
          matchedTokens: string[];
          missingTokens: string[];
          matchedTokenCount: number;
          queryTokenCount: number;
          coverage: number;
        }[];
        truncated: boolean;
      };
  orderedTokenProximityScoring:
    | { skipped: true; reason: string }
    | {
        skipped: false;
        method: "ordered_token_proximity";
        candidateCount: number;
        queryTokens: string[];
        candidatesPreview: {
          id: string;
          title: string;
          year: number | null;
          queryTokens: string[];
          candidateTokens: string[];
          alignment: {
            token: string;
            queryIndex: number;
            titleIndex: number;
          }[];
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
        }[];
        truncated: boolean;
      };
  combinedScoring:
    | { skipped: true; reason: string }
    | {
        skipped: false;
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
          structuredGenreWeights: {
            genreFocus: number;
            bayesianRating: number;
            ratingEvidence: number;
          } | null;
          structuredGenreWeightTotal: number | null;
          bayesianPrior: number;
          minimumAverageRatingCount: number;
          personPopularityWeight: number;
          personPopularityApplied: boolean;
        };
        candidateCount: number;
        candidatesPreview: {
          id: string;
          title: string;
          year: number | null;
          signals: CombinedWeights;
          contributions: CombinedWeights;
          titleScore: number;
          fieldScore: number;
          baseCombinedScore?: number;
          fieldMatch?: { bestMatch: FullSearchResult["matchReason"] };
          combinedScore: number;
          metadataGenreMatchCount: number;
          genreFocus: number;
          averageRatingEligible: boolean;
          bayesianRating: number;
          ratingEvidence: number;
          structuredGenreSignals: GenreWeights;
          structuredGenreContributions: GenreWeights;
          structuredGenreScore: number;
          personPopularityBoost?: FullSearchResult["personPopularityBoost"];
        }[];
        truncated: boolean;
      };
  indexes: {
    titleCount: number;
    exactKeyCount: number;
    collisionCount: number;
    tokenCount: number;
    postingCount: number;
    fieldPostingCount: number;
    trigramCount: number;
    trigramPostingCount: number;
    buildMs: number;
    cache: "warm" | "built for this request";
  };
  searchResults: {
    items: FullSearchResult[];
    shown: number;
    total: number;
    hasMore: boolean;
  };
};
export type TitleRetrievalState = {
  status: "idle" | "ready" | "error";
  query?: string;
  autocorrect?: boolean;
  result?: TitleRetrieval;
  plan?: QueryPlan;
  error?: string;
};
