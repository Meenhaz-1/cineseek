import assert from "node:assert/strict";
import test from "node:test";
import { suggestPersonName } from "./person-name-suggestion.mjs";

const people = [
  {
    id: "person:tmdb:500",
    name: "Tom Cruise",
    movieCount: 43,
    roles: ["actor"],
  },
  {
    id: "person:tmdb:31",
    name: "Tom Hanks",
    movieCount: 52,
    roles: ["actor", "director"],
  },
  {
    id: "person:tmdb:287",
    name: "Brad Pitt",
    movieCount: 38,
    roles: ["actor"],
  },
  {
    id: "person:tmdb:488",
    name: "Steven Spielberg",
    movieCount: 35,
    roles: ["director"],
  },
];

test("suggests a full person entity for a misspelled name", () => {
  assert.deepEqual(suggestPersonName("tom cuise", people), {
    entityId: "person:tmdb:500",
    canonicalName: "Tom Cruise",
    roles: ["actor"],
    matchedText: "tom cuise",
    suggestedQuery: "tom cruise",
    distance: 1,
    confidence: 0.9,
  });
});

test("suggests a director from the same full person registry", () => {
  assert.deepEqual(suggestPersonName("directed by steven spielburg", people), {
    entityId: "person:tmdb:488",
    canonicalName: "Steven Spielberg",
    roles: ["director"],
    matchedText: "steven spielburg",
    suggestedQuery: "directed by steven spielberg",
    distance: 1,
    confidence: 0.938,
  });
});

test("replaces the person-name window inside a longer query", () => {
  assert.equal(
    suggestPersonName("action movies with tom cuise", people)?.suggestedQuery,
    "action movies with tom cruise",
  );
});

test("does not suggest a correction for an exact name", () => {
  assert.equal(suggestPersonName("tom cruise", people), null);
});

test("does not force an unrelated query into a person name", () => {
  assert.equal(suggestPersonName("cozy rainy movie", people), null);
});
