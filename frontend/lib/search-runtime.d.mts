import type { PlannerIndexes } from "./query-planner.mjs";
import type { TitleSearchPipeline } from "./title-search-pipeline.mjs";

export function getSearchRuntime(): Promise<{
  searchIndexes: TitleSearchPipeline;
  plannerIndexes: PlannerIndexes;
  corpusPath: string;
  registryPath: string;
  cached: boolean;
}>;
