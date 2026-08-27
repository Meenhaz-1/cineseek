import {
  characterTrigrams,
  scoreCharacterTrigramCandidate,
} from "./character-trigram-index.mjs";
import { exactTitleKey } from "./exact-title-index.mjs";
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

export const GENRE_WEIGHT_KEYS = [
  "genreFocus",
  "bayesianRating",
  "ratingEvidence",
];

export const SINGLE_GENRE_DISCOVERY_WEIGHTS = {
  genreFocus: 15,
  bayesianRating: 55,
  ratingEvidence: 30,
};

export const COMPOUND_GENRE_DISCOVERY_WEIGHTS = {
  genreFocus: 55,
  bayesianRating: 30,
  ratingEvidence: 15,
};

export const BAYESIAN_RATING_PRIOR = 20;
export const MIN_RATING_COUNT_FOR_AVERAGE = 5;
export const PERSON_POPULARITY_WEIGHT = 0.06;
export const PERSON_RATING_EVIDENCE_WEIGHT = 0.01;

function titlePhrasePriority(title, query) {
  const normalizedQuery = exactTitleKey(query);
  if (normalizedQuery.split(" ").length < 2) return 0;
  const normalizedTitle = exactTitleKey(title).replace(/^(a|an|the)\s+/i, "");
  return normalizedTitle === normalizedQuery ||
    normalizedTitle.startsWith(`${normalizedQuery} `)
    ? 1
    : 0;
}

