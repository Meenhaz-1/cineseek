import { movies, type Movie } from "../data";
import type { QueryPlan } from "../../lib/query-planner.mjs";
import { RESULT_PALETTES, WEIGHT_CONTROLS } from "./search-config";
import type { FullSearchResult, TitleRetrieval } from "./search-contracts";

export function analysisFromPlan(
  plan: QueryPlan | undefined,
  rawQuery: string,
) {
  const filters = plan?.filters ?? { genres: [], genreMode: "any" as const };
  const people = plan?.entities.people.map(({ name }) => name) ?? [];
  const personCandidates = plan?.entities.personCandidates ?? [];
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
    personCandidates,
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

export type QueryAnalysis = ReturnType<typeof analysisFromPlan>;

export function correctedQueryLabel(
  rawQuery: string,
  correction: QueryPlan["corrections"][number],
) {
  const escaped = correction.original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const corrected = rawQuery.replace(
    new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i"),
    (_, prefix: string) => `${prefix}${correction.replacement}`,
  );
  return corrected === rawQuery ? correction.replacement : corrected;
}

export function queryLabel(result: TitleRetrieval) {
  return result.retrievalQuery || result.normalizedQuery || "this query";
}

export function exactTakeaway(result: TitleRetrieval) {
  return result.exact.hit
    ? `CineSeek found an exact title match: ${result.exact.matches.map(({ title }) => title).join(", ")}. No other title checks were needed.`
    : `No title exactly matched “${result.normalizedQuery}”, so CineSeek continued with “${result.retrievalQuery || "the movie details in the search"}”.`;
}

export function tokenTakeaway(result: TitleRetrieval) {
  if (result.tokenLookup.skipped)
    return `${result.tokenLookup.reason} CineSeek continued with people, genres, filters, and other movie details.`;
  const additional =
    result.tokenLookup.candidateCount - result.tokenLookup.intersectionCount;
  return `${result.tokenLookup.candidateCount.toLocaleString()} titles share at least one search word, and ${result.tokenLookup.intersectionCount.toLocaleString()} share every word. Keeping partial matches adds ${additional.toLocaleString()} possible movies.`;
}

export function fieldTakeaway(result: TitleRetrieval) {
  if (result.fieldLookup.skipped) return result.fieldLookup.reason;
  const top = result.fieldLookup.candidatesPreview[0]?.fieldMatch.bestMatch;
  return top
    ? `${result.fieldLookup.candidateCount.toLocaleString()} movies matched a person, genre, tag, or description. One strong example is ${top.label.toLowerCase()}: “${top.value}”.`
    : `No person, genre, tag, or description matched “${result.normalizedQuery}”. Title matching can still find movies.`;
}

export function trigramTakeaway(result: TitleRetrieval) {
  if (result.trigramLookup.skipped)
    return `${result.trigramLookup.reason} No spelling-tolerant title check was needed.`;
  return `CineSeek split “${queryLabel(result)}” into ${result.trigramLookup.trigrams.length} overlapping three-letter groups. ${result.trigramLookup.candidateCount.toLocaleString()} titles shared enough groups to remain possible matches.`;
}

export function mergeTakeaway(result: TitleRetrieval) {
  if (result.combinedCandidates.skipped)
    return result.combinedCandidates.reason;
  const multiSource = result.combinedCandidates.candidatesPreview.filter(
    ({ sources }) => sources.length > 1,
  ).length;
  return `After combining every search path and removing repeats, ${result.combinedCandidates.candidateCount.toLocaleString()} unique movies remained. ${multiSource} previewed movie${multiSource === 1 ? " was" : "s were"} found in more than one way.`;
}

export function metadataTakeaway(result: TitleRetrieval) {
  if (!result.metadataFilter.active)
    return "This search has no required year or rating filters, so no movies were removed at this step.";
  return `${result.metadataFilter.candidateCount.toLocaleString()} of ${result.metadataFilter.corpusCount.toLocaleString()} movies met every required filter. ${result.metadataFilter.excludedCount.toLocaleString()} movies were removed.`;
}

export function fuzzyTakeaway(result: TitleRetrieval) {
  if (result.fuzzyScoring.skipped) return result.fuzzyScoring.reason;
  const top = result.fuzzyScoring.candidatesPreview[0];
  return top
    ? `${top.title} shares the strongest pattern of three-letter groups with the search. Its technical scores are ${top.dice.toFixed(3)} Dice and ${top.jaccard.toFixed(3)} Jaccard.`
    : `No movie shared enough three-letter groups with “${queryLabel(result)}” to receive a similarity score.`;
}

export function editTakeaway(result: TitleRetrieval) {
  if (result.editScoring.skipped) return result.editScoring.reason;
  const top = result.editScoring.candidatesPreview[0];
  return top
    ? `${top.title} is closest in spelling to “${queryLabel(result)}”. It needs ${top.editDistance} letter changes, giving it ${top.editSimilarity.toFixed(3)} edit similarity.`
    : `No movie title could be compared with “${queryLabel(result)}” by spelling difference.`;
}

export function coverageTakeaway(result: TitleRetrieval) {
  if (result.tokenCoverageScoring.skipped)
    return result.tokenCoverageScoring.reason;
  const top = result.tokenCoverageScoring.candidatesPreview[0];
  return top
    ? `${top.title} contains ${top.matchedTokenCount} of ${top.queryTokenCount} complete search words (${Math.round(top.coverage * 100)}%). This check does not consider word order.`
    : `No movie title contains a complete search word from “${queryLabel(result)}”.`;
}

export function orderedTakeaway(result: TitleRetrieval) {
  if (result.orderedTokenProximityScoring.skipped)
    return result.orderedTokenProximityScoring.reason;
  const top = result.orderedTokenProximityScoring.candidatesPreview[0];
  return top
    ? `${top.title} matches ${Math.round(top.orderedCoverage * 100)}% of the search words in order, with ${top.gapCount} gap${top.gapCount === 1 ? "" : "s"}. Its technical proximity score is ${top.proximity.toFixed(3)}${top.phraseMatch ? ", and the words form a complete phrase" : ""}.`
    : `No movie title matches the search words in the same order.`;
}

export function combinedTakeaway(result: TitleRetrieval) {
  if (result.combinedScoring.skipped) return result.combinedScoring.reason;
  const top = result.combinedScoring.candidatesPreview[0];
  if (!top)
    return `CineSeek could not create a final score because there were no possible movies to rank.`;
  if (result.combinedScoring.rankingContext.structuredGenreDiscovery) {
    const qualitySummary = top.averageRatingEligible
      ? "rating quality and rating count"
      : `rating count; its average rating was not used because it has fewer than ${result.combinedScoring.rankingContext.minimumAverageRatingCount} ratings`;
    return `${top.title} ranks first by combining genre match with ${qualitySummary}. Its technical final score is ${top.structuredGenreScore.toFixed(3)}.`;
  }
  if (top.personPopularityBoost) {
    const boost = top.personPopularityBoost;
    return `${top.title} gets a ${boost.contribution.toFixed(3)} boost because it is connected to ${boost.name}, who has ${boost.movieCount} movies in the catalog. The boost becomes smaller for repeated movies from the same person.`;
  }
  if (top.fieldMatch?.bestMatch) {
    return `${top.title} ranks first with a ${top.combinedScore.toFixed(3)} final score. Its strongest movie-detail match is ${top.fieldMatch.bestMatch.label.toLowerCase()}: “${top.fieldMatch.bestMatch.value}”.`;
  }
  const leadingSignal = WEIGHT_CONTROLS.map(({ key, label }) => ({
    label,
    contribution: top.contributions[key],
  })).sort((left, right) => right.contribution - left.contribution)[0];
  if (result.combinedScoring.rankingContext.genreOverlapPrecedesTitleScore) {
    return `${top.title} matches ${top.metadataGenreMatchCount} of ${result.combinedScoring.rankingContext.requestedGenres.length} requested genres. CineSeek checks that before using its ${top.combinedScore.toFixed(3)} title score.`;
  }
  return `${top.title} ranks first with a ${top.combinedScore.toFixed(3)} final score. ${leadingSignal.label} adds the largest share: ${leadingSignal.contribution.toFixed(3)}.`;
}

export function fullResultMovie(result: FullSearchResult): Movie {
  const teachingMovie = movies.find((movie) => movie.id === result.id);
  if (teachingMovie)
    return {
      ...teachingMovie,
      matchReason: result.matchReason,
      personPopularityBoost: result.personPopularityBoost,
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
    personPopularityBoost: result.personPopularityBoost,
    relevanceScore: result.score,
  };
}
