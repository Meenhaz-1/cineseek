import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTitleSearchPipeline,
  publicTitleSearchResult,
  runTitleSearch,
} from "./title-search-pipeline.mjs";

const documents = [
  {
    _id: "1",
    title: "Toy Story",
    overview: "A cowboy doll is threatened by a new spaceman figure.",
    metadata: {
      year: 1995,
      genres: ["Animation"],
      average_rating: 3.9,
      rating_count: 200,
      cast: ["Tom Hanks"],
      directors: ["John Lasseter"],
      tags: ["friendship"],
    },
  },
  {
    _id: "2",
    title: "Mad Max: Fury Road",
    metadata: {
      year: 2015,
      genres: ["Action"],
      average_rating: 4.1,
      rating_count: 80,
    },
  },
  {
    _id: "3",
    title: "Glory Road",
    metadata: {
      year: 2006,
      genres: ["Drama"],
      average_rating: 3.5,
      rating_count: 40,
    },
  },
  {
    _id: "4",
    title: "Goodfellas",
    metadata: {
      year: 1990,
      genres: ["Crime", "Drama"],
      average_rating: 4.25,
      rating_count: 126,
    },
  },
  {
    _id: "5",
    title: "Crime Busters",
    metadata: {
      year: 1977,
      genres: ["Crime"],
      average_rating: 2.8,
      rating_count: 9,
    },
  },
];

test("public diagnostics omit heavyweight enriched fields", () => {
  const pipeline = buildTitleSearchPipeline(documents);
  const result = runTitleSearch(pipeline, {
    effectiveQuery: "animation",
    filters: { genres: ["Animation"] },
    routes: {
      titleQuery: "",
      fieldQuery: "",
      genreTitleFallbackQuery: "animation",
      structuredGenreRanking: true,
    },
  });
  const publicResult = publicTitleSearchResult(result);
  const candidate = publicResult.metadataFilter.candidatesPreview[0];

  assert.equal(candidate.title, "Toy Story");
  assert.equal("overview" in candidate, false);
  assert.equal("cast" in candidate, false);
  assert.equal("directors" in candidate, false);
  assert.equal("tags" in candidate, false);
});

test("exact cast entities retrieve and outrank incidental title matches", () => {
  const pipeline = buildTitleSearchPipeline([
    ...documents,
    {
      _id: "6",
      title: "The Hanks",
      overview: "A family story.",
      metadata: { year: 2020, cast: [], directors: [], genres: ["Drama"] },
    },
  ]);
  const result = runTitleSearch(pipeline, {
    normalizedQuery: "tom hanks",
    retrievalQuery: "",
  });
  assert.equal(result.evaluation.rankedResults[0].id, "1");
  assert.equal(result.evaluation.rankedResults[0].matchReason.field, "cast");
  assert.equal(
    result.evaluation.rankedResults[0].matchReason.matchType,
    "exact_value",
  );
});

test("director and description fields generate candidates with explanations", () => {
  const pipeline = buildTitleSearchPipeline(documents);
  const director = runTitleSearch(pipeline, {
    normalizedQuery: "john lasseter",
    retrievalQuery: "",
  });
  assert.equal(
    director.evaluation.rankedResults[0].matchReason.field,
    "directors",
  );
  const description = runTitleSearch(pipeline, {
    normalizedQuery: "cowboy spaceman",
    retrievalQuery: "cowboy spaceman",
  });
  assert.equal(description.evaluation.rankedResults[0].id, "1");
  assert.equal(
    description.evaluation.rankedResults[0].matchReason.field,
    "overview",
  );
});

test("exact hits become benchmark candidates and ranked results", () => {
  const pipeline = buildTitleSearchPipeline(documents);
  const result = runTitleSearch(pipeline, {
    normalizedQuery: "toy story",
    retrievalQuery: "toy story",
  });
  assert.deepEqual(result.evaluation.candidateIds, ["1"]);
  assert.deepEqual(
    result.evaluation.rankedResults.map(({ id, score }) => ({ id, score })),
    [{ id: "1", score: 1 }],
  );
});

test("fuzzy searches expose full candidates while respecting the rank limit", () => {
  const pipeline = buildTitleSearchPipeline(documents);
  const result = runTitleSearch(
    pipeline,
    { normalizedQuery: "fury road", retrievalQuery: "fury road" },
    { rankLimit: 1 },
  );
  assert.ok(result.evaluation.candidateIds.includes("2"));
  assert.equal(result.evaluation.rankedResults.length, 1);
  assert.equal(result.evaluation.rankedResults[0].id, "2");
});

test("public API results do not expose evaluation-only candidate IDs", () => {
  const pipeline = buildTitleSearchPipeline(documents);
  const result = runTitleSearch(pipeline, {
    normalizedQuery: "fury road",
    retrievalQuery: "fury road",
  });
  assert.equal("evaluation" in publicTitleSearchResult(result), false);
});

