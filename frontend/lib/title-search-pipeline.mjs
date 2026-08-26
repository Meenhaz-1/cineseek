import { readFile } from "node:fs/promises";
import {
  buildExactTitleIndex,
  lookupExactTitle,
} from "./exact-title-index.mjs";
import {
  buildTitleTokenIndex,
  lookupTitleTokens,
} from "./title-token-index.mjs";
import {
  buildFieldAwareIndex,
  lookupFieldAware,
} from "./field-aware-index.mjs";
import {
  buildCharacterTrigramIndex,
  lookupCharacterTrigrams,
  scoreCharacterTrigramCandidates,
} from "./character-trigram-index.mjs";
import { scoreEditDistanceCandidates } from "./edit-distance.mjs";
import { scoreTokenCoverageCandidates } from "./token-coverage.mjs";
import { scoreOrderedTokenProximityCandidates } from "./ordered-token-proximity.mjs";
import {
  BAYESIAN_RATING_PRIOR,
  MIN_RATING_COUNT_FOR_AVERAGE,
  scoreCombinedTitleCandidates,
} from "./combined-title-ranker.mjs";

const roundedMs = (startedAt) =>
  Number((performance.now() - startedAt).toFixed(3));

export function buildTitleSearchPipeline(documents) {
  const startedAt = performance.now();
  const exact = buildExactTitleIndex(documents);
  const tokens = buildTitleTokenIndex(documents);
  const fields = buildFieldAwareIndex(tokens.records);
  const trigrams = buildCharacterTrigramIndex(documents);
  let ratingVotes = 0;
  let weightedRatingSum = 0;
  let maxRatingCount = 1;
  for (const record of tokens.records.values()) {
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
  const corpusRatingMean =
    ratingVotes > 0 ? weightedRatingSum / ratingVotes : 0;
  const ratingById = new Map();
  for (const record of tokens.records.values()) {
    const ratingCount = record.ratingCount ?? 0;
    const averageRating = record.averageRating ?? corpusRatingMean;
    const averageRatingEligible =
      ratingCount >= MIN_RATING_COUNT_FOR_AVERAGE &&
      Number.isFinite(record.averageRating);
    ratingById.set(record.id, {
      averageRatingEligible,
      bayesianRating:
        averageRatingEligible && ratingVotes > 0
          ? (ratingCount * averageRating +
              BAYESIAN_RATING_PRIOR * corpusRatingMean) /
            (ratingCount + BAYESIAN_RATING_PRIOR)
          : 0,
      ratingEvidence: Math.log1p(ratingCount) / Math.log1p(maxRatingCount),
    });
  }
  const ratingStats = {
    ratingVotes,
    corpusRatingMean,
    maxRatingCount,
    ratingById,
  };
  return {
    exact,
    tokens,
    fields,
    trigrams,
    ratingStats,
    buildMs: roundedMs(startedAt),
  };
}

export async function loadTitleSearchPipeline(corpusPath) {
  const contents = await readFile(corpusPath, "utf8");
  const documents = contents
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return buildTitleSearchPipeline(documents);
}

function compactDiagnosticCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") return candidate;
  const {
    cast: _cast,
    directors: _directors,
    overview: _overview,
    tags: _tags,
    posterPath: _posterPath,
    imdbId: _imdbId,
    tmdbId: _tmdbId,
    ...diagnosticCandidate
  } = candidate;
  void _cast;
  void _directors;
  void _overview;
  void _tags;
  void _posterPath;
  void _imdbId;
  void _tmdbId;
  return diagnosticCandidate;
}

function compactDiagnosticStage(stage) {
  if (!stage || !Array.isArray(stage.candidatesPreview)) return stage;
  return {
    ...stage,
    candidatesPreview: stage.candidatesPreview.map(compactDiagnosticCandidate),
  };
}

export function publicTitleSearchResult(result) {
  const { evaluation: _evaluation, ...publicResult } = result;
  void _evaluation;
  return {
    ...publicResult,
    metadataFilter: compactDiagnosticStage(publicResult.metadataFilter),
    tokenLookup: compactDiagnosticStage(publicResult.tokenLookup),
    fieldLookup: compactDiagnosticStage(publicResult.fieldLookup),
    trigramLookup: compactDiagnosticStage(publicResult.trigramLookup),
    combinedCandidates: compactDiagnosticStage(publicResult.combinedCandidates),
    fuzzyScoring: compactDiagnosticStage(publicResult.fuzzyScoring),
    editScoring: compactDiagnosticStage(publicResult.editScoring),
    tokenCoverageScoring: compactDiagnosticStage(
      publicResult.tokenCoverageScoring,
    ),
    orderedTokenProximityScoring: compactDiagnosticStage(
      publicResult.orderedTokenProximityScoring,
    ),
    combinedScoring: compactDiagnosticStage(publicResult.combinedScoring),
  };
}

