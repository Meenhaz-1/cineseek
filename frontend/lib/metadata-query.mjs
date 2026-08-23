export const GENRE_ALIASES = {
  action: "Action",
  adventure: "Adventure",
  animated: "Animation",
  animation: "Animation",
  comedy: "Comedy",
  crime: "Crime",
  documentary: "Documentary",
  drama: "Drama",
  fantasy: "Fantasy",
  horror: "Horror",
  musical: "Musical",
  mystery: "Mystery",
  romance: "Romance",
  romantic: "Romance",
  "sci-fi": "Sci-Fi",
  "sci fi": "Sci-Fi",
  "science fiction": "Sci-Fi",
  thriller: "Thriller",
  war: "War",
  western: "Western",
};

// These phrases describe established compound genres. Unlike an unconnected
// discovery query such as "science fiction thriller", every component is part
// of the user's requested category and must match.
const COMPOUND_GENRE_PHRASES = ["romantic comedy"];

function containsWholeTerm(value, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(value);
}

export function extractExplicitTitleText(normalizedQuery) {
  const patterns = [
    /\btitle\s+(?:contains?|containing|has|with)\s+(.+)$/,
    /\b(?:movies?|films?)\s+(?:with|containing)\s+(.+?)\s+in\s+(?:the\s+)?title\b/,
    /\b(?:called|named|titled)\s+(.+)$/,
  ];
  const match = patterns
    .map((pattern) => normalizedQuery.match(pattern))
    .find(Boolean);
  return match ? (match[1].match(/[a-z0-9]+/g) ?? []).join(" ") : "";
}

const NON_TITLE_TERMS = new Set([
  "a",
  "an",
  "and",
  "at",
  "about",
  "film",
  "films",
  "for",
  "from",
  "in",
  "is",
  "movie",
  "movies",
  "of",
  "or",
  "the",
  "which",
  "with",
  "featuring",
  "starring",
  "rated",
  "rating",
  "ratings",
  "above",
  "over",
  "least",
  "after",
  "before",
  "since",
  "minimum",
  "no",
  "fewer",
  "than",
  "user",
]);

export function metadataResidualTitleTerms(
  normalizedQuery,
  parsed = parseMetadataQuery(normalizedQuery),
) {
  let residual = normalizedQuery;
  const consumedPhrases = [
    ...parsed.matchedGenreEntries.map(([alias]) => alias),
    ...Object.values(parsed.matches)
      .filter(Boolean)
      .map((match) => match[0]),
  ].sort((left, right) => right.length - left.length);
  for (const phrase of consumedPhrases) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    residual = residual.replace(
      new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "g"),
      " ",
    );
  }
  return (residual.match(/[a-z0-9]+/g) ?? []).filter(
    (term) => !NON_TITLE_TERMS.has(term) && !/^\d+$/.test(term),
  );
}

export function parseMetadataQuery(normalizedQuery) {
  const explicitTitleText = extractExplicitTitleText(normalizedQuery);
  const matchedGenreEntries = Object.entries(GENRE_ALIASES).filter(
    ([alias]) =>
      containsWholeTerm(normalizedQuery, alias) &&
      !(explicitTitleText && containsWholeTerm(explicitTitleText, alias)),
  );
  const genres = [...new Set(matchedGenreEntries.map(([, genre]) => genre))];
  const isCompoundGenre = COMPOUND_GENRE_PHRASES.some((phrase) =>
    containsWholeTerm(normalizedQuery, phrase),
  );
  const genreMode =
    genres.length > 1 &&
    (isCompoundGenre || /(?:\band\b|&)/.test(normalizedQuery))
      ? "all"
      : "any";
  const decade = normalizedQuery.match(/\b((?:19|20)\d0)s\b/);
  const after = normalizedQuery.match(/\b(after|since)\s+((?:19|20)\d{2})\b/);
  const before = normalizedQuery.match(/\bbefore\s+((?:19|20)\d{2})\b/);
  const ratingMatch = normalizedQuery.match(
    /\b(?:rated|rating)\s+(?:above|over|at least)\s+(\d(?:\.\d)?)\b/,
  );
  const ratingCountMatch = normalizedQuery.match(
    /\b(?:with\s+)?(?:at least|minimum(?:\s+of)?|no fewer than)\s+(\d+)\s+(?:user\s+)?ratings?\b/,
  );

  let yearMin;
  let yearMax;
  if (decade) {
    yearMin = Number(decade[1]);
    yearMax = yearMin + 9;
  } else {
    if (after) yearMin = Number(after[2]) + (after[1] === "after" ? 1 : 0);
    if (before) yearMax = Number(before[1]) - 1;
  }

  return {
    genres,
    genreMode,
    matchedGenreEntries,
    isCompoundGenre,
    explicitTitleText,
    yearMin,
    yearMax,
    ratingMin: ratingMatch ? Number(ratingMatch[1]) : undefined,
    ratingCountMin: ratingCountMatch ? Number(ratingCountMatch[1]) : undefined,
    matches: {
      decade,
      after,
      before,
      rating: ratingMatch,
      ratingCount: ratingCountMatch,
    },
  };
}
