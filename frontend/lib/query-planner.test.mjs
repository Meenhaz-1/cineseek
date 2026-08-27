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
  {
    _id: "4",
    title: "Harry Potter and the Sorcerer's Stone",
    metadata: { year: 2001, genres: ["Adventure", "Fantasy"] },
  },
  {
    _id: "5",
    title: "Harry Potter and the Chamber of Secrets",
    metadata: { year: 2002, genres: ["Adventure", "Fantasy"] },
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
        id: "person:christopher-nolan",
        name: "Christopher Nolan",
        roles: ["director"],
        movieCount: 10,
        actorMovieCount: 0,
        directorMovieCount: 10,
      },
      {
        id: "person:nolan-north",
        name: "Nolan North",
        roles: ["actor"],
        movieCount: 7,
        actorMovieCount: 7,
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
      {
        id: "person:steven-soderbergh",
        name: "Steven Soderbergh",
        roles: ["director"],
        movieCount: 25,
        actorMovieCount: 0,
        directorMovieCount: 25,
      },
      {
        id: "person:steven-seagal",
        name: "Steven Seagal",
        roles: ["actor"],
        movieCount: 20,
        actorMovieCount: 20,
        directorMovieCount: 0,
      },
      {
        id: "person:allan-smith",
        name: "Allan Smith",
        roles: ["actor"],
        movieCount: 10,
        actorMovieCount: 10,
        directorMovieCount: 0,
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

test("can expose an automatic correction as a suggestion for literal search", () => {
  const corrected = planQuery("intersteler", indexes);
  const literal = planQuery("intersteler", indexes, { autocorrect: false });

  assert.equal(corrected.effectiveQuery, "interstellar");
  assert.equal(corrected.corrections[0].policy, "automatic");
  assert.equal(literal.effectiveQuery, "intersteler");
  assert.equal(literal.corrections[0].policy, "suggest");
  assert.equal(literal.suggestedQuery, "interstellar");
  assert.equal(literal.routes.titleQuery, "intersteler");
});

test("caches corrected and literal plans separately", () => {
  const corrected = planQuery("tom cuise", indexes);
  const literal = planQuery("tom cuise", indexes, { autocorrect: false });

  assert.equal(corrected.effectiveQuery, "tom cruise");
  assert.equal(literal.effectiveQuery, "tom cuise");
  assert.equal(literal.corrections[0].policy, "suggest");
});

test("literal mode downgrades automatic genre and control corrections", () => {
  for (const [query, entityType] of [
    ["horrer movies", "genre"],
    ["lates movies", "control"],
  ]) {
    const literal = planQuery(query, indexes, { autocorrect: false });
    assert.equal(literal.effectiveQuery, query);
    assert.equal(literal.corrections[0].entityType, entityType);
    assert.equal(literal.corrections[0].policy, "suggest");
    assert.ok(literal.suggestedQuery);
  }
});

test("corrects a misspelled recurring franchise phrase", () => {
  const plan = planQuery("hary poter", indexes);
  assert.equal(plan.effectiveQuery, "harry potter");
  assert.deepEqual(plan.corrections[0], {
    original: "hary poter",
    replacement: "Harry Potter",
    entityType: "title",
    confidence: 0.833,
    policy: "automatic",
  });
  assert.equal(plan.routes.titleQuery, "harry potter");
  assert.equal(planQuery("harry potter", indexes).corrections.length, 0);
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

test("ranks partial person candidates by catalog size without narrowing retrieval", () => {
  const plan = planQuery("steven", indexes);
  assert.equal(plan.intent, "general_search");
  assert.equal(plan.corrections.length, 0);
  assert.equal(plan.entities.personCandidates[0].name, "Steven Spielberg");
  assert.equal(plan.entities.personCandidates[0].role, "director");
  assert.equal(plan.entities.personCandidates[0].movieCount, 30);
  assert.equal(plan.entities.personCandidates[0].roleMovieCount, 30);
  assert.equal(plan.routes.titleQuery, "steven");
  assert.equal(plan.routes.fieldQuery, "steven");
});

test("matches surnames and ranks partial people by catalog size", () => {
  const plan = planQuery("nolan", indexes);
  assert.deepEqual(
    plan.entities.personCandidates.slice(0, 2).map(({ name, movieCount }) => ({
      name,
      movieCount,
    })),
    [
      { name: "Christopher Nolan", movieCount: 10 },
      { name: "Nolan North", movieCount: 7 },
    ],
  );
});

test("uses role-specific catalog size for contextual partial names", () => {
  const director = planQuery("director steven", indexes);
  assert.equal(director.entities.personCandidates[0].name, "Steven Spielberg");
  assert.equal(director.entities.personCandidates[0].role, "director");
  assert.equal(director.routes.titleQuery, "");
  assert.equal(director.routes.fieldQuery, "steven");
  assert.equal(director.routes.fieldRole, "director");
  const actor = planQuery("actor steven", indexes);
  assert.equal(actor.entities.personCandidates[0].name, "Steven Seagal");
  assert.equal(actor.entities.personCandidates[0].role, "actor");
  assert.equal(actor.routes.fieldRole, "actor");
});

test("does not turn short control-like prefixes into person discovery", () => {
  const plan = planQuery("all movies", indexes);
  assert.equal(plan.entities.personCandidates.length, 0);
  assert.notEqual(plan.intent, "person_discovery");
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
  assert.equal(plan.routes.structuredGenreRanking, true);
});

test("plans a bare genre as structured discovery without title or field scoring", () => {
  const plan = planQuery("comedy", indexes);
  assert.deepEqual(plan.filters.genres, ["Comedy"]);
  assert.equal(plan.routes.titleQuery, "");
  assert.equal(plan.routes.fieldQuery, "");
  assert.equal(plan.routes.structuredGenreRanking, true);
});

test("keeps unconnected multi-genre discovery on the existing field route", () => {
  const plan = planQuery("science fiction thriller", indexes);
  assert.deepEqual(plan.filters.genres, ["Sci-Fi", "Thriller"]);
  assert.equal(plan.routes.titleQuery, "");
  assert.equal(plan.routes.fieldQuery, "science fiction thriller");
  assert.equal(plan.routes.structuredGenreRanking, false);
});

test("keeps filtered single-genre queries on their existing ranking path", () => {
  const plan = planQuery(
    "1990s crime movies with at least 100 ratings",
    indexes,
  );
  assert.equal(plan.routes.structuredGenreRanking, false);
  assert.equal(
    plan.routes.fieldQuery,
    "1990s crime movies with at least 100 ratings",
  );
});