function normalizeFilters(input = {}) {
  return {
    genres: Array.isArray(input.genres)
      ? [
          ...new Set(
            input.genres.filter((value) => typeof value === "string" && value),
          ),
        ]
      : [],
    genreMode: input.genreMode === "all" ? "all" : "any",
    yearMin: Number.isFinite(input.yearMin) ? input.yearMin : undefined,
    yearMax: Number.isFinite(input.yearMax) ? input.yearMax : undefined,
    ratingMin: Number.isFinite(input.ratingMin) ? input.ratingMin : undefined,
    ratingCountMin: Number.isFinite(input.ratingCountMin)
      ? input.ratingCountMin
      : undefined,
  };
}

function recordMatchesFilters(record, filters, options = {}) {
  const genreMatches = filters.genres.map((genre) =>
    record.genres.includes(genre),
  );
  return (
    (options.ignoreGenres ||
      !filters.genres.length ||
      (filters.genreMode === "all"
        ? genreMatches.every(Boolean)
        : genreMatches.some(Boolean))) &&
    (filters.yearMin === undefined ||
      (record.year !== null && record.year >= filters.yearMin)) &&
    (filters.yearMax === undefined ||
      (record.year !== null && record.year <= filters.yearMax)) &&
    (filters.ratingMin === undefined ||
      (record.averageRating !== null &&
        record.averageRating >= filters.ratingMin)) &&
    (filters.ratingCountMin === undefined ||
      record.ratingCount >= filters.ratingCountMin)
  );
}

