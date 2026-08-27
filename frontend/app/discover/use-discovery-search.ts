"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import type { QueryPlan } from "../../lib/query-planner.mjs";
import type { Movie } from "../data";
import {
  DEFAULT_EXAMPLE_QUERY,
  DEFAULT_RANKER_WEIGHTS,
  RESULT_PAGE_SIZE,
} from "./search-config";
import type {
  CoachState,
  CombinedWeightKey,
  CombinedWeights,
  GenreWeightKey,
  GenreWeights,
  Mode,
  ParserTestReport,
  ParserTestState,
  TitleRetrieval,
  TitleRetrievalState,
  TypeaheadSuggestion,
  TypeaheadSuggestions,
} from "./search-contracts";
import {
  analysisFromPlan,
  correctedQueryLabel,
  fullResultMovie,
} from "./search-presenters";

export function useDiscoverySearch() {
  const portfolioMode =
    process.env.NEXT_PUBLIC_CINESEEK_DEPLOYMENT_MODE === "portfolio";
  const [input, setInput] = useState("");
  const [query, setQuery] = useState(DEFAULT_EXAMPLE_QUERY);
  const [autocorrect, setAutocorrect] = useState(true);
  const [hasSearched, setHasSearched] = useState(false);
  const mode: Mode = "hybrid";
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
  const [genreWeightOverrides, setGenreWeightOverrides] =
    useState<GenreWeights | null>(null);
  const [combinedUpdating, setCombinedUpdating] = useState(false);
  const [resultLimit, setResultLimit] = useState(RESULT_PAGE_SIZE);
  const [showStickySearch, setShowStickySearch] = useState(false);
  const [suggestions, setSuggestions] = useState<TypeaheadSuggestions>();
  const heroSearchRef = useRef<HTMLFormElement>(null);
  const resultsSummaryRef = useRef<HTMLDivElement>(null);
  const focusResultsAfterLoad = useRef(false);

  const retrievalIsCurrent =
    titleRetrieval.query === query &&
    titleRetrieval.autocorrect === autocorrect;
  const activePlan =
    titleRetrieval.status === "ready" && retrievalIsCurrent
      ? titleRetrieval.plan
      : undefined;
  const analysis = useMemo(
    () => analysisFromPlan(activePlan, query),
    [activePlan, query],
  );
  const suggestedQuery = activePlan?.suggestedQuery;
  const activeCorrection = activePlan?.corrections[0];
  const automaticCorrection =
    activeCorrection?.policy === "automatic"
      ? {
          correctedQuery: correctedQueryLabel(query, activeCorrection),
          originalQuery: query,
        }
      : undefined;
  const suggestedQueryLabel =
    suggestedQuery && activeCorrection
      ? correctedQueryLabel(query, activeCorrection)
      : suggestedQuery;
  const rankerWeightTotal = Object.values(rankerWeights).reduce(
    (sum, weight) => sum + weight,
    0,
  );
  const responseCombinedScoring =
    titleRetrieval.status === "ready" && retrievalIsCurrent
      ? titleRetrieval.result?.combinedScoring
      : undefined;
  const responseGenreWeights: GenreWeights | null =
    responseCombinedScoring && !responseCombinedScoring.skipped
      ? responseCombinedScoring.rankingContext.structuredGenreInputWeights
      : null;
  const activeGenreWeights = genreWeightOverrides ?? responseGenreWeights;
  const genreWeightTotal = activeGenreWeights
    ? Object.values(activeGenreWeights).reduce((sum, weight) => sum + weight, 0)
    : 0;
  const titleRetrievalLoading =
    titleRetrieval.status === "idle" || !retrievalIsCurrent;
  const displayedResults = useMemo(
    () =>
      titleRetrieval.status === "ready" && retrievalIsCurrent
        ? (titleRetrieval.result?.searchResults.items.map(fullResultMovie) ??
          [])
        : [],
    [retrievalIsCurrent, titleRetrieval],
  );
  const inferred = analysis.semanticExpansions
    .flatMap(({ values }) => values)
    .slice(0, 4);

  useEffect(() => {
    const trimmedInput = input.trim();
    if (trimmedInput.length < 2) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void fetch(
        `/api/suggestions?q=${encodeURIComponent(trimmedInput)}&limit=6`,
        {
          signal: controller.signal,
        },
      )
        .then(async (response) => {
          const payload = (await response.json()) as
            TypeaheadSuggestions | { error?: string };
          if (!response.ok || !("query" in payload))
            throw new Error(
              "error" in payload
                ? payload.error || "Suggestions unavailable."
                : "Suggestions unavailable.",
            );
          if (payload.query === trimmedInput.toLowerCase())
            setSuggestions(payload);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError")
            return;
          setSuggestions(undefined);
        });
    }, 200);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [input]);

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
    if (
      !focusResultsAfterLoad.current ||
      titleRetrieval.status !== "ready" ||
      !retrievalIsCurrent
    )
      return;
    focusResultsAfterLoad.current = false;
    const resultsSummary = resultsSummaryRef.current;
    if (!resultsSummary) return;
    resultsSummary.focus({ preventScroll: true });
    resultsSummary.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  }, [query, retrievalIsCurrent, titleRetrieval]);

  useEffect(() => {
    if (!activePlan || portfolioMode) return;
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
        if (!response.ok || !payload.paragraph) {
          throw new Error(
            payload.error || "No coaching paragraph was returned.",
          );
        }
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
        autocorrect,
        weights: rankerWeights,
        genreWeights: genreWeightOverrides ?? undefined,
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
        if (!response.ok || !payload.queryPlan || !payload.retrieval) {
          throw new Error(payload.error || "Search failed.");
        }
        setTitleRetrieval({
          status: "ready",
          query,
          autocorrect,
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
          autocorrect,
          error: error instanceof Error ? error.message : "Search failed.",
        });
        setCombinedUpdating(false);
      });
    return () => controller.abort();
  }, [query, autocorrect, rankerWeights, genreWeightOverrides, resultLimit]);

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

  function updateGenreWeight(key: GenreWeightKey, value: number) {
    if (!activeGenreWeights) return;
    const next = { ...activeGenreWeights, [key]: value };
    if (!Object.values(next).some((weight) => weight > 0)) return;
    setCombinedUpdating(true);
    setGenreWeightOverrides(next);
  }

  function resetGenreWeights() {
    setCombinedUpdating(true);
    setGenreWeightOverrides(null);
  }

  function chooseQuery(nextQuery: string, revealResults = false) {
    if (!nextQuery) return;
    setHasSearched(true);
    if (revealResults) focusResultsAfterLoad.current = true;
    setCoach({ status: "loading" });
    setResultLimit(RESULT_PAGE_SIZE);
    setGenreWeightOverrides(null);
    setSuggestions(undefined);
    setAutocorrect(true);
    if (nextQuery === query) setCoachRequest((value) => value + 1);
    else setQuery(nextQuery);
  }

  function showMoreResults() {
    setCombinedUpdating(true);
    setResultLimit((current) => Math.min(9_742, current + RESULT_PAGE_SIZE));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    chooseQuery(input.trim(), true);
  }

  function submitSticky(event: FormEvent) {
    submit(event);
  }

  function runExample(example: string) {
    setInput(example);
    chooseQuery(example, true);
  }

  function acceptSuggestion() {
    if (!suggestedQuery) return;
    const nextQuery = suggestedQueryLabel ?? suggestedQuery;
    setInput(nextQuery);
    chooseQuery(nextQuery, true);
  }

  function selectTypeaheadSuggestion(suggestion: TypeaheadSuggestion) {
    setInput(suggestion.label);
    chooseQuery(suggestion.label, true);
  }

  function searchOriginalQuery() {
    setHasSearched(true);
    focusResultsAfterLoad.current = true;
    setCoach({ status: "loading" });
    setCombinedUpdating(true);
    setResultLimit(RESULT_PAGE_SIZE);
    setGenreWeightOverrides(null);
    setAutocorrect(false);
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
      if (!response.ok) {
        throw new Error(
          payload.error || "The parser cases could not be executed.",
        );
      }
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

  return {
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
    responseCombinedScoring,
    resultLimit,
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
    selectTypeaheadSuggestion,
    suggestedQuery,
    suggestedQueryLabel,
    suggestions,
    titleRetrieval,
    titleRetrievalLoading,
    updateGenreWeight,
    updateRankerWeight,
  };
}
