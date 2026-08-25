"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { examples, movies, type Movie } from "./data";
import { MoviePoster } from "./movie-poster";
import type { QueryPlan } from "../lib/query-planner.mjs";
import benchmarkSummary from "../data/benchmark-summary.json";

type Mode = "lexical" | "semantic" | "hybrid";
type CombinedWeightKey =
  | "tokenCoverage"
  | "orderedCoverage"
  | "phraseMatch"
  | "proximity"
  | "dice"
  | "editSimilarity";
type CombinedWeights = Record<CombinedWeightKey, number>;
const DEFAULT_RANKER_WEIGHTS: CombinedWeights = {
  tokenCoverage: 25,
  orderedCoverage: 20,
  phraseMatch: 15,
  proximity: 10,
  dice: 15,
  editSimilarity: 15,
};
const RESULT_PAGE_SIZE = 24;
const RESULT_PALETTES = [
  "jade",
  "gold",
  "rose",
  "blue",
  "violet",
  "orange",
  "indigo",
  "sand",
  "fire",
  "teal",
  "pink",
  "sky",
];
const WEIGHT_CONTROLS: {
  key: CombinedWeightKey;
  label: string;
  hint: string;
}[] = [
  {
    key: "tokenCoverage",
    label: "Token coverage",
    hint: "Complete query words present",
  },
  {
    key: "orderedCoverage",
    label: "Ordered coverage",
    hint: "Words preserved left to right",
  },
  {
    key: "phraseMatch",
    label: "Phrase bonus",
    hint: "Complete adjacent phrase",
  },
  {
    key: "proximity",
    label: "Proximity",
    hint: "Matched words close together",
  },
  { key: "dice", label: "Dice similarity", hint: "Shared character trigrams" },
  {
    key: "editSimilarity",
    label: "Edit similarity",
    hint: "Whole-string character closeness",
  },
];
type CoachState = {
  status: "loading" | "ready" | "unavailable";
  paragraph?: string;
  detail?: string;
  model?: string;
};
type ParserMismatch = { field: string; expected: string; actual: string };
type ParserTestReport = {
  generatedAt: string;
  totals: {
    all: number;
    executed: number;
    passed: number;
    failed: number;
    planned: number;
  };
  results: {
    caseId: string;
    category: string;
    query: string;
    passed: boolean;
    mismatches: ParserMismatch[];
  }[];
};
type ParserTestState = {
  status: "idle" | "running" | "ready" | "error";
  report?: ParserTestReport;
  error?: string;
};
type FullSearchResult = {
  id: string;
  title: string;
  year: number | null;
  genres: string[];
  averageRating: number | null;
  ratingCount: number;
  tags: string[];
  imdbId: string | null;
  tmdbId: number | null;
  posterPath: string | null;
  overview: string;
  cast: string[];
  directors: string[];
  score: number;
  titleScore?: number;
  fieldScore?: number;
  matchReason?: {
    field: string;
    label: string;
    value: string;
    matchType: string;
  };
};
type TitleRetrieval = {
  normalizedQuery: string;
  retrievalQuery: string;
  metadataFilter: {
    active: boolean;
    filters: {
      genres: string[];
      genreMode: "any" | "all";
      yearMin?: number;
      yearMax?: number;
      ratingMin?: number;
      ratingCountMin?: number;
    };
    corpusCount: number;
    candidateCount: number;
    excludedCount: number;
    candidatesPreview: {
      id: string;
      title: string;
      year: number | null;
      genres: string[];
      averageRating: number | null;
      ratingCount: number;
    }[];
    filterMs: number;
  };
  exact: {
    lookupKey: string;
    hit: boolean;
    matches: {
      id: string;
      title: string;
      sourceTitle: string;
      year: number | null;
    }[];
    lookupMs: number;
  };
  tokenLookup:
    | { skipped: true; reason: string }
    | {
        skipped: false;
        tokens: string[];
        ignoredTokens: string[];
        postings: {
          token: string;
          documentFrequency: number;
          movieIdsPreview: string[];
          truncated: boolean;
        }[];
        candidateCount: number;
        candidateIdsPreview: string[];
        intersectionCount: number;
        intersectionIdsPreview: string[];
        candidatesPreview: { id: string; title: string; year: number | null }[];
        truncated: boolean;
        lookupMs: number;
      };
  fieldLookup:
    | { skipped: true; reason: string }
    | {
        skipped: false;
        tokens: string[];
        ignoredTokens: string[];
        postings: { field: string; token: string; documentFrequency: number }[];
        candidateCount: number;
        candidatesPreview: {
          id: string;
          title: string;
          year: number | null;
          fieldMatch: {
            bestMatch: {
              field: string;
              label: string;
              value: string;
              matchType: string;
              score: number;
            };
          };
        }[];
        truncated: boolean;
        lookupMs: number;
      };
  trigramLookup:
    | { skipped: true; reason: string }
    | {
        skipped: false;
        trigrams: string[];
        minimumMatches: number;
        postings: {
          trigram: string;
          documentFrequency: number;
          movieIdsPreview: string[];
          truncated: boolean;
        }[];
        candidateCount: number;
        candidatesPreview: {
          id: string;
          title: string;
          year: number | null;
          matchedTrigrams: number;
          queryTrigramCount: number;
          trigramCount: number;
          unionTrigramCount: number;
          coverage: number;
          jaccard: number;
          dice: number;
        }[];
        truncated: boolean;
        lookupMs: number;
      };
  combinedCandidates:
    | { skipped: true; reason: string }
    | {
        skipped: false;
        candidateCount: number;
        candidatesPreview: {
          id: string;
          title: string;
          year: number | null;
          sources: ("metadata" | "token" | "trigram" | "field")[];
        }[];
        truncated: boolean;
      };
  fuzzyScoring:
    | { skipped: true; reason: string }
    | {
        skipped: false;
        method: "dice";
        candidateCount: number;
        candidatesPreview: {
          id: string;
          title: string;
          year: number | null;
          matchedTrigrams: number;
          queryTrigramCount: number;
          trigramCount: number;
          unionTrigramCount: number;
          jaccard: number;
          dice: number;
        }[];
        truncated: boolean;
      };
  editScoring:
    | { skipped: true; reason: string }
    | {
        skipped: false;
        method: "normalized_levenshtein";
        candidateCount: number;
        candidatesPreview: {
          id: string;
          title: string;
          year: number | null;
          queryText: string;
          titleText: string;
          editDistance: number;
          maximumLength: number;
          editSimilarity: number;
        }[];
        truncated: boolean;
      };
  tokenCoverageScoring:
    | { skipped: true; reason: string }
    | {
        skipped: false;
        method: "exact_query_token_coverage";
        candidateCount: number;
        queryTokens: string[];
        candidatesPreview: {
          id: string;
          title: string;
          year: number | null;
          queryTokens: string[];
          candidateTokens: string[];
          matchedTokens: string[];
          missingTokens: string[];
          matchedTokenCount: number;
          queryTokenCount: number;
          coverage: number;
        }[];
        truncated: boolean;
      };
  orderedTokenProximityScoring:
    | { skipped: true; reason: string }
    | {
        skipped: false;
        method: "ordered_token_proximity";
        candidateCount: number;
        queryTokens: string[];
        candidatesPreview: {
          id: string;
          title: string;
          year: number | null;
          queryTokens: string[];
          candidateTokens: string[];
          alignment: {
            token: string;
            queryIndex: number;
            titleIndex: number;
          }[];
          matchedTokens: string[];
          missingTokens: string[];
          matchedTitleIndexes: number[];
          matchedTokenCount: number;
          queryTokenCount: number;
          tokenCoverage: number;
          orderedCoverage: number;
          matchSpan: number;
          gapCount: number;
          proximity: number;
          phraseMatch: boolean;
        }[];
        truncated: boolean;
      };
  combinedScoring:
    | { skipped: true; reason: string }
    | {
        skipped: false;
        method:
          | "weighted_explainable_title_ranker"
          | "weighted_explainable_multifield_ranker";
        weights: CombinedWeights;
        effectiveWeights: CombinedWeights;
        totalWeight: number;
        rankingContext: {
          requestedGenres: string[];
          genreOverlapPrecedesTitleScore: boolean;
          titleWeight: number;
          fieldWeight: number;
          structuredGenreDiscovery: boolean;
          structuredGenreWeights: {
            genreFocus: number;
            bayesianRating: number;
            ratingEvidence: number;
          } | null;
        };
        candidateCount: number;
        candidatesPreview: {
          id: string;
          title: string;
          year: number | null;
          signals: CombinedWeights;
          contributions: CombinedWeights;
          titleScore: number;
          fieldScore: number;
          fieldMatch?: { bestMatch: FullSearchResult["matchReason"] };
          combinedScore: number;
          metadataGenreMatchCount: number;
          genreFocus: number;
          bayesianRating: number;
          ratingEvidence: number;
          structuredGenreScore: number;
        }[];
        truncated: boolean;
      };
  indexes: {
    titleCount: number;
    exactKeyCount: number;
    collisionCount: number;
    tokenCount: number;
    postingCount: number;
    fieldPostingCount: number;
    trigramCount: number;
    trigramPostingCount: number;
    buildMs: number;
    cache: "warm" | "built for this request";
  };
  searchResults: {
    items: FullSearchResult[];
    shown: number;
    total: number;
    hasMore: boolean;
  };
};
type TitleRetrievalState = {
  status: "idle" | "ready" | "error";
  query?: string;
  result?: TitleRetrieval;
  plan?: QueryPlan;
  error?: string;
};

