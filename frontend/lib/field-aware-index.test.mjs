import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFieldAwareIndex,
  lookupFieldAware,
} from "./field-aware-index.mjs";

const records = new Map([
  [
    "1",
    {
      id: "1",
      title: "Mission: Impossible",
      cast: ["Tom Cruise"],
      directors: ["Brian De Palma"],
      genres: ["Action"],
      tags: ["spy"],
      overview: "An agent must uncover a mole.",
    },
  ],
  [
    "2",
    {
      id: "2",
      title: "Luna Papa",
      cast: [],
      directors: [],
      genres: ["Comedy"],
      tags: [],
      overview: "A travelling actor poses as a friend of Tom Cruise.",
    },
  ],
  [
    "3",
    {
      id: "3",
      title: "Out to Sea",
      cast: [],
      directors: [],
      genres: ["Comedy"],
      tags: [],
      overview: "Two friends take a luxury cruise.",
    },
  ],
]);

test("exact cast entities outrank incidental description phrases", () => {
  const result = lookupFieldAware(buildFieldAwareIndex(records), "tom cruise");
  assert.equal(result.matchesById.get("1").bestMatch.field, "cast");
  assert.equal(result.matchesById.get("1").exactEntityMatch, true);
  assert.equal(result.matchesById.get("2").bestMatch.field, "overview");
  assert.ok(
    result.matchesById.get("1").score > result.matchesById.get("2").score,
  );
});

test("multi-word description queries require at least two matched words", () => {
  const result = lookupFieldAware(buildFieldAwareIndex(records), "tom cruise");
  assert.equal(result.candidateIds.includes("3"), false);
});

test("retrieves exact director, genre, and tag values with field labels", () => {
  const index = buildFieldAwareIndex(records);
  assert.equal(
    lookupFieldAware(index, "brian de palma").matchesById.get("1").bestMatch
      .label,
    "Director",
  );
  assert.equal(
    lookupFieldAware(index, "action").matchesById.get("1").bestMatch.label,
    "Genre",
  );
  assert.equal(
    lookupFieldAware(index, "spy").matchesById.get("1").bestMatch.label,
    "Tag",
  );
});

test("recognizes a complete person entity inside a longer query", () => {
  const result = lookupFieldAware(
    buildFieldAwareIndex(records),
    "action movies with tom cruise",
  );
  assert.equal(result.matchesById.get("1").exactEntityMatch, true);
  assert.equal(result.matchesById.get("1").bestMatch.value, "Tom Cruise");
});

test("does not treat a partial multi-word person token as an entity match", () => {
  const recordsWithPartialPerson = new Map(records).set("4", {
    id: "4",
    title: "Other",
    cast: ["Cowboy"],
    directors: [],
    genres: [],
    tags: [],
    overview: "",
  });
  const result = lookupFieldAware(
    buildFieldAwareIndex(recordsWithPartialPerson),
    "cowboy spaceman",
  );
  assert.equal(result.matchesById.has("4"), false);
});
