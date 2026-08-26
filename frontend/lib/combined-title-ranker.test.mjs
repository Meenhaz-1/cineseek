import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_COMBINED_WEIGHTS,
  SINGLE_GENRE_DISCOVERY_WEIGHTS,
  scoreCombinedTitleCandidates,
  validateCombinedWeights,
  validateGenreWeights,
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

test("normalizes genre weights and rejects invalid values", () => {
  const result = validateGenreWeights({
    genreFocus: 15,
    bayesianRating: 55,
    ratingEvidence: 30,
  });
  assert.deepEqual(result.weights, SINGLE_GENRE_DISCOVERY_WEIGHTS);
  assert.equal(result.effectiveWeights.bayesianRating, 0.55);
  assert.throws(
    () => validateGenreWeights({ ratingEvidence: Number.NaN }),
    /ratingEvidence weight/,
  );
  assert.throws(
    () =>
      validateGenreWeights({
        genreFocus: 0,
        bayesianRating: 0,
        ratingEvidence: 0,
      }),
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

test("single-genre discovery keeps low-evidence titles but ranks supported quality first", () => {
  const genreRecords = new Map([
    [
      "supported",
      {
        id: "supported",
        title: "Supported Comedy",
        genres: ["Comedy"],
        averageRating: 4.2,
        ratingCount: 500,
      },
    ],
    [
      "tiny",
      {
        id: "tiny",
        title: "One Vote Wonder",
        genres: ["Comedy"],
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
    { genres: ["Comedy"], structuredGenreRanking: true },
  );
  assert.equal(
    result.rankingContext.structuredGenreProfile,
    "single_genre_balanced",
  );
  assert.deepEqual(
    result.rankingContext.structuredGenreInputWeights,
    SINGLE_GENRE_DISCOVERY_WEIGHTS,
  );
  assert.deepEqual(
    result.candidatesPreview.map(({ id }) => id),
    ["supported", "tiny"],
  );
  assert.ok(
    result.candidatesPreview[0].structuredGenreContributions.ratingEvidence >
      result.candidatesPreview[1].structuredGenreContributions.ratingEvidence,
  );
});

test("custom single-genre weights alter the active profile deterministically", () => {
  const genreRecords = new Map([
    [
      "quality",
      {
        id: "quality",
        title: "Quality",
        genres: ["Comedy"],
        averageRating: 4.5,
        ratingCount: 50,
      },
    ],
    [
      "popular",
      {
        id: "popular",
        title: "Popular",
        genres: ["Comedy"],
        averageRating: 3.7,
        ratingCount: 1000,
      },
    ],
  ]);
  const result = scoreCombinedTitleCandidates(
    genreRecords,
    [...genreRecords.keys()],
    "",
    DEFAULT_COMBINED_WEIGHTS,
    10,
    {
      genres: ["Comedy"],
      structuredGenreRanking: true,
      genreWeights: {
        genreFocus: 0,
        bayesianRating: 0,
        ratingEvidence: 100,
      },
    },
  );
  assert.equal(result.candidatesPreview[0].id, "popular");
  assert.equal(result.rankingContext.structuredGenreWeights.ratingEvidence, 1);
});

test("adds a decaying catalog-size contribution to multiple person-linked movies", () => {
  const personRecords = new Map([
    [
      "other",
      {
        id: "other",
        title: "Steven's Story",
        averageRating: 4.5,
        ratingCount: 50,
        genres: [],
      },
    ],
    [
      "spielberg-low",
      {
        id: "spielberg-low",
        title: "Early Work",
        averageRating: 4.8,
        ratingCount: 5,
        genres: [],
      },
    ],
    [
      "spielberg-popular",
      {
        id: "spielberg-popular",
        title: "Popular Work",
        averageRating: 4.2,
        ratingCount: 200,
        genres: [],
      },
    ],
    [
      "spielberg-cast",
      {
        id: "spielberg-cast",
        title: "Documentary",
        averageRating: 5,
        ratingCount: 500,
        genres: [],
      },
    ],
  ]);
  const match = (field, value, score) => ({
    score,
    exactEntityMatch: false,
    bestMatch: { field, value, score },
    matches: [{ field, value, score }],
  });
  const fieldMatches = new Map([
    ["other", match("cast", "Steven Other", 0.9)],
    ["spielberg-low", match("directors", "Steven Spielberg", 0.855)],
    ["spielberg-popular", match("directors", "Steven Spielberg", 0.855)],
    ["spielberg-cast", match("cast", "Steven Spielberg", 0.9)],
  ]);
  const baseline = scoreCombinedTitleCandidates(
    personRecords,
    [...personRecords.keys()],
    "steven",
    DEFAULT_COMBINED_WEIGHTS,
    10,
    { fieldMatches },
  );
  const result = scoreCombinedTitleCandidates(
    personRecords,
    [...personRecords.keys()],
    "steven",
    DEFAULT_COMBINED_WEIGHTS,
    10,
    {
      fieldMatches,
      personCandidates: [
        {
          id: "person:spielberg",
          name: "Steven Spielberg",
          roles: ["actor", "director"],
          role: "director",
          movieCount: 35,
          roleMovieCount: 33,
        },
      ],
    },
  );
  const boosted = result.candidatesPreview.filter(
    ({ personPopularityBoost }) => personPopularityBoost,
  );
  assert.equal(boosted.length, 2);
  assert.equal(boosted[0].personPopularityBoost.name, "Steven Spielberg");
  assert.ok(
    boosted[0].personPopularityBoost.contribution >
      boosted[1].personPopularityBoost.contribution,
  );
  for (const candidate of boosted)
    assert.ok(
      candidate.combinedScore >
        baseline.candidatesPreview.find(({ id }) => id === candidate.id)
          .combinedScore,
    );
  assert.equal(
    result.candidatesPreview.find(({ id }) => id === "other")
      .personPopularityBoost,
    undefined,
  );
});

test("uses base rank to apply popularity decay deterministically", () => {
  const noRatingRecords = new Map([
    ["b", { id: "b", title: "Beta", genres: [] }],
    ["a", { id: "a", title: "Alpha", genres: [] }],
  ]);
  const directorMatch = {
    score: 0.855,
    exactEntityMatch: false,
    bestMatch: {
      field: "directors",
      value: "Steven Spielberg",
      score: 0.855,
    },
    matches: [
      {
        field: "directors",
        value: "Steven Spielberg",
        score: 0.855,
      },
    ],
  };
  const result = scoreCombinedTitleCandidates(
    noRatingRecords,
    [...noRatingRecords.keys()],
    "steven",
    DEFAULT_COMBINED_WEIGHTS,
    10,
    {
      fieldMatches: new Map([
        ["b", directorMatch],
        ["a", directorMatch],
      ]),
      personCandidates: [
        {
          id: "person:spielberg",
          name: "Steven Spielberg",
          roles: ["director"],
          role: "director",
          movieCount: 35,
          roleMovieCount: 33,
        },
      ],
    },
  );
  assert.equal(result.candidatesPreview[0].id, "b");
  assert.equal(result.candidatesPreview[0].personPopularityBoost.occurrence, 1);
  assert.equal(result.candidatesPreview[1].personPopularityBoost.occurrence, 2);
});
