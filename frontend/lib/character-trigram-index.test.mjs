import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCharacterTrigramIndex,
  characterTrigrams,
  lookupCharacterTrigrams,
  scoreCharacterTrigramCandidates,
} from "./character-trigram-index.mjs";

const documents = [
  {
    _id: "7361",
    title: "Eternal Sunshine of the Spotless Mind",
    metadata: { year: 2004 },
  },
  { _id: "109487", title: "Interstellar", metadata: { year: 2014 } },
  { _id: "122882", title: "Mad Max: Fury Road", metadata: { year: 2015 } },
  { _id: "2", title: "Jumanji", metadata: { year: 1995 } },
];

test("creates unique overlapping trigrams with title boundaries", () => {
  assert.deepEqual(characterTrigrams("Interstellar"), [
    "^in",
    "int",
    "nte",
    "ter",
    "ers",
    "rst",
    "ste",
    "tel",
    "ell",
    "lla",
    "lar",
    "ar$",
  ]);
});

test("retrieves a long title token with a two-edit misspelling", () => {
  const index = buildCharacterTrigramIndex(documents);
  const result = lookupCharacterTrigrams(index, "intersteler");
  assert.equal(result.candidatesPreview[0].id, "109487");
  assert.ok(
    result.candidatesPreview[0].matchedTrigrams >= result.minimumMatches,
  );
});

test("recovers a phrase candidate when every query token contains a typo", () => {
  const index = buildCharacterTrigramIndex(documents);
  const result = lookupCharacterTrigrams(index, "mda mx fuy raod");
  assert.ok(result.candidateIds.includes("122882"));
});

test("does not emit duplicate postings for repeated title trigrams", () => {
  const index = buildCharacterTrigramIndex([
    { _id: "repeat", title: "Banana", metadata: { year: 1970 } },
  ]);
  assert.equal(index.byTrigram.get("ana").length, 1);
});

test("calculates Jaccard and Dice from shared, query, and title trigram counts", () => {
  const index = buildCharacterTrigramIndex(documents);
  const result = lookupCharacterTrigrams(index, "intersteler");
  const candidate = result.candidatesPreview.find(({ id }) => id === "109487");
  const expectedUnion =
    candidate.queryTrigramCount +
    candidate.trigramCount -
    candidate.matchedTrigrams;

  assert.equal(candidate.unionTrigramCount, expectedUnion);
  assert.equal(
    candidate.jaccard,
    Number((candidate.matchedTrigrams / expectedUnion).toFixed(4)),
  );
  assert.equal(
    candidate.dice,
    Number(
      (
        (2 * candidate.matchedTrigrams) /
        (candidate.queryTrigramCount + candidate.trigramCount)
      ).toFixed(4),
    ),
  );
  assert.ok(candidate.jaccard >= 0 && candidate.jaccard <= 1);
  assert.ok(candidate.dice >= 0 && candidate.dice <= 1);
});

test("gives identical trigram sets perfect similarity", () => {
  const index = buildCharacterTrigramIndex(documents);
  const result = lookupCharacterTrigrams(index, "Jumanji");
  const candidate = result.candidatesPreview.find(({ id }) => id === "2");

  assert.equal(candidate.jaccard, 1);
  assert.equal(candidate.dice, 1);
});

test("ranks the intended typo correction highest by normalized overlap", () => {
  const index = buildCharacterTrigramIndex(documents);
  const result = scoreCharacterTrigramCandidates(
    index,
    [...index.records.keys()],
    "mad max fuy road",
  );

  assert.equal(result.candidatesPreview[0].id, "122882");
  assert.ok(
    result.candidatesPreview[0].dice >= result.candidatesPreview.at(-1).dice,
  );
});
