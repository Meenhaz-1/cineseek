import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGenreReviewPool,
  GENRE_QUERY_IDS,
  genrePublicationReadiness,
  judgmentStatus,
  serializeGenreReviewedV1,
  upsertAdjudication,
  upsertReview,
} from "./genre-benchmark.mjs";

function fixtures() {
  const records = new Map(
    Array.from({ length: 50 }, (_, index) => {
      const id = String(index + 1);
      return [
        id,
        {
          id,
          title: `Movie ${id}`,
          year: 2000 + index,
          genres: ["Comedy", "Romance"],
          tags: index % 2 ? ["romantic comedy"] : [],
          overview: "A romantic comedy story",
          averageRating: 3 + index / 50,
          ratingCount: index + 1,
        },
      ];
    }),
  );
  const queries = GENRE_QUERY_IDS.map((id) => ({
    id,
    text: "romantic comedy",
    category: "genre",
  }));
  const currentResultsByQuery = new Map(
    GENRE_QUERY_IDS.map((id) => [
      id,
      Array.from({ length: 10 }, (_, index) => String(index + 1)),
    ]),
  );
  const baselineResultsByQuery = new Map(
    GENRE_QUERY_IDS.map((id) => [
      id,
      Array.from({ length: 10 }, (_, index) => String(index + 11)),
    ]),
  );
  return {
    queries,
    qrels: [{ queryId: "q024", corpusId: "50", score: 2 }],
    records,
    currentResultsByQuery,
    baselineResultsByQuery,
    corpusKey: "fixture",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

test("builds a deterministic, deduplicated, capped pool and preserves qrels", () => {
  const input = fixtures();
  const first = buildGenreReviewPool(input);
  const second = buildGenreReviewPool(input);
  assert.deepEqual(first, second);
  assert.equal(first.pool.length, 10);
  assert.ok(
    first.pool.every(
      ({ documents }) =>
        documents.length <= 40 &&
        new Set(documents.map(({ docId }) => docId)).size === documents.length,
    ),
  );
  assert.ok(
    first.pool
      .find(({ queryId }) => queryId === "q024")
      .documents.some(({ docId }) => docId === "50"),
  );
});

test("keeps unjudged distinct and requires adjudication for large disagreement", () => {
  let state = buildGenreReviewPool(fixtures());
  assert.equal(judgmentStatus(state, "q021", "1").finalGrade, null);
  state = upsertReview(
    state,
    { queryId: "q021", docId: "1", reviewerId: "a", grade: 3, notes: "Ideal" },
    "2026-01-01T01:00:00.000Z",
  );
  state = upsertReview(
    state,
    {
      queryId: "q021",
      docId: "1",
      reviewerId: "b",
      grade: 1,
      notes: "Peripheral",
    },
    "2026-01-01T02:00:00.000Z",
  );
  assert.equal(judgmentStatus(state, "q021", "1").conflict, true);
  assert.equal(judgmentStatus(state, "q021", "1").finalGrade, null);
  state = upsertAdjudication(state, {
    queryId: "q021",
    docId: "1",
    adjudicatorId: "lead",
    finalGrade: 2,
    notes: "Resolved",
  });
  assert.equal(judgmentStatus(state, "q021", "1").finalGrade, 2);
});

test("distinguishes unfinished reviews from movies missing from the frozen pool", () => {
  const input = fixtures();
  const state = buildGenreReviewPool(input);
  const unfinished = genrePublicationReadiness(
    state,
    input.currentResultsByQuery,
    input.records,
  ).queries.find(({ queryId }) => queryId === "q021");
  assert.equal(unfinished.actionRequired, "complete_reviews");
  assert.equal(unfinished.inPoolCount, 10);
  assert.equal(unfinished.awaitingReviews.length, 10);

  const changedResults = new Map(input.currentResultsByQuery);
  changedResults.set("q021", [
    ...changedResults.get("q021").slice(0, 9),
    "not-pooled",
  ]);
  const missing = genrePublicationReadiness(
    state,
    changedResults,
    input.records,
  ).queries.find(({ queryId }) => queryId === "q021");
  assert.equal(missing.actionRequired, "expand_pool");
  assert.deepEqual(missing.missingFromPool, [
    { docId: "not-pooled", title: "MovieLens not-pooled" },
  ]);
});

test("publishes only a complete twice-reviewed pool", () => {
  let state = buildGenreReviewPool(fixtures());
  assert.throws(
    () => serializeGenreReviewedV1(state, fixtures().queries),
    /twice-reviewed/,
  );
  for (const query of state.pool) {
    for (const { docId } of query.documents) {
      state = upsertReview(state, {
        queryId: query.queryId,
        docId,
        reviewerId: "a",
        grade: 2,
      });
      state = upsertReview(state, {
        queryId: query.queryId,
        docId,
        reviewerId: "b",
        grade: 2,
      });
    }
  }
  const output = serializeGenreReviewedV1(state, fixtures().queries);
  assert.match(output.queries, /human_reviewed_v1/);
  assert.match(output.qrels, /^query-id\tcorpus-id\tscore/m);
  assert.equal(
    output.qrels.trim().split("\n").length - 1,
    state.pool.reduce((sum, query) => sum + query.documents.length, 0),
  );
});
