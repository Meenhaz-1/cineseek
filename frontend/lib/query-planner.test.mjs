import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPlannerIndexes,
  planQuery,
  titleSearchInputFromPlan,
} from "./query-planner.mjs";

const documents = [
  {
    _id: "1",
    title: "Interstellar",
    metadata: { year: 2014, genres: ["Sci-Fi"] },
  },
  {
    _id: "2",
    title: "Horror of Dracula",
    metadata: { year: 1958, genres: ["Horror"] },
  },
  {
    _id: "3",
    title: "Horror Express",
    metadata: { year: 1972, genres: ["Horror"] },
  },
];
const registry = {
  stats: { movies: 3, people: 2, genres: 2, tags: 0 },
  entities: {
    people: [
      {
        id: "person:tom-cruise",
        name: "Tom Cruise",
        roles: ["actor"],
        movieCount: 20,
        actorMovieCount: 20,
        directorMovieCount: 0,
      },
      {
        id: "person:steven-spielberg",
        name: "Steven Spielberg",
        roles: ["director"],
        movieCount: 30,
        actorMovieCount: 0,
        directorMovieCount: 30,
      },
    ],
    genres: [
      { id: "genre:horror", name: "Horror" },
      { id: "genre:sci-fi", name: "Sci-Fi" },
    ],
    tags: [],
  },
};
const indexes = buildPlannerIndexes(documents, registry);

test("corrects and grounds a complete actor name", () => {
  const plan = planQuery("tom cuise", indexes);
  assert.equal(plan.effectiveQuery, "tom cruise");
  assert.deepEqual(plan.corrections[0], {
    original: "tom cuise",
    replacement: "Tom Cruise",
    entityType: "person",
    role: "actor",
    confidence: 0.9,
    policy: "automatic",
  });
  assert.equal(plan.entities.people[0].name, "Tom Cruise");
});

test("uses director context for person correction", () => {
  const plan = planQuery("directed by steven spielburg", indexes);
  assert.equal(plan.corrections[0].replacement, "Steven Spielberg");
  assert.equal(plan.corrections[0].role, "director");
  assert.equal(plan.entities.people[0].role, "director");
  assert.equal(plan.routes.titleQuery, "");
  assert.equal(plan.routes.fieldQuery, "steven spielberg");
  assert.equal(plan.routes.fieldRole, "director");
});

test("corrects a title with and without explicit title context", () => {
  assert.equal(
    planQuery("intersteler", indexes).corrections[0].replacement,
    "Interstellar",
  );
  const contextual = planQuery("movie called intersteler", indexes);
  assert.equal(contextual.corrections[0].entityType, "title");
  assert.equal(contextual.routes.titleQuery, "interstellar");
});

test("corrects a genre only in genre context", () => {
  const plan = planQuery("horrer movies", indexes);
  assert.equal(plan.corrections[0].replacement, "Horror");
  assert.deepEqual(plan.filters.genres, ["Horror"]);
  assert.equal(plan.routes.titleQuery, "");
});

test("preserves title and genre ownership rules", () => {
  const explicit = planQuery("title contains horror", indexes);
  assert.deepEqual(explicit.filters.genres, []);
  assert.equal(explicit.routes.titleQuery, "horror");
  const phrase = planQuery("horror of dracula", indexes);
  assert.deepEqual(phrase.filters.genres, ["Horror"]);
  assert.equal(phrase.routes.titleQuery, "horror of dracula");
  assert.match(phrase.routes.genreTitleFallbackQuery, /horror/);
});

test("does not force ambiguous or exact entities into corrections", () => {
  assert.equal(planQuery("cruise", indexes).corrections.length, 0);
  assert.equal(planQuery("tom cruise", indexes).corrections.length, 0);
  assert.equal(planQuery("interstellar", indexes).corrections.length, 0);
});

test("retrieval input is derived only from the plan", () => {
  const plan = planQuery("horror of dracula", indexes);
  const input = titleSearchInputFromPlan(plan);
  assert.equal(input.normalizedQuery, plan.effectiveQuery);
  assert.equal(input.retrievalQuery, plan.routes.titleQuery);
  assert.deepEqual(input.filters, plan.filters);
});

test("plans romantic comedy as structured intersection without text scoring", () => {
  const plan = planQuery("romantic comedy", indexes);
  assert.deepEqual(plan.filters.genres, ["Comedy", "Romance"]);
  assert.equal(plan.filters.genreMode, "all");
  assert.equal(plan.routes.titleQuery, "");
  assert.equal(plan.routes.fieldQuery, "");
});
