import { buildTitleSearchPipeline } from "../title-search-pipeline.mjs";
import { buildPlannerIndexes } from "../query-planner.mjs";
import { buildAliasCatalog } from "./catalog.mjs";
export const documents = [
  {
    _id: "1",
    title: "Dil Se",
    aliases: [{ text: "दिल से", language: "hi", source: "reviewed" }],
    metadata: {
      year: 1998,
      genres: ["Drama", "Romance"],
      average_rating: 4,
      rating_count: 30,
      cast: ["Shah Rukh Khan"],
    },
  },
  {
    _id: "2",
    title: "Test Horror",
    metadata: {
      year: 2011,
      genres: ["Horror"],
      average_rating: 3.5,
      rating_count: 20,
      cast: ["Shah Rukh Khan"],
    },
  },
  {
    _id: "3",
    title: "Old Horror",
    metadata: {
      year: 2010,
      genres: ["Horror"],
      average_rating: 4.5,
      rating_count: 40,
    },
  },
  {
    _id: "4",
    title: "New Horror",
    metadata: {
      year: 2020,
      genres: ["Horror"],
      average_rating: 5,
      rating_count: 1,
    },
  },
  {
    _id: "5",
    title: "Newest Horror",
    metadata: {
      year: 2025,
      genres: ["Horror"],
      average_rating: 4,
      rating_count: 50,
    },
  },
];
export const registry = {
  entities: {
    people: [
      {
        id: "person:1",
        name: "Shah Rukh Khan",
        roles: ["actor"],
        movieCount: 2,
        actorMovieCount: 2,
        credits: [
          { movieId: "movie:movielens:1", role: "actor" },
          { movieId: "movie:movielens:2", role: "actor" },
        ],
      },
    ],
    genres: [{ name: "Horror" }, { name: "Drama" }, { name: "Romance" }],
    tags: [],
  },
};
export function fixtureRuntime(
  docs = documents,
  peopleRegistry = registry,
  supplemental = {},
) {
  return {
    catalog: buildAliasCatalog(docs, peopleRegistry, supplemental),
    plannerIndexes: buildPlannerIndexes(docs, peopleRegistry),
    searchIndexes: buildTitleSearchPipeline(docs),
    catalogueVersion: "fixture-1",
    interpretationCache: new Map(),
  };
}
export function interpretation(query, changes = {}) {
  return {
    title: null,
    people: [],
    genres: [],
    genreMode: "any",
    filters: {
      yearMin: null,
      yearMax: null,
      ratingMin: null,
      ratingCountMin: null,
    },
    sort: null,
    unresolved: [],
    evidence: [{ text: query, meaning: "Fixture interpretation" }],
    ...changes,
  };
}
export const cases = [
  ...[
    "शाहरुख की सबसे अच्छी फिल्में",
    "shahrukh ki sabse achhi filmein",
    "best movies starring Shah Rukh Khan",
  ].map((query, i) => ({
    query,
    script: ["Hindi", "Hinglish", "English"][i],
    expected: ["1", "2"],
    expectedPeople: ["person:1"],
    value: interpretation(query, {
      people: [
        {
          text: ["शाहरुख", "shahrukh", "Shah Rukh Khan"][i],
          alternatives: ["Shah Rukh Khan"],
          role: "actor",
        },
      ],
      sort: { field: "rating", direction: "desc" },
    }),
  })),
  ...[
    "२०१० के बाद की डरावनी फिल्में",
    "2010 ke baad ki horror movies",
    "horror movies after 2010",
  ].map((query, i) => ({
    query,
    script: ["Hindi", "Hinglish", "English"][i],
    expected: ["5", "2", "4"],
    expectedPeople: [],
    value: interpretation(query, {
      genres: ["Horror"],
      filters: {
        yearMin: 2011,
        yearMax: null,
        ratingMin: null,
        ratingCountMin: null,
      },
    }),
  })),
];
