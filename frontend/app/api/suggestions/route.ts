import { getSearchRuntime } from "../../../lib/search-runtime.mjs";
import { getTypeaheadSuggestions } from "../../../lib/typeahead-suggestions.mjs";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = params.get("q") ?? "";
  if (query.length > 100)
    return Response.json(
      { error: "q must contain at most 100 characters" },
      { status: 400 },
    );
  const limit = Number(params.get("limit") ?? "8");
  if (!Number.isInteger(limit) || limit < 1 || limit > 12)
    return Response.json(
      { error: "limit must be an integer from 1 to 12" },
      { status: 400 },
    );
  if (query.trim().length < 2)
    return Response.json({
      query: query.trim(),
      titles: [],
      people: [],
      genres: [],
    });
  const runtimeState = await getSearchRuntime();
  const suggestions = getTypeaheadSuggestions(query, runtimeState, limit);
  return Response.json(suggestions, {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
