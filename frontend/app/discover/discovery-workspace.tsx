"use client";

import { MoviePoster } from "../movie-poster";
import type { CombinedWeightKey, Mode } from "./search-contracts";
import {
  DEFAULT_RANKER_WEIGHTS,
  GENRE_WEIGHT_CONTROLS,
  RESULT_PAGE_SIZE,
  WEIGHT_CONTROLS,
} from "./search-config";
import {
  combinedTakeaway,
  coverageTakeaway,
  editTakeaway,
  exactTakeaway,
  fieldTakeaway,
  fuzzyTakeaway,
  mergeTakeaway,
  metadataTakeaway,
  orderedTakeaway,
  tokenTakeaway,
  trigramTakeaway,
} from "./search-presenters";
import { SiteHeader } from "./components/site-header";
import { SearchHero } from "./components/search-hero";
import { MovieDetailsDialog, StickySearch } from "./components/search-overlays";
import { StageSummary } from "./components/stage-summary";
import { EvaluationSection } from "./components/evaluation-section";
import { DatasetSection } from "./components/dataset-section";
import { QueryUnderstandingPanel } from "./components/query-understanding-panel";
import {
  RankingExplanation,
  RankingStageGroup,
} from "./components/ranking-explanation";
import { useDiscoverySearch } from "./use-discovery-search";

