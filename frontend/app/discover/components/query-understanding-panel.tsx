import type { QueryPlan } from "../../../lib/query-planner.mjs";
import type { Mode } from "../search-contracts";
import type { QueryAnalysis } from "../search-presenters";

function TechnicalLabel({ children }: { children: string }) {
  return <small className="technicalLabel">Technical: {children}</small>;
}

function intentLabel(intent: QueryAnalysis["intent"]) {
  return {
    exact_title: "A specific movie title",
    person_discovery: "Movies connected to a person",
    filtered_discovery: "Movies that meet your requirements",
    sorted_discovery: "Movies in a requested order",
    discovery: "Movies matching a theme or genre",
    general_search: "A general movie search",
  }[intent];
}

export function QueryUnderstandingPanel({
  activePlan,
  analysis,
  inferred,
  mode,
}: {
  activePlan?: QueryPlan;
  analysis: QueryAnalysis;
  inferred: string[];
  mode: Mode;
}) {
  const hasFilters =
    analysis.yearMin !== undefined ||
    analysis.yearMax !== undefined ||
    analysis.ratingMin !== undefined ||
    analysis.ratingCountMin !== undefined;

  return (
    <aside
      className="debugPanel queryUnderstandingPanel"
      aria-label="How CineSeek understood your search"
    >
      <div className="panelTitle">
        <div>
          <span className="sectionKicker">Your search, explained</span>
          <h2>How CineSeek understood your search</h2>
          <p>
            These are the words, names, genres, and instructions CineSeek found
            in your search.
          </p>
        </div>
        <span className="live">
          <i /> Analysis ready
        </span>
      </div>

      <div className="debugBlock summaryBlock">
        <label>Search used</label>
        <TechnicalLabel>normalized query</TechnicalLabel>
        <code>{analysis.normalized}</code>
        <small className="fieldReason">
          {activePlan?.corrections.length
            ? "CineSeek used the corrected wording shown below."
            : "No spelling fix was needed."}
        </small>
      </div>

      <div
        className="debugBlock correctionBlock summaryBlock"
        aria-live="polite"
      >
        <label>Spelling fixes</label>
        <TechnicalLabel>typed corrections</TechnicalLabel>
        {activePlan?.corrections.length ? (
          <div className="typedCorrections">
            {activePlan.corrections.map((correction) => (
              <article key={`${correction.entityType}-${correction.original}`}>
                <div>
                  <b>
                    {correction.original} <span aria-hidden="true">→</span>{" "}
                    {correction.replacement}
                  </b>
                  <small>
                    {correction.entityType}
                    {correction.role ? ` · ${correction.role}` : ""}
                  </small>
                </div>
                <span>
                  <strong>
                    {correction.policy === "automatic"
                      ? "Applied"
                      : "Needs your approval"}
                  </strong>
                  <small>
                    {Math.round(correction.confidence * 100)}% confidence
                  </small>
                </span>
              </article>
            ))}
          </div>
        ) : (
          <p className="noCorrection">No spelling fix was needed.</p>
        )}
      </div>

      <div className="debugBlock summaryBlock">
        <label>Search type</label>
        <TechnicalLabel>intent</TechnicalLabel>
        <p>
          <span className="intentIcon">⌕</span> {intentLabel(analysis.intent)}
        </p>
        <small className="fieldReason">
          This helps CineSeek choose the right way to find movies.
        </small>
      </div>

      <div className="debugBlock summaryBlock peopleGenresBlock">
        <label>People and genres found</label>
        <TechnicalLabel>recognized entities</TechnicalLabel>
        <div className="summaryEntityRow">
          <span>People</span>
          <div className="chips">
            {analysis.people.length ? (
              analysis.people.map((person) => (
                <span key={person}>{person}</span>
              ))
            ) : analysis.personCandidates[0] ? (
              <span>
                Possible: {analysis.personCandidates[0].name} ·{" "}
                {analysis.personCandidates[0].movieCount} movies
              </span>
            ) : (
              <span>None</span>
            )}
          </div>
        </div>
        <div className="summaryEntityRow">
          <span>Genres</span>
          <div className="chips">
            {analysis.genres.length ? (
              <>
                {analysis.genres.map((genre) => (
                  <span key={genre}>{genre}</span>
                ))}
                {analysis.genres.length > 1 && (
                  <span>Match {analysis.genreMode}</span>
                )}
              </>
            ) : (
              <span>None</span>
            )}
          </div>
        </div>
      </div>

      <div className="debugBlock summaryBlock">
        <label>Required filters</label>
        <TechnicalLabel>hard filters</TechnicalLabel>
        <div className="chips">
          {analysis.yearMin !== undefined && (
            <span>From {analysis.yearMin}</span>
          )}
          {analysis.yearMax !== undefined && (
            <span>Up to {analysis.yearMax}</span>
          )}
          {analysis.ratingMin !== undefined && (
            <span>Rating above {analysis.ratingMin}</span>
          )}
          {analysis.ratingCountMin !== undefined && (
            <span>At least {analysis.ratingCountMin} ratings</span>
          )}
          {!hasFilters && <span>None</span>}
        </div>
        <small className="fieldReason">
          {hasFilters
            ? "Movies must meet every requirement shown here."
            : "No year or rating requirement was found."}
        </small>
      </div>

      <div className="debugBlock summaryBlock">
        <label>Sort order</label>
        <TechnicalLabel>sort</TechnicalLabel>
        <div className="chips">
          <span>
            {analysis.sort === "newest"
              ? "Newest movies first"
              : "Best matches first"}
          </span>
        </div>
        <small className="fieldReason">
          {analysis.sort === "newest"
            ? "You asked to see newer movies first."
            : "Results are ordered by how well they match your search."}
        </small>
      </div>

      <details className="queryAdvancedDetails">
        <summary>
          <span>
            <b>More search details</b>
            <small>See how CineSeek sent each part of your search.</small>
          </span>
          <span className="stageChevron" aria-hidden="true">
            ⌄
          </span>
        </summary>
        <div className="queryAdvancedContent">
          <div className="debugBlock">
            <label>Words checked in titles</label>
            <TechnicalLabel>title retrieval query</TechnicalLabel>
            <code>
              {analysis.retrievalQuery || "None: title matching was not needed"}
            </code>
            <small className="fieldReason">
              {analysis.retrievalQuery
                ? "These words were compared with movie titles."
                : "People, genres, or filters fully described this search."}
            </small>
          </div>

          <section
            className="termRoutingPanel"
            aria-labelledby="term-routing-title"
          >
            <div className="termRoutingHeader">
              <div>
                <span className="sectionKicker">Where each word goes</span>
                <h3 id="term-routing-title">Search paths</h3>
                <TechnicalLabel>term routing</TechnicalLabel>
              </div>
              <span>{analysis.termRouting.strategy.replaceAll("_", " ")}</span>
            </div>
            <div className="routingLanes">
              <article>
                <label>Title words</label>
                <div className="chips">
                  {analysis.termRouting.titleText ? (
                    <span>{analysis.termRouting.titleText}</span>
                  ) : analysis.termRouting.strategy === "exact_title" ? (
                    <span>Exact title check</span>
                  ) : (
                    <span className="routeEmpty">Not needed</span>
                  )}
                </div>
                <small>Technical path: title retrieval</small>
              </article>
              <article>
                <label>Themes and ideas</label>
                <div className="chips">
                  {analysis.termRouting.concepts.length ? (
                    analysis.termRouting.concepts.map((concept) => (
                      <span key={concept}>{concept}</span>
                    ))
                  ) : (
                    <span className="routeEmpty">None</span>
                  )}
                </div>
                <small>Technical path: descriptive ranking</small>
              </article>
              <article>
                <label>Movie details</label>
                <div className="chips">
                  {[
                    ...analysis.termRouting.genres.map(
                      (value) => `Genre: ${value}`,
                    ),
                    ...analysis.termRouting.people.map(
                      (value) => `Person: ${value}`,
                    ),
                    ...analysis.termRouting.filters,
                  ].length ? (
                    [
                      ...analysis.termRouting.genres.map(
                        (value) => `Genre: ${value}`,
                      ),
                      ...analysis.termRouting.people.map(
                        (value) => `Person: ${value}`,
                      ),
                      ...analysis.termRouting.filters,
                    ].map((value) => <span key={value}>{value}</span>)
                  ) : (
                    <span className="routeEmpty">None</span>
                  )}
                </div>
                <small>Technical path: metadata and entity indexes</small>
              </article>
              <article>
                <label>Instructions</label>
                <div className="chips">
                  {[
                    ...analysis.termRouting.sort,
                    ...analysis.termRouting.structural,
                  ].length ? (
                    [
                      ...analysis.termRouting.sort,
                      ...analysis.termRouting.structural,
                    ].map((value) => <span key={value}>{value}</span>)
                  ) : (
                    <span className="routeEmpty">None</span>
                  )}
                </div>
                <small>Technical path: control language</small>
              </article>
            </div>
          </section>

          <div className="debugBlock">
            <label>Requests CineSeek could not apply</label>
            <TechnicalLabel>unavailable constraints</TechnicalLabel>
            <div className="chips">
              {analysis.unavailableFilters.length ? (
                analysis.unavailableFilters.map((filter) => (
                  <span key={filter}>{filter}</span>
                ))
              ) : (
                <span>None</span>
              )}
            </div>
          </div>

          <div className="debugBlock">
            <label>Themes used for ranking</label>
            <TechnicalLabel>ranking concepts</TechnicalLabel>
            <div className="chips">
              {analysis.concepts.length ? (
                analysis.concepts
                  .slice(0, 5)
                  .map((token) => <span key={token}>{token}</span>)
              ) : (
                <span>None</span>
              )}
            </div>
          </div>

          <div className="debugBlock">
            <label>Related words</label>
            <TechnicalLabel>semantic expansion</TechnicalLabel>
            <div className="flow">
              <span>{analysis.concepts[0] ?? "Movie"}</span>
              <i>→</i>
              <span>{inferred[0] ?? "No related word found"}</span>
            </div>
            <small className="fieldReason">
              Related words help CineSeek recognize similar wording.
            </small>
          </div>

          <details className="debugBlock traceBlock">
            <summary>Step-by-step decisions</summary>
            <TechnicalLabel>rule trace</TechnicalLabel>
            <ol className="trace">
              {analysis.trace.map((step, index) => (
                <li key={`${index}-${step}`}>
                  <span>{index + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </details>

          <div className="scoreMix">
            <div>
              <span>Planned word matching</span>
              <b>{mode === "lexical" ? 100 : mode === "hybrid" ? 45 : 15}%</b>
            </div>
            <div>
              <span>Planned meaning matching</span>
              <b>{mode === "semantic" ? 85 : mode === "hybrid" ? 55 : 0}%</b>
            </div>
            <div className="meter">
              <i
                style={{
                  width:
                    mode === "hybrid"
                      ? "55%"
                      : mode === "semantic"
                        ? "85%"
                        : "0%",
                }}
              />
            </div>
            <small className="scoreMixTechnical">
              Coming soon: this preview is not used to rank current results.
            </small>
          </div>
        </div>
      </details>
    </aside>
  );
}