function validateRelativeWeights(input, defaults, keys, label) {
  if (
    input !== undefined &&
    (typeof input !== "object" || input === null || Array.isArray(input))
  ) {
    throw new Error(`${label} must be an object.`);
  }
  const weights = {};
  for (const key of keys) {
    const value = input?.[key] ?? defaults[key];
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
  const totalWeight = keys.reduce((sum, key) => sum + weights[key], 0);
  if (totalWeight <= 0)
    throw new Error(`At least one ${label} weight must be greater than zero.`);
  const effectiveWeights = Object.fromEntries(
    keys.map((key) => [key, Number((weights[key] / totalWeight).toFixed(6))]),
  );
  return { weights, effectiveWeights, totalWeight };
}

export function validateCombinedWeights(input) {
  return validateRelativeWeights(
    input,
    DEFAULT_COMBINED_WEIGHTS,
    COMBINED_WEIGHT_KEYS,
    "combined-ranker",
  );
}

export function validateGenreWeights(input, defaults) {
  return validateRelativeWeights(
    input,
    defaults ?? SINGLE_GENRE_DISCOVERY_WEIGHTS,
    GENRE_WEIGHT_KEYS,
    "genre-ranker",
  );
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
  const personCandidates = rankingContext.personCandidates ?? [];
  const personIntentRanking = rankingContext.personIntentRanking === true;
  const isStructuredGenreDiscovery =
    rankingContext.structuredGenreRanking === true &&
    normalizedQuery.length === 0 &&
    requestedGenres.length > 0;
  const structuredGenreProfile =
    requestedGenres.length === 1
      ? "single_genre_balanced"
      : "compound_genre_focus";
  const structuredGenreDefaults =
    requestedGenres.length === 1
      ? SINGLE_GENRE_DISCOVERY_WEIGHTS
      : COMPOUND_GENRE_DISCOVERY_WEIGHTS;
  const genreWeightProfile = isStructuredGenreDiscovery
    ? validateGenreWeights(rankingContext.genreWeights, structuredGenreDefaults)
    : null;
  const cachedRatingStats = rankingContext.ratingStats;
  let ratingVotes = cachedRatingStats?.ratingVotes ?? 0;
  let weightedRatingSum = 0;
  let maxRatingCount = cachedRatingStats?.maxRatingCount ?? 1;
  if (isStructuredGenreDiscovery && !cachedRatingStats) {
    for (const record of records.values()) {
      const ratingCount = record.ratingCount ?? 0;
      maxRatingCount = Math.max(maxRatingCount, ratingCount);
      if (
        ratingCount >= MIN_RATING_COUNT_FOR_AVERAGE &&
        Number.isFinite(record.averageRating)
      ) {
        ratingVotes += ratingCount;
        weightedRatingSum += record.averageRating * ratingCount;
      }
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
  let candidates = candidateIds
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
      const cachedRating = cachedRatingStats?.ratingById.get(record.id);
      const averageRatingEligible =
        cachedRating?.averageRatingEligible ??
        (ratingCount >= MIN_RATING_COUNT_FOR_AVERAGE &&
          Number.isFinite(record.averageRating));
      const averageRating = record.averageRating ?? corpusRatingMean;
      const bayesianRating = !averageRatingEligible
        ? 0
        : cachedRating
          ? cachedRating.bayesianRating
          : ratingVotes > 0
            ? (ratingCount * averageRating +
                BAYESIAN_RATING_PRIOR * corpusRatingMean) /
              (ratingCount + BAYESIAN_RATING_PRIOR)
            : 0;
      const ratingEvidence = cachedRating
        ? cachedRating.ratingEvidence
        : Math.log1p(ratingCount) / Math.log1p(maxRatingCount);
      const structuredGenreSignals = {
        genreFocus,
        bayesianRating: bayesianRating / 5,
        ratingEvidence,
      };
      const structuredGenreContributions = Object.fromEntries(
        GENRE_WEIGHT_KEYS.map((key) => [
          key,
          isStructuredGenreDiscovery
            ? Number(
                (
                  structuredGenreSignals[key] *
                  genreWeightProfile.effectiveWeights[key]
                ).toFixed(6),
              )
            : 0,
        ]),
      );
      const structuredGenreScore = isStructuredGenreDiscovery
        ? Number(
            GENRE_WEIGHT_KEYS.reduce(
              (sum, key) => sum + structuredGenreContributions[key],
              0,
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
        averageRatingEligible,
        bayesianRating: Number(bayesianRating.toFixed(3)),
        ratingEvidence: Number(ratingEvidence.toFixed(6)),
        structuredGenreSignals,
        structuredGenreContributions,
        structuredGenreScore,
        isExactTitleMatch,
        titlePhrasePriority: titlePhrasePriority(record.title, normalizedQuery),
      };
    })
    .sort((left, right) => {
      const exactTitlePriority =
        Number(right.isExactTitleMatch) - Number(left.isExactTitleMatch);
      if (exactTitlePriority) return exactTitlePriority;
      const titlePhrasePriorityDifference =
        right.titlePhrasePriority - left.titlePhrasePriority;
      if (titlePhrasePriorityDifference) return titlePhrasePriorityDifference;
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
      const leftRankingAverage = left.averageRatingEligible
        ? (left.averageRating ?? 0)
        : 0;
      const rightRankingAverage = right.averageRatingEligible
        ? (right.averageRating ?? 0)
        : 0;
      return (
        right.combinedScore - left.combinedScore ||
        right.signals.orderedCoverage - left.signals.orderedCoverage ||
        right.signals.tokenCoverage - left.signals.tokenCoverage ||
        right.signals.dice - left.signals.dice ||
        rightRankingAverage - leftRankingAverage ||
        (right.ratingCount ?? 0) - (left.ratingCount ?? 0) ||
        left.title.localeCompare(right.title)
      );
    });
  const normalizedPersonName = (name) =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const popularityMetric = (person) =>
    rankingContext.personRole ? person.roleMovieCount : person.movieCount;
  const maximumPersonMovieCount = Math.max(
    0,
    ...personCandidates.map(popularityMetric),
  );
  const occurrencesByPerson = new Map();
  const baseRankById = new Map(candidates.map(({ id }, rank) => [id, rank]));
  if (maximumPersonMovieCount > 0) {
    candidates = candidates
      .map((candidate) => {
        const personCandidateIndex = personCandidates.findIndex(
          (personCandidate) => {
            const personName = normalizedPersonName(personCandidate.name);
            return candidate.fieldMatch?.matches.some((match) => {
              const matchedRole =
                rankingContext.personRole ?? personCandidate.role;
              const roleMatches =
                match.field ===
                (matchedRole === "director" ? "directors" : "cast");
              return (
                roleMatches && normalizedPersonName(match.value) === personName
              );
            });
          },
        );
        const person =
          personCandidateIndex >= 0
            ? personCandidates[personCandidateIndex]
            : null;
        if (!person) return candidate;
        const occurrence = (occurrencesByPerson.get(person.id) ?? 0) + 1;
        occurrencesByPerson.set(person.id, occurrence);
        const signal = popularityMetric(person) / maximumPersonMovieCount;
        const decay = 1 / Math.sqrt(occurrence);
        const contribution = Number(
          (PERSON_POPULARITY_WEIGHT * signal * decay).toFixed(6),
        );
        const ratingEvidenceContribution = Number(
          (PERSON_RATING_EVIDENCE_WEIGHT * candidate.ratingEvidence).toFixed(6),
        );
        const totalContribution = Number(
          (contribution + ratingEvidenceContribution).toFixed(6),
        );
        return {
          ...candidate,
          baseCombinedScore: candidate.combinedScore,
          combinedScore: Number(
            Math.min(1, candidate.combinedScore + totalContribution).toFixed(6),
          ),
          personPopularityBoost: {
            entityId: person.id,
            name: person.name,
            role: person.role,
            movieCount: person.movieCount,
            roleMovieCount: person.roleMovieCount,
            occurrence,
            signal: Number(signal.toFixed(6)),
            decay: Number(decay.toFixed(6)),
            contribution,
            ratingEvidence: candidate.ratingEvidence,
            ratingEvidenceContribution,
            totalContribution,
            personIntentRank: personCandidateIndex,
          },
        };
      })
      .sort((left, right) => {
        if (personIntentRanking) {
          const leftPersonRank =
            left.personPopularityBoost?.personIntentRank ?? Infinity;
          const rightPersonRank =
            right.personPopularityBoost?.personIntentRank ?? Infinity;
          if (leftPersonRank !== rightPersonRank)
            return leftPersonRank - rightPersonRank;
        }
        return (
          right.combinedScore - left.combinedScore ||
          baseRankById.get(left.id) - baseRankById.get(right.id)
        );
      });
  }
  return {
    method: isStructuredGenreDiscovery
      ? "weighted_structured_genre_ranker"
      : blendFieldEvidence
        ? "weighted_explainable_multifield_ranker"
        : "weighted_explainable_title_ranker",
    rankingContext: {
      requestedGenres,
      genreOverlapPrecedesTitleScore: requestedGenres.length > 1,
      titleWeight: isStructuredGenreDiscovery
        ? 0
        : blendFieldEvidence
          ? 0.35
          : 1,
      fieldWeight: isStructuredGenreDiscovery
        ? 0
        : blendFieldEvidence
          ? 0.65
          : 0,
      structuredGenreDiscovery: isStructuredGenreDiscovery,
      structuredGenreProfile: isStructuredGenreDiscovery
        ? structuredGenreProfile
        : null,
      structuredGenreInputWeights: isStructuredGenreDiscovery
        ? genreWeightProfile.weights
        : null,
      structuredGenreWeights: isStructuredGenreDiscovery
        ? genreWeightProfile.effectiveWeights
        : null,
      structuredGenreWeightTotal: isStructuredGenreDiscovery
        ? genreWeightProfile.totalWeight
        : null,
      bayesianPrior: BAYESIAN_RATING_PRIOR,
      minimumAverageRatingCount: MIN_RATING_COUNT_FOR_AVERAGE,
      personPopularityWeight: PERSON_POPULARITY_WEIGHT,
      personRatingEvidenceWeight: PERSON_RATING_EVIDENCE_WEIGHT,
      personIntentRanking,
      personPopularityApplied: maximumPersonMovieCount > 0,
    },
    weights,
    effectiveWeights,
    totalWeight,
    candidateCount: candidates.length,
    candidatesPreview: candidates.slice(0, previewLimit),
    truncated: candidates.length > previewLimit,
  };
}
