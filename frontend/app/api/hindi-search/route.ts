import { submittedHindiSearch } from "../../../lib/hindi-search/runtime.mjs";
import { internalErrorResponse } from "../../../lib/api-errors.mjs";
export const runtime = "nodejs";
export async function POST(request: Request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }
  if (
    !body ||
    typeof body.query !== "string" ||
    !body.query.trim() ||
    body.query.length > 300
  )
    return Response.json(
      { error: "query must contain 1-300 characters" },
      { status: 400 },
    );
  const limit = body.resultLimit ?? 24;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200)
    return Response.json(
      { error: "resultLimit must be an integer from 1 to 200" },
      { status: 400 },
    );
  try {
    return Response.json(await submittedHindiSearch(body.query, limit), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return internalErrorResponse(
      "hindi-search",
      error,
      "Hindi search is temporarily unavailable",
    );
  }
}
