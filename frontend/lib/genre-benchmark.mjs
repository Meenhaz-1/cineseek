import { createHash } from "node:crypto";
import { parseMetadataQuery } from "./metadata-query.mjs";
import { exactTitleKey } from "./exact-title-index.mjs";
import { queryTitleTokens } from "./title-token-index.mjs";

export const GENRE_QUERY_IDS = Array.from(
  { length: 10 },
  (_, index) => `q${String(index + 21).padStart(3, "0")}`,
);
export const GENRE_REVIEW_VERSION = 1;
export const POOL_LIMIT = 40;
export const STRATEGY_DEPTH = 10;

const REVIEW_STOP_WORDS = new Set([
  "movie",
  "movies",
  "film",
  "films",
  "classic",
  "indie",
  "quirky",
  "epic",
]);
const REVIEW_QUERY_GENRES = {
  q021: ["Animation", "Children", "Adventure"],
  q022: ["Sci-Fi", "Thriller"],
  q023: ["Film-Noir"],
  q024: ["Comedy", "Romance"],
  q025: ["Crime", "Drama"],
  q026: ["Fantasy", "Adventure"],
  q027: ["Thriller"],
  q028: ["War"],
  q029: ["Musical", "Romance"],
  q030: ["Comedy"],
};

function round(value) {
  return Number(value.toFixed(6));
}

export function reviewRevision(state) {
  return createHash("sha256")
    .update(JSON.stringify(state))
    .digest("hex")
    .slice(0, 16);
}

function movieMatchesGenres(record, genres, mode = "all") {
  if (!genres.length) return true;
  const matches = genres.map((genre) => record.genres.includes(genre));
  return mode === "all" ? matches.every(Boolean) : matches.some(Boolean);
}

function qualityContext(records) {
  const values = [...records.values()];
  const votes = values.reduce((sum, record) => sum + record.ratingCount, 0);
  const mean = votes
    ? values.reduce(
        (sum, record) => sum + (record.averageRating ?? 0) * record.ratingCount,
        0,
      ) / votes
    : 0;
  const maxCount = Math.max(1, ...values.map(({ ratingCount }) => ratingCount));
  return { mean, maxCount };
}

function qualityScore(record, requestedGenres, context) {
  const matched = requestedGenres.filter((genre) =>
    record.genres.includes(genre),
  ).length;
  const focus =
    matched / Math.max(requestedGenres.length, record.genres.length, 1);
  const bayesian =
    (record.ratingCount * (record.averageRating ?? context.mean) +
      20 * context.mean) /
    (record.ratingCount + 20);
  const evidence =
    Math.log1p(record.ratingCount) / Math.log1p(context.maxCount);
  return round(focus * 0.55 + (bayesian / 5) * 0.3 + evidence * 0.15);
}

function textEvidenceScore(record, queryText, requestedGenres) {
  const terms = queryTitleTokens(queryText).tokens.filter(
    (term) => !REVIEW_STOP_WORDS.has(term),
  );
  const text = exactTitleKey(`${record.tags.join(" ")} ${record.overview}`);
  const matchedTerms = terms.filter((term) => text.includes(term));
  const genreMatches = requestedGenres.filter((genre) =>
    record.genres.includes(genre),
  ).length;
  return round(
    (terms.length ? matchedTerms.length / terms.length : 0) * 0.6 +
      (requestedGenres.length ? genreMatches / requestedGenres.length : 0) *
        0.4,
  );
}

function nominate(nominations, source, ids) {
  ids.slice(0, STRATEGY_DEPTH).forEach((docId, index) => {
    const entries = nominations.get(docId) ?? [];
    entries.push({ source, rank: index + 1 });
    nominations.set(docId, entries);
  });
}