function analysisFromPlan(plan: QueryPlan | undefined, rawQuery: string) {
  const filters = plan?.filters ?? { genres: [], genreMode: "any" as const };
  const people = plan?.entities.people.map(({ name }) => name) ?? [];
  const concepts = plan?.routes.concepts ?? [];
  const filterLabels = [
    filters.yearMin !== undefined ? `year >= ${filters.yearMin}` : undefined,
    filters.yearMax !== undefined ? `year <= ${filters.yearMax}` : undefined,
    filters.ratingMin !== undefined
      ? `rating > ${filters.ratingMin}`
      : undefined,
    filters.ratingCountMin !== undefined
      ? `rating count >= ${filters.ratingCountMin}`
      : undefined,
  ].filter((value): value is string => Boolean(value));
  return {
    normalized: plan?.effectiveQuery ?? rawQuery,
    retrievalQuery: plan?.routes.titleQuery ?? "",
    intent: plan?.intent ?? ("general_search" as const),
    suggestedQuery: plan?.suggestedQuery,
    people,
    genres: plan?.entities.genres ?? [],
    genreMode: filters.genreMode ?? ("any" as const),
    concepts,
    semanticExpansions: plan?.routes.semanticExpansions ?? [],
    yearMin: filters.yearMin,
    yearMax: filters.yearMax,
    ratingMin: filters.ratingMin,
    ratingCountMin: filters.ratingCountMin,
    sort:
      plan?.sort?.field === "year" && plan.sort.direction === "desc"
        ? ("newest" as const)
        : undefined,
    unavailableFilters: plan?.unavailableFilters ?? [],
    trace: plan?.trace ?? ["Waiting for the server-side query planner."],
    termRouting: {
      strategy: plan?.routes.strategy ?? ("structured" as const),
      titleText: plan?.routes.titleQuery ?? "",
      titlePriority: plan?.routes.titlePriority ?? ("none" as const),
      genreTitleFallbacks: (plan?.entities.genres ?? []).map((genre) => ({
        genre,
        term: genre.toLowerCase(),
      })),
      concepts,
      genres: plan?.entities.genres ?? [],
      people,
      filters: filterLabels,
      sort: plan?.sort
        ? [`${plan.sort.source} -> ${plan.sort.field} ${plan.sort.direction}`]
        : [],
      structural: plan?.routes.structural ?? [],
    },
    reasons: {
      normalized:
        plan?.explanations.normalization ??
        "The server planner has not returned yet.",
      retrieval:
        plan?.explanations.routing ??
        "The server planner has not returned yet.",
      intent:
        plan?.explanations.intent ?? "The server planner has not returned yet.",
      people: people.length
        ? "Names were linked against the full actor and director registry."
        : "No complete person entity was linked.",
      genres: plan?.entities.genres.length
        ? "Genres were resolved through canonical aliases."
        : "No genre metadata was resolved.",
      filters: filterLabels.length
        ? "Supported metadata constraints are applied as hard filters."
        : "No supported hard metadata constraints were found.",
      sort: plan?.sort
        ? "The planner extracted an explicit ordering instruction."
        : "Default relevance ordering is used.",
      unavailableFilters: plan?.unavailableFilters.length
        ? "The request references metadata unavailable in this corpus."
        : "Every recognized constraint is supported locally.",
      concepts: concepts.length
        ? "Residual terms remain available to searchable metadata fields."
        : "No residual descriptive concepts remain.",
    },
  };
}

function StageSummary({
  number,
  title,
  description,
  takeaway,
  outcome,
}: {
  number: number | string;
  title: string;
  description: string;
  takeaway: string;
  outcome: string;
}) {
  return (
    <summary className="stageSummary">
      <span className="stageSummaryInner">
        <span className="stageNumber">{number}</span>
        <span className="stageSummaryCopy">
          <b>{title}</b>
          <small>{description}</small>
          <small className="stageTakeaway">
            <em>Key takeaway</em>
            {takeaway}
          </small>
        </span>
        <span className="stageOutcome">{outcome}</span>
        <span className="stageChevron" aria-hidden="true">
          ⌄
        </span>
      </span>
    </summary>
  );
}

function queryLabel(result: TitleRetrieval) {
  return result.retrievalQuery || result.normalizedQuery || "this query";
}

function exactTakeaway(result: TitleRetrieval) {
  return result.exact.hit
    ? `“${result.normalizedQuery}” resolved directly to ${result.exact.matches.map(({ title }) => title).join(", ")}. Later title-retrieval stages are unnecessary for this search.`
    : `“${result.normalizedQuery}” has no exact hash key. The pipeline continues with “${result.retrievalQuery || "no residual title text"}” to protect recall.`;
}

