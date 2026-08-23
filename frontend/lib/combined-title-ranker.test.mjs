import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_COMBINED_WEIGHTS,
  scoreCombinedTitleCandidates,
  validateCombinedWeights,
} from "./combined-title-ranker.mjs";

const records = new Map([
  ["1", { id: "1", title: "Mad Max: Fury Road", year: 2015 }],
  ["2", { id: "2", title: "Road to Fury", year: 2020 }],
  ["3", { id: "3", title: "Glory Road", year: 2006 }],
]);

test("normalizes relative weights into effective percentages", () => {
  const result = validateCombinedWeights({
    ...DEFAULT_COMBINED_WEIGHTS,
    phraseMatch: 100,
  });
  const effectiveTotal = Object.values(result.effectiveWeights).reduce(
    (sum, value) => sum + value,
    0,
  );
  assert.ok(Math.abs(effectiveTotal - 1) < 0.00001);
  assert.ok(
    result.effectiveWeights.phraseMatch > result.effectiveWeights.tokenCoverage,
  );
});

test("rejects invalid and all-zero weight sets", () => {
  assert.throws(
    () => validateCombinedWeights({ ...DEFAULT_COMBINED_WEIGHTS, dice: -1 }),
    /dice weight/,
  );
  assert.throws(
    () =>
      validateCombinedWeights(
        Object.fromEntries(
          Object.keys(DEFAULT_COMBINED_WEIGHTS).map((key) => [key, 0]),
        ),
      ),
    /greater than zero/,
  );
});

test("ranks the complete ordered phrase first with the default mix", () => {
  const result = scoreCombinedTitleCandidates(
    records,
    [...records.keys()],
    "fury road",
    DEFAULT_COMBINED_WEIGHTS,
  );
  assert.equal(result.candidatesPreview[0].id, "1");
  assert.equal(result.candidatesPreview[0].signals.phraseMatch, 1);
  const contributionTotal = Object.values(
    result.candidatesPreview[0].contributions,
  ).reduce((sum, value) => sum + value, 0);
  assert.ok(
    Math.abs(contributionTotal - result.candidatesPreview[0].combinedScore) <
      0.00001,
  );
});

test("supports a phrase-only experiment", () => {
  const phraseOnly = {
    tokenCoverage: 0,
    orderedCoverage: 0,
    phraseMatch: 100,
    proximity: 0,
    dice: 0,
    editSimilarity: 0,
  };
  const result = scoreCombinedTitleCandidates(
    records,
    [...records.keys()],
    "fury road",
    phraseOnly,
  );
  assert.equal(result.candidatesPreview[0].id, "1");
  assert.equal(result.candidatesPreview.at(-1).combinedScore, 0);
});

test("structured genre discovery balances genre focus, quality, and rating evidence", () => {
  const genreRecords = new Map([
    [
      "focused",
      {
        id: "focused",
        title: "Focused",
        genres: ["Comedy", "Romance"],
        averageRating: 4.1,
        ratingCount: 100,
      },
    ],
    [
      "broad",
      {
        id: "broad",
        title: "Broad",
        genres: ["Adventure", "Comedy", "Drama", "Romance"],
        averageRating: 4.3,
        ratingCount: 150,
      },
    ],
    [
      "tiny",
      {
        id: "tiny",
        title: "Tiny",
        genres: ["Comedy", "Romance"],
        averageRating: 5,
        ratingCount: 1,
      },
    ],
  ]);
  const result = scoreCombinedTitleCandidates(
    genreRecords,
    [...genreRecords.keys()],
    "",
    DEFAULT_COMBINED_WEIGHTS,
    10,
    { genres: ["Comedy", "Romance"], structuredGenreRanking: true },
  );
  assert.equal(result.rankingContext.structuredGenreDiscovery, true);
  assert.equal(result.candidatesPreview[0].id, "focused");
  assert.equal(
    result.candidatesPreview[0].combinedScore,
    result.candidatesPreview[0].structuredGenreScore,
  );
  assert.ok(
    result.candidatesPreview[0].structuredGenreScore >
      result.candidatesPreview[1].structuredGenreScore,
  );
  assert.ok(
    result.candidatesPreview[0].genreFocus >
      result.candidatesPreview.find(({ id }) => id === "broad").genreFocus,
  );
});
