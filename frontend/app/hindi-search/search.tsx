"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type {
  HindiSearchResponse,
  HindiSuggestion,
} from "../../lib/hindi-search/runtime.mjs";
import styles from "./search.module.css";
import { searchUseCases } from "./use-cases";

const examples = [
  "दिल से",
  "shahrukh ki sabse achhi filmein",
  "2010 ke baad ki horror movies",
  "शाहरुख की सबसे अच्छी फिल्में",
];
const fallbackLabels: Record<string, string> = {
  model_disabled:
    "Model interpretation is off. Only catalogue aliases and limited English parsing are available.",
  hosted_disabled:
    "Model interpretation is available locally. This hosted experience uses catalogue aliases and limited English parsing.",
  timeout: "Interpretation took too long. Showing the deterministic fallback.",
  refusal:
    "The model could not interpret this request. Showing the deterministic fallback.",
  invalid_output:
    "The interpretation could not be validated. Showing the deterministic fallback.",
  incomplete_output:
    "The interpretation was incomplete. Showing the deterministic fallback.",
  provider_error:
    "The model is unavailable. Showing the deterministic fallback.",
};
export default function HindiSearch() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<HindiSuggestion[]>([]);
  const [result, setResult] = useState<HindiSearchResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [composing, setComposing] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(true);
  const requestRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => {
    if (composing || !suggestOpen || query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/hindi-search/suggestions?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        if (response.ok) setSuggestions((await response.json()).suggestions);
      } catch {
        /* Suggestions are optional; submitted search has its own error state. */
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, composing, suggestOpen]);
  async function search(value = query, limit = 24) {
    if (!value.trim() || composing) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setQuery(value);
    setSuggestOpen(false);
    setSuggestions([]);
    setPending(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/hindi-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: value, resultLimit: limit }),
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Search failed. Please try again.");
      if (!controller.signal.aborted) setResult(body);
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          error instanceof Error
            ? error.message
            : "Search failed. Please try again.",
        );
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }
  const interpretation = result?.queryPlan.interpretation;
  const filters = result?.queryPlan.filters;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          CineSeek<span>↗</span>
        </Link>
        <span className={styles.badge}>LANGUAGE LAB · 01</span>
      </header>
      <section className={styles.hero} aria-labelledby="search-heading">
        <p className={styles.eyebrow}>YOUR WORDS. YOUR SCRIPT.</p>
        <h1 id="search-heading">
          एक कहानी खोजें.
          <br />
          <span>Find your next film.</span>
        </h1>
        <p className={styles.intro}>
          Hindi, Hinglish, or a little of both. Search for a title, a person, or
          the kind of movie you feel like watching.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
          className={styles.form}
        >
          <label htmlFor="hindi-query" className={styles.label}>
            What would you like to watch?
          </label>
          <div className={styles.inputRow}>
            <input
              id="hindi-query"
              ref={inputRef}
              value={query}
              maxLength={300}
              autoComplete="off"
              placeholder="जैसे: शाहरुख की फिल्में · shahrukh ki filmein"
              onChange={(e) => {
                setSuggestions([]);
                setQuery(e.target.value);
                setSuggestOpen(true);
              }}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={() => setComposing(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSuggestOpen(false);
                if (e.key === "Enter" && e.nativeEvent.isComposing)
                  e.preventDefault();
              }}
              aria-describedby="search-hint"
            />
            <button
              type="submit"
              disabled={pending || !query.trim() || composing}
            >
              {pending ? "Searching…" : "Search ↗"}
            </button>
          </div>
          <p id="search-hint" className={styles.hint}>
            देवनागरी · Roman Hindi · English
          </p>
          {suggestOpen && suggestions.length > 0 && (
            <ul
              className={styles.suggestions}
              aria-label="Catalogue suggestions"
            >
              {suggestions.map((s) => (
                <li key={`${s.type}:${s.id}`}>
                  <button type="button" onClick={() => void search(s.query)}>
                    <span>
                      {s.name}
                      <small>
                        {s.alias.text !== s.name ? s.alias.text : s.type}
                      </small>
                    </span>
                    <span>{s.type} ↗</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
        <div className={styles.examples}>
          <span>TRY A SEARCH</span>
          {examples.map((example) => (
            <button
              type="button"
              key={example}
              onClick={() => void search(example)}
            >
              {example}
            </button>
          ))}
        </div>
        <details className={styles.useCases}>
          <summary>
            Try more test cases <span>12 examples · expected behavior</span>
          </summary>
          <p>
            Compare the interpretation with the expected behavior. Available
            films and people depend on this catalogue.
          </p>
          <div>
            {searchUseCases.map((group) => (
              <section key={group.category}>
                <h2>{group.category}</h2>
                {group.cases.map((item) => (
                  <button
                    type="button"
                    key={item.query}
                    disabled={pending}
                    onClick={() => void search(item.query)}
                  >
                    <strong>{item.query} ↗</strong>
                    <span>{item.expectation}</span>
                  </button>
                ))}
              </section>
            ))}
          </div>
        </details>
      </section>
      {error && (
        <p role="alert" className={styles.notice}>
          {error}
        </p>
      )}
      <div aria-live="polite" aria-atomic="true" className={styles.status}>
        {pending
          ? "Understanding your search…"
          : result
            ? `${result.results.total} matching movies${result.queryPlan.multilingual.blocked ? ". Some parts of your request need clarification." : "."}`
            : ""}
      </div>
      {result && (
        <section
          className={styles.workspace}
          aria-label="Search results and interpretation"
        >
          <aside className={styles.understanding}>
            <p className={styles.eyebrow}>HOW WE READ IT</p>
            <h2>Your search, understood.</h2>
            <blockquote>{result.queryPlan.rawQuery}</blockquote>
            <span className={styles.mode}>
              {interpretation?.mode === "exact_alias"
                ? "Exact catalogue match"
                : interpretation?.mode === "local_genre"
                  ? "Local genre translation · no model call"
                  : interpretation?.mode === "model"
                    ? "Model-assisted interpretation"
                    : "Deterministic fallback"}
            </span>
            {interpretation?.fallbackReason && (
              <p className={styles.notice}>
                {fallbackLabels[interpretation.fallbackReason] ??
                  "Using deterministic fallback."}
              </p>
            )}
            <dl className={styles.facts}>
              {result.queryPlan.entities.people.map((p) => (
                <div key={p.id}>
                  <dt>{p.role ?? "Person"}</dt>
                  <dd>{p.name}</dd>
                </div>
              ))}
              {!!filters?.genres.length && (
                <div>
                  <dt>Genre · {filters.genreMode}</dt>
                  <dd>{filters.genres.join(", ")}</dd>
                </div>
              )}
              {filters?.yearMin !== undefined && (
                <div>
                  <dt>From year</dt>
                  <dd>{filters.yearMin}</dd>
                </div>
              )}
              {filters?.yearMax !== undefined && (
                <div>
                  <dt>Through year</dt>
                  <dd>{filters.yearMax}</dd>
                </div>
              )}
              {filters?.ratingMin !== undefined && (
                <div>
                  <dt>MovieLens rating</dt>
                  <dd>At least {filters.ratingMin} / 5</dd>
                </div>
              )}
              {filters?.ratingCountMin !== undefined && (
                <div>
                  <dt>Rating count</dt>
                  <dd>At least {filters.ratingCountMin}</dd>
                </div>
              )}
              {result.queryPlan.sort && (
                <div>
                  <dt>Order</dt>
                  <dd>
                    {result.queryPlan.sort.field} ·{" "}
                    {result.queryPlan.sort.direction === "desc"
                      ? "highest first"
                      : "lowest first"}
                  </dd>
                </div>
              )}
            </dl>
            {!!interpretation?.unresolved.length && (
              <div className={styles.notice}>
                <strong>Needs clarification</strong>
                <ul>
                  {interpretation.unresolved.map((text, i) => (
                    <li key={i}>{text}</li>
                  ))}
                </ul>
                <p>Try a specific title or person, or rephrase these parts.</p>
              </div>
            )}
            <details className={styles.details}>
              <summary>Interpretation evidence</summary>
              <ul>
                {interpretation?.originalSpans.map((e, i) => (
                  <li key={i}>
                    <strong>{e.text}</strong>
                    <br />
                    {e.meaning}
                  </li>
                ))}
              </ul>
              {!!interpretation?.catalogueContext?.length && (
                <>
                  <h3>Catalogue context given to the model</h3>
                  <ul>
                    {interpretation.catalogueContext.map((item, index) => (
                      <li key={index}>
                        {item.name}
                        <small>
                          {item.matchedText} → {item.alias} · {item.source}
                        </small>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {!!interpretation?.matchedAliases.length && (
                <>
                  <h3>Matched names</h3>
                  <ul>
                    {interpretation.matchedAliases.map((a, i) => (
                      <li key={i}>
                        {a.alias.text} → {a.name}
                        <small>
                          {a.alias.script} · {a.alias.source}
                        </small>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p>
                {result.timings.plannerMs.toFixed(0)} ms interpretation ·{" "}
                {result.timings.retrievalMs.toFixed(0)} ms retrieval
              </p>
              {interpretation?.model && (
                <p>
                  {interpretation.model}
                  {interpretation.cacheHit ? " · cached interpretation" : ""}
                </p>
              )}
              {interpretation?.usage && (
                <p>
                  Tokens: {interpretation.usage.inputTokens} input ·{" "}
                  {interpretation.usage.outputTokens} output
                </p>
              )}
            </details>
            <p className={styles.coverage}>
              {result.coverage.moviesWithHindi.toLocaleString()} of{" "}
              {result.coverage.movies.toLocaleString()} movies have Hindi-script
              aliases. {result.coverage.peopleWithHindi.toLocaleString()} people
              have Hindi-script aliases. Results depend on catalogue coverage.
            </p>
          </aside>
          <div className={styles.results}>
            <div className={styles.resultHeading}>
              <h2>
                {result.queryPlan.multilingual.blocked
                  ? "Let’s refine that search"
                  : "In the catalogue"}
              </h2>
              <span>{result.results.total.toLocaleString()} films</span>
            </div>
            {!result.results.items.length && (
              <div className={styles.empty}>
                <span>खोज जारी है</span>
                <h3>
                  {result.queryPlan.multilingual.blocked
                    ? "A little more detail will help."
                    : "No matching films yet."}
                </h3>
                <p>
                  {result.queryPlan.multilingual.blocked
                    ? "Check the interpretation for unresolved names or requests."
                    : "Try another spelling or fewer filters. The film may not be in this catalogue."}
                </p>
                <button type="button" onClick={() => inputRef.current?.focus()}>
                  Refine your search ↑
                </button>
              </div>
            )}
            <ol className={styles.movieList}>
              {result.results.items.map((movie, index) => (
                <li key={movie.id}>
                  <span className={styles.rank}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3>{movie.title}</h3>
                    {movie.matchedAlias &&
                      movie.matchedAlias.text !== movie.title && (
                        <p className={styles.alias}>
                          {movie.matchedAlias.text}
                        </p>
                      )}
                    <p className={styles.movieMeta}>
                      {movie.year ?? "Year unknown"} <span>·</span>{" "}
                      {movie.genres.join(" / ")}
                    </p>
                    <p className={styles.reason}>{movie.matchReason}</p>
                  </div>
                  <div className={styles.rating}>
                    <strong>
                      {movie.averageRating?.toFixed(1) ?? "—"}
                      <small> / 5</small>
                    </strong>
                    <span>{movie.ratingCount ?? 0} ratings</span>
                  </div>
                </li>
              ))}
            </ol>
            {result.results.hasMore && (
              <button
                className={styles.more}
                onClick={() =>
                  void search(
                    result.queryPlan.rawQuery,
                    Math.min(200, result.results.items.length + 24),
                  )
                }
                disabled={pending || result.results.items.length >= 200}
              >
                {result.results.items.length >= 200
                  ? "Showing first 200 — refine to narrow results"
                  : "Show more films ↓"}
              </button>
            )}
          </div>
        </section>
      )}
      {!result && !pending && (
        <section className={styles.explainer}>
          <div>
            <span>01 / WRITE NATURALLY</span>
            <h2>दो लिपियाँ. एक खोज.</h2>
            <p>
              Type Hindi in देवनागरी or English characters. Mix in English words
              whenever they fit.
            </p>
          </div>
          <div>
            <span>02 / FOLLOW THE MEANING</span>
            <h2>See what search understood.</h2>
            <p>
              Inspect the names, genres and filters behind your results. Names
              resolve to films and people in the catalogue.
            </p>
          </div>
        </section>
      )}
      <footer className={styles.footer}>
        <span>CineSeek · Hindi & Hinglish experiment</span>
        <Link href="/">Back to CineSeek ↗</Link>
      </footer>
    </main>
  );
}
