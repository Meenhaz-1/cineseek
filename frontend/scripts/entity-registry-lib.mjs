import {
  displayMovieLensTitle,
  exactTitleKey,
} from "../lib/exact-title-index.mjs";

function slug(value) {
  return (
    exactTitleKey(value)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "unknown"
  );
}

function uniqueNamed(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const name = item?.name?.trim();
    const key =
      item?.id != null ? `id:${item.id}` : `name:${exactTitleKey(name)}`;
    if (!name || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function buildEntityRegistry(documents, enrichmentMovies = {}) {
  const people = new Map();
  const genres = new Map();
  const tags = new Map();
  const movies = {};

  function addPerson(person, movieId, role, character = "") {
    const id =
      person.id != null
        ? `person:tmdb:${person.id}`
        : `person:name:${slug(person.name)}`;
    const entity = people.get(id) ?? {
      id,
      type: "person",
      tmdbId: person.id ?? null,
      name: person.name.trim(),
      roles: new Set(),
      movieIds: new Set(),
      credits: [],
    };
    entity.roles.add(role);
    entity.movieIds.add(movieId);
    entity.credits.push({ movieId, role, character: character?.trim() ?? "" });
    people.set(id, entity);
    return id;
  }

  function addGenre(name, movieId) {
    const id = `genre:${slug(name)}`;
    const entity = genres.get(id) ?? {
      id,
      type: "genre",
      name,
      movieIds: new Set(),
    };
    entity.movieIds.add(movieId);
    genres.set(id, entity);
    return id;
  }

  function addTag(name, movieId, source) {
    const id = `tag:${slug(name)}`;
    const entity = tags.get(id) ?? {
      id,
      type: "tag",
      name,
      sources: new Set(),
      movieIds: new Set(),
    };
    entity.sources.add(source);
    entity.movieIds.add(movieId);
    tags.set(id, entity);
    return id;
  }

  for (const document of documents) {
    const movieLensId = String(document._id);
    const movieId = `movie:movielens:${movieLensId}`;
    const enrichment = enrichmentMovies[movieLensId] ?? {};
    const actorIds = uniqueNamed(enrichment.cast).map((person) =>
      addPerson(person, movieId, "actor", person.character),
    );
    const directorIds = uniqueNamed(enrichment.directors).map((person) =>
      addPerson(person, movieId, "director"),
    );
    const genreIds = sortedUnique(document.metadata?.genres ?? []).map((name) =>
      addGenre(name, movieId),
    );
    const movieLensTagIds = sortedUnique(document.metadata?.tags ?? []).map(
      (name) => addTag(name, movieId, "MovieLens"),
    );
    const keywordTagIds = uniqueNamed(enrichment.keywords).map(({ name }) =>
      addTag(name, movieId, "TMDB"),
    );
    movies[movieId] = {
      id: movieId,
      type: "movie",
      movieLensId,
      tmdbId: document.metadata?.tmdb_id ?? enrichment.tmdb_id ?? null,
      imdbId: document.metadata?.imdb_id ?? null,
      name: displayMovieLensTitle(document.title),
      year: document.metadata?.year ?? null,
      averageRating: document.metadata?.average_rating ?? null,
      ratingCount: document.metadata?.rating_count ?? 0,
      posterPath: enrichment.poster_path ?? null,
      actorIds,
      directorIds,
      genreIds,
      tagIds: sortedUnique([...movieLensTagIds, ...keywordTagIds]),
    };
  }

  const personEntities = [...people.values()].map((entity) => ({
    ...entity,
    roles: [...entity.roles].sort(),
    movieIds: [...entity.movieIds],
    movieCount: entity.movieIds.size,
    actorMovieCount: new Set(
      entity.credits
        .filter(({ role }) => role === "actor")
        .map(({ movieId }) => movieId),
    ).size,
    directorMovieCount: new Set(
      entity.credits
        .filter(({ role }) => role === "director")
        .map(({ movieId }) => movieId),
    ).size,
  }));
  const genreEntities = [...genres.values()].map((entity) => ({
    ...entity,
    movieIds: [...entity.movieIds],
    movieCount: entity.movieIds.size,
  }));
  const tagEntities = [...tags.values()].map((entity) => ({
    ...entity,
    sources: [...entity.sources].sort(),
    movieIds: [...entity.movieIds],
    movieCount: entity.movieIds.size,
  }));
  const byPopularityThenName = (left, right) =>
    right.movieCount - left.movieCount || left.name.localeCompare(right.name);
  personEntities.sort(byPopularityThenName);
  genreEntities.sort(byPopularityThenName);
  tagEntities.sort(byPopularityThenName);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    stats: {
      movies: Object.keys(movies).length,
      people: personEntities.length,
      genres: genreEntities.length,
      tags: tagEntities.length,
    },
    entities: {
      people: personEntities,
      genres: genreEntities,
      tags: tagEntities,
      movies,
    },
  };
}
