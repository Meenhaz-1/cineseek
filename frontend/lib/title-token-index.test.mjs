import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTitleTokenIndex,
  lookupTitleTokens,
  queryTitleTokens,
  titleTokens,
} from "./title-token-index.mjs";

const documents = [
  { _id: "1", title: "Toy Story", metadata: { year: 1995 } },
  { _id: "2", title: "NeverEnding Story, The", metadata: { year: 1984 } },
  { _id: "2571", title: "Matrix, The", metadata: { year: 1999 } },
  { _id: "122882", title: "Mad Max: Fury Road", metadata: { year: 2015 } },
];

test("tokenizes titles deterministically and removes duplicate tokens", () => {
  assert.deepEqual(titleTokens("Mad Max: Mad Road"), ["mad", "max", "road"]);
});

test("separates query stop words from searchable title tokens", () => {
  assert.deepEqual(queryTitleTokens("the movie with mad max"), {
    tokens: ["mad", "max"],
    ignoredTokens: ["the", "movie", "with"],
  });
});

test("retrieves postings and unions candidate movie IDs without fuzzy scoring", () => {
  const index = buildTitleTokenIndex(documents);
  const result = lookupTitleTokens(index, "mad max fuy road");
  assert.deepEqual(result.tokens, ["mad", "max", "fuy", "road"]);
  assert.equal(
    result.postings.find(({ token }) => token === "fuy").documentFrequency,
    0,
  );
  assert.deepEqual(result.candidateIdsPreview, ["122882"]);
  assert.equal(result.candidateCount, 1);
  assert.equal(result.intersectionCount, 0);
  assert.deepEqual(result.intersectionIdsPreview, []);
});

test("unions overlapping postings without returning duplicate candidates", () => {
  const index = buildTitleTokenIndex(documents);
  const result = lookupTitleTokens(index, "toy story");
  assert.deepEqual(result.candidateIdsPreview, ["1", "2"]);
  assert.equal(result.candidateCount, 2);
  assert.equal(result.intersectionCount, 1);
  assert.deepEqual(result.intersectionIdsPreview, ["1"]);
  assert.equal(index.titleCount, 4);
  assert.ok(index.tokenCount > 0);
  assert.ok(index.postingCount > index.titleCount);
});
