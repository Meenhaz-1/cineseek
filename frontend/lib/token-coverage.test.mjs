import assert from "node:assert/strict";
import test from "node:test";
import {
  scoreTokenCoverageCandidate,
  scoreTokenCoverageCandidates,
} from "./token-coverage.mjs";

const records = new Map([
  ["122882", { id: "122882", title: "Mad Max: Fury Road", year: 2015 }],
  ["1", { id: "1", title: "Glory Road", year: 2006 }],
  ["2", { id: "2", title: "Dead Fury", year: 2008 }],
]);

test("measures the share of unique searchable query tokens found in a title", () => {
  const score = scoreTokenCoverageCandidate("fury road", records.get("122882"));
  assert.deepEqual(score.queryTokens, ["fury", "road"]);
  assert.deepEqual(score.matchedTokens, ["fury", "road"]);
  assert.deepEqual(score.missingTokens, []);
  assert.equal(score.coverage, 1);
});

test("penalizes a short fuzzy candidate that matches only one query token", () => {
  const score = scoreTokenCoverageCandidate("fury road", records.get("1"));
  assert.deepEqual(score.matchedTokens, ["road"]);
  assert.deepEqual(score.missingTokens, ["fury"]);
  assert.equal(score.coverage, 0.5);
});

test("ranks full token coverage above whole-string fuzzy lookalikes", () => {
  const result = scoreTokenCoverageCandidates(
    records,
    [...records.keys()],
    "fury road",
  );
  assert.equal(result.candidatesPreview[0].id, "122882");
  assert.equal(result.candidatesPreview[0].coverage, 1);
  assert.equal(result.candidatesPreview[1].coverage, 0.5);
});

test("does not yet reward query word order", () => {
  const forward = scoreTokenCoverageCandidate(
    "fury road",
    records.get("122882"),
  );
  const reversed = scoreTokenCoverageCandidate(
    "road fury",
    records.get("122882"),
  );
  assert.equal(forward.coverage, 1);
  assert.equal(reversed.coverage, 1);
});
