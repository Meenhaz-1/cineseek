import assert from "node:assert/strict";
import test from "node:test";
import {
  scoreOrderedTokenProximityCandidate,
  scoreOrderedTokenProximityCandidates,
} from "./ordered-token-proximity.mjs";

const records = new Map([
  ["1", { id: "1", title: "Mad Max: Fury Road", year: 2015 }],
  ["2", { id: "2", title: "Road to Fury", year: 2020 }],
  ["3", { id: "3", title: "Fury on the Open Road", year: 2021 }],
  ["4", { id: "4", title: "Fury Fury Road", year: 2022 }],
]);

test("rewards complete left-to-right token order", () => {
  const forward = scoreOrderedTokenProximityCandidate(
    "fury road",
    records.get("1"),
  );
  const reversed = scoreOrderedTokenProximityCandidate(
    "road fury",
    records.get("1"),
  );
  assert.equal(forward.orderedCoverage, 1);
  assert.equal(reversed.orderedCoverage, 0.5);
  assert.equal(reversed.tokenCoverage, 1);
  assert.deepEqual(forward.matchedTitleIndexes, [2, 3]);
  assert.deepEqual(reversed.missingTokens, ["fury"]);
});

test("gives adjacent ordered tokens a perfect proximity score and phrase match", () => {
  const score = scoreOrderedTokenProximityCandidate(
    "fury road",
    records.get("1"),
  );
  assert.equal(score.matchSpan, 2);
  assert.equal(score.gapCount, 0);
  assert.equal(score.proximity, 1);
  assert.equal(score.phraseMatch, true);
});

test("penalizes gaps without losing ordered coverage", () => {
  const score = scoreOrderedTokenProximityCandidate(
    "fury road",
    records.get("3"),
  );
  assert.equal(score.orderedCoverage, 1);
  assert.equal(score.matchSpan, 5);
  assert.equal(score.gapCount, 3);
  assert.equal(score.proximity, 0.4);
  assert.equal(score.phraseMatch, false);
});

test("chooses the tightest complete alignment when a token repeats", () => {
  const score = scoreOrderedTokenProximityCandidate(
    "fury road",
    records.get("4"),
  );
  assert.deepEqual(score.matchedTitleIndexes, [1, 2]);
  assert.equal(score.proximity, 1);
  assert.equal(score.phraseMatch, true);
});

test("ranks phrases above separated and reversed matches", () => {
  const result = scoreOrderedTokenProximityCandidates(
    records,
    [...records.keys()],
    "fury road",
  );
  assert.deepEqual(
    new Set(result.candidatesPreview.slice(0, 2).map(({ id }) => id)),
    new Set(["1", "4"]),
  );
  assert.deepEqual(
    result.candidatesPreview.slice(2).map(({ id }) => id),
    ["3", "2"],
  );
});
