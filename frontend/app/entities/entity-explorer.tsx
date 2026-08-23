"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { buildTmdbPosterUrl } from "../../lib/tmdb-images.mjs";

type Kind = "actor" | "director" | "genre" | "tag";
type EntitySummary = {
  id: string;
  type: "person" | "genre" | "tag";
  name: string;
  movieCount: number;
  roles?: string[];
  tmdbId?: number | null;
  sources?: string[];
};
type RegistryStats = {
  movies: number;
  people: number;
  genres: number;
  tags: number;
};
type EntityList = {
  stats: RegistryStats;
  kind: Kind;
  query: string;
  page: number;
  pages: number;
  total: number;
  items: EntitySummary[];
};
type RelatedMovie = {
  id: string;
  movieLensId: string;
  name: string;
  year: number | null;
  posterPath: string | null;
  averageRating: number | null;
  ratingCount: number;
  relationship: { role: "actor" | "director"; character: string } | null;
};
type EntityDetail = {
  entity: EntitySummary;
  relatedMovies: RelatedMovie[];
  relatedMovieCount: number;
  moviePage: number;
  moviePages: number;
};

const KINDS: { id: Kind; label: string; description: string }[] = [
  {
    id: "actor",
    label: "Actors",
    description: "People connected through acting credits",
  },
  {
    id: "director",
    label: "Directors",
    description: "People connected through directing credits",
  },
  {
    id: "genre",
    label: "Genres",
    description: "Canonical MovieLens genre vocabulary",
  },
  {
    id: "tag",
    label: "Tags",
    description: "Normalized MovieLens tags and TMDB keywords",
  },
];

function entityMeta(entity: EntitySummary) {
  if (entity.type === "person")
    return `${entity.roles?.join(" + ") ?? "person"} · TMDB ${entity.tmdbId ?? "name-keyed"}`;
  if (entity.type === "tag") return entity.sources?.join(" + ") ?? "tag";
  return "canonical genre";
}

