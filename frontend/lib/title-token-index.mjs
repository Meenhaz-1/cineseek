import { displayMovieLensTitle, exactTitleKey } from "./exact-title-index.mjs";

const QUERY_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "from",
  "in",
  "movie",
  "movies",
  "of",
  "on",
  "the",
  "to",
  "with",
]);

function unique(values) {
  return [...new Set(values)];
}

export function titleTokens(value) {
  return unique(exactTitleKey(value).match(/[a-z0-9]+/g) ?? []);
}

export function queryTitleTokens(value) {
  const allTokens = titleTokens(value);
  return {
    tokens: allTokens.filter((token) => !QUERY_STOP_WORDS.has(token)),
    ignoredTokens: allTokens.filter((token) => QUERY_STOP_WORDS.has(token)),
  };
}

export function buildTitleTokenIndex(documents) {
  const byToken = new Map();
  const records = new Map();
  let postingCount = 0;

  for (const document of documents) {
    const id = String(document._id);
    const record = {
      id,
      title: displayMovieLensTitle(document.title),
      year: document.metadata?.year ?? null,
      genres: document.metadata?.genres ?? [],
      averageRating: document.metadata?.average_rating ?? null,
      ratingCount: document.metadata?.rating_count ?? 0,
      tags: document.metadata?.tags ?? [],
      imdbId: document.metadata?.imdb_id ?? null,
      tmdbId: document.metadata?.tmdb_id ?? null,
      posterPath: document.metadata?.poster_path ?? null,
      overview: document.overview ?? "",
      cast: document.metadata?.cast ?? [],
      directors: document.metadata?.directors ?? [],
    };
    records.set(id, record);
    for (const token of titleTokens(record.title)) {
      const postings = byToken.get(token) ?? [];
      postings.push(id);
      byToken.set(token, postings);
      postingCount += 1;
    }
  }

  return {
    byToken,
    records,
    titleCount: records.size,
    tokenCount: byToken.size,
    postingCount,
  };
}

export function lookupTitleTokens(index, normalizedQuery, previewLimit = 12) {
  const { tokens, ignoredTokens } = queryTitleTokens(normalizedQuery);
  const candidateIds = new Set();
  const postingLists = tokens.map((token) => index.byToken.get(token) ?? []);
  const postings = tokens.map((token) => {
    const movieIds = index.byToken.get(token) ?? [];
    movieIds.forEach((id) => candidateIds.add(id));
    return {
      token,
      documentFrequency: movieIds.length,
      movieIdsPreview: movieIds.slice(0, previewLimit),
      truncated: movieIds.length > previewLimit,
    };
  });
  const intersectionIds = postingLists.length
    ? postingLists[0].filter((id) =>
        postingLists.slice(1).every((movieIds) => movieIds.includes(id)),
      )
    : [];
  const candidateIdsPreview = [...candidateIds].slice(0, previewLimit);
  return {
    tokens,
    ignoredTokens,
    postings,
    candidateIds: [...candidateIds],
    candidateCount: candidateIds.size,
    candidateIdsPreview,
    intersectionCount: intersectionIds.length,
    intersectionIdsPreview: intersectionIds.slice(0, previewLimit),
    candidatesPreview: candidateIdsPreview.map((id) => index.records.get(id)),
    truncated: candidateIds.size > previewLimit,
  };
}
