export function internalErrorResponse(scope, error, message, status = 500) {
  console.error(`[${scope}]`, error);
  return Response.json({ error: message }, { status });
}
