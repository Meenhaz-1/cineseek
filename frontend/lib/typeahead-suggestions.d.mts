import type { PlannerIndexes } from "./query-planner.mjs";
import type { TitleSearchPipeline } from "./title-search-pipeline.mjs";

export type TypeaheadSuggestion = {
  id: string;
  label: string;
  type: string;
  year?: number | null;
  roles?: string[];
  movieCount?: number;
};
export type TypeaheadSuggestions = {
  query: string;
  titles: TypeaheadSuggestion[];
  people: TypeaheadSuggestion[];
  genres: TypeaheadSuggestion[];
};
export function getTypeaheadSuggestions(
  query: string,
  runtime: {
    plannerIndexes: PlannerIndexes;
    searchIndexes: TitleSearchPipeline;
  },
  requestedLimit?: number,
): TypeaheadSuggestions;