export function EntityExplorer() {
  const [kind, setKind] = useState<Kind>("actor");
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [list, setList] = useState<EntityList | null>(null);
  const [listError, setListError] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  const [moviePage, setMoviePage] = useState(1);
  const [detail, setDetail] = useState<EntityDetail | null>(null);
  const [detailError, setDetailError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    void fetch(
      `/api/entities?kind=${kind}&q=${encodeURIComponent(query)}&page=${page}&limit=24`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const payload = (await response.json()) as EntityList & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(payload.error ?? "Entities could not be loaded.");
        setListError(undefined);
        setList(payload);
        if (!payload.items.length) setDetail(null);
        setSelectedId((current) =>
          payload.items.some(({ id }) => id === current)
            ? current
            : payload.items[0]?.id,
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setListError(
          error instanceof Error
            ? error.message
            : "Entities could not be loaded.",
        );
      });
    return () => controller.abort();
  }, [kind, page, query]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    void fetch(
      `/api/entities?id=${encodeURIComponent(selectedId)}&kind=${kind}&moviePage=${moviePage}&movieLimit=18`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const payload = (await response.json()) as EntityDetail & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(
            payload.error ?? "Entity relationships could not be loaded.",
          );
        setDetailError(undefined);
        setDetail(payload);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setDetailError(
          error instanceof Error
            ? error.message
            : "Entity relationships could not be loaded.",
        );
      });
    return () => controller.abort();
  }, [kind, moviePage, selectedId]);

  function chooseKind(next: Kind) {
    setKind(next);
    setPage(1);
    setMoviePage(1);
    setSelectedId(undefined);
    setDetail(null);
  }
  function search(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setMoviePage(1);
    setQuery(input.trim());
  }
  function selectEntity(id: string) {
    setSelectedId(id);
    setMoviePage(1);
  }

  return (
    <section className="entityWorkspace" aria-labelledby="entity-browser-title">
      <div className="entityWorkspaceHeader">
        <div>
          <span className="sectionKicker">Entity registry</span>
          <h2 id="entity-browser-title">Explore canonical records</h2>
        </div>
        {list?.stats && (
          <dl className="entityStats">
            <div>
              <dt>Movies</dt>
              <dd>{list.stats.movies.toLocaleString()}</dd>
            </div>
            <div>
              <dt>People</dt>
              <dd>{list.stats.people.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Genres</dt>
              <dd>{list.stats.genres.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Tags</dt>
              <dd>{list.stats.tags.toLocaleString()}</dd>
            </div>
          </dl>
        )}
      </div>
      <div className="entityTabs" role="tablist" aria-label="Entity types">
        {KINDS.map((item) => (
          <button
            type="button"
            role="tab"
            aria-selected={kind === item.id}
            aria-controls="entity-list"
            key={item.id}
            onClick={() => chooseKind(item.id)}
          >
            <b>{item.label}</b>
            <small>{item.description}</small>
          </button>
        ))}
      </div>
      <form className="entitySearch" role="search" onSubmit={search}>
        <label htmlFor="entity-search">
          Search {KINDS.find(({ id }) => id === kind)?.label.toLowerCase()}
        </label>
        <div>
          <input
            id="entity-search"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={
              kind === "actor"
                ? "Try Tom Cruise"
                : kind === "director"
                  ? "Try Christopher Nolan"
                  : kind === "genre"
                    ? "Try science fiction"
                    : "Try time travel"
            }
          />
          <button type="submit">Search</button>
          {query && (
            <button
              type="button"
              className="entityClear"
              onClick={() => {
                setInput("");
                setQuery("");
                setPage(1);
              }}
            >
              Clear
            </button>
          )}
        </div>
      </form>
      {listError && (
        <p className="entityError" role="alert">
          {listError}
        </p>
      )}
      <div className="entityBrowserGrid">
        <section
          className="entityListPanel"
          id="entity-list"
          role="tabpanel"
          aria-live="polite"
        >
          <header>
            <div>
              <b>{KINDS.find(({ id }) => id === kind)?.label}</b>
              <small>
                {list
                  ? `${list.total.toLocaleString()} entities${query ? ` matching “${query}”` : ""}`
                  : "Loading registry…"}
              </small>
            </div>
            {list && (
              <span>
                Page {list.page} of {list.pages}
              </span>
            )}
          </header>
          <div className="entityList">
            {list?.items.map((entity) => (
              <button
                type="button"
                key={entity.id}
                className={selectedId === entity.id ? "selected" : ""}
                aria-pressed={selectedId === entity.id}
                onClick={() => selectEntity(entity.id)}
              >
                <span className="entityMonogram" aria-hidden="true">
                  {entity.name.slice(0, 1).toUpperCase()}
                </span>
                <span>
                  <b>{entity.name}</b>
                  <small>{entityMeta(entity)}</small>
                </span>
                <strong>
                  {entity.movieCount.toLocaleString()}
                  <small>movies</small>
                </strong>
              </button>
            ))}
            {list && !list.items.length && (
              <p className="entityEmpty">No entities match this search.</p>
            )}
          </div>
          {list && list.pages > 1 && (
            <nav className="entityPagination" aria-label="Entity pages">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </button>
              <span>
                {((page - 1) * 24 + 1).toLocaleString()}–
                {Math.min(page * 24, list.total).toLocaleString()} of{" "}
                {list.total.toLocaleString()}
              </span>
              <button
                type="button"
                disabled={page >= list.pages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </nav>
          )}
        </section>
        <section
          className="relationshipPanel"
          aria-live="polite"
          aria-labelledby="relationship-title"
        >
          {detailError && (
            <p className="entityError" role="alert">
              {detailError}
            </p>
          )}
          {!detail && !detailError && (
            <p className="entityEmpty">
              Select an entity to inspect its movie relationships.
            </p>
          )}
          {detail && (
            <>
              <header>
                <span className="sectionKicker">Selected entity</span>
                <h3 id="relationship-title">{detail.entity.name}</h3>
                <p>
                  <code>{detail.entity.id}</code> · {entityMeta(detail.entity)}
                </p>
              </header>
              <div className="relationshipMap">
                <div className="entityHub">
                  <span>{detail.entity.type}</span>
                  <b>{detail.entity.name}</b>
                  <small>
                    {detail.relatedMovieCount.toLocaleString()} movie
                    relationships
                  </small>
                </div>
                <div className="relationshipStem" aria-hidden="true" />
                <div className="relatedMovieGrid">
                  {detail.relatedMovies.map((movie) => {
                    const posterUrl = buildTmdbPosterUrl(
                      movie.posterPath,
                      "w185",
                    );
                    return (
                      <article key={movie.id}>
                        {posterUrl ? (
                          <Image
                            src={posterUrl}
                            alt=""
                            width={92}
                            height={138}
                            unoptimized
                          />
                        ) : (
                          <span
                            className="entityMovieFallback"
                            aria-hidden="true"
                          >
                            {movie.name.slice(0, 1)}
                          </span>
                        )}
                        <div>
                          <b>{movie.name}</b>
                          <small>
                            {movie.year ?? "year unknown"} · MovieLens{" "}
                            {movie.movieLensId}
                          </small>
                          {movie.relationship && (
                            <span>
                              {movie.relationship.role}
                              {movie.relationship.character
                                ? ` · ${movie.relationship.character}`
                                : ""}
                            </span>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
              {detail.moviePages > 1 && (
                <nav
                  className="entityPagination relationshipPagination"
                  aria-label="Related movie pages"
                >
                  <button
                    type="button"
                    disabled={moviePage <= 1}
                    onClick={() => setMoviePage((current) => current - 1)}
                  >
                    Previous movies
                  </button>
                  <span>
                    Page {detail.moviePage} of {detail.moviePages}
                  </span>
                  <button
                    type="button"
                    disabled={moviePage >= detail.moviePages}
                    onClick={() => setMoviePage((current) => current + 1)}
                  >
                    Next movies
                  </button>
                </nav>
              )}
            </>
          )}
        </section>
      </div>
    </section>
  );
}
