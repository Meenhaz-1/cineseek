import { exactTitleKey } from "./exact-title-index.mjs";
import { titleTokens } from "./title-token-index.mjs";

const LEADING_ARTICLE = /^(a|an|the)\s+/;
const catalogCache = new WeakMap();

function normalize(value) {
  return exactTitleKey(value).replace(LEADING_ARTICLE, "");
}

function matchScore(name, query) {
  const normalizedName = normalize(name);
  const normalizedQuery = exactTitleKey(query);
  if (normalizedName === normalizedQuery) return 3;
  if (normalizedName.startsWith(normalizedQuery)) return 2;
  if (normalizedName.includes(normalizedQuery)) return 1;
  return 0;
}

function personMatchScore(name, query) {
  const normalizedName = normalize(name);
  const normalizedQuery = exactTitleKey(query);
  const nameTokens = normalizedName.split(" ");
  if (normalizedName === normalizedQuery) return 4;
  if (nameTokens.includes(normalizedQuery)) return 3;
  if (nameTokens.some((token) => token.startsWith(normalizedQuery))) return 2;
  return normalizedName.includes(normalizedQuery) ? 1 : 0;
}

function titleScore(title, query) {
  const score = matchScore(title, query);
  if (score) return score;
  const queryTokens = titleTokens(query);
  const titleTokenSet = new Set(titleTokens(title));
  return queryTokens.length
    ? queryTokens.filter((token) => titleTokenSet.has(token)).length /
        queryTokens.length
    : 0;
}

function limitValue(value, fallback = 8) {
  const parsed = Number(value);
  return Number.isInteger(parsed)
    ? Math.min(12, Math.max(1, parsed))
    : fallback;
}

function sortSuggestions(left, right) {
  return (
    right.matchScore - left.matchScore ||
    (right.ratingEvidence ?? 0) - (left.ratingEvidence ?? 0) ||
    (right.movieCount ?? 0) - (left.movieCount ?? 0) ||
    left.label.localeCompare(right.label) ||
    left.id.localeCompare(right.id)
  );
}

function publicSuggestion(item) {
  const result = { id: item.id, label: item.label, type: item.type };
  if (item.year !== undefined) result.year = item.year;
  if (item.roles !== undefined) result.roles = item.roles;
  if (item.movieCount !== undefined) result.movieCount = item.movieCount;
  return result;
}

function roleLabel(roles) {
  return (
    roles?.map((role) => role[0].toUpperCase() + role.slice(1)).join(" · ") ||
    "Person"
  );
}

function catalogFor(runtime) {
  const cached = catalogCache.get(runtime);
  if (cached) return cached;
  const catalog = {
    titles: [...runtime.searchIndexes.tokens.records.values()].map(
      (record) => ({
        id: record.id,
        label: record.title,
        type: "Movie",
        year: record.year,
        movieCount: 0,
        ratingEvidence:
          runtime.searchIndexes.ratingStats?.ratingById.get(record.id)
            ?.ratingEvidence ?? 0,
      }),
    ),
    people: runtime.plannerIndexes.people.map((person) => ({
      id: person.id,
      label: person.name,
      type: roleLabel(person.roles),
      roles: person.roles ?? [],
      movieCount: person.movieCount ?? 0,
    })),
    genres: runtime.plannerIndexes.genres.map((genre) => ({
      id: genre.id,
      label: genre.name,
      type: "Genre",
      movieCount: genre.movieCount ?? 0,
    })),
  };
  catalogCache.set(runtime, catalog);
  return catalog;
}

export function getTypeaheadSuggestions(query, runtime, requestedLimit) {
  const normalizedQuery = exactTitleKey(query).trim();
  const limit = limitValue(requestedLimit);
  if (normalizedQuery.length < 2) {
    return { query: normalizedQuery, titles: [], people: [], genres: [] };
  }

  const catalog = catalogFor(runtime);
  const titles = catalog.titles
    .map((candidate) => ({
      ...candidate,
      matchScore: titleScore(candidate.label, normalizedQuery),
    }))
    .filter(({ matchScore }) => matchScore > 0)
    .sort(sortSuggestions)
    .slice(0, limit)
    .map(publicSuggestion);

  const people = catalog.people
    .map((person) => ({
      ...person,
      matchScore: personMatchScore(person.label, normalizedQuery),
    }))
    .filter(({ matchScore: score }) => score > 0)
    .sort(sortSuggestions)
    .slice(0, limit)
    .map(publicSuggestion);

  const genres = catalog.genres
    .map((genre) => ({
      id: genre.id,
      label: genre.name,
      type: "Genre",
      movieCount: genre.movieCount ?? 0,
      matchScore: matchScore(genre.name, normalizedQuery),
    }))
    .filter(({ matchScore: score }) => score > 0)
    .sort(sortSuggestions)
    .slice(0, limit)
    .map(publicSuggestion);

  return { query: normalizedQuery, titles, people, genres };
}