function tokenTakeaway(result: TitleRetrieval) {
  if (result.tokenLookup.skipped)
    return `${result.tokenLookup.reason} This query will continue through its remaining structured metadata paths.`;
  const additional =
    result.tokenLookup.candidateCount - result.tokenLookup.intersectionCount;
  return `For “${queryLabel(result)}”, the union found ${result.tokenLookup.candidateCount.toLocaleString()} titles and the intersection found ${result.tokenLookup.intersectionCount.toLocaleString()}. Union preserves ${additional.toLocaleString()} additional partial-token candidates for later scoring.`;
}

function fieldTakeaway(result: TitleRetrieval) {
  if (result.fieldLookup.skipped) return result.fieldLookup.reason;
  const top = result.fieldLookup.candidatesPreview[0]?.fieldMatch.bestMatch;
  return top
    ? `“${result.normalizedQuery}” nominated ${result.fieldLookup.candidateCount.toLocaleString()} movies across typed fields. The preview includes a ${top.label.toLowerCase()} match on “${top.value}”; structured cast and director entities receive more weight than description text.`
    : `No cast, director, genre, tag, or description field contains enough evidence for “${result.normalizedQuery}”. Title retrieval can still provide candidates.`;
}

function trigramTakeaway(result: TitleRetrieval) {
  if (result.trigramLookup.skipped)
    return `${result.trigramLookup.reason} No typo-tolerant title candidates are needed for this query.`;
  return `“${queryLabel(result)}” produced ${result.trigramLookup.trigrams.length} character trigrams with a ${result.trigramLookup.minimumMatches}-match threshold. That threshold admitted ${result.trigramLookup.candidateCount.toLocaleString()} typo-tolerant candidates.`;
}

function mergeTakeaway(result: TitleRetrieval) {
  if (result.combinedCandidates.skipped)
    return result.combinedCandidates.reason;
  const multiSource = result.combinedCandidates.candidatesPreview.filter(
    ({ sources }) => sources.length > 1,
  ).length;
  return `Title, fuzzy, typed-field, and metadata retrieval produced ${result.combinedCandidates.candidateCount.toLocaleString()} unique IDs for “${queryLabel(result)}”. In the preview, ${multiSource} candidate${multiSource === 1 ? "" : "s"} were nominated by multiple paths.`;
}

function metadataTakeaway(result: TitleRetrieval) {
  if (!result.metadataFilter.active)
    return "This query has no supported hard metadata constraints, so all corpus records remain eligible for title retrieval.";
  return `${result.metadataFilter.candidateCount.toLocaleString()} of ${result.metadataFilter.corpusCount.toLocaleString()} movies satisfy every recognized hard constraint. ${result.metadataFilter.excludedCount.toLocaleString()} records are removed before final ranking.`;
}

function fuzzyTakeaway(result: TitleRetrieval) {
  if (result.fuzzyScoring.skipped) return result.fuzzyScoring.reason;
  const top = result.fuzzyScoring.candidatesPreview[0];
  return top
    ? `For “${queryLabel(result)}”, ${top.title} leads with ${top.dice.toFixed(3)} Dice and ${top.jaccard.toFixed(3)} Jaccard. The scores agree on ordering but express shared trigram overlap on different scales.`
    : `No merged candidate received a trigram-similarity score for “${queryLabel(result)}”. The query needs a broader candidate-generation path.`;
}

function editTakeaway(result: TitleRetrieval) {
  if (result.editScoring.skipped) return result.editScoring.reason;
  const top = result.editScoring.candidatesPreview[0];
  return top
    ? `${top.title} is closest to “${queryLabel(result)}” at ${top.editDistance} edits and ${top.editSimilarity.toFixed(3)} normalized similarity. This signal rewards character-level closeness, even when exact words fail.`
    : `No candidate could be compared with “${queryLabel(result)}” by edit distance. Character-level similarity therefore contributes no evidence.`;
}

function coverageTakeaway(result: TitleRetrieval) {
  if (result.tokenCoverageScoring.skipped)
    return result.tokenCoverageScoring.reason;
  const top = result.tokenCoverageScoring.candidatesPreview[0];
  return top
    ? `${top.title} contains ${top.matchedTokenCount} of ${top.queryTokenCount} searchable words from “${queryLabel(result)}” (${Math.round(top.coverage * 100)}%). This stage values complete words but still cannot see their order.`
    : `No candidate contains a complete searchable token from “${queryLabel(result)}”. Exact token coverage therefore cannot separate the candidates.`;
}

function orderedTakeaway(result: TitleRetrieval) {
  if (result.orderedTokenProximityScoring.skipped)
    return result.orderedTokenProximityScoring.reason;
  const top = result.orderedTokenProximityScoring.candidatesPreview[0];
  return top
    ? `${top.title} matches ${Math.round(top.orderedCoverage * 100)}% of “${queryLabel(result)}” in order with ${top.gapCount} gap${top.gapCount === 1 ? "" : "s"}. Its ${top.proximity.toFixed(3)} proximity${top.phraseMatch ? " forms a complete adjacent phrase" : " does not form a complete phrase"}.`
    : `No candidate forms an ordered alignment for “${queryLabel(result)}”. Word order and proximity therefore contribute no ranking evidence.`;
}

function combinedTakeaway(result: TitleRetrieval) {
  if (result.combinedScoring.skipped) return result.combinedScoring.reason;
  const top = result.combinedScoring.candidatesPreview[0];
  if (!top)
    return `No combined score was produced for “${queryLabel(result)}”. Adjusting weights cannot change an empty candidate pool.`;
  if (result.combinedScoring.rankingContext.structuredGenreDiscovery) {
    return `${top.title} leads with ${Math.round(top.genreFocus * 100)}% genre focus, a ${top.bayesianRating.toFixed(2)} Bayesian rating, and ${Math.round(top.ratingEvidence * 100)}% rating-count evidence. Its final structured discovery score is ${top.structuredGenreScore.toFixed(3)}.`;
  }
  if (top.fieldMatch?.bestMatch) {
    return `${top.title} wins with a ${top.combinedScore.toFixed(3)} blended score. Its strongest typed-field evidence is ${top.fieldMatch.bestMatch.label.toLowerCase()}: “${top.fieldMatch.bestMatch.value}” (${top.fieldScore.toFixed(3)}).`;
  }
  const leadingSignal = WEIGHT_CONTROLS.map(({ key, label }) => ({
    label,
    contribution: top.contributions[key],
  })).sort((left, right) => right.contribution - left.contribution)[0];
  if (result.combinedScoring.rankingContext.genreOverlapPrecedesTitleScore) {
    return `${top.title} matches ${top.metadataGenreMatchCount} of ${result.combinedScoring.rankingContext.requestedGenres.length} requested genres, which is considered before its ${top.combinedScore.toFixed(3)} title score.`;
  }
  return `${top.title} wins “${queryLabel(result)}” with a ${top.combinedScore.toFixed(3)} combined score. ${leadingSignal.label} contributes the largest share at ${leadingSignal.contribution.toFixed(3)}.`;
}

