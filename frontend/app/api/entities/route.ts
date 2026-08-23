import path from "node:path";
import { readFile, stat } from "node:fs/promises";

export const runtime = "nodejs";

type Entity = {
  id: string;
  type: "person" | "genre" | "tag";
  name: string;
  movieCount: number;
  actorMovieCount?: number;
  directorMovieCount?: number;
  movieIds: string[];
  roles?: ("actor" | "director")[];
  tmdbId?: number | null;
  sources?: string[];
  credits?: {
    movieId: string;
    role: "actor" | "director";
    character: string;
  }[];
};
type MovieEntity = {
  id: string;
  movieLensId: string;
  name: string;
  year: number | null;
  posterPath: string | null;
  averageRating: number | null;
  ratingCount: number;
  actorIds: string[];
  directorIds: string[];
  genreIds: string[];
  tagIds: string[];
};
type Registry = {
  generatedAt: string;
  stats: { movies: number; people: number; genres: number; tags: number };
  entities: {
    people: Entity[];
    genres: Entity[];
    tags: Entity[];
    movies: Record<string, MovieEntity>;
  };
};

let registryPromise: Promise<Registry> | undefined;
let registryKey: string | undefined;

async function loadRegistry() {
  const registryPath = path.join(
    process.cwd(),
    "..",
    "data",
    "movielens",
    "entity-registry.json",
  );
  const fileStats = await stat(registryPath);
  const sourceKey = `${fileStats.size}:${fileStats.mtimeMs}`;
  if (!registryPromise || registryKey !== sourceKey) {
    registryKey = sourceKey;
    registryPromise = readFile(registryPath, "utf8").then(
      (contents) => JSON.parse(contents) as Registry,
    );
  }
  return registryPromise;
}

function collectionFor(registry: Registry, kind: string) {
  if (kind === "genre") return registry.entities.genres;
  if (kind === "tag") return registry.entities.tags;
  if (kind === "actor")
    return registry.entities.people
      .filter(({ roles }) => roles?.includes("actor"))
      .sort(
        (left, right) =>
          (right.actorMovieCount ?? 0) - (left.actorMovieCount ?? 0) ||
          left.name.localeCompare(right.name),
      );
  if (kind === "director")
    return registry.entities.people
      .filter(({ roles }) => roles?.includes("director"))
      .sort(
        (left, right) =>
          (right.directorMovieCount ?? 0) - (left.directorMovieCount ?? 0) ||
          left.name.localeCompare(right.name),
      );
  return registry.entities.people;
}

function publicEntity(entity: Entity, kind?: string) {
  const { movieIds: _movieIds, credits: _credits, ...summary } = entity;
  void _movieIds;
  void _credits;
  const movieCount =
    kind === "actor"
      ? entity.actorMovieCount
      : kind === "director"
        ? entity.directorMovieCount
        : entity.movieCount;
  return { ...summary, movieCount: movieCount ?? entity.movieCount };
}

export async function GET(request: Request) {
  try {
    const registry = await loadRegistry();
    const params = new URL(request.url).searchParams;
    const id = params.get("id");
    if (id) {
      const detailCollection = id.startsWith("person:")
        ? registry.entities.people
        : id.startsWith("genre:")
          ? registry.entities.genres
          : registry.entities.tags;
      const entity = detailCollection.find((candidate) => candidate.id === id);
      if (!entity)
        return Response.json({ error: "Entity not found" }, { status: 404 });
      const detailKind = params.get("kind") ?? undefined;
      const scopedCredits =
        detailKind === "actor" || detailKind === "director"
          ? (entity.credits?.filter(({ role }) => role === detailKind) ?? [])
          : (entity.credits ?? []);
      const creditByMovie = new Map(
        scopedCredits.map((credit) => [credit.movieId, credit]),
      );
      const scopedMovieIds = scopedCredits.length
        ? [...new Set(scopedCredits.map(({ movieId }) => movieId))]
        : entity.movieIds;
      const allRelatedMovies = scopedMovieIds
        .map((movieId) => registry.entities.movies[movieId])
        .filter(Boolean)
        .sort(
          (left, right) =>
            (right.ratingCount ?? 0) - (left.ratingCount ?? 0) ||
            left.name.localeCompare(right.name),
        )
        .map((movie) => ({
          ...movie,
          relationship: creditByMovie.get(movie.id) ?? null,
        }));
      const moviePage = Math.max(
        1,
        Number.parseInt(params.get("moviePage") ?? "1", 10) || 1,
      );
      const movieLimit = Math.min(
        48,
        Math.max(
          1,
          Number.parseInt(params.get("movieLimit") ?? "18", 10) || 18,
        ),
      );
      const movieStart = (moviePage - 1) * movieLimit;
      return Response.json({
        generatedAt: registry.generatedAt,
        entity: publicEntity(entity, detailKind),
        relatedMovies: allRelatedMovies.slice(
          movieStart,
          movieStart + movieLimit,
        ),
        relatedMovieCount: allRelatedMovies.length,
        moviePage,
        moviePages: Math.max(
          1,
          Math.ceil(allRelatedMovies.length / movieLimit),
        ),
      });
    }

    const kind = params.get("kind") ?? "actor";
    if (!new Set(["actor", "director", "genre", "tag"]).has(kind))
      return Response.json(
        { error: "Unsupported entity kind" },
        { status: 400 },
      );
    const query = (params.get("q") ?? "").trim().toLowerCase();
    const page = Math.max(
      1,
      Number.parseInt(params.get("page") ?? "1", 10) || 1,
    );
    const limit = Math.min(
      48,
      Math.max(1, Number.parseInt(params.get("limit") ?? "24", 10) || 24),
    );
    const filtered = collectionFor(registry, kind).filter(
      ({ name }) => !query || name.toLowerCase().includes(query),
    );
    const start = (page - 1) * limit;
    return Response.json({
      generatedAt: registry.generatedAt,
      stats: registry.stats,
      kind,
      query,
      page,
      limit,
      total: filtered.length,
      pages: Math.max(1, Math.ceil(filtered.length / limit)),
      items: filtered
        .slice(start, start + limit)
        .map((entity) => publicEntity(entity, kind)),
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Entity registry failed",
      },
      { status: 500 },
    );
  }
}
