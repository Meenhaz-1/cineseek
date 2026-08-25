import {
  characterTrigrams,
  scoreCharacterTrigramCandidate,
} from "./character-trigram-index.mjs";
import { scoreEditDistanceCandidate } from "./edit-distance.mjs";
import { scoreTokenCoverageCandidate } from "./token-coverage.mjs";
import { scoreOrderedTokenProximityCandidate } from "./ordered-token-proximity.mjs";

export const COMBINED_WEIGHT_KEYS = [
  "tokenCoverage",
  "orderedCoverage",
  "phraseMatch",
  "proximity",
  "dice",
  "editSimilarity",
];

export const DEFAULT_COMBINED_WEIGHTS = {
  tokenCoverage: 25,
  orderedCoverage: 20,
  phraseMatch: 15,
  proximity: 10,
  dice: 15,
  editSimilarity: 15,
};

export function validateCombinedWeights(input) {
  const weights = {};
  for (const key of COMBINED_WEIGHT_KEYS) {
    const value = input?.[key] ?? DEFAULT_COMBINED_WEIGHTS[key];
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 100
    ) {
      throw new Error(`${key} weight must be a finite number from 0 to 100.`);
    }
    weights[key] = value;
  }
  const totalWeight = COMBINED_WEIGHT_KEYS.reduce(
    (sum, key) => sum + weights[key],
    0,
  );
  if (totalWeight <= 0)
    throw new Error(
      "At least one combined-ranker weight must be greater than zero.",
    );
  const effectiveWeights = Object.fromEntries(
    COMBINED_WEIGHT_KEYS.map((key) => [
      key,
      Number((weights[key] / totalWeight).toFixed(6)),
    ]),
  );
  return { weights, effectiveWeights, totalWeight };
}

export function scoreCombinedTitleCandidate(
  record,
  normalizedQuery,
  queryTrigrams,
  effectiveWeights,
) {
  const trigram = scoreCharacterTrigramCandidate(queryTrigrams, record);
  const edit = scoreEditDistanceCandidate(normalizedQuery, record);
  const coverage = scoreTokenCoverageCandidate(normalizedQuery, record);
  const ordered = scoreOrderedTokenProximityCandidate(normalizedQuery, record);
  const signals = {
    tokenCoverage: coverage.coverage,
    orderedCoverage: ordered.orderedCoverage,
    phraseMatch: ordered.phraseMatch ? 1 : 0,
    proximity: ordered.proximity,
    dice: trigram.dice,
    editSimilarity: edit.editSimilarity,
  };
  const contributions = Object.fromEntries(
    COMBINED_WEIGHT_KEYS.map((key) => [
      key,
      Number((signals[key] * effectiveWeights[key]).toFixed(6)),
    ]),
  );
  const combinedScore = Number(
    COMBINED_WEIGHT_KEYS.reduce(
      (sum, key) => sum + contributions[key],
      0,
    ).toFixed(6),
  );
  return { ...record, signals, contributions, combinedScore };
}

