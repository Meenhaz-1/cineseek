import { hindiSuggestions } from "../../../../lib/hindi-search/runtime.mjs";
import { internalErrorResponse } from "../../../../lib/api-errors.mjs";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  if (query.length > 300)
    return Response.json(
      { error: "query must be at most 300 characters" },
      { status: 400 },
    );
  try {
    return Response.json(
      { suggestions: query.trim() ? await hindiSuggestions(query) : [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return internalErrorResponse(
      "hindi-suggestions",
      error,
      "Suggestions are temporarily unavailable",
    );
  }
}