function fullResultMovie(result: FullSearchResult): Movie {
  const teachingMovie = movies.find((movie) => movie.id === result.id);
  if (teachingMovie)
    return {
      ...teachingMovie,
      matchReason: result.matchReason,
      relevanceScore: result.score,
    };
  const numericId = Number(result.id);
  return {
    id: result.id,
    title: result.title,
    year: result.year ?? 0,
    genres: result.genres,
    tags: result.tags,
    rating: result.averageRating ?? 0,
    ratings: result.ratingCount,
    imdb: result.imdbId ?? "unavailable",
    tmdb: result.tmdbId ?? 0,
    palette:
      RESULT_PALETTES[
        Number.isFinite(numericId) ? numericId % RESULT_PALETTES.length : 0
      ],
    overview: result.overview || undefined,
    posterPath: result.posterPath,
    cast: result.cast.map((name, index) => ({
      id: index,
      name,
      character: "",
    })),
    matchReason: result.matchReason,
    relevanceScore: result.score,
  };
}

export default function Home() {
  const portfolioMode =
    process.env.NEXT_PUBLIC_CINESEEK_DEPLOYMENT_MODE === "portfolio";
  const [input, setInput] = useState("dark sci-fi with philosophy");
  const [query, setQuery] = useState(input);
  const [mode, setMode] = useState<Mode>("hybrid");
  const [selected, setSelected] = useState<Movie | null>(null);
  const [coach, setCoach] = useState<CoachState>({ status: "loading" });
  const [coachRequest, setCoachRequest] = useState(0);
  const [parserTests, setParserTests] = useState<ParserTestState>({
    status: "idle",
  });
  const [titleRetrieval, setTitleRetrieval] = useState<TitleRetrievalState>({
    status: "idle",
  });
  const [rankerWeights, setRankerWeights] = useState<CombinedWeights>(
    DEFAULT_RANKER_WEIGHTS,
  );
  const [combinedUpdating, setCombinedUpdating] = useState(false);
  const [resultLimit, setResultLimit] = useState(RESULT_PAGE_SIZE);
  const [showStickySearch, setShowStickySearch] = useState(false);
  const heroSearchRef = useRef<HTMLFormElement>(null);
  const activePlan =
    titleRetrieval.status === "ready" && titleRetrieval.query === query
      ? titleRetrieval.plan
      : undefined;
  const analysis = useMemo(
    () => analysisFromPlan(activePlan, query),
    [activePlan, query],
  );
  const suggestedQuery = activePlan?.suggestedQuery;
  const rankerWeightTotal = Object.values(rankerWeights).reduce(
    (sum, weight) => sum + weight,
    0,
  );
  const titleRetrievalLoading =
    titleRetrieval.status === "idle" || titleRetrieval.query !== query;
  const fullResults = useMemo(
    () =>
      titleRetrieval.status === "ready" && titleRetrieval.query === query
        ? (titleRetrieval.result?.searchResults.items.map(fullResultMovie) ??
          [])
        : [],
    [query, titleRetrieval],
  );
  const displayedResults = fullResults;
  const inferred = analysis.semanticExpansions
    .flatMap(({ values }) => values)
    .slice(0, 4);
  useEffect(() => {
    const heroSearch = heroSearchRef.current;
    if (!heroSearch) return;
    const observer = new IntersectionObserver(([entry]) =>
      setShowStickySearch(!entry.isIntersecting),
    );
    observer.observe(heroSearch);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!selected) return;
    document.querySelector<HTMLButtonElement>(".close")?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selected]);
  useEffect(() => {
    if (!activePlan) return;
    if (portfolioMode) return;
    const controller = new AbortController();
    void fetch("/api/query-coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, analysis: activePlan }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          paragraph?: string;
          error?: string;
          model?: string;
        };
        if (!response.ok || !payload.paragraph)
          throw new Error(
            payload.error || "No coaching paragraph was returned.",
          );
        setCoach({
          status: "ready",
          paragraph: payload.paragraph,
          model: payload.model,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setCoach({
          status: "unavailable",
          detail:
            error instanceof Error ? error.message : "AI coach unavailable.",
        });
      });
    return () => controller.abort();
  }, [activePlan, query, coachRequest, portfolioMode]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        weights: rankerWeights,
        resultLimit,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          queryPlan?: QueryPlan;
          retrieval?: TitleRetrieval;
          error?: string;
        };
        if (!response.ok || !payload.queryPlan || !payload.retrieval)
          throw new Error(payload.error || "Search failed.");
        setTitleRetrieval({
          status: "ready",
          query,
          plan: payload.queryPlan,
          result: payload.retrieval,
        });
        setCombinedUpdating(false);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setTitleRetrieval({
          status: "error",
          query,
          error: error instanceof Error ? error.message : "Search failed.",
        });
        setCombinedUpdating(false);
      });
    return () => controller.abort();
  }, [query, rankerWeights, resultLimit]);
  function updateRankerWeight(key: CombinedWeightKey, value: number) {
    setCombinedUpdating(true);
    setRankerWeights((current) => {
      const next = { ...current, [key]: value };
      return Object.values(next).some((weight) => weight > 0) ? next : current;
    });
  }
  function resetRankerWeights() {
    setCombinedUpdating(true);
    setRankerWeights(DEFAULT_RANKER_WEIGHTS);
  }
  function chooseQuery(nextQuery: string) {
    setCoach({ status: "loading" });
    setResultLimit(RESULT_PAGE_SIZE);
    if (nextQuery === query) setCoachRequest((value) => value + 1);
    else setQuery(nextQuery);
  }
  function showMoreResults() {
    setCombinedUpdating(true);
    setResultLimit((current) => Math.min(9_742, current + RESULT_PAGE_SIZE));
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    chooseQuery(input.trim() || examples[0]);
  }
  function submitSticky(event: FormEvent) {
    submit(event);
    document
      .getElementById("discover")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function runExample(example: string) {
    setInput(example);
    chooseQuery(example);
  }
  function acceptSuggestion() {
    if (!suggestedQuery) return;
    setInput(suggestedQuery);
    chooseQuery(suggestedQuery);
  }
  async function runParserTests() {
    setParserTests({ status: "running" });
    try {
      const response = await fetch("/api/query-parser-tests", {
        method: "POST",
      });
      const payload = (await response.json()) as ParserTestReport & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(
          payload.error || "The parser cases could not be executed.",
        );
      setParserTests({ status: "ready", report: payload });
    } catch (error) {
      setParserTests({
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "The parser cases could not be executed.",
      });
    }
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="CineSeek home">
          <span className="brandMark" aria-hidden="true">
            C
          </span>
          <span>CineSeek</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#discover">Discover</a>
          <Link href="/entities">Entities</Link>
          <Link href="/benchmark">Benchmark</Link>
          <a href="#dataset">Dataset</a>
        </nav>
        <span className="statusBadge">
          <i /> {portfolioMode ? "Public demo" : "Local build"}
        </span>
      </header>

      <section className="hero" id="top">
        <div className="heroGlow" />
        <div className="heroCopy">
          <span className="eyebrow">Explainable movie discovery</span>
          <h1>
            Search the feeling.
            <br />
            <em>Find the film.</em>
          </h1>
          <p>
            Explore 9,742 MovieLens titles while seeing how lexical, entity,
            metadata, and ranking signals shape every result.
          </p>
          <form
            className="search"
            onSubmit={submit}
            role="search"
            ref={heroSearchRef}
          >
            <label className="srOnly" htmlFor="movie-search">
              Search movies
            </label>
            <span aria-hidden="true" className="searchIcon">
              ⌕
            </span>
            <input
              id="movie-search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Try “dreamlike romance about memory”"
            />
            <button type="submit">
              Search <span aria-hidden="true">→</span>
            </button>
          </form>
          {suggestedQuery && (
            <div className="didYouMean" role="status">
              <span>Did you mean</span>
              <button type="button" onClick={acceptSuggestion}>
                {suggestedQuery}
              </button>
              <span>?</span>
            </div>
          )}
          <div className="examples">
            <span>Try</span>
            {examples.map((item) => (
              <button key={item} onClick={() => runExample(item)}>
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="heroArt" aria-hidden="true">
          <div className="orb orb1" />
          <div className="orb orb2" />
          <div className="filmTitle">
            INTER
            <br />
            STELLAR<small>BEYOND THE STARS</small>
          </div>
          <div className="heroRating">
            ★ 4.0 <span>73 ratings</span>
          </div>
        </div>
      </section>

      <section className="workspace" id="discover">
        <div className="modeRow">
          <div>
            <span className="sectionKicker">Retrieval strategy</span>
            <h2>Choose your search signal</h2>
          </div>
          <div className="segmented" role="group" aria-label="Search mode">
            {(["lexical", "semantic", "hybrid"] as Mode[]).map((item) => (
              <button
                key={item}
                className={mode === item ? "active" : ""}
                aria-pressed={mode === item}
                onClick={() => setMode(item)}
              >
                <span>
                  {item === "lexical" ? "Aa" : item === "semantic" ? "◉" : "✦"}
                </span>
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="resultsHeader">
          <div>
            <h2>Top matches</h2>
            <p>For “{query}” · full-corpus combined ranking</p>
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
                  <h3>{movie.title}</h3>
                  <p>
                    {movie.year} · {movie.genres.slice(0, 2).join(" / ")}
                  </p>
                  {movie.matchReason && (
                    <span className="matchReason">
                      <b>{movie.matchReason.label}</b>
                      <span>{movie.matchReason.value}</span>
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
          <aside className="debugPanel" aria-label="Query understanding">
            <div className="panelTitle">
              <div>
                <span className="sectionKicker">Under the hood</span>
                <h2>Query understanding</h2>
              </div>
              <span className="live">
                <i /> Server planner
              </span>
            </div>
            <div className="debugBlock">
              <label>Normalized query</label>
              <code>{analysis.normalized}</code>
              <small className="fieldReason">
                Why: {analysis.reasons.normalized}
              </small>
            </div>
            <div className="debugBlock correctionBlock" aria-live="polite">
              <label>Typed corrections</label>
              {activePlan?.corrections.length ? (
                <div className="typedCorrections">
                  {activePlan.corrections.map((correction) => (
                    <article
                      key={`${correction.entityType}-${correction.original}`}
                    >
                      <div>
                        <b>
                          {correction.original}{" "}
                          <span aria-hidden="true">→</span>{" "}
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
                            ? "Applied automatically"
                            : "Needs confirmation"}
                        </strong>
                        <small>
                          {Math.round(correction.confidence * 100)}% correction
                          confidence
                        </small>
                      </span>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="noCorrection">
                  No correction was needed for this query.
                </p>
              )}
              <small className="fieldReason">
                Automatic corrections form the effective query. Suggested
                corrections are not applied until you accept them.
              </small>
            </div>
            <div className="debugBlock">
              <label>Title retrieval query</label>
              <code>
                {analysis.retrievalQuery || "(none — title retrieval skipped)"}
              </code>
              <small className="fieldReason">
                Why: {analysis.reasons.retrieval}
              </small>
            </div>
            <section
              className="termRoutingPanel"
              aria-labelledby="term-routing-title"
            >
              <div className="termRoutingHeader">
                <div>
                  <span className="sectionKicker">Query planner</span>
                  <h3 id="term-routing-title">Term routing</h3>
                </div>
                <span>{analysis.termRouting.strategy.replace("_", " ")}</span>
              </div>
              <div className="routingLanes">
                <article>
                  <label>Title retrieval</label>
                  <div className="chips">
                    {analysis.termRouting.titleText ? (
                      <span>{analysis.termRouting.titleText}</span>
                    ) : analysis.termRouting.strategy === "exact_title" ? (
                      <span>exact hash lookup</span>
                    ) : (
                      <span className="routeEmpty">skipped</span>
                    )}
                  </div>
                  <small>
                    {analysis.termRouting.titlePriority === "secondary"
                      ? "Secondary recall · lower ranking weight"
                      : "Primary exact, token, trigram, and edit path"}
                  </small>
                </article>
                <article>
                  <label>Descriptive ranking</label>
                  <div className="chips">
                    {analysis.termRouting.concepts.length ? (
                      analysis.termRouting.concepts.map((concept) => (
                        <span key={concept}>{concept}</span>
                      ))
                    ) : (
                      <span className="routeEmpty">none</span>
                    )}
                  </div>
                  <small>Tags now · semantic retrieval later</small>
                </article>
                <article>
                  <label>Metadata paths</label>
                  <div className="chips">
                    {[
                      ...analysis.termRouting.genres.map(
                        (value) => `genre: ${value}`,
                      ),
                      ...analysis.termRouting.people.map(
                        (value) => `person: ${value}`,
                      ),
                      ...analysis.termRouting.filters,
                    ].length ? (
                      [
                        ...analysis.termRouting.genres.map(
                          (value) => `genre: ${value}`,
                        ),
                        ...analysis.termRouting.people.map(
                          (value) => `person: ${value}`,
                        ),
                        ...analysis.termRouting.filters,
                      ].map((value) => <span key={value}>{value}</span>)
                    ) : (
                      <span className="routeEmpty">none</span>
                    )}
                  </div>
                  <small>Filter and entity indexes</small>
                </article>
                <article>
                  <label>Control language</label>
                  <div className="chips">
                    {[
                      ...analysis.termRouting.sort,
                      ...analysis.termRouting.structural.map(
                        (value) => `consume: ${value}`,
                      ),
                    ].length ? (
                      [
                        ...analysis.termRouting.sort,
                        ...analysis.termRouting.structural.map(
                          (value) => `consume: ${value}`,
                        ),
                      ].map((value) => <span key={value}>{value}</span>)
                    ) : (
                      <span className="routeEmpty">none</span>
                    )}
                  </div>
                  <small>Sorting and non-searchable structure</small>
                </article>
              </div>
            </section>
            <div className="debugBlock">
              <label>Intent</label>
              <p>
                <span className="intentIcon">⌕</span>{" "}
                {analysis.intent.replace("_", " ")}
              </p>
              <small className="fieldReason">
                Why: {analysis.reasons.intent}
              </small>
            </div>
            <div className="debugBlock">
              <label>Recognized people</label>
              <div className="chips">
                {analysis.people.length ? (
                  analysis.people.map((person) => (
                    <span key={person}>{person}</span>
                  ))
                ) : (
                  <span>none</span>
                )}
              </div>
              <small className="fieldReason">
                Why: {analysis.reasons.people}
              </small>
            </div>
            <div className="debugBlock">
              <label>Recognized genres</label>
              <div className="chips">
                {analysis.genres.length ? (
                  <>
                    {analysis.genres.map((genre) => (
                      <span key={genre}>{genre}</span>
                    ))}
                    {analysis.genres.length > 1 && (
                      <span>match {analysis.genreMode}</span>
                    )}
                  </>
                ) : (
                  <span>none</span>
                )}
              </div>
              <small className="fieldReason">
                Why: {analysis.reasons.genres}
              </small>
            </div>
            <div className="debugBlock">
              <label>Hard filters</label>
              <div className="chips">
                {analysis.yearMin !== undefined && (
                  <span>year ≥ {analysis.yearMin}</span>
                )}
                {analysis.yearMax !== undefined && (
                  <span>year ≤ {analysis.yearMax}</span>
                )}
                {analysis.ratingMin !== undefined && (
                  <span>rating &gt; {analysis.ratingMin}</span>
                )}
                {analysis.ratingCountMin !== undefined && (
                  <span>ratings ≥ {analysis.ratingCountMin}</span>
                )}
                {analysis.yearMin === undefined &&
                  analysis.yearMax === undefined &&
                  analysis.ratingMin === undefined &&
                  analysis.ratingCountMin === undefined && <span>none</span>}
              </div>
              <small className="fieldReason">
                Why: {analysis.reasons.filters}
              </small>
            </div>
            <div className="debugBlock">
              <label>Sort</label>
              <div className="chips">
                <span>
                  {analysis.sort === "newest"
                    ? "year ↓ newest first"
                    : "default relevance"}
                </span>
              </div>
              <small className="fieldReason">
                Why: {analysis.reasons.sort}
              </small>
            </div>
            <div className="debugBlock">
              <label>Unavailable constraints</label>
              <div className="chips">
                {analysis.unavailableFilters.length ? (
                  analysis.unavailableFilters.map((filter) => (
                    <span key={filter}>{filter}</span>
                  ))
                ) : (
                  <span>none</span>
                )}
              </div>
              <small className="fieldReason">
                Why: {analysis.reasons.unavailableFilters}
              </small>
            </div>
            <div className="debugBlock">
              <label>Ranking concepts</label>
              <div className="chips">
                {analysis.concepts.length ? (
                  analysis.concepts
                    .slice(0, 5)
                    .map((token) => <span key={token}>{token}</span>)
                ) : (
                  <span>none</span>
                )}
              </div>
              <small className="fieldReason">
                Why: {analysis.reasons.concepts}
              </small>
            </div>
            <div className="debugBlock">
              <label>Semantic expansion</label>
              <div className="flow">
                <span>{analysis.concepts[0] ?? "movie"}</span>
                <i>→</i>
                <span>{inferred[0] ?? "no expansion yet"}</span>
              </div>
              <small className="fieldReason">
                Why: Known aliases add related words; unknown concepts remain
                unchanged.
              </small>
            </div>
            <details className="debugBlock traceBlock">
              <summary>Rule trace</summary>
              <ol className="trace">
                {analysis.trace.map((step, index) => (
                  <li key={step}>
                    <span>{index + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </details>
            {!portfolioMode && (
              <div className="aiCoach" aria-live="polite">
                <div className="coachTitle">
                  <span>✦ AI query-analysis coach</span>
                  {coach.model && <small>{coach.model}</small>}
                </div>
                {coach.status === "loading" && (
                  <p className="coachLoading">Reviewing this analysis…</p>
                )}
                {coach.status === "ready" && <p>{coach.paragraph}</p>}
                {coach.status === "unavailable" && (
                  <p className="coachUnavailable">{coach.detail}</p>
                )}
              </div>
            )}
            <div className="scoreMix">
              <div>
                <span>Lexical</span>
                <b>{mode === "lexical" ? 100 : mode === "hybrid" ? 45 : 15}%</b>
              </div>
              <div>
                <span>Semantic</span>
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
            </div>
          </aside>
        </div>
        <section
          className="titleLookupLab"
          aria-labelledby="title-lookup-heading"
        >
          <div className="titleLookupHeader">
            <div>
              <span className="sectionKicker">
                Multi-field retrieval · stages 3–10
              </span>
              <h2 id="title-lookup-heading">
                From routed terms to an explainable rank
              </h2>
              <p>
                Title text, typed entities, tags, and descriptions retain
                separate retrieval paths before their evidence is blended.
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
              <div className="lookupTrace" aria-live="polite">
                <details className="stageDisclosure exactStage">
                  <StageSummary
                    number={3}
                    title="Exact-title hash lookup"
                    description="Checks the complete normalized query against a constant-time title map. An exact hit stops title candidate generation."
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
                              {titleRetrieval.result.exact.matches.length === 1
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
                          <span className="lookupIcon miss" aria-hidden="true">
                            ×
                          </span>
                          <div>
                            <b>No value exists for this exact key.</b>
                            <p>
                              The pipeline continues to postings-list retrieval;
                              fuzzy scoring has not started yet.
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
                      title="Token inverted index"
                      description="Opens one postings list per searchable word, then unions the movie IDs into a broad candidate set."
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
                      title="Token inverted index"
                      description="Opens one postings list per searchable word, then unions the movie IDs into a broad candidate set."
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
                            {titleRetrieval.result.tokenLookup.tokens.length ? (
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
                            titleRetrieval.result.tokenLookup.candidateCount > 0
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
                      title="Typed-field entity index"
                      description="Searches cast, directors, genres, tags, and descriptions without flattening their meaning into the title."
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
                      title="Typed-field entity index"
                      description="Searches cast, directors, genres, tags, and descriptions without flattening their meaning into the title."
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
                            Actor, director, genre, and tag values remain typed
                            entities. Overview text uses a lower weight and
                            requires two matching words for multi-word queries.
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
                    title="Metadata candidate filter"
                    description="Applies recognized genre, year, average-rating, and rating-count constraints across the full corpus before final ranking."
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
                      title="Character-trigram index"
                      description="Splits the query into overlapping three-character fragments so misspellings can still retrieve plausible titles."
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
                      title="Character-trigram index"
                      description="Splits the query into overlapping three-character fragments so misspellings can still retrieve plausible titles."
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
                          {titleRetrieval.result.trigramLookup.postings.length}{" "}
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
                            {titleRetrieval.result.trigramLookup.minimumMatches}{" "}
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
                      title="Candidate merge"
                      description="Combines title, fuzzy, field, and metadata nominations, then removes duplicate movie IDs before scoring begins."
                      takeaway={mergeTakeaway(titleRetrieval.result)}
                      outcome={`${titleRetrieval.result.combinedCandidates.candidateCount.toLocaleString()} combined IDs`}
                    />
                    <div className="stageDisclosureContent">
                      <div className="combinedCandidateStage">
                        <div>
                          <span className="sectionKicker">Candidate merge</span>
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
                {!titleRetrieval.result.fuzzyScoring.skipped && (
                  <details className="stageDisclosure fuzzyScoreStage">
                    <StageSummary
                      number={6}
                      title="Trigram similarity"
                      description="Normalizes shared character fragments with Jaccard and Dice so titles of different lengths can be compared fairly."
                      takeaway={fuzzyTakeaway(titleRetrieval.result)}
                      outcome={
                        titleRetrieval.result.fuzzyScoring.candidatesPreview[0]
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
                              containing more fragments. This learning table is
                              not connected to the streaming result cards yet.
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
                            accounting for size?” For the same two sets, Dice =
                            2J / (1 + J), so Dice looks higher but always
                            preserves Jaccard’s ordering. The useful experiment
                            is comparing either normalized score with raw
                            overlap on short and long titles.
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
                        title="Edit-distance scoring"
                        description="Counts the smallest character edits between the query and each candidate, then normalizes the distance into similarity."
                        takeaway={editTakeaway(titleRetrieval.result)}
                        outcome={
                          titleRetrieval.result.editScoring.candidatesPreview[0]
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
                                insertions, deletions, and substitutions needed
                                to turn the residual query into the normalized
                                title. This comparison is still a learning
                                ranker, not the streaming-card ranker.
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
                                Converts the distance to a comparable 0–1 score
                                where 1 means identical.
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
                              two edits. A later Damerau–Levenshtein experiment
                              can count that transposition as one, which is
                              useful for typing errors such as swapped letters.
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
                        title="Exact token coverage"
                        description="Measures how many complete searchable query words appear anywhere in each candidate title, regardless of order."
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
                                        candidate.matchedTokens.map((token) => (
                                          <span key={token}>{token}</span>
                                        ))
                                      ) : (
                                        <span className="routeEmpty">none</span>
                                      )}
                                    </div>
                                    <div
                                      className="chips missingTokens"
                                      role="cell"
                                    >
                                      {candidate.missingTokens.length ? (
                                        candidate.missingTokens.map((token) => (
                                          <span key={token}>{token}</span>
                                        ))
                                      ) : (
                                        <span>none</span>
                                      )}
                                    </div>
                                    <span role="cell">
                                      <b>
                                        {Math.round(candidate.coverage * 100)}%
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
                              <code>fury road</code> and <code>road fury</code>{" "}
                              both give Mad Max: Fury Road 100% basic coverage.
                              The next stage separates them by alignment order
                              and token gaps.
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
                      title="Order and proximity"
                      description="Aligns exact query words from left to right, then rewards compact spans and identifies complete adjacent phrases."
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
                              positions, the span they occupy, and whether they
                              form an exact phrase.
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
                            <strong>matched tokens / matched title span</strong>
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
                              <span role="columnheader">Ordered coverage</span>
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
                {!titleRetrieval.result.combinedScoring.skipped && (
                  <details className="stageDisclosure combinedRankerStage">
                    <StageSummary
                      number={10}
                      title="Combined explainable ranker"
                      description="Blends six title signals with typed-field evidence while preserving the field that caused each match."
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
                              The six adjustable signals form the title score.
                              It contributes 35% of the final score; typed-field
                              evidence contributes 65% so exact people and
                              directors outrank incidental description text.
                            </p>
                          </div>
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
                        </div>
                        {titleRetrieval.result.combinedScoring.rankingContext
                          .structuredGenreDiscovery && (
                          <div className="orderedLesson" role="note">
                            <b>Structured genre ranking is active</b>
                            <p>
                              Because the query contains only genre constraints,
                              title weights are not used. Results combine 55%
                              genre focus, 30% Bayesian rating quality, and 15%
                              rating-count evidence.
                            </p>
                          </div>
                        )}
                        <div
                          className="weightControlGrid"
                          hidden={
                            titleRetrieval.result.combinedScoring.rankingContext
                              .structuredGenreDiscovery
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
                            titleRetrieval.result.combinedScoring.rankingContext
                              .structuredGenreDiscovery
                          }
                        >
                          <span>Relative-weight total</span>
                          <strong>{rankerWeightTotal}</strong>
                          <p>
                            Scores are divided by this total, so the six
                            effective percentages always add to 100%.
                          </p>
                          {combinedUpdating && <i>Recalculating candidates…</i>}
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
                                          %
                                        </b>
                                      </span>
                                      <span>
                                        <i>Bayesian rating</i>
                                        <b>
                                          {candidate.bayesianRating.toFixed(2)}
                                          /5
                                        </b>
                                      </span>
                                      <span>
                                        <i>Rating evidence</i>
                                        <b>
                                          {Math.round(
                                            candidate.ratingEvidence * 100,
                                          )}
                                          %
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
                                        winner.rankingContext.titleWeight * 100,
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
                                .candidatesPreview[0].fieldMatch?.bestMatch && (
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
                        {titleRetrieval.result.combinedScoring.candidatesPreview
                          .length ? (
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
                                          {candidate.fieldMatch.bestMatch.label}
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
                                    <b>{candidate.combinedScore.toFixed(3)}</b>
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
              </div>
            )}
        </section>
      </section>

      <section className="metrics" id="evaluation">
        <div className="sectionHeading">
          <div>
            <span className="sectionKicker">Quality at a glance</span>
            <h2>Evaluation snapshot</h2>
          </div>
          <p>{benchmarkSummary.label}</p>
        </div>
        <div className="metricGrid">
          {[
            ["nDCG@10", benchmarkSummary.ndcgAt10.toFixed(3), "graded ranking"],
            ["MRR", benchmarkSummary.mrr.toFixed(3), "first relevant result"],
            [
              "Candidate recall",
              benchmarkSummary.candidateRecall.toFixed(3),
              "pooled relevance",
            ],
            [
              "p95 latency",
              `${benchmarkSummary.p95LatencyMs.toFixed(1)} ms`,
              "warm local run",
            ],
          ].map(([label, value, context]) => (
            <article key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{context}</small>
            </article>
          ))}
        </div>
        <p className="demoNotice">
          <span>i</span> Provisional evidence from{" "}
          {benchmarkSummary.evaluatedQueries} queries with incomplete human
          judgments; missing runs: {benchmarkSummary.missingQueries}.{" "}
          {benchmarkSummary.methodology}
        </p>
        <section
          className="parserTestWorkbench"
          aria-labelledby="parser-test-title"
        >
          <div className="parserTestHeader">
            <div>
              <span className="sectionKicker">Executable specification</span>
              <h2 id="parser-test-title">Query parser verification</h2>
              <p>
                Runs every workbook case marked Supported against the same
                deterministic planner used by search.
              </p>
            </div>
            <button
              type="button"
              onClick={runParserTests}
              disabled={parserTests.status === "running"}
            >
              {parserTests.status === "running"
                ? "Running…"
                : parserTests.status === "ready"
                  ? "Run again"
                  : "Run parser cases"}
            </button>
          </div>
          <div className="parserTestOutput" aria-live="polite">
            {parserTests.status === "idle" && (
              <p className="parserTestEmpty">
                Run the cases to replace labels with measured pass and failure
                counts.
              </p>
            )}
            {parserTests.status === "running" && (
              <p className="parserTestEmpty">
                Reading the workbook and comparing expected fields…
              </p>
            )}
            {parserTests.status === "error" && (
              <p className="parserTestError">{parserTests.error}</p>
            )}
            {parserTests.status === "ready" && parserTests.report && (
              <>
                <div className="parserTestStats">
                  <div>
                    <span>Passed</span>
                    <strong>{parserTests.report.totals.passed}</strong>
                    <small>
                      of {parserTests.report.totals.executed} executed
                    </small>
                  </div>
                  <div>
                    <span>Failed</span>
                    <strong>{parserTests.report.totals.failed}</strong>
                    <small>needs investigation</small>
                  </div>
                  <div>
                    <span>Planned</span>
                    <strong>{parserTests.report.totals.planned}</strong>
                    <small>not executed</small>
                  </div>
                  <div>
                    <span>Pass rate</span>
                    <strong>
                      {Math.round(
                        (parserTests.report.totals.passed /
                          Math.max(1, parserTests.report.totals.executed)) *
                          100,
                      )}
                      %
                    </strong>
                    <small>
                      {new Date(
                        parserTests.report.generatedAt,
                      ).toLocaleTimeString()}
                    </small>
                  </div>
                </div>
                <details
                  className="parserFailures"
                  open={parserTests.report.totals.failed > 0}
                >
                  <summary>
                    {parserTests.report.totals.failed
                      ? `${parserTests.report.totals.failed} failing cases`
                      : "All executed cases pass"}
                  </summary>
                  <div>
                    {parserTests.report.results
                      .filter((result) => !result.passed)
                      .map((result) => (
                        <article key={result.caseId}>
                          <header>
                            <code>{result.caseId}</code>
                            <span>{result.category}</span>
                          </header>
                          <p>“{result.query}”</p>
                          <ul>
                            {result.mismatches.map((mismatch) => (
                              <li key={mismatch.field}>
                                <b>{mismatch.field}</b>
                                <span>Expected: {mismatch.expected}</span>
                                <span>Actual: {mismatch.actual}</span>
                              </li>
                            ))}
                          </ul>
                        </article>
                      ))}
                  </div>
                </details>
                <details className="parserPassed">
                  <summary>
                    {parserTests.report.totals.passed} passing cases
                  </summary>
                  <div>
                    {parserTests.report.results
                      .filter((result) => result.passed)
                      .map((result) => (
                        <article key={result.caseId}>
                          <span className="caseStatus" aria-label="Passed">
                            ✓
                          </span>
                          <code>{result.caseId}</code>
                          <span>{result.category}</span>
                          <p>“{result.query}”</p>
                        </article>
                      ))}
                  </div>
                </details>
              </>
            )}
          </div>
        </section>
      </section>

      <section className="dataset" id="dataset">
        <div>
          <span className="sectionKicker">Built in the open</span>
          <h2>
            From raw ratings to
            <br />
            explainable retrieval.
          </h2>
          <p>
            CineSeek turns MovieLens Latest Small into a searchable corpus with
            transparent metadata, a reproducible evaluation harness, and room
            for optional enrichment.
          </p>
        </div>
        <div className="datasetCard">
          <div className="datasetTop">
            <span className="database">▱</span>
            <div>
              <h3>MovieLens Latest Small</h3>
              <p>Local corpus · transformed & verified</p>
            </div>
            <b>READY</b>
          </div>
          <div className="datasetStats">
            <div>
              <strong>9,742</strong>
              <span>movies indexed</span>
            </div>
            <div>
              <strong>80</strong>
              <span>benchmark queries</span>
            </div>
            <div>
              <strong>Optional</strong>
              <span>TMDB enrichment</span>
            </div>
          </div>
          <ol>
            <li className="done">
              <span>✓</span>
              <div>
                <b>Corpus & metadata</b>
                <small>Titles, genres, tags, ratings, IDs</small>
              </div>
            </li>
            <li className="done">
              <span>✓</span>
              <div>
                <b>Provisional benchmark</b>
                <small>80 relevance queries with reproducible evaluation</small>
              </div>
            </li>
            <li className="done">
              <span>✓</span>
              <div>
                <b>Transparent diagnostics</b>
                <small>Planner, retrieval, scoring, and review evidence</small>
              </div>
            </li>
          </ol>
          <small>
            This product uses TMDB and the TMDB APIs but is not endorsed,
            certified, or otherwise approved by TMDB.
          </small>
        </div>
      </section>
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
        <form
          className="stickySearchDock"
          onSubmit={submitSticky}
          role="search"
          aria-label="Persistent movie search"
        >
          <span className="stickySearchMark" aria-hidden="true">
            C
          </span>
          <label className="srOnly" htmlFor="sticky-movie-search">
            Search movies from anywhere on the page
          </label>
          <input
            id="sticky-movie-search"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Search the MovieLens teaching sample"
          />
          <span className="stickySearchMode" aria-hidden="true">
            {mode}
          </span>
          <button type="submit">
            Search <span aria-hidden="true">→</span>
          </button>
        </form>
      )}

      {selected && (
        <div
          className="modalBackdrop"
          role="presentation"
          onMouseDown={() => setSelected(null)}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="movie-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              onClick={() => setSelected(null)}
              aria-label="Close details"
            >
              ×
            </button>
            <span className="sectionKicker">MovieLens ID {selected.id}</span>
            <h2 id="movie-title">{selected.title}</h2>
            <p>
              {selected.year} · {selected.genres.join(" · ")}
            </p>
            {selected.learningUseCase && (
              <div className="learningFocus">
                <b>Why this movie is in the teaching sample</b>
                <p>{selected.learningUseCase}</p>
              </div>
            )}
            {selected.overview && <p>{selected.overview}</p>}
            <div className="chips">
              {selected.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            {selected.cast?.length ? (
              <div>
                <small>Cast from optional TMDB enrichment</small>
                <div className="chips">
                  {selected.cast.slice(0, 6).map((person) => (
                    <span key={person.id}>{person.name}</span>
                  ))}
                </div>
              </div>
            ) : null}
            <dl>
              <div>
                <dt>Average rating</dt>
                <dd>★ {selected.rating.toFixed(3)}</dd>
              </div>
              <div>
                <dt>Rating count</dt>
                <dd>{selected.ratings}</dd>
              </div>
              <div>
                <dt>IMDb</dt>
                <dd>{selected.imdb}</dd>
              </div>
              <div>
                <dt>TMDB</dt>
                <dd>{selected.tmdb}</dd>
              </div>
            </dl>
            <small>
              MovieLens-derived record with optional cached TMDB enrichment.
              When no poster is available, CineSeek uses a generated fallback
              treatment.
            </small>
          </section>
        </div>
      )}
    </main>
  );
}
