import assert from "node:assert/strict";
import test from "node:test";
import {
  levenshteinDistance,
  normalizeForEditDistance,
  scoreEditDistanceCandidate,
  scoreEditDistanceCandidates,
} from "./edit-distance.mjs";

const records = new Map([
  ["109487", { id: "109487", title: "Interstellar", year: 2014 }],
  ["122882", { id: "122882", title: "Mad Max: Fury Road", year: 2015 }],
  ["60069", { id: "60069", title: "WALL·E", year: 2008 }],
  ["47", { id: "47", title: "Seven (a.k.a. Se7en)", year: 1995 }],
]);

test("calculates standard Levenshtein insertions, deletions, and substitutions", () => {
  assert.equal(levenshteinDistance("kitten", "sitting"), 3);
  assert.equal(levenshteinDistance("", "alien"), 5);
  assert.equal(levenshteinDistance("alien", "alien"), 0);
});

test("counts a neighboring transposition as two standard Levenshtein edits", () => {
  assert.equal(levenshteinDistance("touy", "toyu"), 2);
});

test("normalizes case and punctuation before edit scoring", () => {
  assert.equal(normalizeForEditDistance("WALL·E"), "wall e");
  const score = scoreEditDistanceCandidate("wall e", records.get("60069"));
  assert.equal(score.editDistance, 0);
  assert.equal(score.editSimilarity, 1);
});

test("normalizes distance by the longer string", () => {
  const score = scoreEditDistanceCandidate(
    "intersteler",
    records.get("109487"),
  );
  assert.equal(score.editDistance, 2);
  assert.equal(score.maximumLength, 12);
  assert.equal(score.editSimilarity, 0.8333);
});

test("ranks the intended title first across merged candidates", () => {
  const result = scoreEditDistanceCandidates(
    records,
    [...records.keys()],
    "mad max fuy road",
  );
  assert.equal(result.candidatesPreview[0].id, "122882");
  assert.ok(
    result.candidatesPreview[0].editSimilarity >
      result.candidatesPreview[1].editSimilarity,
  );
});
