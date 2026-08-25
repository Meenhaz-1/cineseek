"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Query = { id: string; text: string; category: string };
type Movie = {
  id: string;
  title: string;
  year: number | null;
  genres: string[];
  averageRating: number | null;
  ratingCount: number;
};
type Judgment = {
  queryId: string;
  corpusId: string;
  score: number;
  movie?: Movie;
};
type Payload = {
  source: "draft" | "provisional";
  revision: string;
  queries: Query[];
  judgments: Judgment[];
  suggestedNextId: string;
  categories: string[];
};
type SaveState = {
  status: "idle" | "saving" | "saved" | "error";
  message?: string;
};

const GRADES = [
  { value: 0, label: "0 · Not relevant" },
  { value: 1, label: "1 · Plausible" },
  { value: 2, label: "2 · Relevant" },
  { value: 3, label: "3 · Exact or ideal" },
];

function nextId(queries: Query[]) {
  const largest = queries.reduce(
    (maximum, query) => Math.max(maximum, Number(query.id.slice(1)) || 0),
    0,
  );
  return `q${String(largest + 1).padStart(3, "0")}`;
}

export function BenchmarkEditor({ readOnly = false }: { readOnly?: boolean }) {
  const [payload, setPayload] = useState<Payload>();
  const [queries, setQueries] = useState<Query[]>([]);
  const [judgments, setJudgments] = useState<Judgment[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [queryFilter, setQueryFilter] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [movieInput, setMovieInput] = useState("");
  const [movieMatches, setMovieMatches] = useState<Movie[]>([]);
  const [movieSearchError, setMovieSearchError] = useState<string>();
  const detailRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/benchmark-editor", { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as Payload & { error?: string };
        if (!response.ok)
          throw new Error(data.error ?? "The benchmark could not be loaded.");
        setPayload(data);
        setQueries(data.queries);
        setJudgments(data.judgments);
        setSelectedId(data.queries[0]?.id);
        setLoadError(undefined);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setLoadError(
          error instanceof Error
            ? error.message
            : "The benchmark could not be loaded.",
        );
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [dirty]);

  const selected = queries.find(({ id }) => id === selectedId);
  const selectedJudgments = judgments.filter(
    ({ queryId }) => queryId === selectedId,
  );
  const filteredQueries = useMemo(() => {
    const filter = queryFilter.trim().toLowerCase();
    return queries.filter(
      (query) =>
        !filter ||
        query.id.toLowerCase().includes(filter) ||
        query.text.toLowerCase().includes(filter) ||
        query.category.includes(filter),
    );
  }, [queries, queryFilter]);

  function updateSelected(patch: Partial<Query>) {
    if (!selectedId) return;
    setQueries((current) =>
      current.map((query) =>
        query.id === selectedId ? { ...query, ...patch } : query,
      ),
    );
    setDirty(true);
    setSaveState({ status: "idle" });
  }

  function addQuery() {
    const id = nextId(queries);
    const query = { id, text: "", category: "new_query" };
    setQueries((current) => [...current, query]);
    setSelectedId(id);
    setDirty(true);
    setSaveState({ status: "idle" });
  }

  function selectQuery(id: string) {
    setSelectedId(id);
    if (window.matchMedia("(max-width: 1050px)").matches) {
      window.requestAnimationFrame(() =>
        detailRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      );
    }
  }

  async function searchMovies(event: FormEvent) {
    event.preventDefault();
    try {
      const response = await fetch(
        `/api/benchmark-editor?movieQuery=${encodeURIComponent(movieInput.trim())}`,
      );
      const result = (await response.json()) as {
        items?: Movie[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "Movie lookup failed.");
      setMovieMatches(result.items ?? []);
      setMovieSearchError(undefined);
    } catch (error) {
      setMovieSearchError(
        error instanceof Error ? error.message : "Movie lookup failed.",
      );
    }
  }

  function addJudgment(movie: Movie) {
    if (
      !selectedId ||
      judgments.some(
        (judgment) =>
          judgment.queryId === selectedId && judgment.corpusId === movie.id,
      )
    )
      return;
    setJudgments((current) => [
      ...current,
      { queryId: selectedId, corpusId: movie.id, score: 2, movie },
    ]);
    setDirty(true);
    setSaveState({ status: "idle" });
    setMovieMatches([]);
    setMovieInput("");
  }

  function updateGrade(corpusId: string, score: number) {
    setJudgments((current) =>
      current.map((judgment) =>
        judgment.queryId === selectedId && judgment.corpusId === corpusId
          ? { ...judgment, score }
          : judgment,
      ),
    );
    setDirty(true);
    setSaveState({ status: "idle" });
  }

  function removeJudgment(corpusId: string) {
    setJudgments((current) =>
      current.filter(
        (judgment) =>
          !(judgment.queryId === selectedId && judgment.corpusId === corpusId),
      ),
    );
    setDirty(true);
    setSaveState({ status: "idle" });
  }

  async function saveDraft() {
    if (!payload) return;
    setSaveState({ status: "saving" });
    try {
      const response = await fetch("/api/benchmark-editor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: payload.revision,
          queries,
          judgments: judgments.map(({ queryId, corpusId, score }) => ({
            queryId,
            corpusId,
            score,
          })),
        }),
      });
      const result = (await response.json()) as {
        revision?: string;
        savedAt?: string;
        error?: string;
      };
      if (!response.ok || !result.revision)
        throw new Error(
          result.error ?? "The benchmark draft could not be saved.",
        );
      setPayload((current) =>
        current
          ? { ...current, source: "draft", revision: result.revision! }
          : current,
      );
      setDirty(false);
      setSaveState({
        status: "saved",
        message: `Saved locally at ${new Date(result.savedAt ?? Date.now()).toLocaleTimeString()}.`,
      });
    } catch (error) {
      setSaveState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "The benchmark draft could not be saved.",
      });
    }
  }

  if (loadError)
    return (
      <section className="benchmarkWorkspace">
        <p className="benchmarkAlert" role="alert">
          {loadError}
        </p>
      </section>
    );
  if (!payload)
    return (
      <section className="benchmarkWorkspace">
        <p className="benchmarkLoading" aria-live="polite">
          Loading benchmark queries and judgments…
        </p>
      </section>
    );

  return (
    <section
      className="benchmarkWorkspace"
      aria-labelledby="benchmark-editor-title"
    >
      <header className="benchmarkWorkspaceHeader">
        <div>
          <span className="sectionKicker">Draft split editor</span>
          <h2 id="benchmark-editor-title">Queries and relevance judgments</h2>
          <p>
            Loaded from <b>{payload.source}</b>.{" "}
            {readOnly
              ? "This deployment lets you inspect the benchmark without changing its source files."
              : "Saving writes queries.draft.jsonl and qrels/draft.tsv; provisional files remain unchanged."}
          </p>
        </div>
        {!readOnly && (
          <div className="benchmarkActions">
            <span className={dirty ? "dirty" : "clean"}>
              {dirty ? "Unsaved changes" : "All changes saved"}
            </span>
            <button
              type="button"
              onClick={saveDraft}
              disabled={!dirty || saveState.status === "saving"}
            >
              {saveState.status === "saving" ? "Saving…" : "Save draft"}
            </button>
          </div>
        )}
      </header>
      {saveState.message && (
        <p
          className={`benchmarkSaveMessage ${saveState.status}`}
          role={saveState.status === "error" ? "alert" : "status"}
        >
          {saveState.message}
        </p>
      )}
      <div className="benchmarkSummary">
        <div>
          <span>Queries</span>
          <strong>{queries.length}</strong>
        </div>
        <div>
          <span>Judgments</span>
          <strong>{judgments.length}</strong>
        </div>
        <div>
          <span>Average judgments/query</span>
          <strong>
            {queries.length
              ? (judgments.length / queries.length).toFixed(2)
              : "0"}
          </strong>
        </div>
        <div>
          <span>Unjudged queries</span>
          <strong>
            {
              queries.filter(
                (query) =>
                  !judgments.some(({ queryId }) => queryId === query.id),
              ).length
            }
          </strong>
        </div>
      </div>
      <div className="benchmarkEditorGrid">
        <aside
          className="benchmarkQueryPanel"
          aria-label="Benchmark query list"
        >
          <div className="benchmarkQueryTools">
            <label htmlFor="benchmark-query-filter">Find a query</label>
            <input
              id="benchmark-query-filter"
              value={queryFilter}
              onChange={(event) => setQueryFilter(event.target.value)}
              placeholder="ID, text, or category"
            />
            {!readOnly && (
              <button type="button" onClick={addQuery}>
                Add query
              </button>
            )}
          </div>
          <div className="benchmarkQueryList">
            {filteredQueries.map((query) => {
              const count = judgments.filter(
                ({ queryId }) => queryId === query.id,
              ).length;
              return (
                <button
                  type="button"
                  key={query.id}
                  className={selectedId === query.id ? "selected" : ""}
                  aria-pressed={selectedId === query.id}
                  onClick={() => selectQuery(query.id)}
                >
                  <span>
                    <b>{query.id}</b>
                    <small>{query.category.replaceAll("_", " ")}</small>
                  </span>
                  <p>{query.text || "Untitled new query"}</p>
                  <strong>
                    {count}
                    <small>judgments</small>
                  </strong>
                </button>
              );
            })}
          </div>
        </aside>
        <section ref={detailRef} className="benchmarkDetail" aria-live="polite">
          {selected ? (
            <>
              <header>
                <span className="sectionKicker">Editing {selected.id}</span>
                <h3>{selected.text || "New benchmark query"}</h3>
              </header>
              <div className="benchmarkFields">
                <label htmlFor="benchmark-query-text">
                  <span>Query text</span>
                  <textarea
                    id="benchmark-query-text"
                    value={selected.text}
                    maxLength={300}
                    disabled={readOnly}
                    onChange={(event) =>
                      updateSelected({ text: event.target.value })
                    }
                  />
                  <small>{selected.text.length}/300 characters</small>
                </label>
                <label htmlFor="benchmark-category">
                  <span>Category</span>
                  <input
                    id="benchmark-category"
                    list="benchmark-categories"
                    value={selected.category}
                    disabled={readOnly}
                    onChange={(event) =>
                      updateSelected({
                        category: event.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, "_")
                          .replace(/^_|_$/g, ""),
                      })
                    }
                  />
                  <datalist id="benchmark-categories">
                    {payload.categories.map((category) => (
                      <option value={category} key={category} />
                    ))}
                  </datalist>
                  <small>Lowercase words separated by underscores</small>
                </label>
              </div>
              <section
                className="judgmentEditor"
                aria-labelledby="judgment-title"
              >
                <div className="judgmentHeader">
                  <div>
                    <span className="sectionKicker">Graded relevance</span>
                    <h4 id="judgment-title">Movie judgments</h4>
                  </div>
                  <span>{selectedJudgments.length} judged movies</span>
                </div>
                {selectedJudgments.length ? (
                  <div className="judgmentList">
                    {selectedJudgments.map((judgment) => (
                      <article key={judgment.corpusId}>
                        <div>
                          <b>
                            {judgment.movie?.title ??
                              `MovieLens ${judgment.corpusId}`}
                          </b>
                          <small>
                            {judgment.movie
                              ? `${judgment.movie.year ?? "year unknown"} · ${judgment.movie.genres.slice(0, 3).join(" / ")}`
                              : `MovieLens ${judgment.corpusId}`}
                          </small>
                        </div>
                        <label>
                          <span className="srOnly">
                            Relevance grade for{" "}
                            {judgment.movie?.title ?? judgment.corpusId}
                          </span>
                          <select
                            value={judgment.score}
                            disabled={readOnly}
                            onChange={(event) =>
                              updateGrade(
                                judgment.corpusId,
                                Number(event.target.value),
                              )
                            }
                          >
                            {GRADES.map((grade) => (
                              <option value={grade.value} key={grade.value}>
                                {grade.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => removeJudgment(judgment.corpusId)}
                            aria-label={`Remove judgment for ${judgment.movie?.title ?? judgment.corpusId}`}
                          >
                            Remove
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="benchmarkEmpty">
                    No relevance judgments yet. Add at least one ideal or
                    relevant movie before evaluating this query.
                  </p>
                )}
                {!readOnly && (
                  <form className="movieLookup" onSubmit={searchMovies}>
                    <label htmlFor="judgment-movie-search">
                      Add a movie judgment
                    </label>
                    <div>
                      <input
                        id="judgment-movie-search"
                        value={movieInput}
                        onChange={(event) => setMovieInput(event.target.value)}
                        placeholder="Search title or MovieLens ID"
                      />
                      <button type="submit">Find movies</button>
                    </div>
                  </form>
                )}
                {movieSearchError && (
                  <p className="benchmarkAlert" role="alert">
                    {movieSearchError}
                  </p>
                )}
                {!readOnly && movieMatches.length > 0 && (
                  <div className="movieLookupResults" aria-live="polite">
                    {movieMatches.map((movie) => {
                      const alreadyAdded = judgments.some(
                        (judgment) =>
                          judgment.queryId === selectedId &&
                          judgment.corpusId === movie.id,
                      );
                      return (
                        <button
                          type="button"
                          key={movie.id}
                          disabled={alreadyAdded}
                          onClick={() => addJudgment(movie)}
                        >
                          <span>
                            <b>{movie.title}</b>
                            <small>
                              {movie.year ?? "year unknown"} · MovieLens{" "}
                              {movie.id}
                            </small>
                          </span>
                          <strong>{alreadyAdded ? "Added" : "Add"}</strong>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          ) : (
            <p className="benchmarkEmpty">
              Select or add a query to begin editing.
            </p>
          )}
        </section>
      </div>
    </section>
  );
}
