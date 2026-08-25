import { deploymentMode } from "../../../lib/deployment-mode.mjs";
import { loadRuntimeManifest } from "../../../lib/runtime-data.mjs";
import { getSearchRuntime } from "../../../lib/search-runtime.mjs";

export const runtime = "nodejs";

export async function GET() {
  const startedAt = performance.now();
  try {
    const [manifest, runtimeState] = await Promise.all([
      loadRuntimeManifest(),
      getSearchRuntime(),
    ]);
    const plannerIndexes = runtimeState.plannerIndexes as unknown as {
      people: unknown[];
      genres: unknown[];
    };
    const duration = Number((performance.now() - startedAt).toFixed(3));
    return Response.json(
      {
        status: "ok",
        deploymentMode: deploymentMode(),
        release: manifest
          ? {
              id: manifest.releaseId,
              schemaVersion: manifest.schemaVersion,
              generatedAt: manifest.generatedAt,
              expiresAt: manifest.expiresAt,
            }
          : { id: "local-development", schemaVersion: null },
        data: {
          movies: runtimeState.searchIndexes.tokens.records.size,
          people: plannerIndexes.people.length,
          genres: plannerIndexes.genres.length,
        },
        indexes: runtimeState.cached ? "warm" : "built",
        durationMs: duration,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "Server-Timing": `health;dur=${duration}`,
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        status: "unhealthy",
        deploymentMode: deploymentMode(),
        error:
          error instanceof Error
            ? error.message
            : "Runtime initialization failed",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