export function buildGenreReviewPool({
  queries,
  qrels,
  records,
  currentResultsByQuery,
  baselineResultsByQuery,
  corpusKey,
  createdAt = new Date().toISOString(),
}) {
  const quality = qualityContext(records);
  const pool = [];
  const selectedQueries = queries.filter(({ id }) =>
    GENRE_QUERY_IDS.includes(id),
  );
  if (selectedQueries.length !== GENRE_QUERY_IDS.length)
    throw new Error(
      "All genre queries q021-q030 are required to build the review pool.",
    );

  for (const query of selectedQueries) {
    const parsed = parseMetadataQuery(exactTitleKey(query.text));
    const requestedGenres = REVIEW_QUERY_GENRES[query.id] ?? parsed.genres;
    const nominations = new Map();
    const existingIds = qrels
      .filter(({ queryId }) => queryId === query.id)
      .map(({ corpusId }) => corpusId);
    nominate(nominations, "existing_qrel", existingIds);
    nominate(
      nominations,
      "production",
      currentResultsByQuery.get(query.id) ?? [],
    );
    nominate(
      nominations,
      "frozen_baseline",
      baselineResultsByQuery.get(query.id) ?? [],
    );

    const strict = [...records.values()]
      .filter((record) => movieMatchesGenres(record, requestedGenres, "all"))
      .map((record) => ({
        id: record.id,
        score: qualityScore(record, requestedGenres, quality),
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.id.localeCompare(right.id, undefined, { numeric: true }),
      );
    nominate(
      nominations,
      "genre_quality",
      strict.map(({ id }) => id),
    );

    const evidence = [...records.values()]
      .filter((record) => movieMatchesGenres(record, requestedGenres, "any"))
      .map((record) => ({
        id: record.id,
        score: textEvidenceScore(record, query.text, requestedGenres),
      }))
      .filter(({ score }) => score > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.id.localeCompare(right.id, undefined, { numeric: true }),
      );
    nominate(
      nominations,
      "text_evidence",
      evidence.map(({ id }) => id),
    );

    const selected = [];
    const add = (id) => {
      if (
        records.has(id) &&
        !selected.includes(id) &&
        selected.length < POOL_LIMIT
      )
        selected.push(id);
    };
    existingIds.forEach(add);
    for (
      let rank = 1;
      rank <= STRATEGY_DEPTH && selected.length < POOL_LIMIT;
      rank += 1
    ) {
      for (const source of [
        "production",
        "frozen_baseline",
        "genre_quality",
        "text_evidence",
      ]) {
        const id = [...nominations].find(([, entries]) =>
          entries.some(
            (entry) => entry.source === source && entry.rank === rank,
          ),
        )?.[0];
        if (id) add(id);
      }
    }
    pool.push({
      queryId: query.id,
      queryText: query.text,
      intendedGenres: requestedGenres,
      documents: selected.map((docId) => ({
        docId,
        nominations: nominations.get(docId) ?? [],
      })),
    });
  }

  return {
    version: GENRE_REVIEW_VERSION,
    status: "frozen",
    createdAt,
    corpusKey,
    queryIds: GENRE_QUERY_IDS,
    pool,
    reviews: [],
    adjudications: [],
  };
}

export function upsertReview(
  state,
  input,
  reviewedAt = new Date().toISOString(),
) {
  const query = state.pool.find(({ queryId }) => queryId === input.queryId);
  if (!query?.documents.some(({ docId }) => docId === input.docId))
    throw new Error("The movie is not in the frozen pool for this query.");
  const reviewerId = String(input.reviewerId ?? "").trim();
  if (!reviewerId || reviewerId.length > 80)
    throw new Error("reviewerId must contain 1-80 characters.");
  const grade = Number(input.grade);
  if (!Number.isInteger(grade) || grade < 0 || grade > 3)
    throw new Error("grade must be 0, 1, 2, or 3.");
  const notes = String(input.notes ?? "").trim();
  if (notes.length > 500)
    throw new Error("notes must contain at most 500 characters.");
  const reviews = state.reviews.filter(
    (review) =>
      !(
        review.queryId === input.queryId &&
        review.docId === input.docId &&
        review.reviewerId === reviewerId
      ),
  );
  reviews.push({
    queryId: input.queryId,
    docId: input.docId,
    reviewerId,
    grade,
    notes,
    reviewedAt,
  });
  return { ...state, reviews };
}

export function upsertAdjudication(
  state,
  input,
  adjudicatedAt = new Date().toISOString(),
) {
  const reviews = state.reviews.filter(
    (review) =>
      review.queryId === input.queryId && review.docId === input.docId,
  );
  if (new Set(reviews.map(({ reviewerId }) => reviewerId)).size < 2)
    throw new Error(
      "Two independent reviews are required before adjudication.",
    );
  const finalGrade = Number(input.finalGrade);
  if (!Number.isInteger(finalGrade) || finalGrade < 0 || finalGrade > 3)
    throw new Error("finalGrade must be 0, 1, 2, or 3.");
  const adjudicatorId = String(input.adjudicatorId ?? "").trim();
  if (!adjudicatorId || adjudicatorId.length > 80)
    throw new Error("adjudicatorId must contain 1-80 characters.");
  const notes = String(input.notes ?? "").trim();
  const adjudications = state.adjudications.filter(
    (item) => !(item.queryId === input.queryId && item.docId === input.docId),
  );
  adjudications.push({
    queryId: input.queryId,
    docId: input.docId,
    finalGrade,
    adjudicatorId,
    notes,
    adjudicatedAt,
  });
  return { ...state, adjudications };
}

export function judgmentStatus(state, queryId, docId) {
  const reviews = state.reviews.filter(
    (review) => review.queryId === queryId && review.docId === docId,
  );
  const distinct = [
    ...new Map(reviews.map((review) => [review.reviewerId, review])).values(),
  ];
  const grades = distinct.map(({ grade }) => grade);
  const conflict =
    grades.length >= 2 &&
    (Math.max(...grades) - Math.min(...grades) >= 2 ||
      (grades.includes(3) && grades.some((grade) => grade <= 1)));
  const adjudication = state.adjudications.find(
    (item) => item.queryId === queryId && item.docId === docId,
  );
  const finalGrade =
    adjudication?.finalGrade ??
    (distinct.length >= 2 && !conflict
      ? Math.round(
          grades.reduce((sum, grade) => sum + grade, 0) / grades.length,
        )
      : null);
  return { reviews: distinct, conflict, adjudication, finalGrade };
}

export function reviewProgress(state) {
  return state.pool.map((query) => {
    const statuses = query.documents.map(({ docId }) =>
      judgmentStatus(state, query.queryId, docId),
    );
    return {
      queryId: query.queryId,
      poolSize: query.documents.length,
      twiceReviewed: statuses.filter(({ reviews }) => reviews.length >= 2)
        .length,
      conflicts: statuses.filter(
        ({ conflict, adjudication }) => conflict && !adjudication,
      ).length,
      finalized: statuses.filter(({ finalGrade }) => finalGrade !== null)
        .length,
    };
  });
}

export function genrePublicationReadiness(
  state,
  currentResultsByQuery,
  records,
) {
  const progress = reviewProgress(state);
  const queries = [...currentResultsByQuery].map(([queryId, topIds]) => {
    const poolQuery = state.pool.find((query) => query.queryId === queryId);
    const pooledIds = new Set(
      poolQuery?.documents.map(({ docId }) => docId) ?? [],
    );
    const missingFromPool = topIds
      .filter((docId) => !pooledIds.has(docId))
      .map((docId) => ({
        docId,
        title: records.get(docId)?.title ?? `MovieLens ${docId}`,
      }));
    const awaitingReviews = topIds
      .filter((docId) => pooledIds.has(docId))
      .map((docId) => ({
        docId,
        title: records.get(docId)?.title ?? `MovieLens ${docId}`,
        ...judgmentStatus(state, queryId, docId),
      }))
      .filter(({ finalGrade }) => finalGrade === null)
      .map(({ docId, title, reviews, conflict }) => ({
        docId,
        title,
        reviewCount: reviews.length,
        conflict,
      }));
    return {
      queryId,
      top10Count: topIds.length,
      inPoolCount: topIds.length - missingFromPool.length,
      finalizedCount:
        topIds.length - missingFromPool.length - awaitingReviews.length,
      missingFromPool,
      awaitingReviews,
      actionRequired: missingFromPool.length
        ? "expand_pool"
        : awaitingReviews.length
          ? "complete_reviews"
          : "none",
      ready: missingFromPool.length === 0 && awaitingReviews.length === 0,
    };
  });
  const poolReviewComplete = progress.every(
    ({ poolSize, twiceReviewed, conflicts, finalized }) =>
      poolSize >= 20 &&
      twiceReviewed === poolSize &&
      conflicts === 0 &&
      finalized === poolSize,
  );
  return {
    publishable: poolReviewComplete && queries.every(({ ready }) => ready),
    poolReviewComplete,
    queries,
  };
}

export function serializeGenreReviewedV1(state, queries) {
  const progress = reviewProgress(state);
  if (
    progress.some(
      ({ poolSize, twiceReviewed, conflicts, finalized }) =>
        poolSize < 20 ||
        twiceReviewed !== poolSize ||
        conflicts > 0 ||
        finalized !== poolSize,
    )
  ) {
    throw new Error(
      "Every query needs at least 20 twice-reviewed, finalized judgments and no unresolved conflicts.",
    );
  }
  const selectedQueries = queries.filter(({ id }) =>
    state.queryIds.includes(id),
  );
  const queryText = `${selectedQueries.map((query) => JSON.stringify({ _id: query.id, text: query.text, metadata: { category: "genre", label_status: "human_reviewed_v1" } })).join("\n")}\n`;
  const judgmentRows = state.pool.flatMap((query) =>
    query.documents.map(({ docId }) => ({
      queryId: query.queryId,
      docId,
      grade: judgmentStatus(state, query.queryId, docId).finalGrade,
    })),
  );
  const qrels = `query-id\tcorpus-id\tscore\n${judgmentRows.map(({ queryId, docId, grade }) => `${queryId}\t${docId}\t${grade}`).join("\n")}\n`;
  const audit = `${state.reviews
    .map((review) => JSON.stringify({ type: "review", ...review }))
    .concat(
      state.adjudications.map((item) =>
        JSON.stringify({ type: "adjudication", ...item }),
      ),
    )
    .join("\n")}\n`;
  return {
    queries: queryText,
    qrels,
    audit,
    pool: `${JSON.stringify(state, null, 2)}\n`,
  };
}
