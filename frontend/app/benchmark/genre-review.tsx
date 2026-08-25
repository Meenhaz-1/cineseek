"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Review = {
  reviewerId: string;
  grade: number;
  notes: string;
  reviewedAt: string;
};
type Movie = {
  docId: string;
  title: string;
  year: number | null;
  genres: string[];
  tags: string[];
  overview: string;
  averageRating: number | null;
  ratingCount: number;
  ownReview?: Review;
  reviewCount: number;
  conflict: boolean;
  finalGrade: number | null;
  adjudication?: { finalGrade: number };
  nominations?: { source: string; rank: number }[];
};
type PoolQuery = { queryId: string; queryText: string; documents: Movie[] };
type PublicationQuery = {
  queryId: string;
  top10Count: number;
  inPoolCount: number;
  finalizedCount: number;
  ready: boolean;
  actionRequired: "expand_pool" | "complete_reviews" | "none";
  missingFromPool: { docId: string; title: string }[];
  awaitingReviews: {
    docId: string;
    title: string;
    reviewCount: number;
    conflict: boolean;
  }[];
};
type Payload = {
  status: "not_built" | "frozen" | "published";
  revision?: string;
  queryIds: string[];
  pool?: PoolQuery[];
  progress?: {
    queryId: string;
    poolSize: number;
    twiceReviewed: number;
    conflicts: number;
    finalized: number;
  }[];
  publication?: {
    publishable: boolean;
    poolReviewComplete: boolean;
    queries: PublicationQuery[];
  };
  error?: string;
};

const GRADES = [
  { value: 0, label: "Not relevant", hint: "Does not satisfy the query" },
  { value: 1, label: "Plausible", hint: "Related, but a weak result" },
  { value: 2, label: "Relevant", hint: "A strong answer to the query" },
  { value: 3, label: "Exemplary", hint: "One of the best possible results" },
];

