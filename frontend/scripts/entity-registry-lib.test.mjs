import assert from "node:assert/strict";
import test from "node:test";
import { buildEntityRegistry } from "./entity-registry-lib.mjs";

const documents = [
  {
    _id: "1",
    title: "First",
    metadata: { year: 2000, genres: ["Action"], tags: ["spy"], tmdb_id: 10 },
  },
  {
    _id: "2",
    title: "Second",
    metadata: { year: 2001, genres: ["Action", "Drama"], tags: ["spy"] },
  },
];
const enrichment = {
  1: {
    cast: [{ id: 500, name: "Alex Star", character: "Agent" }],
    directors: [{ id: 700, name: "Dana Ray" }],
    keywords: [{ id: 1, name: "mission" }],
  },
  2: {
    cast: [{ id: 500, name: "Alex Star", character: "Pilot" }],
    directors: [{ id: 500, name: "Alex Star" }],
    keywords: [],
  },
};

test("creates canonical entities and reusable movie relationships", () => {
  const registry = buildEntityRegistry(documents, enrichment);
  assert.deepEqual(registry.stats, {
    movies: 2,
    people: 2,
    genres: 2,
    tags: 2,
  });
  const person = registry.entities.people.find(
    ({ id }) => id === "person:tmdb:500",
  );
  assert.equal(person.movieCount, 2);
  assert.deepEqual(person.roles, ["actor", "director"]);
  assert.equal(person.credits.length, 3);
  assert.deepEqual(registry.entities.movies["movie:movielens:1"].actorIds, [
    "person:tmdb:500",
  ]);
});

test("merges canonical genres and tags across movies", () => {
  const registry = buildEntityRegistry(documents, enrichment);
  assert.equal(
    registry.entities.genres.find(({ id }) => id === "genre:action").movieCount,
    2,
  );
  assert.equal(
    registry.entities.tags.find(({ id }) => id === "tag:spy").movieCount,
    2,
  );
});