test("metadata constraints retrieve from the full corpus and exclude title matches that violate filters", () => {
  const pipeline = buildTitleSearchPipeline(documents);
  const result = runTitleSearch(pipeline, {
    normalizedQuery: "1990s crime movies with at least 100 ratings",
    retrievalQuery: "",
    genreTitleFallbackQuery: "crime",
    filters: {
      genres: ["Crime"],
      yearMin: 1990,
      yearMax: 1999,
      ratingCountMin: 100,
    },
  });
  assert.deepEqual(result.evaluation.candidateIds, ["4"]);
  assert.equal(result.evaluation.rankedResults[0].id, "4");
  assert.equal(result.metadataFilter.excludedCount, 4);
  assert.ok(
    result.combinedCandidates.candidatesPreview[0].sources.includes("metadata"),
  );
});

test("multi-genre discovery supports ANY matching unless the query explicitly requires ALL", () => {
  const pipeline = buildTitleSearchPipeline(documents);
  const anyResult = runTitleSearch(pipeline, {
    normalizedQuery: "animation drama",
    retrievalQuery: "",
    genreTitleFallbackQuery: "animation drama",
    filters: { genres: ["Animation", "Drama"], genreMode: "any" },
  });
  assert.deepEqual(anyResult.evaluation.candidateIds, ["1", "3", "4"]);

  const allResult = runTitleSearch(pipeline, {
    normalizedQuery: "animation and drama",
    retrievalQuery: "",
    genreTitleFallbackQuery: "animation drama",
    filters: { genres: ["Animation", "Drama"], genreMode: "all" },
  });
  assert.deepEqual(allResult.evaluation.candidateIds, []);
});

test("ANY matching ranks candidates matching more requested genres first", () => {
  const pipeline = buildTitleSearchPipeline(documents);
  const result = runTitleSearch(pipeline, {
    normalizedQuery: "crime drama",
    retrievalQuery: "",
    genreTitleFallbackQuery: "crime drama",
    filters: { genres: ["Crime", "Drama"], genreMode: "any" },
  });
  assert.equal(result.evaluation.rankedResults[0].id, "4");
  assert.equal(
    result.combinedScoring.candidatesPreview[0].metadataGenreMatchCount,
    2,
  );
});

test("keeps genre-owned words out of title scoring while preserving exact and title-only recall", () => {
  const pipeline = buildTitleSearchPipeline([
    {
      _id: "10",
      title: "Comedy",
      metadata: {
        year: 2020,
        genres: ["Drama"],
        average_rating: 2,
        rating_count: 2,
      },
    },
    {
      _id: "11",
      title: "Popular Laughs",
      metadata: {
        year: 2019,
        genres: ["Comedy"],
        average_rating: 4.2,
        rating_count: 100,
      },
    },
    {
      _id: "12",
      title: "Comedy Night",
      metadata: {
        year: 2021,
        genres: ["Drama"],
        average_rating: 5,
        rating_count: 1,
      },
    },
  ]);
  const result = runTitleSearch(pipeline, {
    normalizedQuery: "comedy",
    retrievalQuery: "",
    genreTitleFallbackQuery: "comedy",
    filters: { genres: ["Comedy"] },
  });

  assert.deepEqual(
    result.evaluation.rankedResults.map(({ id }) => id),
    ["10", "11", "12"],
  );
  const genreCandidate = result.combinedScoring.candidatesPreview.find(
    ({ id }) => id === "11",
  );
  assert.equal(genreCandidate.titleScore, 0);
  assert.equal(genreCandidate.metadataGenreMatchCount, 1);
  assert.equal(
    result.combinedScoring.candidatesPreview[0].isExactTitleMatch,
    true,
  );
});

test("allows a genre word to participate in a longer title phrase without double-scoring a generic genre query", () => {
  const pipeline = buildTitleSearchPipeline([
    {
      _id: "20",
      title: "Horror Castle",
      metadata: {
        year: 2020,
        genres: ["Horror"],
        average_rating: 3,
        rating_count: 10,
      },
    },
    {
      _id: "21",
      title: "Castle Keep",
      metadata: {
        year: 2019,
        genres: ["Horror"],
        average_rating: 4.5,
        rating_count: 100,
      },
    },
  ]);
  const result = runTitleSearch(pipeline, {
    normalizedQuery: "horror castle",
    retrievalQuery: "castle",
    genreTitleFallbackQuery: "horror castle",
    filters: { genres: ["Horror"] },
  });

  assert.equal(result.evaluation.rankedResults[0].id, "20");
  assert.equal(
    result.combinedScoring.candidatesPreview[0].signals.phraseMatch,
    1,
  );
});