export function GenreReview({ readOnly = false }: { readOnly?: boolean }) {
  const [reviewerId, setReviewerId] = useState(
    readOnly ? "portfolio-demo" : "",
  );
  const [payload, setPayload] = useState<Payload>();
  const [selectedId, setSelectedId] = useState("q021");
  const [showCompleted, setShowCompleted] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [draftGrades, setDraftGrades] = useState<Record<string, number>>({});
  const [lastSavedKey, setLastSavedKey] = useState<string>();
  const [message, setMessage] = useState<{
    kind: "status" | "error";
    text: string;
  }>();
  const [busy, setBusy] = useState(false);
  const nextCardRef = useRef<HTMLElement>(null);

  async function load(identity = reviewerId) {
    const response = await fetch(
      `/api/benchmark-pool?reviewerId=${encodeURIComponent(identity.trim())}`,
    );
    const data = (await response.json()) as Payload;
    if (!response.ok)
      throw new Error(
        data.error ?? "The genre review pool could not be loaded.",
      );
    setPayload(data);
  }

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/benchmark-pool?reviewerId=", { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as Payload;
        if (!response.ok)
          throw new Error(
            data.error ?? "The genre review pool could not be loaded.",
          );
        setPayload(data);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setMessage({
          kind: "error",
          text:
            error instanceof Error
              ? error.message
              : "The genre review pool could not be loaded.",
        });
      });
    return () => controller.abort();
  }, []);

  async function act(body: Record<string, unknown>, success: string) {
    setBusy(true);
    setMessage(undefined);
    try {
      const response = await fetch("/api/benchmark-pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          reviewerId: reviewerId.trim(),
          expectedRevision: payload?.revision,
        }),
      });
      const data = (await response.json()) as Payload & { published?: boolean };
      if (!response.ok)
        throw new Error(data.error ?? "The review action failed.");
      if (data.published) await load();
      else setPayload(data);
      setMessage({ kind: "status", text: success });
      return true;
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof Error ? error.message : "The review action failed.",
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveReview(movie: Movie, key: string, grade: number) {
    if (readOnly) {
      setPayload((current) =>
        current
          ? {
              ...current,
              pool: current.pool?.map((query) => ({
                ...query,
                documents: query.documents.map((candidate) =>
                  query.queryId === selectedId &&
                  candidate.docId === movie.docId
                    ? {
                        ...candidate,
                        ownReview: {
                          reviewerId: "portfolio-demo",
                          grade,
                          notes: notes[key] ?? "",
                          reviewedAt: new Date().toISOString(),
                        },
                        reviewCount: 1,
                      }
                    : candidate,
                ),
              })),
            }
          : current,
      );
      setLastSavedKey(key);
      setMessage({
        kind: "status",
        text: `Demo grade ${grade} · ${GRADES[grade].label} selected for ${movie.title}. It exists only in this browser session and is not part of CineSeek's benchmark.`,
      });
      return;
    }
    const saved = await act(
      {
        action: "review",
        queryId: selectedId,
        docId: movie.docId,
        grade,
        notes: notes[key] ?? movie.ownReview?.notes ?? "",
      },
      `Your review was saved as ${grade} · ${GRADES[grade].label} for ${movie.title}. This is one independent vote, not the final benchmark grade.`,
    );
    if (!saved) return;
    setLastSavedKey(key);
    setDraftGrades((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function continueReviewing() {
    setLastSavedKey(undefined);
    setMessage(undefined);
    window.requestAnimationFrame(() => nextCardRef.current?.focus());
  }

  const selected = payload?.pool?.find(({ queryId }) => queryId === selectedId);
  const selectedProgress = payload?.progress?.find(
    ({ queryId }) => queryId === selectedId,
  );
  const selectedPublication = payload?.publication?.queries.find(
    ({ queryId }) => queryId === selectedId,
  );
  const visibleMovies = useMemo(
    () =>
      selected?.documents.filter((movie) => {
        const key = `${selectedId}:${movie.docId}`;
        return showCompleted || !movie.ownReview || key === lastSavedKey;
      }) ?? [],
    [selected, selectedId, showCompleted, lastSavedKey],
  );

  return (
    <section
      className="genreReviewWorkspace"
      aria-labelledby="genre-review-title"
    >
      <header className="genreReviewHeader">
        <div>
          <span className="sectionKicker">
            Human-reviewed discovery benchmark
          </span>
          <h2 id="genre-review-title">Genre judgment pool</h2>
          <p>
            {readOnly
              ? "Try grading the current top results to understand the review workflow. Demo grades stay only in this browser session and never change the benchmark."
              : "Each grade is your independent vote. The benchmark gets a final grade only after a second reviewer agrees, or an adjudicator resolves a disagreement."}
          </p>
        </div>
        {!readOnly && (
          <label>
            <span>Reviewer ID</span>
            <input
              value={reviewerId}
              maxLength={80}
              onChange={(event) => setReviewerId(event.target.value)}
              onBlur={() =>
                void load().catch((error) =>
                  setMessage({ kind: "error", text: error.message }),
                )
              }
              placeholder="e.g. reviewer-a"
            />
          </label>
        )}
      </header>
      <ol className="genreReviewSteps" aria-label="How genre review works">
        <li>
          <b>1</b>
          <span>Read the movie evidence</span>
        </li>
        <li>
          <b>2</b>
          <span>Select one grade</span>
        </li>
        <li>
          <b>3</b>
          <span>Save your grade explicitly</span>
        </li>
        <li>
          <b>4</b>
          <span>A second reviewer finalizes it</span>
        </li>
      </ol>
      {message && (
        <p
          className={`genreReviewMessage ${message.kind}`}
          role={message.kind === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      )}
      {payload?.status === "not_built" && (
        <div className="genreReviewEmpty">
          <p>
            {readOnly
              ? "The public repository preserves the review protocol, while active reviewer data remains private. Run CineSeek locally to build and grade a frozen review pool."
              : "Build once to freeze a reproducible pool from production, the frozen baseline, genre quality, text evidence, and existing judgments."}
          </p>
          {!readOnly && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act(
                  { action: "build" },
                  "The q021–q030 pool is frozen and ready for review.",
                )
              }
            >
              {busy ? "Building…" : "Build and freeze review pool"}
            </button>
          )}
        </div>
      )}
      {payload?.pool && (
        <>
          <div
            className="genreReviewSummary"
            aria-label="Genre review progress"
          >
            {payload.progress?.map((item) => (
              <button
                type="button"
                key={item.queryId}
                className={selectedId === item.queryId ? "selected" : ""}
                aria-pressed={selectedId === item.queryId}
                onClick={() => {
                  setSelectedId(item.queryId);
                  setLastSavedKey(undefined);
                }}
              >
                <b>{item.queryId}</b>
                <span>
                  {item.finalized}/{item.poolSize} final
                </span>
                <small>
                  {item.twiceReviewed} twice reviewed · {item.conflicts}{" "}
                  conflicts
                </small>
              </button>
            ))}
          </div>
          <div className="genreReviewTools">
            <div>
              <b>{selected?.queryText}</b>
              <span>
                <strong>{selectedProgress?.finalized ?? 0} final</strong> ·{" "}
                {selectedProgress?.twiceReviewed ?? 0} twice reviewed ·{" "}
                {selectedProgress?.poolSize ?? 0} movies in this pool
              </span>
            </div>
            <label>
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(event) => setShowCompleted(event.target.checked)}
              />{" "}
              Show movies I already graded
            </label>
            {!readOnly && (
              <button
                type="button"
                aria-describedby="publication-readiness"
                disabled={
                  busy ||
                  payload.status === "published" ||
                  !payload.publication?.publishable
                }
                onClick={() =>
                  void act(
                    { action: "publish" },
                    "Published immutable genre-reviewed-v1 artifacts.",
                  )
                }
              >
                Publish reviewed v1
              </button>
            )}
          </div>
          {selectedPublication && (
            <div
              id="publication-readiness"
              className={`genrePublicationReadiness ${selectedPublication.ready ? "ready" : "needsWork"}`}
              role="status"
            >
              <div>
                <b>
                  Current top 10: {selectedPublication.finalizedCount} of{" "}
                  {selectedPublication.top10Count} have final grades
                </b>
                <span>
                  {selectedPublication.inPoolCount} of{" "}
                  {selectedPublication.top10Count} are included in this pool
                </span>
              </div>
              {selectedPublication.actionRequired === "complete_reviews" && (
                <p>
                  <strong>No pool expansion needed.</strong> Review the
                  remaining {selectedPublication.awaitingReviews.length} movie
                  {selectedPublication.awaitingReviews.length === 1 ? "" : "s"}.
                  Each needs two independent reviews; disagreements need
                  adjudication.
                </p>
              )}
              {selectedPublication.actionRequired === "expand_pool" && (
                <p>
                  <strong>Build a new pool.</strong> Add{" "}
                  {selectedPublication.missingFromPool.length} missing top-10
                  movie
                  {selectedPublication.missingFromPool.length === 1
                    ? ""
                    : "s"}:{" "}
                  {selectedPublication.missingFromPool
                    .slice(0, 3)
                    .map(({ title }) => title)
                    .join(", ")}
                  .
                </p>
              )}
              {selectedPublication.actionRequired === "none" && (
                <p>
                  <strong>This query is ready.</strong> Every current top-10
                  movie is in the pool and has a final grade.
                </p>
              )}
            </div>
          )}
          {!readOnly && !reviewerId.trim() && (
            <p className="genreReviewMessage error" role="alert">
              Start by entering your reviewer ID. Two distinct reviewer IDs are
              required for every movie.
            </p>
          )}
          <div className="genreMovieList">
            {visibleMovies.map((movie, index) => {
              const key = `${selectedId}:${movie.docId}`;
              const selectedGrade = draftGrades[key] ?? movie.ownReview?.grade;
              const justSaved =
                key === lastSavedKey && Boolean(movie.ownReview);
              return (
                <article
                  className={`genreMovieReview ${justSaved ? "justSaved" : ""}`}
                  key={movie.docId}
                  tabIndex={-1}
                  ref={index === 0 && !justSaved ? nextCardRef : undefined}
                >
                  <header>
                    <div>
                      <span className="sectionKicker">
                        MovieLens {movie.docId}
                      </span>
                      <h3>{movie.title}</h3>
                      <p>
                        {movie.year ?? "Year unknown"} ·{" "}
                        {movie.genres.join(" / ")}
                      </p>
                    </div>
                    <div className="genreMovieRating">
                      <strong>{movie.averageRating?.toFixed(2) ?? "—"}</strong>
                      <span>{movie.ratingCount.toLocaleString()} ratings</span>
                    </div>
                  </header>
                  {movie.overview && (
                    <p className="genreMovieOverview">{movie.overview}</p>
                  )}
                  {movie.tags.length > 0 && (
                    <div className="genreMovieTags" aria-label="Movie tags">
                      {movie.tags.slice(0, 8).map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  )}
                  {justSaved && movie.ownReview && (
                    <div className="savedReviewPanel" role="status">
                      <div>
                        <span>Your review is saved</span>
                        <strong>
                          {movie.ownReview.grade} ·{" "}
                          {GRADES[movie.ownReview.grade].label}
                        </strong>
                      </div>
                      <p>
                        {readOnly
                          ? "This temporary example is not saved to the server and does not affect CineSeek's benchmark."
                          : movie.reviewCount < 2
                            ? `Review ${movie.reviewCount} of 2. Waiting for another reviewer before a final grade is assigned.`
                            : movie.finalGrade === null
                              ? "Two reviews are present, but an adjudicator must resolve the disagreement."
                              : `This movie now has final grade ${movie.finalGrade}.`}
                      </p>
                      <button type="button" onClick={continueReviewing}>
                        Continue to next ungraded movie
                      </button>
                    </div>
                  )}
                  <fieldset
                    disabled={busy || (!readOnly && !reviewerId.trim())}
                  >
                    <legend>
                      {movie.ownReview
                        ? "Change your grade"
                        : `How useful is this result for “${selected?.queryText}”?`}
                    </legend>
                    <div className="genreGradeButtons">
                      {GRADES.map(({ value, label, hint }) => (
                        <button
                          type="button"
                          key={label}
                          className={selectedGrade === value ? "selected" : ""}
                          aria-pressed={selectedGrade === value}
                          onClick={() =>
                            setDraftGrades((current) => ({
                              ...current,
                              [key]: value,
                            }))
                          }
                        >
                          <b>{value}</b>
                          <span>
                            {label}
                            <small>{hint}</small>
                          </span>
                        </button>
                      ))}
                    </div>
                    <label className="genreReviewNotes">
                      <span>Why did you choose this grade? (optional)</span>
                      <textarea
                        maxLength={500}
                        value={notes[key] ?? movie.ownReview?.notes ?? ""}
                        onChange={(event) =>
                          setNotes((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <div className="genreSaveRow">
                      <span>
                        {selectedGrade === undefined
                          ? "Select a grade to continue."
                          : readOnly
                            ? `Selected: ${selectedGrade} · ${GRADES[selectedGrade].label}. This will remain only in this browser session.`
                            : `Selected: ${selectedGrade} · ${GRADES[selectedGrade].label}. Nothing is saved yet.`}
                      </span>
                      <button
                        type="button"
                        disabled={selectedGrade === undefined || busy}
                        onClick={() =>
                          selectedGrade !== undefined &&
                          void saveReview(movie, key, selectedGrade)
                        }
                      >
                        {busy
                          ? "Saving…"
                          : readOnly
                            ? "Keep demo grade"
                            : movie.ownReview
                              ? "Save changed grade"
                              : "Save my grade"}
                      </button>
                    </div>
                  </fieldset>
                  <footer>
                    <span>
                      {movie.reviewCount} independent review
                      {movie.reviewCount === 1 ? "" : "s"}
                    </span>
                    {movie.ownReview && (
                      <span>
                        Your vote: {movie.ownReview.grade} ·{" "}
                        {GRADES[movie.ownReview.grade].label}
                      </span>
                    )}
                    {movie.finalGrade !== null && (
                      <strong>Final grade {movie.finalGrade}</strong>
                    )}
                    {movie.conflict && !movie.adjudication && (
                      <div className="genreConflict" role="alert">
                        <b>Adjudication required</b>
                        <span>Resolve as:</span>
                        {GRADES.map(({ label }, finalGrade) => (
                          <button
                            type="button"
                            key={label}
                            aria-label={`Resolve ${movie.title} as ${finalGrade} ${label}`}
                            disabled={!reviewerId.trim() || busy}
                            onClick={() =>
                              void act(
                                {
                                  action: "adjudicate",
                                  queryId: selectedId,
                                  docId: movie.docId,
                                  adjudicatorId: reviewerId.trim(),
                                  finalGrade,
                                  notes: notes[key] ?? "",
                                },
                                `Adjudicated ${movie.title} as grade ${finalGrade}.`,
                              )
                            }
                          >
                            {finalGrade}
                          </button>
                        ))}
                      </div>
                    )}
                    {movie.nominations && (
                      <details>
                        <summary>Why this movie entered the pool</summary>
                        <p>
                          {movie.nominations
                            .map(
                              ({ source, rank }) =>
                                `${source.replaceAll("_", " ")} #${rank}`,
                            )
                            .join(" · ")}
                        </p>
                      </details>
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
          {visibleMovies.length === 0 && (
            <p className="genreReviewEmpty">
              You have graded every movie in this query. Switch reviewer IDs or
              enable “Show movies I already graded.”
            </p>
          )}
        </>
      )}
    </section>
  );
}
