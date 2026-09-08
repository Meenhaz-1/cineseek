import {
  scoreCombinedTitleCandidates,
  MIN_RATING_COUNT_FOR_AVERAGE,
} from "../combined-title-ranker.mjs";

function movieId(id) {
  return String(id).replace(/^movie:movielens:/, "");
}
function personMovieIds(group, catalog, records) {
  const person = catalog.people.entities.get(group.matches[0]?.id);
  if (!person) return new Set();
  if (person.credits?.length)
    return new Set(
      person.credits
        .filter((c) => !group.role || c.role === group.role)
        .map((c) => movieId(c.movieId)),
    );
  if (!group.role && person.movieIds?.length)
    return new Set(person.movieIds.map(movieId));
  // Older compact registries carry names/roles but omit credits.
  const fields =
    group.role === "actor"
      ? ["cast"]
      : group.role === "director"
        ? ["directors"]
        : ["cast", "directors"];
  return new Set(
    [...records.values()]
      .filter((record) =>
        fields.some((field) => record[field]?.includes(person.name)),
      )
      .map((r) => r.id),
  );
}
function satisfies(record, filters) {
  const genres = filters.genres.map((g) => record.genres.includes(g));
  return (
    (!genres.length ||
      (filters.genreMode === "all"
        ? genres.every(Boolean)
        : genres.some(Boolean))) &&
    (filters.yearMin === undefined ||
      (record.year !== null && record.year >= filters.yearMin)) &&
    (filters.yearMax === undefined ||
      (record.year !== null && record.year <= filters.yearMax)) &&
    (filters.ratingMin === undefined ||
      (record.averageRating !== null &&
        record.averageRating >= filters.ratingMin)) &&
    (filters.ratingCountMin === undefined ||
      record.ratingCount >= filters.ratingCountMin)
  );
}
export function searchHindiPlan(runtime, plan, limit = 24) {
  const started = performance.now();
  const { searchIndexes, catalog } = runtime;
  const records = searchIndexes.tokens.records;
  if (plan.multilingual.blocked)
    return { items: [], total: 0, hasMore: false, retrievalMs: 0 };
  const titles = new Map(plan.multilingual.titleMatches.map((m) => [m.id, m]));
  const groups = plan.multilingual.personGroups.map((g) =>
    personMovieIds(g, catalog, records),
  );
  const ids = [...records.values()]
    .filter(
      (record) =>
        (!plan.routes.titleQuery || titles.has(record.id)) &&
        groups.every((ids) => ids.has(record.id)) &&
        satisfies(record, plan.filters),
    )
    .map((r) => r.id);
  // Reuse CineSeek's metadata/genre ranker and corpus rating priors. Unicode
  // title evidence is scored independently, using the best alias per movie.
  const ranking = scoreCombinedTitleCandidates(
    records,
    ids,
    "",
    undefined,
    ids.length,
    {
      genres: plan.filters.genres,
      structuredGenreRanking: plan.routes.structuredGenreRanking,
      ratingStats: searchIndexes.ratingStats,
    },
  );
  const items = ranking.candidatesPreview.map((ranked, baseRank) => {
    const record = records.get(ranked.id),
      title = titles.get(ranked.id);
    return {
      ...record,
      score: title?.score ?? ranked.combinedScore,
      matchedAlias: title?.alias ?? null,
      baseRank,
      matchReason: title
        ? `Title: ${title.alias.text}`
        : plan.entities.people.length
          ? `Person: ${plan.entities.people.map((p) => p.name).join(", ")}`
          : `Genre / filters: ${plan.filters.genres.join(", ") || "catalogue"}`,
    };
  });
  function sortValue(item, field) {
    if (field === "rating")
      return item.ratingCount >= MIN_RATING_COUNT_FOR_AVERAGE
        ? item.averageRating
        : null;
    return field === "ratingCount" ? item.ratingCount : item.year;
  }
  items.sort((a, b) => {
    if (plan.sort) {
      const av = sortValue(a, plan.sort.field),
        bv = sortValue(b, plan.sort.field);
      if (av == null && bv != null) return 1;
      if (bv == null && av != null) return -1;
      if (av != null && bv != null && av !== bv)
        return (plan.sort.direction === "asc" ? 1 : -1) * (av - bv);
    }
    return b.score - a.score || a.baseRank - b.baseRank;
  });
  return {
    items: items.slice(0, limit).map(({ baseRank, ...item }) => {
      void baseRank;
      return item;
    }),
    total: items.length,
    hasMore: items.length > limit,
    retrievalMs: Number((performance.now() - started).toFixed(3)),
  };
}
