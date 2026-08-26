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

export function queryLabel(result: TitleRetrieval) {
  return result.retrievalQuery || result.normalizedQuery || "this query";
}

export function exactTakeaway(result: TitleRetrieval) {
  return result.exact.hit
    ? `â€œ${result.normalizedQuery}â€ resolved directly to ${result.exact.matches.map(({ title }) => title).join(", ")}. Later title-retrieval stages are unnecessary for this search.`
    : `â€œ${result.normalizedQuery}â€ has no exact hash key. The pipeline continues with â€œ${result.retrievalQuery || "no residual title text"}â€ to protect recall.`;
}

export function tokenTakeaway(result: TitleRetrieval) {
  if (result.tokenLookup.skipped)
    return `${result.tokenLookup.reason} This query will continue through its remaining structured metadata paths.`;
  const additional =
    result.tokenLookup.candidateCount - result.tokenLookup.intersectionCount;
  return `For â€œ${queryLabel(result)}â€, the union found ${result.tokenLookup.candidateCount.toLocaleString()} titles and the intersection found ${result.tokenLookup.intersectionCount.toLocaleString()}. Union preserves ${additional.toLocaleString()} additional partial-token candidates for later scoring.`;
}

export function fieldTakeaway(result: TitleRetrieval) {
  if (result.fieldLookup.skipped) return result.fieldLookup.reason;
  const top = result.fieldLookup.candidatesPreview[0]?.fieldMatch.bestMatch;
  return top
    ? `â€œ${result.normalizedQuery}â€ nominated ${result.fieldLookup.candidateCount.toLocaleString()} movies across typed fields. The preview includes a ${top.label.toLowerCase()} match on â€œ${top.value}â€; structured cast and director entities receive more weight than description text.`
    : `No cast, director, genre, tag, or description field contains enough evidence for â€œ${result.normalizedQuery}â€. Title retrieval can still provide candidates.`;
}

export function trigramTakeaway(result: TitleRetrieval) {
  if (result.trigramLookup.skipped)
    return `${result.trigramLookup.reason} No typo-tolerant title candidates are needed for this query.`;
  return `â€œ${queryLabel(result)}â€ produced ${result.trigramLookup.trigrams.length} character trigrams with a ${result.trigramLookup.minimumMatches}-match threshold. That threshold admitted ${result.trigramLookup.candidateCount.toLocaleString()} typo-tolerant candidates.`;
}

export function mergeTakeaway(result: TitleRetrieval) {
  if (result.combinedCandidates.skipped)
    return result.combinedCandidates.reason;
  const multiSource = result.combinedCandidates.candidatesPreview.filter(
    ({ sources }) => sources.length > 1,
  ).length;
  return `Title, fuzzy, typed-field, and metadata retrieval produced ${result.combinedCandidates.candidateCount.toLocaleString()} unique IDs for â€œ${queryLabel(result)}â€. In the preview, ${multiSource} candidate${multiSource === 1 ? "" : "s"} were nominated by multiple paths.`;
}

export function metadataTakeaway(result: TitleRetrieval) {
  if (!result.metadataFilter.active)
    return "This query has no supported hard metadata constraints, so all corpus records remain eligible for title retrieval.";
  return `${result.metadataFilter.candidateCount.toLocaleString()} of ${result.metadataFilter.corpusCount.toLocaleString()} movies satisfy every recognized hard constraint. ${result.metadataFilter.excludedCount.toLocaleString()} records are removed before final ranking.`;
}

export function fuzzyTakeaway(result: TitleRetrieval) {
  if (result.fuzzyScoring.skipped) return result.fuzzyScoring.reason;
  const top = result.fuzzyScoring.candidatesPreview[0];
  return top
    ? `For â€œ${queryLabel(result)}â€, ${top.title} leads with ${top.dice.toFixed(3)} Dice and ${top.jaccard.toFixed(3)} Jaccard. The scores agree on ordering but express shared trigram overlap on different scales.`
    : `No merged candidate received a trigram-similarity score for â€œ${queryLabel(result)}â€. The query needs a broader candidate-generation path.`;
}