export function DiscoveryWorkspace() {
  const {
    acceptSuggestion,
    automaticCorrection,
    activeGenreWeights,
    activePlan,
    analysis,
    coach,
    combinedUpdating,
    displayedResults,
    genreWeightOverrides,
    genreWeightTotal,
    hasSearched,
    heroSearchRef,
    inferred,
    input,
    mode,
    parserTests,
    portfolioMode,
    query,
    rankerWeights,
    rankerWeightTotal,
    resetGenreWeights,
    resetRankerWeights,
    retrievalIsCurrent,
    resultsSummaryRef,
    runExample,
    runParserTests,
    searchOriginalQuery,
    selected,
    setInput,
    setSelected,
    showMoreResults,
    showStickySearch,
    submit,
    submitSticky,
    suggestedQuery,
    suggestedQueryLabel,
    titleRetrieval,
    titleRetrievalLoading,
    updateGenreWeight,
    updateRankerWeight,
  } = useDiscoverySearch();
  return (
    <main>
      <SiteHeader portfolioMode={portfolioMode} />

      <SearchHero
        input={input}
        automaticCorrection={automaticCorrection}
        suggestedQuery={suggestedQuery}
        suggestedQueryLabel={suggestedQueryLabel}
        heroSearchRef={heroSearchRef}
        onInputChange={setInput}
        onSubmit={submit}
        onAcceptSuggestion={acceptSuggestion}
        onSearchOriginal={searchOriginalQuery}
        onRunExample={runExample}
      />

      <section className="workspace" id="discover">
        <div className="modeRow">
          <div>
            <span className="sectionKicker modeKicker">
              Retrieval strategy <span>Coming soon</span>
            </span>
            <h2>Search signal options</h2>
            <p id="search-mode-status" className="modeStatus">
              These options are a preview and do not change results yet.
            </p>
          </div>
          <div
            className="segmented"
            role="group"
            aria-label="Search mode (coming soon)"
            aria-describedby="search-mode-status"
          >
            {(["lexical", "semantic", "hybrid"] as Mode[]).map((item) => (
              <button
                key={item}
                className={mode === item ? "active" : ""}
                aria-pressed={mode === item}
                disabled
                title="Coming soon"
              >
                <span>
                  {item === "lexical" ? "Aa" : item === "semantic" ? "◉" : "✦"}
                </span>
                {item}
              </button>
            ))}
          </div>
        </div>
        <div
          className="resultsHeader"
          ref={resultsSummaryRef}
          tabIndex={-1}
          aria-busy={titleRetrievalLoading}
        >
          <div>
            <h2>{hasSearched ? "Top matches" : "Example matches"}</h2>
            <p>
              {hasSearched ? "For" : "Example results for"} “{query}” ·
              full-corpus combined ranking
            </p>
          </div>
          <div className="resultsMeta">
            <span>
              {titleRetrieval.result?.searchResults.shown ?? 0} of{" "}
              {(
                titleRetrieval.result?.searchResults.total ?? 0
              ).toLocaleString()}{" "}
              matching candidates shown
            </span>
            <small>
              Card badge = normalized ranking score, not a probability
            </small>
          </div>
        </div>
        {hasSearched &&
          titleRetrieval.status === "ready" &&
          retrievalIsCurrent && (
            <p className="srOnly" role="status" aria-live="polite">
              Showing {titleRetrieval.result?.searchResults.shown ?? 0} of{" "}
              {titleRetrieval.result?.searchResults.total.toLocaleString() ?? 0}{" "}
              matching movies for {query}.
            </p>
          )}
        <div className="contentGrid">
          <div
            className="movieRail"
            aria-label="Search results"
            aria-live="polite"
          >
            {displayedResults.length === 0 && (
              <div className="emptyState">
                <b>No full-corpus records match this query.</b>
                <span>Try a wider year range or a lower rating threshold.</span>
              </div>
            )}
            {displayedResults.map((movie, index) => (
              <button
                className="movieCard"
                key={movie.id}
                onClick={() => setSelected(movie)}
                aria-label={`View details for ${movie.title}`}
              >
                <div className="cardHeading">
                  <h3>{movie.title}</h3>
                  <p>
                    {movie.year} · {movie.genres.slice(0, 2).join(" / ")}
                  </p>
                </div>
                <MoviePoster
                  key={`${movie.id}-${movie.posterPath ?? "fallback"}`}
                  movieId={movie.id}
                  title={movie.title}
                  palette={movie.palette}
                  posterPath={movie.posterPath}
                  rank={index + 1}
                  scorePercent={
                    movie.relevanceScore === undefined
                      ? undefined
                      : Math.round(
                          Math.max(0, Math.min(1, movie.relevanceScore)) * 100,
                        )
                  }
                />
                <div className="cardBody">
                  {movie.matchReason && (
                    <span className="matchReason">
                      <b>{movie.matchReason.label}</b>
                      <span>{movie.matchReason.value}</span>
                    </span>
                  )}
                  {movie.personPopularityBoost && (
                    <span className="matchReason">
                      <b>
                        Person + rating evidence +
                        {Math.round(
                          movie.personPopularityBoost.totalContribution * 100,
                        )}
                        %
                      </b>
                      <span>
                        {movie.personPopularityBoost.name} ·{" "}
                        {movie.personPopularityBoost.movieCount} catalog movies
                        ·{" "}
                        {movie.personPopularityBoost.ratingEvidenceContribution.toFixed(
                          3,
                        )}{" "}
                        rating-volume boost
                      </span>
                    </span>
                  )}
                  <div>
                    <span className="stars">★</span> {movie.rating.toFixed(1)}{" "}
                    <small>{movie.ratings} ratings</small>
                  </div>
                </div>
              </button>
            ))}
          </div>
          {titleRetrieval.result?.searchResults.hasMore && (
            <div className="resultPagination">
              <button
                type="button"
                onClick={showMoreResults}
                disabled={combinedUpdating}
                aria-busy={combinedUpdating}
              >
                {combinedUpdating
                  ? "Loading more…"
                  : `Show ${Math.min(RESULT_PAGE_SIZE, titleRetrieval.result.searchResults.total - titleRetrieval.result.searchResults.shown)} more results`}
              </button>
              <small>
                Results are loaded progressively; the complete candidate set
                remains available.
              </small>
            </div>
          )}
          <QueryUnderstandingPanel
            activePlan={activePlan}
            analysis={analysis}
            coach={coach}
            inferred={inferred}
            mode={mode}
            portfolioMode={portfolioMode}
          />
        </div>
        <RankingExplanation
          key={query}
          query={query}
          loading={titleRetrievalLoading}
          error={
            titleRetrieval.status === "error" ? titleRetrieval.error : undefined
          }
          candidateCount={
            titleRetrieval.result &&
            !titleRetrieval.result.combinedCandidates.skipped
              ? titleRetrieval.result.combinedCandidates.candidateCount
              : titleRetrieval.result?.searchResults.total
          }
          topTitle={
            titleRetrieval.result &&
            !titleRetrieval.result.combinedScoring.skipped
              ? titleRetrieval.result.combinedScoring.candidatesPreview[0]
                  ?.title
              : undefined
          }
        >
          <div className="titleLookupHeader">
            <div>
              <span className="sectionKicker">
                Technical steps · stages 3–10
              </span>
              <h2 id="title-lookup-heading">The full ranking process</h2>
              <p>
                Open a group below to see the technical checks and calculations
                behind the result order.
              </p>
            </div>
            {!titleRetrievalLoading &&
              titleRetrieval.status === "ready" &&
              titleRetrieval.result && (
                <span
                  className={`lookupOutcome ${titleRetrieval.result.exact.hit ? "hit" : "miss"}`}
                >
                  {titleRetrieval.result.exact.hit
                    ? "Exact hit · stopped"
                    : "Exact miss · continued"}
                </span>
              )}
          </div>
          <div
            className="pipelineProgress"
            aria-label="Title retrieval progress"
          >
            <span className="done">
              1 <b>Normalize</b>
            </span>
            <i>→</i>
            <span className="done">
              2 <b>Route terms</b>
            </span>
            <i>→</i>
            <span
              className={
                !titleRetrievalLoading && titleRetrieval.status === "ready"
                  ? "done"
                  : "active"
              }
            >
              3 <b>Exact lookup</b>
            </span>
            <i>→</i>
            <span
              className={
                !titleRetrievalLoading &&
                titleRetrieval.status === "ready" &&
                !titleRetrieval.result?.tokenLookup.skipped
                  ? "done"
                  : ""
              }
            >
              4 <b>Token index</b>
            </span>
            <i>+</i>
            <span
              className={
                !titleRetrievalLoading &&
                titleRetrieval.status === "ready" &&
                !titleRetrieval.result?.trigramLookup.skipped
                  ? "done"
                  : ""
              }
            >
              5 <b>Trigram index</b>
            </span>
            <i>→</i>
            <span
              className={
                !titleRetrievalLoading &&
                titleRetrieval.status === "ready" &&
                !titleRetrieval.result?.fuzzyScoring.skipped
                  ? "done"
                  : ""
              }
            >
              6 <b>Dice score</b>
            </span>
            <i>→</i>
            <span
              className={
                !titleRetrievalLoading &&
                titleRetrieval.status === "ready" &&
                !titleRetrieval.result?.editScoring.skipped
                  ? "done"
                  : ""
              }
            >
              7 <b>Edit distance</b>
            </span>
            <i>→</i>
            <span
              className={
                !titleRetrievalLoading &&
                titleRetrieval.status === "ready" &&
                !titleRetrieval.result?.tokenCoverageScoring.skipped
                  ? "done"
                  : ""
              }
            >
              8 <b>Token coverage</b>
            </span>
            <i>→</i>
            <span
              className={
                !titleRetrievalLoading &&
                titleRetrieval.status === "ready" &&
                !titleRetrieval.result?.orderedTokenProximityScoring.skipped
                  ? "done"
                  : ""
              }
            >
              9 <b>Order + proximity</b>
            </span>
            <i>→</i>
            <span
              className={
                !titleRetrievalLoading &&
                titleRetrieval.status === "ready" &&
                !titleRetrieval.result?.combinedScoring.skipped
                  ? "active"
                  : ""
              }
            >
              10 <b>Combined rank</b>
            </span>
          </div>
          {titleRetrievalLoading && (
            <p className="lookupMessage" aria-live="polite">
              Running the title retrieval pipeline…
            </p>
          )}
          {!titleRetrievalLoading && titleRetrieval.status === "error" && (
            <p className="lookupMessage error" role="alert">
              {titleRetrieval.error}
            </p>
          )}
          {!titleRetrievalLoading &&
            titleRetrieval.status === "ready" &&
            titleRetrieval.result && (
              <div className="lookupTrace">
                <RankingStageGroup
                  number="1"
                  title="Find movies"
                  description="Build one clean list of possible movies from titles, people, genres, tags, descriptions, and filters."
                  technicalLabel="candidate retrieval and filtering"
                >
                  <details className="stageDisclosure exactStage">
                    <StageSummary
                      number={3}
                      title="Look for an exact title"
                      technicalTitle="Exact-title hash lookup"
                      description="Checks whether the full search exactly matches a movie title."
                      takeaway={exactTakeaway(titleRetrieval.result)}
                      outcome={
                        titleRetrieval.result.exact.hit
                          ? `${titleRetrieval.result.exact.matches.length} exact match${titleRetrieval.result.exact.matches.length === 1 ? "" : "es"}`
                          : "Miss · continued"
                      }
                    />
                    <div className="stageDisclosureContent">
                      <div className="lookupOperation">
                        <div>
                          <label>Normalized query</label>
                          <code>
                            {titleRetrieval.result.normalizedQuery || "(empty)"}
                          </code>
                        </div>
                        <span aria-hidden="true">→</span>
                        <div>
                          <label>Hash operation</label>
                          <code>
                            titleMap.get(&quot;
                            {titleRetrieval.result.exact.lookupKey}&quot;)
                          </code>
                        </div>
                      </div>
                      <div
                        className={`residualQueryPlan ${titleRetrieval.result.retrievalQuery ? "hasResidual" : "structuredOnly"}`}
                      >
                        <div>
                          <label>Title retrieval query</label>
                          <code>
                            {titleRetrieval.result.retrievalQuery || "∅"}
                          </code>
                        </div>
                        <p>
                          {titleRetrieval.result.retrievalQuery
                            ? analysis.termRouting.titlePriority === "secondary"
                              ? "This lower-priority fallback protects title recall; genre metadata still receives the stronger ranking boost."
                              : "Only this routed title text enters the token and trigram indexes."
                            : "No free title text remains. Metadata filters can form and rank the result set without fuzzy title retrieval."}
                        </p>
                      </div>
                      <div className="lookupResult">
                        {titleRetrieval.result.exact.hit ? (
                          <>
                            <span className="lookupIcon hit" aria-hidden="true">
                              ✓
                            </span>
                            <div>
                              <b>
                                {titleRetrieval.result.exact.matches.length ===
                                1
                                  ? "The key exists in the hash map."
                                  : `${titleRetrieval.result.exact.matches.length} titles share this exact key.`}
                              </b>
                              {titleRetrieval.result.exact.matches.map(
                                (match) => (
                                  <p key={match.id}>
                                    {match.title}{" "}
                                    <small>
                                      {match.year ?? "year unknown"} · MovieLens{" "}
                                      {match.id}
                                    </small>
                                  </p>
                                ),
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            <span
                              className="lookupIcon miss"
                              aria-hidden="true"
                            >
                              ×
                            </span>
                            <div>
                              <b>No value exists for this exact key.</b>
                              <p>
                                The pipeline continues to postings-list
                                retrieval; fuzzy scoring has not started yet.
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                      <dl className="lookupStats">
                        <div>
                          <dt>Titles indexed</dt>
                          <dd>
                            {titleRetrieval.result.indexes.titleCount.toLocaleString()}
                          </dd>
                        </div>
                        <div>
                          <dt>Exact hash keys</dt>
                          <dd>
                            {titleRetrieval.result.indexes.exactKeyCount.toLocaleString()}
                          </dd>
                        </div>
                        <div>
                          <dt>Exact lookup</dt>
                          <dd>
                            {titleRetrieval.result.exact.lookupMs.toFixed(3)} ms
                          </dd>
                        </div>
                        <div>
                          <dt>Index state</dt>
                          <dd>{titleRetrieval.result.indexes.cache}</dd>
                        </div>
                      </dl>
                    </div>
                  </details>
                  {titleRetrieval.result.tokenLookup.skipped ? (
                    <details className="stageDisclosure tokenStage skipped">
                      <StageSummary
                        number={4}
                        title="Find titles with the same words"
                        technicalTitle="Token inverted index"
                        description="Finds movie titles containing any complete word from the search."
                        takeaway={tokenTakeaway(titleRetrieval.result)}
                        outcome="Skipped"
                      />
                      <div className="stageDisclosureContent">
                        <p>{titleRetrieval.result.tokenLookup.reason}</p>
                      </div>
                    </details>
                  ) : (
                    <details className="stageDisclosure tokenStage">
                      <StageSummary
                        number={4}
                        title="Find titles with the same words"
                        technicalTitle="Token inverted index"
                        description="Finds movie titles containing any complete word from the search."
                        takeaway={tokenTakeaway(titleRetrieval.result)}
                        outcome={`${titleRetrieval.result.tokenLookup.candidateCount.toLocaleString()} candidates`}
                      />
                      <div className="stageDisclosureContent">
                        <div className="tokenStageHeader">
                          <div>
                            <span className="sectionKicker">
                              Stage 4 · candidate generation
                            </span>
                            <h3>Token inverted index</h3>
                            <p>
                              Every searchable token opens one postings list.
                              Their movie IDs are combined with a set union.
                            </p>
                          </div>
                          <span>
                            {titleRetrieval.result.tokenLookup.candidateCount.toLocaleString()}{" "}
                            unranked candidates
                          </span>
                        </div>
                        <div className="tokenGroups">
                          <div>
                            <label>Searchable tokens</label>
                            <div className="chips">
                              {titleRetrieval.result.tokenLookup.tokens
                                .length ? (
                                titleRetrieval.result.tokenLookup.tokens.map(
                                  (token) => <span key={token}>{token}</span>,
                                )
                              ) : (
                                <span>none</span>
                              )}
                            </div>
                          </div>
                          <div>
                            <label>Ignored stop words</label>
                            <div className="chips muted">
                              {titleRetrieval.result.tokenLookup.ignoredTokens
                                .length ? (
                                titleRetrieval.result.tokenLookup.ignoredTokens.map(
                                  (token) => <span key={token}>{token}</span>,
                                )
                              ) : (
                                <span>none</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div
                          className="postingsTable"
                          role="table"
                          aria-label="Token postings lists"
                        >
                          <div className="postingsHeader" role="row">
                            <span role="columnheader">Token</span>
                            <span role="columnheader">Document frequency</span>
                            <span role="columnheader">Movie IDs preview</span>
                          </div>
                          {titleRetrieval.result.tokenLookup.postings.map(
                            (posting) => (
                              <div
                                className="postingsRow"
                                role="row"
                                key={posting.token}
                              >
                                <code role="cell">{posting.token}</code>
                                <strong role="cell">
                                  {posting.documentFrequency.toLocaleString()}
                                </strong>
                                <span role="cell">
                                  {posting.movieIdsPreview.length
                                    ? posting.movieIdsPreview.join(", ") +
                                      (posting.truncated ? ", …" : "")
                                    : "no postings"}
                                </span>
                              </div>
                            ),
                          )}
                        </div>
                        <div className="setComparison">
                          <article>
                            <span>OR · Union</span>
                            <strong>
                              {titleRetrieval.result.tokenLookup.candidateCount.toLocaleString()}
                            </strong>
                            <p>
                              Matches at least one searchable token. Broader
                              candidate coverage.
                            </p>
                          </article>
                          <article>
                            <span>AND · Intersection</span>
                            <strong>
                              {titleRetrieval.result.tokenLookup.intersectionCount.toLocaleString()}
                            </strong>
                            <p>
                              Matches every searchable token. One unknown token
                              can reduce this to zero.
                            </p>
                          </article>
                          <div>
                            <b>What changed?</b>
                            <p>
                              {titleRetrieval.result.tokenLookup
                                .intersectionCount === 0 &&
                              titleRetrieval.result.tokenLookup.candidateCount >
                                0
                                ? "Union still finds candidates while intersection fails because no title contains every query token."
                                : titleRetrieval.result.tokenLookup
                                      .candidateCount ===
                                    titleRetrieval.result.tokenLookup
                                      .intersectionCount
                                  ? "Every union candidate also contains every query token for this query."
                                  : `Union keeps ${titleRetrieval.result.tokenLookup.candidateCount - titleRetrieval.result.tokenLookup.intersectionCount} additional candidates that match only some tokens.`}
                            </p>
                          </div>
                        </div>
                        <div className="candidateUnion">
                          <div>
                            <label>Set union</label>
                            <code>
                              union(
                              {titleRetrieval.result.tokenLookup.tokens
                                .map((token) => `postings[${token}]`)
                                .join(", ") || "∅"}
                              )
                            </code>
                          </div>
                          <span aria-hidden="true">→</span>
                          <div>
                            <label>Candidate movie IDs</label>
                            <code>
                              {titleRetrieval.result.tokenLookup
                                .candidateIdsPreview.length
                                ? titleRetrieval.result.tokenLookup.candidateIdsPreview.join(
                                    ", ",
                                  ) +
                                  (titleRetrieval.result.tokenLookup.truncated
                                    ? ", …"
                                    : "")
                                : "∅"}
                            </code>
                          </div>
                        </div>
                        {titleRetrieval.result.tokenLookup.candidatesPreview
                          .length > 0 && (
                          <div className="candidatePreview">
                            <b>Candidate preview—not ranked</b>
                            <div>
                              {titleRetrieval.result.tokenLookup.candidatesPreview.map(
                                (candidate) => (
                                  <span key={candidate.id}>
                                    {candidate.title}{" "}
                                    <small>
                                      {candidate.year ?? "year unknown"} ·{" "}
                                      {candidate.id}
                                    </small>
                                  </span>
                                ),
                              )}
                            </div>
                          </div>
                        )}
                        <dl className="lookupStats">
                          <div>
                            <dt>Unique title tokens</dt>
                            <dd>
                              {titleRetrieval.result.indexes.tokenCount.toLocaleString()}
                            </dd>
                          </div>
                          <div>
                            <dt>Total postings</dt>
                            <dd>
                              {titleRetrieval.result.indexes.postingCount.toLocaleString()}
                            </dd>
                          </div>
                          <div>
                            <dt>Union / intersection</dt>
                            <dd>
                              {titleRetrieval.result.tokenLookup.candidateCount.toLocaleString()}{" "}
                              /{" "}
                              {titleRetrieval.result.tokenLookup.intersectionCount.toLocaleString()}
                            </dd>
                          </div>
                          <div>
                            <dt>Token lookup</dt>
                            <dd>
                              {titleRetrieval.result.tokenLookup.lookupMs.toFixed(
                                3,
                              )}{" "}
                              ms
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </details>
                  )}
                  {titleRetrieval.result.fieldLookup.skipped ? (
                    <details className="stageDisclosure tokenStage skipped">
                      <StageSummary
                        number="4B"
                        title="Match people, genres, tags, and descriptions"
                        technicalTitle="Typed-field entity index"
                        description="Checks movie details while keeping each kind of information separate."
                        takeaway={fieldTakeaway(titleRetrieval.result)}
                        outcome="Skipped"
                      />
                      <div className="stageDisclosureContent">
                        <p>{titleRetrieval.result.fieldLookup.reason}</p>
                      </div>
                    </details>
                  ) : (
                    <details className="stageDisclosure tokenStage">
                      <StageSummary
                        number="4B"
                        title="Match people, genres, tags, and descriptions"
                        technicalTitle="Typed-field entity index"
                        description="Checks movie details while keeping each kind of information separate."
                        takeaway={fieldTakeaway(titleRetrieval.result)}
                        outcome={`${titleRetrieval.result.fieldLookup.candidateCount.toLocaleString()} candidates`}
                      />
                      <div className="stageDisclosureContent">
                        <div className="tokenStageHeader">
                          <div>
                            <span className="sectionKicker">
                              Entity and document retrieval
                            </span>
                            <h3>Field-aware inverted indexes</h3>
                            <p>
                              Actor, director, genre, and tag values remain
                              typed entities. Overview text uses a lower weight
                              and requires two matching words for multi-word
                              queries.
                            </p>
                          </div>
                          <span>
                            {titleRetrieval.result.fieldLookup.candidateCount.toLocaleString()}{" "}
                            field candidates
                          </span>
                        </div>
                        <div className="tokenGroups">
                          <div>
                            <label>Searchable query tokens</label>
                            <div className="chips">
                              {titleRetrieval.result.fieldLookup.tokens.map(
                                (token) => (
                                  <span key={token}>{token}</span>
                                ),
                              )}
                            </div>
                          </div>
                          <div>
                            <label>Field priority</label>
                            <div className="chips">
                              <span>cast 1.00</span>
                              <span>director 0.95</span>
                              <span>genre 0.75</span>
                              <span>tag 0.60</span>
                              <span>description 0.30</span>
                            </div>
                          </div>
                        </div>
                        <div className="candidatePreview">
                          <b>Field-match preview</b>
                          <div>
                            {titleRetrieval.result.fieldLookup.candidatesPreview.map(
                              (candidate) => (
                                <span key={candidate.id}>
                                  {candidate.title}
                                  <small>
                                    {candidate.fieldMatch.bestMatch.label}:{" "}
                                    {candidate.fieldMatch.bestMatch.value}
                                  </small>
                                </span>
                              ),
                            )}
                          </div>
                        </div>
                        <dl className="lookupStats">
                          <div>
                            <dt>Typed-field postings</dt>
                            <dd>
                              {titleRetrieval.result.indexes.fieldPostingCount.toLocaleString()}
                            </dd>
                          </div>
                          <div>
                            <dt>Field candidates</dt>
                            <dd>
                              {titleRetrieval.result.fieldLookup.candidateCount.toLocaleString()}
                            </dd>
                          </div>
                          <div>
                            <dt>Field lookup</dt>
                            <dd>
                              {titleRetrieval.result.fieldLookup.lookupMs.toFixed(
                                3,
                              )}{" "}
                              ms
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </details>
                  )}
                  <details className="stageDisclosure mergeDisclosure metadataFilterStage">
                    <StageSummary
                      number="M"
                      title="Apply required filters"
                      technicalTitle="Metadata candidate filter"
                      description="Keeps only movies that meet the requested genre, year, or rating rules."
                      takeaway={metadataTakeaway(titleRetrieval.result)}
                      outcome={
                        titleRetrieval.result.metadataFilter.active
                          ? `${titleRetrieval.result.metadataFilter.candidateCount.toLocaleString()} eligible`
                          : "No hard filters"
                      }
                    />
                    <div className="stageDisclosureContent">
                      <div className="combinedCandidateStage">
                        <div>
                          <span className="sectionKicker">
                            Hard constraint gate
                          </span>
                          <h3>
                            {titleRetrieval.result.metadataFilter.active
                              ? "Full-corpus metadata filtering"
                              : "No metadata filtering needed"}
                          </h3>
                          <p>
                            {titleRetrieval.result.metadataFilter.active
                              ? "A movie must satisfy every listed constraint to enter the final candidate set. Title similarity cannot override this gate."
                              : "No supported metadata constraints were recognized, so candidate generation proceeds through title indexes."}
                          </p>
                        </div>
                        <strong>
                          {titleRetrieval.result.metadataFilter.candidateCount.toLocaleString()}
                          <small>eligible IDs</small>
                        </strong>
                        {titleRetrieval.result.metadataFilter.active && (
                          <div className="combinedPreview">
                            {titleRetrieval.result.metadataFilter.candidatesPreview.map(
                              (candidate) => (
                                <span key={candidate.id}>
                                  {candidate.title}
                                  <small>
                                    {candidate.year ?? "year unknown"} ·{" "}
                                    {candidate.ratingCount} ratings
                                  </small>
                                </span>
                              ),
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </details>
                  {titleRetrieval.result.trigramLookup.skipped ? (
                    <details className="stageDisclosure trigramStage skipped">
                      <StageSummary
                        number={5}
                        title="Find likely spelling matches"
                        technicalTitle="Character-trigram index"
                        description="Uses short groups of letters to find titles even when words are misspelled."
                        takeaway={trigramTakeaway(titleRetrieval.result)}
                        outcome="Skipped"
                      />
                      <div className="stageDisclosureContent">
                        <p>{titleRetrieval.result.trigramLookup.reason}</p>
                      </div>
                    </details>
                  ) : (
                    <details className="stageDisclosure trigramStage">
                      <StageSummary
                        number={5}
                        title="Find likely spelling matches"
                        technicalTitle="Character-trigram index"
                        description="Uses short groups of letters to find titles even when words are misspelled."
                        takeaway={trigramTakeaway(titleRetrieval.result)}
                        outcome={`${titleRetrieval.result.trigramLookup.candidateCount.toLocaleString()} candidates`}
                      />
                      <div className="stageDisclosureContent">
                        <div className="tokenStageHeader">
                          <div>
                            <span className="sectionKicker">
                              Stage 5 · typo-tolerant candidates
                            </span>
                            <h3>Character-trigram inverted index</h3>
                            <p>
                              The normalized query is split into overlapping
                              three-character windows. Shared fragments can
                              survive a misspelling even when complete-token
                              lookup fails.
                            </p>
                          </div>
                          <span>
                            {titleRetrieval.result.trigramLookup.candidateCount.toLocaleString()}{" "}
                            coarse candidates
                          </span>
                        </div>
                        <div className="trigramHow">
                          <div>
                            <label>Boundary markers</label>
                            <p>
                              <code>^</code> means start, <code>$</code> means
                              end, and <code>␠</code> makes spaces visible.
                            </p>
                          </div>
                          <div>
                            <label>Candidate threshold</label>
                            <p>
                              A title needs at least{" "}
                              <strong>
                                {
                                  titleRetrieval.result.trigramLookup
                                    .minimumMatches
                                }
                              </strong>{" "}
                              shared trigrams to enter this candidate set.
                            </p>
                          </div>
                        </div>
                        <div
                          className="trigramStrip"
                          aria-label="Query character trigrams"
                        >
                          {titleRetrieval.result.trigramLookup.trigrams
                            .slice(0, 40)
                            .map((trigram) => (
                              <code key={trigram}>
                                {trigram.replaceAll(" ", "␠")}
                              </code>
                            ))}
                          {titleRetrieval.result.trigramLookup.trigrams.length >
                            40 && (
                            <span>
                              +
                              {titleRetrieval.result.trigramLookup.trigrams
                                .length - 40}{" "}
                              more
                            </span>
                          )}
                        </div>
                        <div
                          className="postingsTable trigramPostings"
                          role="table"
                          aria-label="Character trigram postings lists"
                        >
                          <div className="postingsHeader" role="row">
                            <span role="columnheader">Trigram</span>
                            <span role="columnheader">Document frequency</span>
                            <span role="columnheader">Movie IDs preview</span>
                          </div>
                          {titleRetrieval.result.trigramLookup.postings
                            .slice(0, 12)
                            .map((posting) => (
                              <div
                                className="postingsRow"
                                role="row"
                                key={posting.trigram}
                              >
                                <code role="cell">
                                  {posting.trigram.replaceAll(" ", "␠")}
                                </code>
                                <strong role="cell">
                                  {posting.documentFrequency.toLocaleString()}
                                </strong>
                                <span role="cell">
                                  {posting.movieIdsPreview.length
                                    ? posting.movieIdsPreview.join(", ") +
                                      (posting.truncated ? ", …" : "")
                                    : "no postings"}
                                </span>
                              </div>
                            ))}
                        </div>
                        {titleRetrieval.result.trigramLookup.postings.length >
                          12 && (
                          <p className="tableNote">
                            Showing 12 of{" "}
                            {
                              titleRetrieval.result.trigramLookup.postings
                                .length
                            }{" "}
                            postings lists to keep the explanation readable.
                          </p>
                        )}
                        <div className="trigramCandidates">
                          <b>Highest fragment overlap—coarse retrieval only</b>
                          {titleRetrieval.result.trigramLookup.candidatesPreview
                            .length ? (
                            <div>
                              {titleRetrieval.result.trigramLookup.candidatesPreview.map(
                                (candidate) => (
                                  <article key={candidate.id}>
                                    <div>
                                      <strong>{candidate.title}</strong>
                                      <small>
                                        {candidate.year ?? "year unknown"} ·
                                        MovieLens {candidate.id}
                                      </small>
                                    </div>
                                    <span>
                                      {candidate.matchedTrigrams} matches
                                      <small>
                                        {Math.round(candidate.coverage * 100)}%
                                        query coverage
                                      </small>
                                    </span>
                                  </article>
                                ),
                              )}
                            </div>
                          ) : (
                            <p>No title met the shared-trigram threshold.</p>
                          )}
                        </div>
                        <dl className="lookupStats">
                          <div>
                            <dt>Unique title trigrams</dt>
                            <dd>
                              {titleRetrieval.result.indexes.trigramCount.toLocaleString()}
                            </dd>
                          </div>
                          <div>
                            <dt>Trigram postings</dt>
                            <dd>
                              {titleRetrieval.result.indexes.trigramPostingCount.toLocaleString()}
                            </dd>
                          </div>
                          <div>
                            <dt>Threshold / candidates</dt>
                            <dd>
                              {
                                titleRetrieval.result.trigramLookup
                                  .minimumMatches
                              }{" "}
                              /{" "}
                              {titleRetrieval.result.trigramLookup.candidateCount.toLocaleString()}
                            </dd>
                          </div>
                          <div>
                            <dt>Trigram lookup</dt>
                            <dd>
                              {titleRetrieval.result.trigramLookup.lookupMs.toFixed(
                                3,
                              )}{" "}
                              ms
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </details>
                  )}
                  {!titleRetrieval.result.combinedCandidates.skipped && (
                    <details className="stageDisclosure mergeDisclosure">
                      <StageSummary
                        number="∪"
                        title="Combine and remove duplicates"
                        technicalTitle="Candidate merge"
                        description="Combines every possible movie into one list and removes repeats."
                        takeaway={mergeTakeaway(titleRetrieval.result)}
                        outcome={`${titleRetrieval.result.combinedCandidates.candidateCount.toLocaleString()} combined IDs`}
                      />
                      <div className="stageDisclosureContent">
                        <div className="combinedCandidateStage">
                          <div>
                            <span className="sectionKicker">
                              Candidate merge
                            </span>
                            <h3>Title ∪ fuzzy ∪ field candidates</h3>
                            <p>
                              Any retrieval path can nominate a movie. Duplicate
                              IDs are removed before every candidate is scored.
                            </p>
                          </div>
                          <strong>
                            {titleRetrieval.result.combinedCandidates.candidateCount.toLocaleString()}
                            <small>combined IDs</small>
                          </strong>
                          <div className="combinedPreview">
                            {titleRetrieval.result.combinedCandidates.candidatesPreview.map(
                              (candidate) => (
                                <span key={candidate.id}>
                                  {candidate.title}
                                  <small>{candidate.sources.join(" + ")}</small>
                                </span>
                              ),
                            )}
                            {titleRetrieval.result.combinedCandidates
                              .truncated && (
                              <span>More candidates omitted from preview…</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </details>
                  )}
                  {titleRetrieval.result.combinedCandidates.skipped &&
                    !titleRetrieval.result.exact.hit && (
                      <div className="structuredQueryOutcome">
                        <span className="sectionKicker">
                          Efficient query plan
                        </span>
                        <h3>Title candidate generation skipped</h3>
                        <p>
                          {titleRetrieval.result.combinedCandidates.reason} The
                          recognized genres, years, ratings, people, and sorting
                          instructions continue through their dedicated metadata
                          paths.
                        </p>
                      </div>
                    )}
                </RankingStageGroup>
                <RankingStageGroup
                  number="2"
                  title="Compare matches"
                  description="Measure spelling, complete words, and word order to see which titles fit the search best."
                  technicalLabel="similarity and title-signal scoring"
                >
                  {!titleRetrieval.result.fuzzyScoring.skipped && (
                    <details className="stageDisclosure fuzzyScoreStage">
                      <StageSummary
                        number={6}
                        title="Compare character patterns"
                        technicalTitle="Trigram similarity"
                        description="Compares shared letter groups so short and long titles can be judged fairly."
                        takeaway={fuzzyTakeaway(titleRetrieval.result)}
                        outcome={
                          titleRetrieval.result.fuzzyScoring
                            .candidatesPreview[0]
                            ? `${titleRetrieval.result.fuzzyScoring.candidatesPreview[0].dice.toFixed(3)} · ${titleRetrieval.result.fuzzyScoring.candidatesPreview[0].title}`
                            : "No candidates"
                        }
                      />
                      <div className="stageDisclosureContent">
                        <section aria-labelledby="fuzzy-score-title">
                          <div className="fuzzyScoreHeader">
                            <div>
                              <span className="sectionKicker">
                                Stage 6 · first fuzzy ranker
                              </span>
                              <h3 id="fuzzy-score-title">
                                Jaccard versus Dice similarity
                              </h3>
                              <p>
                                Both scores normalize shared trigrams to a 0–1
                                scale, so a long title cannot win merely by
                                containing more fragments. This learning table
                                is not connected to the streaming result cards
                                yet.
                              </p>
                            </div>
                            <span>Ranked by Dice</span>
                          </div>
                          <div className="formulaCards">
                            <article>
                              <span>Jaccard</span>
                              <strong>shared / union</strong>
                              <p>
                                Strict: shared fragments divided by every unique
                                fragment found in either string.
                              </p>
                            </article>
                            <article>
                              <span>Dice</span>
                              <strong>2 × shared / (query + title)</strong>
                              <p>
                                More forgiving: shared fragments count twice in
                                the comparison.
                              </p>
                            </article>
                          </div>
                          {titleRetrieval.result.fuzzyScoring.candidatesPreview
                            .length ? (
                            <div
                              className="fuzzyScoreTable"
                              role="table"
                              aria-label="Fuzzy title similarity scores"
                            >
                              <div
                                className="fuzzyScoreRow fuzzyScoreLabels"
                                role="row"
                              >
                                <span role="columnheader">Candidate</span>
                                <span role="columnheader">Shared math</span>
                                <span role="columnheader">Jaccard</span>
                                <span role="columnheader">Dice</span>
                              </div>
                              {titleRetrieval.result.fuzzyScoring.candidatesPreview.map(
                                (candidate, index) => (
                                  <div
                                    className="fuzzyScoreRow"
                                    role="row"
                                    key={candidate.id}
                                  >
                                    <span role="cell">
                                      <b>
                                        {index + 1}. {candidate.title}
                                      </b>
                                      <small>
                                        {candidate.year ?? "year unknown"} ·
                                        MovieLens {candidate.id}
                                      </small>
                                    </span>
                                    <code role="cell">
                                      {candidate.matchedTrigrams} shared ·{" "}
                                      {candidate.queryTrigramCount} query ·{" "}
                                      {candidate.trigramCount} title
                                    </code>
                                    <span role="cell">
                                      <b>{candidate.jaccard.toFixed(3)}</b>
                                      <small>
                                        {candidate.matchedTrigrams} /{" "}
                                        {candidate.unionTrigramCount}
                                      </small>
                                    </span>
                                    <span role="cell">
                                      <b>{candidate.dice.toFixed(3)}</b>
                                      <small>
                                        {2 * candidate.matchedTrigrams} /{" "}
                                        {candidate.queryTrigramCount +
                                          candidate.trigramCount}
                                      </small>
                                    </span>
                                  </div>
                                ),
                              )}
                            </div>
                          ) : (
                            <p className="lookupMessage">
                              There are no merged candidates to score.
                            </p>
                          )}
                          {titleRetrieval.result.fuzzyScoring.truncated && (
                            <p className="tableNote">
                              Showing the top 12 of{" "}
                              {titleRetrieval.result.fuzzyScoring.candidateCount.toLocaleString()}{" "}
                              candidates after Dice sorting.
                            </p>
                          )}
                          <div className="fuzzyLesson">
                            <b>What to notice</b>
                            <p>
                              Raw overlap asks “how many fragments match?” These
                              scores ask “how similar are the strings after
                              accounting for size?” For the same two sets, Dice
                              = 2J / (1 + J), so Dice looks higher but always
                              preserves Jaccard’s ordering. The useful
                              experiment is comparing either normalized score
                              with raw overlap on short and long titles.
                            </p>
                          </div>
                        </section>
                      </div>
                    </details>
                  )}
                  {!titleRetrieval.result.editScoring.skipped &&
                    !titleRetrieval.result.fuzzyScoring.skipped && (
                      <details className="stageDisclosure editScoreStage">
                        <StageSummary
                          number={7}
                          title="Count spelling differences"
                          technicalTitle="Edit-distance scoring"
                          description="Counts how many letter changes separate the search from each title."
                          takeaway={editTakeaway(titleRetrieval.result)}
                          outcome={
                            titleRetrieval.result.editScoring
                              .candidatesPreview[0]
                              ? `${titleRetrieval.result.editScoring.candidatesPreview[0].editSimilarity.toFixed(3)} · ${titleRetrieval.result.editScoring.candidatesPreview[0].title}`
                              : "No candidates"
                          }
                        />
                        <div className="stageDisclosureContent">
                          <section aria-labelledby="edit-score-title">
                            <div className="fuzzyScoreHeader">
                              <div>
                                <span className="sectionKicker">
                                  Stage 7 · character edits
                                </span>
                                <h3 id="edit-score-title">
                                  Levenshtein edit distance
                                </h3>
                                <p>
                                  For every merged candidate, count the minimum
                                  insertions, deletions, and substitutions
                                  needed to turn the residual query into the
                                  normalized title. This comparison is still a
                                  learning ranker, not the streaming-card
                                  ranker.
                                </p>
                              </div>
                              <span>Ranked by edit similarity</span>
                            </div>
                            <div className="formulaCards editFormulaCards">
                              <article>
                                <span>Raw distance</span>
                                <strong>insert + delete + substitute</strong>
                                <p>
                                  Smaller is better, but long titles naturally
                                  have room for more edits.
                                </p>
                              </article>
                              <article>
                                <span>Normalized similarity</span>
                                <strong>1 − distance / max length</strong>
                                <p>
                                  Converts the distance to a comparable 0–1
                                  score where 1 means identical.
                                </p>
                              </article>
                            </div>
                            <div className="rankerComparison">
                              <article>
                                <span>Dice winner</span>
                                <strong>
                                  {titleRetrieval.result.fuzzyScoring
                                    .candidatesPreview[0]?.title ??
                                    "No candidate"}
                                </strong>
                                <small>
                                  {titleRetrieval.result.fuzzyScoring
                                    .candidatesPreview[0]
                                    ? titleRetrieval.result.fuzzyScoring.candidatesPreview[0].dice.toFixed(
                                        3,
                                      )
                                    : "—"}{" "}
                                  Dice
                                </small>
                              </article>
                              <article>
                                <span>Edit-distance winner</span>
                                <strong>
                                  {titleRetrieval.result.editScoring
                                    .candidatesPreview[0]?.title ??
                                    "No candidate"}
                                </strong>
                                <small>
                                  {titleRetrieval.result.editScoring
                                    .candidatesPreview[0]
                                    ? titleRetrieval.result.editScoring.candidatesPreview[0].editSimilarity.toFixed(
                                        3,
                                      )
                                    : "—"}{" "}
                                  similarity
                                </small>
                              </article>
                              <p>
                                {titleRetrieval.result.fuzzyScoring
                                  .candidatesPreview[0]?.id ===
                                titleRetrieval.result.editScoring
                                  .candidatesPreview[0]?.id
                                  ? "Both signals select the same top candidate for this query."
                                  : "The signals disagree. This is exactly the kind of case a later combined ranker must resolve."}
                              </p>
                            </div>
                            {titleRetrieval.result.editScoring.candidatesPreview
                              .length ? (
                              <div
                                className="editScoreTable"
                                role="table"
                                aria-label="Edit-distance title scores"
                              >
                                <div
                                  className="editScoreRow editScoreLabels"
                                  role="row"
                                >
                                  <span role="columnheader">Candidate</span>
                                  <span role="columnheader">
                                    Compared strings
                                  </span>
                                  <span role="columnheader">Edits</span>
                                  <span role="columnheader">Similarity</span>
                                </div>
                                {titleRetrieval.result.editScoring.candidatesPreview.map(
                                  (candidate, index) => (
                                    <div
                                      className="editScoreRow"
                                      role="row"
                                      key={candidate.id}
                                    >
                                      <span role="cell">
                                        <b>
                                          {index + 1}. {candidate.title}
                                        </b>
                                        <small>
                                          {candidate.year ?? "year unknown"} ·
                                          MovieLens {candidate.id}
                                        </small>
                                      </span>
                                      <code role="cell">
                                        <span>q: {candidate.queryText}</span>
                                        <span>t: {candidate.titleText}</span>
                                      </code>
                                      <span role="cell">
                                        <b>{candidate.editDistance}</b>
                                        <small>minimum operations</small>
                                      </span>
                                      <span role="cell">
                                        <b>
                                          {candidate.editSimilarity.toFixed(3)}
                                        </b>
                                        <small>
                                          1 − {candidate.editDistance}/
                                          {candidate.maximumLength}
                                        </small>
                                      </span>
                                    </div>
                                  ),
                                )}
                              </div>
                            ) : (
                              <p className="lookupMessage">
                                There are no merged candidates to score.
                              </p>
                            )}
                            {titleRetrieval.result.editScoring.truncated && (
                              <p className="tableNote">
                                Showing the top 12 of{" "}
                                {titleRetrieval.result.editScoring.candidateCount.toLocaleString()}{" "}
                                candidates after normalized edit-similarity
                                sorting.
                              </p>
                            )}
                            <div className="editLesson">
                              <b>Important limitation</b>
                              <p>
                                Standard Levenshtein treats an adjacent swap as
                                two edits. A later Damerau–Levenshtein
                                experiment can count that transposition as one,
                                which is useful for typing errors such as
                                swapped letters.
                              </p>
                            </div>
                          </section>
                        </div>
                      </details>
                    )}
                  {!titleRetrieval.result.tokenCoverageScoring.skipped &&
                    !titleRetrieval.result.fuzzyScoring.skipped && (
                      <details className="stageDisclosure coverageScoreStage">
                        <StageSummary
                          number={8}
                          title="Check complete matching words"
                          technicalTitle="Exact token coverage"
                          description="Checks how many complete search words appear in each title."
                          takeaway={coverageTakeaway(titleRetrieval.result)}
                          outcome={
                            titleRetrieval.result.tokenCoverageScoring
                              .candidatesPreview[0]
                              ? `${Math.round(titleRetrieval.result.tokenCoverageScoring.candidatesPreview[0].coverage * 100)}% · ${titleRetrieval.result.tokenCoverageScoring.candidatesPreview[0].title}`
                              : "No candidates"
                          }
                        />
                        <div className="stageDisclosureContent">
                          <section aria-labelledby="coverage-score-title">
                            <div className="fuzzyScoreHeader">
                              <div>
                                <span className="sectionKicker">
                                  Stage 8 · query completeness
                                </span>
                                <h3 id="coverage-score-title">
                                  Exact token coverage
                                </h3>
                                <p>
                                  For every merged candidate, ask what share of
                                  the unique searchable query tokens appears as
                                  complete title tokens. This corrects the
                                  short-title bias exposed by “fury road.”
                                </p>
                              </div>
                              <span>Ranked by coverage</span>
                            </div>
                            <div className="coverageFormula">
                              <span>Token coverage</span>
                              <strong>
                                matched query tokens / searchable query tokens
                              </strong>
                              <p>
                                For <code>fury road</code>, Mad Max: Fury Road
                                scores 2/2 = 100%, while Glory Road scores 1/2 =
                                50%.
                              </p>
                            </div>
                            <div className="rankerComparison coverageComparison">
                              <article>
                                <span>Dice winner</span>
                                <strong>
                                  {titleRetrieval.result.fuzzyScoring
                                    .candidatesPreview[0]?.title ??
                                    "No candidate"}
                                </strong>
                                <small>
                                  {titleRetrieval.result.fuzzyScoring
                                    .candidatesPreview[0]
                                    ? titleRetrieval.result.fuzzyScoring.candidatesPreview[0].dice.toFixed(
                                        3,
                                      )
                                    : "—"}{" "}
                                  Dice
                                </small>
                              </article>
                              <article>
                                <span>Coverage winner</span>
                                <strong>
                                  {titleRetrieval.result.tokenCoverageScoring
                                    .candidatesPreview[0]?.title ??
                                    "No candidate"}
                                </strong>
                                <small>
                                  {titleRetrieval.result.tokenCoverageScoring
                                    .candidatesPreview[0]
                                    ? `${Math.round(titleRetrieval.result.tokenCoverageScoring.candidatesPreview[0].coverage * 100)}% coverage`
                                    : "—"}
                                </small>
                              </article>
                              <p>
                                {titleRetrieval.result.fuzzyScoring
                                  .candidatesPreview[0]?.id ===
                                titleRetrieval.result.tokenCoverageScoring
                                  .candidatesPreview[0]?.id
                                  ? "Both signals select the same top candidate."
                                  : "Coverage changes the winner because it rewards candidates that contain more complete query words."}
                              </p>
                            </div>
                            {titleRetrieval.result.tokenCoverageScoring
                              .candidatesPreview.length ? (
                              <div
                                className="coverageScoreTable"
                                role="table"
                                aria-label="Exact query-token coverage scores"
                              >
                                <div
                                  className="coverageScoreRow coverageScoreLabels"
                                  role="row"
                                >
                                  <span role="columnheader">Candidate</span>
                                  <span role="columnheader">Matched</span>
                                  <span role="columnheader">Missing</span>
                                  <span role="columnheader">Coverage</span>
                                </div>
                                {titleRetrieval.result.tokenCoverageScoring.candidatesPreview.map(
                                  (candidate, index) => (
                                    <div
                                      className="coverageScoreRow"
                                      role="row"
                                      key={candidate.id}
                                    >
                                      <span role="cell">
                                        <b>
                                          {index + 1}. {candidate.title}
                                        </b>
                                        <small>
                                          {candidate.year ?? "year unknown"} ·
                                          MovieLens {candidate.id}
                                        </small>
                                      </span>
                                      <div className="chips" role="cell">
                                        {candidate.matchedTokens.length ? (
                                          candidate.matchedTokens.map(
                                            (token) => (
                                              <span key={token}>{token}</span>
                                            ),
                                          )
                                        ) : (
                                          <span className="routeEmpty">
                                            none
                                          </span>
                                        )}
                                      </div>
                                      <div
                                        className="chips missingTokens"
                                        role="cell"
                                      >
                                        {candidate.missingTokens.length ? (
                                          candidate.missingTokens.map(
                                            (token) => (
                                              <span key={token}>{token}</span>
                                            ),
                                          )
                                        ) : (
                                          <span>none</span>
                                        )}
                                      </div>
                                      <span role="cell">
                                        <b>
                                          {Math.round(candidate.coverage * 100)}
                                          %
                                        </b>
                                        <small>
                                          {candidate.matchedTokenCount} /{" "}
                                          {candidate.queryTokenCount}
                                        </small>
                                      </span>
                                    </div>
                                  ),
                                )}
                              </div>
                            ) : (
                              <p className="lookupMessage">
                                There are no merged candidates to score.
                              </p>
                            )}
                            {titleRetrieval.result.tokenCoverageScoring
                              .truncated && (
                              <p className="tableNote">
                                Showing the top 12 of{" "}
                                {titleRetrieval.result.tokenCoverageScoring.candidateCount.toLocaleString()}{" "}
                                candidates after token-coverage sorting.
                              </p>
                            )}
                            <div className="coverageLesson">
                              <b>Why continue to Stage 9?</b>
                              <p>
                                <code>fury road</code> and{" "}
                                <code>road fury</code> both give Mad Max: Fury
                                Road 100% basic coverage. The next stage
                                separates them by alignment order and token
                                gaps.
                              </p>
                            </div>
                          </section>
                        </div>
                      </details>
                    )}
                  {!titleRetrieval.result.orderedTokenProximityScoring
                    .skipped && (
                    <details className="stageDisclosure orderedScoreStage">
                      <StageSummary
                        number={9}
                        title="Check word order and closeness"
                        technicalTitle="Order and proximity"
                        description="Rewards titles where matching words appear in the same order and close together."
                        takeaway={orderedTakeaway(titleRetrieval.result)}
                        outcome={
                          titleRetrieval.result.orderedTokenProximityScoring
                            .candidatesPreview[0]
                            ? `${Math.round(titleRetrieval.result.orderedTokenProximityScoring.candidatesPreview[0].orderedCoverage * 100)}% ordered · ${titleRetrieval.result.orderedTokenProximityScoring.candidatesPreview[0].title}`
                            : "No candidates"
                        }
                      />
                      <div className="stageDisclosureContent">
                        <section aria-labelledby="ordered-score-title">
                          <div className="fuzzyScoreHeader">
                            <div>
                              <span className="sectionKicker">
                                Stage 9 · sequence and distance
                              </span>
                              <h3 id="ordered-score-title">
                                Ordered coverage + proximity explorer
                              </h3>
                              <p>
                                Search a different query to rebuild every
                                alignment below. Each candidate exposes the
                                left-to-right token matches, their title
                                positions, the span they occupy, and whether
                                they form an exact phrase.
                              </p>
                            </div>
                            <span>
                              Live for “{titleRetrieval.result.retrievalQuery}”
                            </span>
                          </div>
                          <div className="orderedQueryStrip">
                            <span>Searchable query tokens</span>
                            <div>
                              {titleRetrieval.result.orderedTokenProximityScoring.queryTokens.map(
                                (token, index) => (
                                  <code key={`${token}-${index}`}>
                                    <i>{index}</i>
                                    {token}
                                  </code>
                                ),
                              )}
                            </div>
                          </div>
                          <div className="orderedFormulaGrid">
                            <article>
                              <span>Ordered coverage</span>
                              <strong>
                                left-to-right matches / query tokens
                              </strong>
                              <p>
                                Wrong-order words cannot all join the same
                                alignment.
                              </p>
                            </article>
                            <article>
                              <span>Proximity</span>
                              <strong>
                                matched tokens / matched title span
                              </strong>
                              <p>
                                Adjacent matches score 1.0; intervening title
                                words widen the span.
                              </p>
                            </article>
                            <article>
                              <span>Phrase match</span>
                              <strong>full coverage + zero gaps</strong>
                              <p>
                                A phrase is a complete ordered alignment with
                                neighboring positions.
                              </p>
                            </article>
                          </div>
                          {titleRetrieval.result.orderedTokenProximityScoring
                            .candidatesPreview.length ? (
                            <div
                              className="orderedScoreTable"
                              role="table"
                              aria-label="Ordered token coverage and proximity scores"
                            >
                              <div
                                className="orderedScoreRow orderedScoreLabels"
                                role="row"
                              >
                                <span role="columnheader">
                                  Candidate + alignment
                                </span>
                                <span role="columnheader">
                                  Ordered coverage
                                </span>
                                <span role="columnheader">Proximity</span>
                                <span role="columnheader">Phrase</span>
                              </div>
                              {titleRetrieval.result.orderedTokenProximityScoring.candidatesPreview.map(
                                (candidate, index) => (
                                  <div
                                    className="orderedScoreRow"
                                    role="row"
                                    key={candidate.id}
                                  >
                                    <span role="cell">
                                      <b>
                                        {index + 1}. {candidate.title}
                                      </b>
                                      <small>
                                        {candidate.year ?? "year unknown"} ·
                                        MovieLens {candidate.id}
                                      </small>
                                      <span
                                        className="candidateTokenTrace"
                                        aria-label={`Token alignment for ${candidate.title}`}
                                      >
                                        {candidate.candidateTokens.map(
                                          (token, titleIndex) => (
                                            <code
                                              className={
                                                candidate.matchedTitleIndexes.includes(
                                                  titleIndex,
                                                )
                                                  ? "matched"
                                                  : ""
                                              }
                                              key={`${token}-${titleIndex}`}
                                            >
                                              <i>{titleIndex}</i>
                                              {token}
                                            </code>
                                          ),
                                        )}
                                      </span>
                                      <small className="alignmentTrace">
                                        {candidate.alignment.length
                                          ? candidate.alignment
                                              .map(
                                                ({
                                                  token,
                                                  queryIndex,
                                                  titleIndex,
                                                }) =>
                                                  `${token}: q${queryIndex}→t${titleIndex}`,
                                              )
                                              .join(" · ")
                                          : "No ordered token alignment"}
                                      </small>
                                    </span>
                                    <span role="cell">
                                      <b>
                                        {Math.round(
                                          candidate.orderedCoverage * 100,
                                        )}
                                        %
                                      </b>
                                      <small>
                                        {candidate.matchedTokenCount}/
                                        {candidate.queryTokenCount} tokens
                                      </small>
                                    </span>
                                    <span role="cell">
                                      <b>{candidate.proximity.toFixed(3)}</b>
                                      <small>
                                        {candidate.matchedTokenCount}/
                                        {candidate.matchSpan || "—"} span ·{" "}
                                        {candidate.gapCount} gaps
                                      </small>
                                    </span>
                                    <span role="cell">
                                      <b
                                        className={
                                          candidate.phraseMatch
                                            ? "phraseYes"
                                            : "phraseNo"
                                        }
                                      >
                                        {candidate.phraseMatch ? "Yes" : "No"}
                                      </b>
                                      <small>
                                        {candidate.phraseMatch
                                          ? "adjacent + complete"
                                          : candidate.missingTokens.length
                                            ? `missing: ${candidate.missingTokens.join(", ")}`
                                            : "ordered, but separated"}
                                      </small>
                                    </span>
                                  </div>
                                ),
                              )}
                            </div>
                          ) : (
                            <p className="lookupMessage">
                              There are no merged candidates to align.
                            </p>
                          )}
                          {titleRetrieval.result.orderedTokenProximityScoring
                            .truncated && (
                            <p className="tableNote">
                              Showing the top 12 of{" "}
                              {titleRetrieval.result.orderedTokenProximityScoring.candidateCount.toLocaleString()}{" "}
                              candidates after ordered-coverage and proximity
                              sorting.
                            </p>
                          )}
                          <div className="orderedLesson">
                            <b>Try this comparison</b>
                            <p>
                              Search <code>fury road</code>, then{" "}
                              <code>road fury</code>. Basic coverage stays the
                              same for Mad Max: Fury Road, while the alignment,
                              ordered coverage, and phrase result change.
                            </p>
                          </div>
                        </section>
                      </div>
                    </details>
                  )}
                </RankingStageGroup>
                <RankingStageGroup
                  number="3"
                  title="Rank results"
                  description="Combine title matches with people, genres, tags, ratings, and other movie details."
                  technicalLabel="combined multi-field ranking"
                >
                  {!titleRetrieval.result.combinedScoring.skipped && (
                    <details className="stageDisclosure combinedRankerStage">
                      <StageSummary
                        number={10}
                        title="Combine all the evidence"
                        technicalTitle="Combined explainable ranker"
                        description="Combines title and movie-detail matches into the final result order."
                        takeaway={combinedTakeaway(titleRetrieval.result)}
                        outcome={
                          combinedUpdating
                            ? "Updating…"
                            : titleRetrieval.result.combinedScoring
                                  .candidatesPreview[0]
                              ? `${titleRetrieval.result.combinedScoring.candidatesPreview[0].combinedScore.toFixed(3)} · ${titleRetrieval.result.combinedScoring.candidatesPreview[0].title}`
                              : "No candidates"
                        }
                      />
                      <div className="stageDisclosureContent">
                        <section aria-labelledby="combined-ranker-title">
                          <div className="combinedRankerHeader">
                            <div>
                              <span className="sectionKicker">
                                Stage 10 · weighted decision
                              </span>
                              <h3 id="combined-ranker-title">
                                Build the final multi-field score
                              </h3>
                              <p>
                                {titleRetrieval.result.combinedScoring
                                  .rankingContext.structuredGenreDiscovery
                                  ? "This genre-only query uses adjustable centrality, rating quality, and rating-count evidence instead of title similarity."
                                  : "The six adjustable signals form the title score. It contributes 35% of the final score; typed-field evidence contributes 65% so exact people and directors outrank incidental description text."}
                              </p>
                            </div>
                            {titleRetrieval.result.combinedScoring
                              .rankingContext.structuredGenreDiscovery ? (
                              <button
                                type="button"
                                onClick={resetGenreWeights}
                                disabled={genreWeightOverrides === null}
                              >
                                Reset genre weights
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={resetRankerWeights}
                                disabled={Object.entries(
                                  DEFAULT_RANKER_WEIGHTS,
                                ).every(
                                  ([key, value]) =>
                                    rankerWeights[key as CombinedWeightKey] ===
                                    value,
                                )}
                              >
                                Reset weights
                              </button>
                            )}
                          </div>
                          {titleRetrieval.result.combinedScoring.rankingContext
                            .structuredGenreDiscovery && (
                            <div className="orderedLesson" role="note">
                              <b>Structured genre ranking is active</b>
                              <p>
                                Because the query contains only genre
                                constraints, title weights are not used. This{" "}
                                {titleRetrieval.result.combinedScoring
                                  .rankingContext.structuredGenreProfile ===
                                "single_genre_balanced"
                                  ? "balanced single-genre profile favors well-supported, recognizable choices"
                                  : "compound-genre profile emphasizes central fit across every requested genre"}
                                .
                              </p>
                              <p>
                                Rating count is a log-scaled MovieLens
                                popularity proxy, not global awareness. The card
                                match value is a weighted ranking score, not a
                                probability.
                              </p>
                            </div>
                          )}
                          {titleRetrieval.result.combinedScoring.rankingContext
                            .structuredGenreDiscovery &&
                            activeGenreWeights && (
                              <>
                                <div
                                  className="weightControlGrid genreWeightControlGrid"
                                  role="group"
                                  aria-label="Genre ranking weights"
                                >
                                  {GENRE_WEIGHT_CONTROLS.map(
                                    ({ key, label, hint }) => (
                                      <label key={key}>
                                        <span>
                                          <b>{label}</b>
                                          <small>{hint}</small>
                                        </span>
                                        <input
                                          type="range"
                                          min="0"
                                          max="100"
                                          step="5"
                                          value={activeGenreWeights[key]}
                                          aria-describedby={`genre-weight-${key}-value`}
                                          onChange={(event) =>
                                            updateGenreWeight(
                                              key,
                                              Number(event.target.value),
                                            )
                                          }
                                        />
                                        <output
                                          id={`genre-weight-${key}-value`}
                                        >
                                          <b>{activeGenreWeights[key]}</b>
                                          <small>
                                            {Math.round(
                                              (activeGenreWeights[key] /
                                                genreWeightTotal) *
                                                100,
                                            )}
                                            % effective
                                          </small>
                                        </output>
                                      </label>
                                    ),
                                  )}
                                </div>
                                <div className="weightTotal">
                                  <span>Relative-weight total</span>
                                  <strong>{genreWeightTotal}</strong>
                                  <p>
                                    Average rating contributes only after a
                                    movie has at least{" "}
                                    {
                                      titleRetrieval.result.combinedScoring
                                        .rankingContext
                                        .minimumAverageRatingCount
                                    }{" "}
                                    ratings. Eligible movies then use a{" "}
                                    {
                                      titleRetrieval.result.combinedScoring
                                        .rankingContext.bayesianPrior
                                    }
                                    -rating prior. Scores are normalized so the
                                    effective weights always total 100%.
                                  </p>
                                  <i role="status" aria-live="polite">
                                    {combinedUpdating
                                      ? "Recalculating genre results…"
                                      : genreWeightOverrides
                                        ? "Custom genre weights applied."
                                        : "Active profile defaults applied."}
                                  </i>
                                </div>
                              </>
                            )}
                          <div
                            className="weightControlGrid"
                            hidden={
                              titleRetrieval.result.combinedScoring
                                .rankingContext.structuredGenreDiscovery
                            }
                          >
                            {WEIGHT_CONTROLS.map(({ key, label, hint }) => (
                              <label key={key}>
                                <span>
                                  <b>{label}</b>
                                  <small>{hint}</small>
                                </span>
                                <input
                                  type="range"
                                  min="0"
                                  max="100"
                                  step="5"
                                  value={rankerWeights[key]}
                                  onChange={(event) =>
                                    updateRankerWeight(
                                      key,
                                      Number(event.target.value),
                                    )
                                  }
                                />
                                <output>
                                  <b>{rankerWeights[key]}</b>
                                  <small>
                                    {Math.round(
                                      (rankerWeights[key] / rankerWeightTotal) *
                                        100,
                                    )}
                                    % effective
                                  </small>
                                </output>
                              </label>
                            ))}
                          </div>
                          <div
                            className="weightTotal"
                            hidden={
                              titleRetrieval.result.combinedScoring
                                .rankingContext.structuredGenreDiscovery
                            }
                          >
                            <span>Relative-weight total</span>
                            <strong>{rankerWeightTotal}</strong>
                            <p>
                              Scores are divided by this total, so the six
                              effective percentages always add to 100%.
                            </p>
                            {combinedUpdating && (
                              <i>Recalculating candidates…</i>
                            )}
                          </div>
                          {titleRetrieval.result.combinedScoring.rankingContext
                            .structuredGenreDiscovery &&
                            titleRetrieval.result.combinedScoring
                              .candidatesPreview.length > 0 && (
                              <div
                                className="combinedRankTable"
                                role="table"
                                aria-label="Structured genre ranking scores"
                              >
                                <div
                                  className="combinedRankRow combinedRankLabels"
                                  role="row"
                                >
                                  <span role="columnheader">Candidate</span>
                                  <span role="columnheader">
                                    Structured evidence
                                  </span>
                                  <span role="columnheader">Score</span>
                                </div>
                                {titleRetrieval.result.combinedScoring.candidatesPreview.map(
                                  (candidate, index) => (
                                    <div
                                      className="combinedRankRow"
                                      role="row"
                                      key={candidate.id}
                                    >
                                      <span role="cell">
                                        <b>
                                          {index + 1}. {candidate.title}
                                        </b>
                                        <small>
                                          {candidate.year ?? "year unknown"} ·
                                          MovieLens {candidate.id}
                                        </small>
                                      </span>
                                      <div
                                        className="contributionChips"
                                        role="cell"
                                      >
                                        <span>
                                          <i>Genre focus</i>
                                          <b>
                                            {Math.round(
                                              candidate.genreFocus * 100,
                                            )}
                                            % · +
                                            {candidate.structuredGenreContributions.genreFocus.toFixed(
                                              3,
                                            )}
                                          </b>
                                        </span>
                                        <span>
                                          <i>Bayesian rating</i>
                                          <b>
                                            {candidate.averageRatingEligible
                                              ? `${candidate.bayesianRating.toFixed(2)}/5`
                                              : "Not used (<5 ratings)"}
                                            {" · +"}
                                            {candidate.structuredGenreContributions.bayesianRating.toFixed(
                                              3,
                                            )}
                                          </b>
                                        </span>
                                        <span>
                                          <i>Rating evidence</i>
                                          <b>
                                            {Math.round(
                                              candidate.ratingEvidence * 100,
                                            )}
                                            % · +
                                            {candidate.structuredGenreContributions.ratingEvidence.toFixed(
                                              3,
                                            )}
                                          </b>
                                        </span>
                                      </div>
                                      <span role="cell">
                                        <b>
                                          {candidate.structuredGenreScore.toFixed(
                                            3,
                                          )}
                                        </b>
                                        <small>structured discovery</small>
                                      </span>
                                    </div>
                                  ),
                                )}
                              </div>
                            )}
                          {titleRetrieval.result.combinedScoring
                            .candidatesPreview[0] && (
                            <div className="winnerBreakdown">
                              <div>
                                <span className="sectionKicker">
                                  Winning contribution breakdown
                                </span>
                                <h4>
                                  {
                                    titleRetrieval.result.combinedScoring
                                      .candidatesPreview[0].title
                                  }
                                </h4>
                                <strong>
                                  {titleRetrieval.result.combinedScoring.candidatesPreview[0].combinedScore.toFixed(
                                    3,
                                  )}
                                  <small>final blended score</small>
                                </strong>
                              </div>
                              <div className="contributionBars">
                                {WEIGHT_CONTROLS.map(({ key, label }) => {
                                  const winner =
                                    titleRetrieval.result!.combinedScoring;
                                  if (winner.skipped) return null;
                                  const top = winner.candidatesPreview[0];
                                  const finalContribution =
                                    top.contributions[key] *
                                    winner.rankingContext.titleWeight;
                                  return (
                                    <div key={key}>
                                      <span>{label}</span>
                                      <i>
                                        <b
                                          style={{
                                            width: `${Math.max(2, top.signals[key] * 100)}%`,
                                          }}
                                        />
                                      </i>
                                      <code>
                                        title signal{" "}
                                        {top.contributions[key].toFixed(3)} ×{" "}
                                        {Math.round(
                                          winner.rankingContext.titleWeight *
                                            100,
                                        )}
                                        % ={" "}
                                        <strong>
                                          {finalContribution.toFixed(3)}
                                        </strong>
                                      </code>
                                    </div>
                                  );
                                })}
                                {titleRetrieval.result.combinedScoring
                                  .candidatesPreview[0].fieldMatch
                                  ?.bestMatch && (
                                  <div className="fieldContribution">
                                    <span>
                                      {
                                        titleRetrieval.result.combinedScoring
                                          .candidatesPreview[0].fieldMatch
                                          .bestMatch.label
                                      }
                                      :{" "}
                                      {
                                        titleRetrieval.result.combinedScoring
                                          .candidatesPreview[0].fieldMatch
                                          .bestMatch.value
                                      }
                                    </span>
                                    <i>
                                      <b
                                        style={{
                                          width: `${titleRetrieval.result.combinedScoring.candidatesPreview[0].fieldScore * 100}%`,
                                        }}
                                      />
                                    </i>
                                    <code>
                                      field signal{" "}
                                      {titleRetrieval.result.combinedScoring.candidatesPreview[0].fieldScore.toFixed(
                                        3,
                                      )}{" "}
                                      ×{" "}
                                      {Math.round(
                                        titleRetrieval.result.combinedScoring
                                          .rankingContext.fieldWeight * 100,
                                      )}
                                      % ={" "}
                                      <strong>
                                        {(
                                          titleRetrieval.result.combinedScoring
                                            .candidatesPreview[0].fieldScore *
                                          titleRetrieval.result.combinedScoring
                                            .rankingContext.fieldWeight
                                        ).toFixed(3)}
                                      </strong>
                                    </code>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          {titleRetrieval.result.combinedScoring
                            .candidatesPreview.length ? (
                            <div
                              className="combinedRankTable"
                              role="table"
                              aria-label="Combined explainable multi-field scores"
                            >
                              <div
                                className="combinedRankRow combinedRankLabels"
                                role="row"
                              >
                                <span role="columnheader">Candidate</span>
                                <span role="columnheader">
                                  Final contributions
                                </span>
                                <span role="columnheader">Combined</span>
                              </div>
                              {titleRetrieval.result.combinedScoring.candidatesPreview.map(
                                (candidate, index) => (
                                  <div
                                    className="combinedRankRow"
                                    role="row"
                                    key={candidate.id}
                                  >
                                    <span role="cell">
                                      <b>
                                        {index + 1}. {candidate.title}
                                      </b>
                                      <small>
                                        {candidate.year ?? "year unknown"} ·
                                        MovieLens {candidate.id}
                                      </small>
                                    </span>
                                    <div
                                      className="contributionChips"
                                      role="cell"
                                    >
                                      {WEIGHT_CONTROLS.map(({ key, label }) => (
                                        <span
                                          key={key}
                                          title={`${label}: ${candidate.contributions[key].toFixed(3)} within the title score × ${Math.round(titleRetrieval.result!.combinedScoring.skipped ? 0 : titleRetrieval.result!.combinedScoring.rankingContext.titleWeight * 100)}% title blend`}
                                        >
                                          <i>{label}</i>
                                          <b>
                                            +
                                            {(
                                              candidate.contributions[key] *
                                              (titleRetrieval.result!
                                                .combinedScoring.skipped
                                                ? 0
                                                : titleRetrieval.result!
                                                    .combinedScoring
                                                    .rankingContext.titleWeight)
                                            ).toFixed(3)}
                                          </b>
                                        </span>
                                      ))}
                                      {candidate.fieldMatch?.bestMatch && (
                                        <span
                                          className="fieldContribution"
                                          title={`${candidate.fieldMatch.bestMatch.label}: ${candidate.fieldMatch.bestMatch.value}`}
                                        >
                                          <i>
                                            {
                                              candidate.fieldMatch.bestMatch
                                                .label
                                            }
                                          </i>
                                          <b>
                                            +
                                            {(
                                              candidate.fieldScore *
                                              (titleRetrieval.result!
                                                .combinedScoring.skipped
                                                ? 0
                                                : titleRetrieval.result!
                                                    .combinedScoring
                                                    .rankingContext.fieldWeight)
                                            ).toFixed(3)}
                                          </b>
                                        </span>
                                      )}
                                    </div>
                                    <span role="cell">
                                      <b>
                                        {candidate.combinedScore.toFixed(3)}
                                      </b>
                                      <small>
                                        {candidate.fieldMatch?.bestMatch
                                          ? `${Math.round(titleRetrieval.result!.combinedScoring.skipped ? 0 : titleRetrieval.result!.combinedScoring.rankingContext.titleWeight * 100)}% title + ${Math.round(titleRetrieval.result!.combinedScoring.skipped ? 0 : titleRetrieval.result!.combinedScoring.rankingContext.fieldWeight * 100)}% ${candidate.fieldMatch.bestMatch.label.toLowerCase()}`
                                          : "weighted title score"}
                                      </small>
                                    </span>
                                  </div>
                                ),
                              )}
                            </div>
                          ) : (
                            <p className="lookupMessage">
                              There are no merged candidates to combine.
                            </p>
                          )}
                          {titleRetrieval.result.combinedScoring.truncated && (
                            <p className="tableNote">
                              Showing the top 12 of{" "}
                              {titleRetrieval.result.combinedScoring.candidateCount.toLocaleString()}{" "}
                              candidates after combined scoring.
                            </p>
                          )}
                        </section>
                      </div>
                    </details>
                  )}
                </RankingStageGroup>
              </div>
            )}
        </RankingExplanation>
      </section>

      <EvaluationSection
        parserTests={parserTests}
        onRunParserTests={runParserTests}
      />
      <DatasetSection />

      <footer>
        <a className="brand" href="#top">
          <span className="brandMark">C</span>
          <span>CineSeek</span>
        </a>
        <p>
          Explainable movie search · MovieLens data · Reproducible evaluation
        </p>
        <a
          href="https://grouplens.org/datasets/movielens/"
          target="_blank"
          rel="noreferrer"
        >
          Dataset source ↗
        </a>
      </footer>

      {showStickySearch && (
        <StickySearch
          input={input}
          mode={mode}
          onInputChange={setInput}
          onSubmit={submitSticky}
        />
      )}

      {selected && (
        <MovieDetailsDialog
          movie={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}
