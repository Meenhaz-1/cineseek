import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExactTitleIndex,
  displayMovieLensTitle,
  exactTitleKey,
  lookupExactTitle,
} from "./exact-title-index.mjs";

const documents = [
  { _id: "1", title: "Toy Story", metadata: { year: 1995 } },
  { _id: "2571", title: "Matrix, The", metadata: { year: 1999 } },
  { _id: "122882", title: "Mad Max: Fury Road", metadata: { year: 2015 } },
];

test("creates the same exact key shape as the existing frontend normalization", () => {
  assert.equal(exactTitleKey("  MAD MAX: Fury—Road  "), "mad max: fury road");
});

test("makes MovieLens trailing articles searchable in natural order", () => {
  assert.equal(displayMovieLensTitle("Matrix, The"), "The Matrix");
  const index = buildExactTitleIndex(documents);
  assert.equal(lookupExactTitle(index, "the matrix").matches[0].id, "2571");
  assert.equal(lookupExactTitle(index, "matrix").matches[0].id, "2571");
});

test("returns exact hits without performing fuzzy or punctuation-tolerant matching", () => {
  const index = buildExactTitleIndex(documents);
  assert.equal(
    lookupExactTitle(index, "mad max: fury road").matches[0].id,
    "122882",
  );
  assert.deepEqual(lookupExactTitle(index, "mad max fuy road").matches, []);
  assert.deepEqual(lookupExactTitle(index, "mad max fury road").matches, []);
});

test("retains every record when exact keys collide", () => {
  const index = buildExactTitleIndex([
    ...documents,
    { _id: "copy", title: "Toy Story", metadata: { year: 2095 } },
  ]);
  assert.equal(lookupExactTitle(index, "toy story").matches.length, 2);
  assert.equal(index.collisionCount, 1);
});