export function runTitleSearch(pipeline, input, options = {}) {
  const queryPlan = input?.routes && input?.filters ? input : null;
  const resolvedInput = queryPlan
    ? {
        normalizedQuery: queryPlan.effectiveQuery,
        retrievalQuery: queryPlan.routes.titleQuery,
        fieldQuery: queryPlan.routes.fieldQuery,
        fieldRole: queryPlan.routes.fieldRole,
        genreTitleFallbackQuery: queryPlan.routes.genreTitleFallbackQuery,
        filters: queryPlan.filters,
        sort: queryPlan.sort,
        weights: options.weights,
      }
    : input;
  const { normalizedQuery, retrievalQuery, weights } = resolvedInput;
  const genreTitleFallbackQuery = (
    resolvedInput.genreTitleFallbackQuery ?? ""
  ).trim();
  const filters = normalizeFilters(resolvedInput.filters);
  const previewLimit = options.previewLimit ?? 12;
  const rankLimit = options.rankLimit ?? previewLimit;
  const cacheStatus = options.cacheStatus ?? "warm";
  const totalStartedAt = performance.now();
  const exactStartedAt = performance.now();
  const { lookupKey, matches } = lookupExactTitle(
    pipeline.exact,
    normalizedQuery,
  );
  const exactLookupMs = roundedMs(exactStartedAt);
  const hasMetadataFilters =
    filters.genres.length > 0 ||
    filters.yearMin !== undefined ||
    filters.yearMax !== undefined ||
    filters.ratingMin !== undefined ||
    filters.ratingCountMin !== undefined;
  const exactHit = matches.length > 0 && !hasMetadataFilters;
  const hasResidualQuery = retrievalQuery.trim().length > 0;
  // An explicit empty field query is meaningful: the planner has consumed the
  // entire query as structured metadata, so retrieval must not reinterpret it.
  const fieldQuery = (
    Object.hasOwn(resolvedInput, "fieldQuery")
      ? (resolvedInput.fieldQuery ?? "")
      : retrievalQuery || normalizedQuery
  ).trim();
  const hasFieldQuery = fieldQuery.length > 0;
  const isStructuredGenreDiscovery =
    queryPlan?.routes.structuredGenreRanking === true;
  const hasGenreTitleFallback =
    !isStructuredGenreDiscovery &&
    filters.genres.length > 0 &&
    genreTitleFallbackQuery.length > 0;

  const metadataStartedAt = performance.now();
  const metadataCandidateIds = hasMetadataFilters
    ? [...pipeline.tokens.records.values()]
        .filter((record) => recordMatchesFilters(record, filters))
        .map(({ id }) => id)
    : [];
  const metadataFilterMs = roundedMs(metadataStartedAt);

  let tokenLookup;
  let fieldLookup;
  let trigramLookup;
  let combinedCandidates;
  let fuzzyScoring;
  let editScoring;
  let tokenCoverageScoring;
  let orderedTokenProximityScoring;
  let combinedScoring;
  let candidateIds = [];
  let tokenLookupMs = 0;
  let fieldLookupMs = 0;
  let trigramLookupMs = 0;
  let candidateMergeMs = 0;
  let scoringMs = 0;

  if (!exactHit && (hasResidualQuery || hasFieldQuery || hasMetadataFilters)) {
    const tokenStartedAt = performance.now();
    const tokenResult = hasResidualQuery
      ? lookupTitleTokens(pipeline.tokens, retrievalQuery, previewLimit)
      : {
          tokens: [],
          ignoredTokens: [],
          postings: [],
          candidateIds: [],
          candidateCount: 0,
          candidateIdsPreview: [],
          intersectionCount: 0,
          intersectionIdsPreview: [],
          candidatesPreview: [],
          truncated: false,
        };
    tokenLookupMs = roundedMs(tokenStartedAt);
    const fieldStartedAt = performance.now();
    const fieldResult = hasFieldQuery
      ? lookupFieldAware(
          pipeline.fields,
          fieldQuery,
          previewLimit,
          resolvedInput.fieldRole === "director"
            ? { allowedFields: ["directors"] }
            : resolvedInput.fieldRole === "actor"
              ? { allowedFields: ["cast"] }
              : undefined,
        )
      : {
          tokens: [],
          ignoredTokens: [],
          postings: [],
          candidateIds: [],
          candidateCount: 0,
          matchesById: new Map(),
          candidatesPreview: [],
          truncated: false,
        };
    fieldLookupMs = roundedMs(fieldStartedAt);
    const trigramStartedAt = performance.now();
    const trigramResult = hasResidualQuery
      ? lookupCharacterTrigrams(pipeline.trigrams, retrievalQuery, previewLimit)
      : {
          trigrams: [],
          minimumMatches: 0,
          postings: [],
          candidateIds: [],
          candidateCount: 0,
          candidatesPreview: [],
          truncated: false,
        };
    trigramLookupMs = roundedMs(trigramStartedAt);

    const genreFallbackResult = hasGenreTitleFallback
      ? lookupTitleTokens(
          pipeline.tokens,
          genreTitleFallbackQuery,
          previewLimit,
        )
      : { candidateIds: [] };
    const exactTitleIds = new Set(
      matches
        .filter(({ id }) => {
          if (!isStructuredGenreDiscovery) return true;
          const record = pipeline.tokens.records.get(id);
          return record && recordMatchesFilters(record, filters);
        })
        .map(({ id }) => id),
    );
    const genreFallbackCandidateIds = new Set(
      [
        ...new Set([...genreFallbackResult.candidateIds, ...exactTitleIds]),
      ].filter((id) => {
        const record = pipeline.tokens.records.get(id);
        return (
          record &&
          recordMatchesFilters(record, filters, { ignoreGenres: true })
        );
      }),
    );

    const mergeStartedAt = performance.now();
    const tokenCandidateIds = new Set(tokenResult.candidateIds);
    const fieldCandidateIds = new Set(fieldResult.candidateIds);
    const trigramCandidateIds = new Set(trigramResult.candidateIds);
    const metadataCandidateSet = new Set(metadataCandidateIds);
    candidateIds = hasMetadataFilters
      ? [
          ...new Set([
            ...exactTitleIds,
            ...metadataCandidateIds,
            ...genreFallbackCandidateIds,
          ]),
        ]
      : [
          ...new Set([
            ...tokenResult.candidateIds,
            ...trigramResult.candidateIds,
            ...fieldResult.candidateIds,
          ]),
        ];
    combinedCandidates = {
      candidateCount: candidateIds.length,
      candidatesPreview: candidateIds.slice(0, previewLimit).map((id) => ({
        ...pipeline.tokens.records.get(id),
        sources: [
          metadataCandidateSet.has(id) ? "metadata" : undefined,
          tokenCandidateIds.has(id) || genreFallbackCandidateIds.has(id)
            ? "token"
            : undefined,
          trigramCandidateIds.has(id) ? "trigram" : undefined,
          fieldCandidateIds.has(id) ? "field" : undefined,
        ].filter(Boolean),
      })),
      truncated: candidateIds.length > previewLimit,
    };
    candidateMergeMs = roundedMs(mergeStartedAt);

    const scoringStartedAt = performance.now();
    if (hasResidualQuery) {
      fuzzyScoring = scoreCharacterTrigramCandidates(
        pipeline.trigrams,
        candidateIds,
        retrievalQuery,
        previewLimit,
      );
      editScoring = scoreEditDistanceCandidates(
        pipeline.tokens.records,
        candidateIds,
        retrievalQuery,
        previewLimit,
      );
      tokenCoverageScoring = scoreTokenCoverageCandidates(
        pipeline.tokens.records,
        candidateIds,
        retrievalQuery,
        previewLimit,
      );
      orderedTokenProximityScoring = scoreOrderedTokenProximityCandidates(
        pipeline.tokens.records,
        candidateIds,
        retrievalQuery,
        previewLimit,
      );
    }
    const scoringQuery = retrievalQuery;
    combinedScoring = scoreCombinedTitleCandidates(
      pipeline.tokens.records,
      candidateIds,
      scoringQuery,
      weights,
      rankLimit,
      {
        genres: filters.genres,
        fieldMatches: fieldResult.matchesById,
        exactTitleIds,
        genreFallbackCandidateIds,
        genreFallbackQuery: genreTitleFallbackQuery,
        structuredGenreRanking:
          queryPlan?.routes.structuredGenreRanking === true,
        genreWeights: options.genreWeights,
        ratingStats: pipeline.ratingStats,
        personCandidates: queryPlan?.entities?.personCandidates ?? [],
        personRole: queryPlan?.routes.fieldRole,
      },
    );
    scoringMs = roundedMs(scoringStartedAt);

    const { candidateIds: _tokenCandidateIds, ...tokenPublicResult } =
      tokenResult;
    const { candidateIds: _trigramCandidateIds, ...trigramPublicResult } =
      trigramResult;
    void _tokenCandidateIds;
    const {
      candidateIds: _fieldCandidateIds,
      matchesById: _fieldMatchesById,
      ...fieldPublicResult
    } = fieldResult;
    void _fieldCandidateIds;
    void _fieldMatchesById;
    void _trigramCandidateIds;
    tokenLookup = tokenPublicResult;
    fieldLookup = fieldPublicResult;
    trigramLookup = trigramPublicResult;
  } else if (exactHit) {
    candidateIds = matches.map(({ id }) => id);
  }

  const timings = {
    exactLookupMs,
    metadataFilterMs,
    tokenLookupMs,
    fieldLookupMs,
    trigramLookupMs,
    candidateMergeMs,
    scoringMs,
    totalMs: roundedMs(totalStartedAt),
  };
  let rankedResults = exactHit
    ? matches.slice(0, rankLimit).map(({ id, title, year }) => ({
        id,
        title,
        year,
        score: 1,
        matchReason: {
          field: "title",
          label: "Title",
          value: title,
          matchType: "exact_value",
        },
      }))
    : (combinedScoring?.candidatesPreview.map(
        ({
          id,
          title,
          year,
          combinedScore,
          titleScore,
          fieldScore,
          fieldMatch,
          personPopularityBoost,
        }) => ({
          id,
          title,
          year,
          score: combinedScore,
          titleScore,
          fieldScore,
          matchReason: fieldMatch?.bestMatch,
          personPopularityBoost,
        }),
      ) ?? []);
  if (resolvedInput.sort?.field === "year") {
    const direction = resolvedInput.sort.direction === "asc" ? 1 : -1;
    rankedResults = [...rankedResults].sort(
      (left, right) =>
        direction * ((left.year ?? -Infinity) - (right.year ?? -Infinity)) ||
        right.score - left.score,
    );
  }

  return {
    normalizedQuery,
    retrievalQuery,
    metadataFilter: {
      active: hasMetadataFilters,
      filters,
      corpusCount: pipeline.tokens.records.size,
      candidateCount: hasMetadataFilters
        ? metadataCandidateIds.length
        : pipeline.tokens.records.size,
      excludedCount: hasMetadataFilters
        ? pipeline.tokens.records.size - metadataCandidateIds.length
        : 0,
      candidatesPreview: (hasMetadataFilters ? metadataCandidateIds : [])
        .slice(0, previewLimit)
        .map((id) => pipeline.tokens.records.get(id)),
      filterMs: metadataFilterMs,
    },
    exact: { lookupKey, hit: exactHit, matches, lookupMs: exactLookupMs },
    tokenLookup: exactHit
      ? {
          skipped: true,
          reason: "An exact title matched, so candidate generation stopped.",
        }
      : !hasResidualQuery
        ? {
            skipped: true,
            reason:
              "Structured parsing consumed every meaningful term, so token title retrieval was skipped.",
          }
        : { skipped: false, ...tokenLookup, lookupMs: tokenLookupMs },
    fieldLookup: exactHit
      ? {
          skipped: true,
          reason:
            "An exact title matched, so field-aware retrieval was unnecessary.",
        }
      : !hasFieldQuery
        ? { skipped: true, reason: "There is no searchable field text." }
        : { skipped: false, ...fieldLookup, lookupMs: fieldLookupMs },
    trigramLookup: exactHit
      ? {
          skipped: true,
          reason:
            "An exact title matched, so fuzzy candidate generation was unnecessary.",
        }
      : !hasResidualQuery
        ? {
            skipped: true,
            reason:
              "There is no residual title text, so trigram candidate generation was skipped.",
          }
        : { skipped: false, ...trigramLookup, lookupMs: trigramLookupMs },
    combinedCandidates: exactHit
      ? { skipped: true, reason: "Exact title matched." }
      : !hasResidualQuery && !hasFieldQuery && !hasMetadataFilters
        ? {
            skipped: true,
            reason:
              "No candidates were generated for this structured-only query.",
          }
        : { skipped: false, ...combinedCandidates },
    fuzzyScoring: exactHit
      ? {
          skipped: true,
          reason: "An exact title matched, so fuzzy scoring was unnecessary.",
        }
      : !hasResidualQuery
        ? {
            skipped: true,
            reason: "There are no residual title candidates to score.",
          }
        : { skipped: false, ...fuzzyScoring },
    editScoring: exactHit
      ? {
          skipped: true,
          reason:
            "An exact title matched, so edit-distance scoring was unnecessary.",
        }
      : !hasResidualQuery
        ? {
            skipped: true,
            reason: "There are no residual title candidates to score.",
          }
        : { skipped: false, ...editScoring },
    tokenCoverageScoring: exactHit
      ? {
          skipped: true,
          reason:
            "An exact title matched, so token-coverage scoring was unnecessary.",
        }
      : !hasResidualQuery
        ? {
            skipped: true,
            reason: "There are no residual title candidates to score.",
          }
        : { skipped: false, ...tokenCoverageScoring },
    orderedTokenProximityScoring: exactHit
      ? {
          skipped: true,
          reason:
            "An exact title matched, so ordered-token scoring was unnecessary.",
        }
      : !hasResidualQuery
        ? {
            skipped: true,
            reason: "There are no residual title candidates to score.",
          }
        : { skipped: false, ...orderedTokenProximityScoring },
    combinedScoring: exactHit
      ? {
          skipped: true,
          reason:
            "An exact title matched, so combined scoring was unnecessary.",
        }
      : !hasResidualQuery && !hasFieldQuery && !hasMetadataFilters
        ? { skipped: true, reason: "There are no candidates to combine." }
        : { skipped: false, ...combinedScoring },
    indexes: {
      titleCount: pipeline.exact.titleCount,
      exactKeyCount: pipeline.exact.keyCount,
      collisionCount: pipeline.exact.collisionCount,
      tokenCount: pipeline.tokens.tokenCount,
      postingCount: pipeline.tokens.postingCount,
      fieldPostingCount: pipeline.fields.postingCount,
      trigramCount: pipeline.trigrams.trigramCount,
      trigramPostingCount: pipeline.trigrams.postingCount,
      buildMs: pipeline.buildMs,
      cache: cacheStatus,
    },
    timings,
    evaluation: { candidateIds, rankedResults },
  };
}