export function editTakeaway(result: TitleRetrieval) {
  if (result.editScoring.skipped) return result.editScoring.reason;
  const top = result.editScoring.candidatesPreview[0];
  return top
    ? `${top.title} is closest to â€œ${queryLabel(result)}â€ at ${top.editDistance} edits and ${top.editSimilarity.toFixed(3)} normalized similarity. This signal rewards character-level closeness, even when exact words fail.`
    : `No candidate could be compared with â€œ${queryLabel(result)}â€ by edit distance. Character-level similarity therefore contributes no evidence.`;
}

export function coverageTakeaway(result: TitleRetrieval) {
  if (result.tokenCoverageScoring.skipped)
    return result.tokenCoverageScoring.reason;
  const top = result.tokenCoverageScoring.candidatesPreview[0];
  return top
    ? `${top.title} contains ${top.matchedTokenCount} of ${top.queryTokenCount} searchable words from â€œ${queryLabel(result)}â€ (${Math.round(top.coverage * 100)}%). This stage values complete words but still cannot see their order.`
    : `No candidate contains a complete searchable token from â€œ${queryLabel(result)}â€. Exact token coverage therefore cannot separate the candidates.`;
}

export function orderedTakeaway(result: TitleRetrieval) {
  if (result.orderedTokenProximityScoring.skipped)
    return result.orderedTokenProximityScoring.reason;
  const top = result.orderedTokenProximityScoring.candidatesPreview[0];
  return top
    ? `${top.title} matches ${Math.round(top.orderedCoverage * 100)}% of â€œ${queryLabel(result)}â€ in order with ${top.gapCount} gap${top.gapCount === 1 ? "" : "s"}. Its ${top.proximity.toFixed(3)} proximity${top.phraseMatch ? " forms a complete adjacent phrase" : " does not form a complete phrase"}.`
    : `No candidate forms an ordered alignment for â€œ${queryLabel(result)}â€. Word order and proximity therefore contribute no ranking evidence.`;
}

export function combinedTakeaway(result: TitleRetrieval) {
  if (result.combinedScoring.skipped) return result.combinedScoring.reason;
  const top = result.combinedScoring.candidatesPreview[0];
  if (!top)
    return `No combined score was produced for â€œ${queryLabel(result)}â€. Adjusting weights cannot change an empty candidate pool.`;
  if (result.combinedScoring.rankingContext.structuredGenreDiscovery) {
    return `${top.title} leads with ${Math.round(top.genreFocus * 100)}% genre focus, a ${top.bayesianRating.toFixed(2)} Bayesian rating, and ${Math.round(top.ratingEvidence * 100)}% rating-count evidence. Its final structured discovery score is ${top.structuredGenreScore.toFixed(3)}.`;
  }
  if (top.personPopularityBoost) {
    const boost = top.personPopularityBoost;
    return `${top.title} receives a ${boost.contribution.toFixed(3)} person-popularity contribution from ${boost.name}'s ${boost.movieCount}-movie catalog. The contribution decays across repeated movies from the same person, keeping the final ${top.combinedScore.toFixed(3)} score movie-focused.`;
  }
  if (top.fieldMatch?.bestMatch) {
    return `${top.title} wins with a ${top.combinedScore.toFixed(3)} blended score. Its strongest typed-field evidence is ${top.fieldMatch.bestMatch.label.toLowerCase()}: â€œ${top.fieldMatch.bestMatch.value}â€ (${top.fieldScore.toFixed(3)}).`;
  }
  const leadingSignal = WEIGHT_CONTROLS.map(({ key, label }) => ({
    label,
    contribution: top.contributions[key],
  })).sort((left, right) => right.contribution - left.contribution)[0];
  if (result.combinedScoring.rankingContext.genreOverlapPrecedesTitleScore) {
    return `${top.title} matches ${top.metadataGenreMatchCount} of ${result.combinedScoring.rankingContext.requestedGenres.length} requested genres, which is considered before its ${top.combinedScore.toFixed(3)} title score.`;
  }
  return `${top.title} wins â€œ${queryLabel(result)}â€ with a ${top.combinedScore.toFixed(3)} combined score. ${leadingSignal.label} contributes the largest share at ${leadingSignal.contribution.toFixed(3)}.`;
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
