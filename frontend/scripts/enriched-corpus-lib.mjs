function uniqueNames(items) {
  return [
    ...new Set((items ?? []).map((item) => item?.name?.trim()).filter(Boolean)),
  ];
}

export function buildSearchableDocument(document, enrichment) {
  if (!enrichment) return document;
  const cast = uniqueNames(enrichment.cast);
  const directors = uniqueNames(enrichment.directors);
  const keywords = uniqueNames(enrichment.keywords);
  const overview = enrichment.overview?.trim() ?? "";
  const metadata = {
    ...document.metadata,
    cast,
    directors,
    tmdb_keywords: keywords,
    overview_available: Boolean(overview),
    enrichment_source: "TMDB",
    poster_path: enrichment.poster_path ?? null,
  };
  const text = [
    document.text,
    overview ? `Overview: ${overview}` : "",
    cast.length ? `Cast: ${cast.join(", ")}` : "",
    directors.length ? `Directors: ${directors.join(", ")}` : "",
    keywords.length ? `TMDB keywords: ${keywords.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(". ");
  return { ...document, text, overview, metadata };
}