export function scoreCombinedTitleCandidates(
  records,
  candidateIds,
  normalizedQuery,
  inputWeights,
  previewLimit = 12,
  rankingContext = {},
) {
  const { weights, effectiveWeights, totalWeight } =
    validateCombinedWeights(inputWeights);
  const requestedGenres = rankingContext.genres ?? [];
  const fieldMatches = rankingContext.fieldMatches;
  const exactTitleIds =
    rankingContext.exactTitleIds instanceof Set
      ? rankingContext.exactTitleIds
      : new Set();
  const genreFallbackCandidateIds =
    rankingContext.genreFallbackCandidateIds instanceof Set
      ? rankingContext.genreFallbackCandidateIds
      : new Set();
  const genreFallbackQuery = rankingContext.genreFallbackQuery ?? "";
  const blendFieldEvidence = fieldMatches instanceof Map;
  const isStructuredGenreDiscovery =
    rankingContext.structuredGenreRanking === true &&
    normalizedQuery.length === 0 &&
    requestedGenres.length > 0;
  const cachedRatingStats = rankingContext.ratingStats;
  let ratingVotes = cachedRatingStats?.ratingVotes ?? 0;
  let weightedRatingSum = 0;
  let maxRatingCount = cachedRatingStats?.maxRatingCount ?? 1;
  if (isStructuredGenreDiscovery && !cachedRatingStats) {
    for (const record of records.values()) {
      const ratingCount = record.ratingCount ?? 0;
      ratingVotes += ratingCount;
      weightedRatingSum += (record.averageRating ?? 0) * ratingCount;
      maxRatingCount = Math.max(maxRatingCount, ratingCount);
    }
  }
  const corpusRatingMean = cachedRatingStats
    ? cachedRatingStats.corpusRatingMean
    : ratingVotes > 0
      ? weightedRatingSum / ratingVotes
      : 0;
  const zeroSignals = Object.fromEntries(
    COMBINED_WEIGHT_KEYS.map((key) => [key, 0]),
  );
  const candidates = candidateIds
    .map((id) => records.get(id))
    .filter(Boolean)
    .map((record) => {
      const metadataGenreMatchCount = requestedGenres.filter((genre) =>
        record.genres.includes(genre),
      ).length;
      const usesStrongGenreTitlePhrase =
        normalizedQuery.length > 0 && genreFallbackQuery !== normalizedQuery;
      const candidateTitleQuery =
        genreFallbackCandidateIds.has(record.id) &&
        (metadataGenreMatchCount === 0 || usesStrongGenreTitlePhrase)
          ? genreFallbackQuery
          : normalizedQuery;
      const titleCandidate = isStructuredGenreDiscovery
        ? {
            id: record.id,
            title: record.title,
            year: record.year,
            genres: record.genres,
            averageRating: record.averageRating,
            ratingCount: record.ratingCount,
            signals: zeroSignals,
            contributions: zeroSignals,
            combinedScore: 0,
          }
        : scoreCombinedTitleCandidate(
            record,
            candidateTitleQuery,
            characterTrigrams(candidateTitleQuery),
            effectiveWeights,
          );
      const fieldMatch = fieldMatches?.get(record.id);
      const titleScore = titleCandidate.combinedScore;
      const fieldScore = fieldMatch?.score ?? 0;
      const isExactTitleMatch = exactTitleIds.has(record.id);
      const lexicalCombinedScore = isExactTitleMatch
        ? 1
        : blendFieldEvidence
          ? Number((titleScore * 0.35 + fieldScore * 0.65).toFixed(6))
          : titleScore;
      const genreFocus =
        requestedGenres.length > 0
          ? metadataGenreMatchCount /
            Math.max(requestedGenres.length, record.genres?.length ?? 0, 1)
          : 0;
      const ratingCount = record.ratingCount ?? 0;
      const averageRating = record.averageRating ?? corpusRatingMean;
      const cachedRating = cachedRatingStats?.ratingById.get(record.id);
      const bayesianRating = cachedRating
        ? cachedRating.bayesianRating
        : ratingVotes > 0
          ? (ratingCount * averageRating + 20 * corpusRatingMean) /
            (ratingCount + 20)
          : 0;
      const ratingEvidence = cachedRating
        ? cachedRating.ratingEvidence
        : Math.log1p(ratingCount) / Math.log1p(maxRatingCount);
      const structuredGenreScore = isStructuredGenreDiscovery
        ? Number(
            (
              genreFocus * 0.55 +
              (bayesianRating / 5) * 0.3 +
              ratingEvidence * 0.15
            ).toFixed(6),
          )
        : 0;
      const combinedScore = isStructuredGenreDiscovery
        ? structuredGenreScore
        : lexicalCombinedScore;
      return {
        ...titleCandidate,
        titleScore,
        fieldScore,
        fieldMatch,
        combinedScore,
        metadataGenreMatchCount,
        genreFocus,
        bayesianRating: Number(bayesianRating.toFixed(3)),
        ratingEvidence: Number(ratingEvidence.toFixed(6)),
        structuredGenreScore,
        isExactTitleMatch,
      };
    })
    .sort((left, right) => {
      const exactTitlePriority =
        Number(right.isExactTitleMatch) - Number(left.isExactTitleMatch);
      if (exactTitlePriority) return exactTitlePriority;
      const entityPriority =
        Number(right.fieldMatch?.exactEntityMatch ?? false) -
        Number(left.fieldMatch?.exactEntityMatch ?? false);
      if (entityPriority) return entityPriority;
      const genrePriority =
        right.metadataGenreMatchCount - left.metadataGenreMatchCount;
      if (genrePriority) return genrePriority;
      if (
        isStructuredGenreDiscovery &&
        right.structuredGenreScore !== left.structuredGenreScore
      ) {
        return right.structuredGenreScore - left.structuredGenreScore;
      }
      return (
        right.combinedScore - left.combinedScore ||
        right.signals.orderedCoverage - left.signals.orderedCoverage ||
        right.signals.tokenCoverage - left.signals.tokenCoverage ||
        right.signals.dice - left.signals.dice ||
        (right.averageRating ?? 0) - (left.averageRating ?? 0) ||
        (right.ratingCount ?? 0) - (left.ratingCount ?? 0) ||
        left.title.localeCompare(right.title)
      );
    });
  return {
    method: blendFieldEvidence
      ? "weighted_explainable_multifield_ranker"
      : "weighted_explainable_title_ranker",
    rankingContext: {
      requestedGenres,
      genreOverlapPrecedesTitleScore: requestedGenres.length > 1,
      titleWeight: blendFieldEvidence ? 0.35 : 1,
      fieldWeight: blendFieldEvidence ? 0.65 : 0,
      structuredGenreDiscovery: isStructuredGenreDiscovery,
      structuredGenreWeights: isStructuredGenreDiscovery
        ? { genreFocus: 0.55, bayesianRating: 0.3, ratingEvidence: 0.15 }
        : null,
    },
    weights,
    effectiveWeights,
    totalWeight,
    candidateCount: candidates.length,
    candidatesPreview: candidates.slice(0, previewLimit),
    truncated: candidates.length > previewLimit,
  };
}
