import { planQuery } from "../../../lib/query-planner.mjs";
import { getSearchRuntime } from "../../../lib/search-runtime.mjs";
import { loadRuntimeManifest } from "../../../lib/runtime-data.mjs";
import { internalErrorResponse } from "../../../lib/api-errors.mjs";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { query?: unknown };
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
    const runtimeState = await getSearchRuntime();
    const queryPlan = planQuery(body.query, runtimeState.plannerIndexes);
    const manifest = await loadRuntimeManifest();
    return Response.json(
      {
        queryPlan,
        cache: runtimeState.cached ? "warm" : "built for this request",
        releaseId: manifest?.releaseId ?? "local-development",
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "Server-Timing": `planner;dur=${queryPlan.planner.planningMs}`,
        },
      },
    );
  } catch (error) {
    return internalErrorResponse("query-plan", error, "Query planning failed");
  }
}
