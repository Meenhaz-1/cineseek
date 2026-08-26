import type { MetadataFilters as BaseMetadataFilters } from "./metadata-query.mjs";
import type { CombinedWeights } from "./combined-title-ranker.mjs";

export type Intent =
  | "exact_title"
  | "person_discovery"
  | "filtered_discovery"
  | "sorted_discovery"
  | "discovery"
  | "general_search";
export type PersonRole = "actor" | "director";
export type PersonEntity = {
  id: string;
  name: string;
  roles: PersonRole[];
  role?: PersonRole;
  matchedText: string;
  confidence: number;
};
export type PersonCandidate = PersonEntity & {
  movieCount: number;
  roleMovieCount: number;
};
export type MetadataFilters = BaseMetadataFilters & {
  genres: string[];
  genreMode: "any" | "all";
};
export type QueryCorrection = {
  original: string;
  replacement: string;
  entityType: "title" | "person" | "genre" | "control";
  role?: PersonRole;
  confidence: number;
  policy: "automatic" | "suggest";
};
export type QueryPlan = {
  rawQuery: string;
  normalizedQuery: string;
  effectiveQuery: string;
  intent: Intent;
  corrections: QueryCorrection[];
  suggestedQuery?: string;
  routes: {
    strategy:
      "exact_title" | "title" | "structured" | "dual" | "genre_fallback";
    titleQuery: string;
    fieldQuery: string;
    fieldRole?: PersonRole;
    genreTitleFallbackQuery: string;
    titlePriority: "exact" | "primary" | "secondary" | "none";
    structural: string[];
    concepts: string[];
    semanticExpansions: { term: string; values: string[] }[];
    structuredGenreRanking: boolean;
  };
  entities: {
    people: PersonEntity[];
    personCandidates: PersonCandidate[];
    genres: string[];
  };
  filters: MetadataFilters;
  sort: {
    field: "year" | "rating" | "ratingCount";
    direction: "asc" | "desc";
    source: string;
  } | null;
  unavailableFilters: string[];
  trace: string[];
  explanations: { normalization: string; routing: string; intent: string };
  planner: {
    id: string;
    version: string;
    planningMs: number;
    indexBuildMs: number;
    corpusSize: number;
    entityCount: number;
  };
};
export type PlannerIndexes = Record<string, unknown> & {
  buildMs: number;
  corpusSize: number;
};
export interface QueryPlanner {
  id: string;
  version: string;
  plan(rawQuery: string, indexes: PlannerIndexes): Promise<QueryPlan>;
}

export const QUERY_PLANNER_ID: string;
export const QUERY_PLANNER_VERSION: string;
export const SEMANTIC_SYNONYMS: Record<string, string[]>;
export const TitleCandidateProvider: {
  provide(query: string, indexes: PlannerIndexes): unknown;
};
export const PersonCandidateProvider: {
  provide(
    query: string,
    indexes: PlannerIndexes,
    preferredRole?: PersonRole,
  ): unknown;
};
export const GenreCandidateProvider: {
  provide(query: string, indexes: PlannerIndexes): unknown;
};
export const ControlWordCandidateProvider: {
  provide(query: string, indexes: PlannerIndexes): unknown;
};
export function buildPlannerIndexes(
  documents: Record<string, unknown>[],
  registry: Record<string, unknown>,
  sharedIndexes?: {
    exactTitles?: Record<string, unknown>;
    titleTrigrams?: Record<string, unknown>;
  },
): PlannerIndexes;
export function loadPlannerIndexes(
  corpusPath: string,
  registryPath: string,
): Promise<PlannerIndexes>;
export function planQuery(
  rawQuery: string,
  indexes: PlannerIndexes,
  options?: { autocorrect?: boolean },
): QueryPlan;
export const deterministicQueryPlanner: QueryPlanner;
export function titleSearchInputFromPlan(
  plan: QueryPlan,
  weights?: Partial<CombinedWeights>,
): {
  normalizedQuery: string;
  retrievalQuery: string;
  fieldQuery: string;
  fieldRole?: PersonRole;
  genreTitleFallbackQuery: string;
  filters: MetadataFilters;
  weights?: Partial<CombinedWeights>;
  sort?: QueryPlan["sort"];
};
