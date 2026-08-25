import {
  publicTitleSearchResult,
  runTitleSearch,
} from "../../../lib/title-search-pipeline.mjs";
import { planQuery } from "../../../lib/query-planner.mjs";
import { getSearchRuntime } from "../../../lib/search-runtime.mjs";
import { loadRuntimeManifest } from "../../../lib/runtime-data.mjs";
import {
  validateCombinedWeights,
  type CombinedWeights,
} from "../../../lib/combined-title-ranker.mjs";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { query?: unknown; weights?: unknown; resultLimit?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }
  try {
    if (
      typeof body.query !== "string" ||
      !body.query.trim() ||
      body.query.length > 300
    ) {
      return Response.json(
        { error: "query must contain 1-300 characters" },
        { status: 400 },
      );
    }
    if (
      body.weights !== undefined &&
      (typeof body.weights !== "object" ||
        body.weights === null ||
        Array.isArray(body.weights))
    ) {
      return Response.json(
        { error: "weights must be an object" },
        { status: 400 },
      );
    }
    const weights = body.weights as Partial<CombinedWeights> | undefined;
    try {
      validateCombinedWeights(weights);
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Invalid weights" },
        { status: 400 },
      );
    }
    const resultLimit =
      body.resultLimit === undefined ? 24 : Number(body.resultLimit);
    if (
      !Number.isInteger(resultLimit) ||
      resultLimit < 1 ||
      resultLimit > 9_742
    ) {
      return Response.json(
        { error: "resultLimit must be an integer from 1 to 9742" },
        { status: 400 },
      );
    }

    const totalStartedAt = performance.now();
    const runtimeState = await getSearchRuntime();
    const queryPlan = planQuery(body.query, runtimeState.plannerIndexes);
    const result = runTitleSearch(runtimeState.searchIndexes, queryPlan, {
      cacheStatus: runtimeState.cached ? "warm" : "built for this request",
      rankLimit: resultLimit,
      weights,
    });
    const items = result.evaluation.rankedResults.map((ranked) => ({
      ...runtimeState.searchIndexes.tokens.records.get(ranked.id),
      score: ranked.score,
      titleScore: ranked.titleScore,
      fieldScore: ranked.fieldScore,
      matchReason: ranked.matchReason,
    }));
    const results = {
      items,
      shown: items.length,
      total: result.evaluation.candidateIds.length,
      hasMore: items.length < result.evaluation.candidateIds.length,
    };
    const endToEndMs = Number((performance.now() - totalStartedAt).toFixed(3));
    const manifest = await loadRuntimeManifest();
    return Response.json(
      {
        queryPlan,
        retrieval: {
          ...publicTitleSearchResult(result),
          searchResults: results,
        },
        results,
        timings: {
          plannerMs: queryPlan.planner.planningMs,
          retrievalMs: result.timings.totalMs,
          endToEndMs,
        },
        sources: {
          releaseId: manifest?.releaseId ?? "local-development",
          movieCount: runtimeState.searchIndexes.tokens.records.size,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "Server-Timing": `planner;dur=${queryPlan.planner.planningMs}, retrieval;dur=${result.timings.totalMs}, total;dur=${endToEndMs}`,
          "X-CineSeek-Release": String(
            manifest?.releaseId ?? "local-development",
          ),
        },
      },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Search failed" },
      { status: 500 },
    );
  }
}
