import assert from "node:assert/strict";
import test from "node:test";
import { getTypeaheadSuggestions } from "./typeahead-suggestions.mjs";

function runtime() {
  const records = new Map([
    ["1", { id: "1", title: "The Lord of the Rings", year: 1978 }],
    ["2", { id: "2", title: "Lord of War", year: 2005 }],
    ["3", { id: "3", title: "Cold Comes the Night", year: 2013 }],
  ]);
  return {
    searchIndexes: { tokens: { records } },
    plannerIndexes: {
      people: [
        {
          id: "person:christopher-nolan",
          name: "Christopher Nolan",
          roles: ["director"],
          movieCount: 10,
        },
        {
          id: "person:nolan-north",
          name: "Nolan North",
          roles: ["actor"],
          movieCount: 7,
        },
      ],
      genres: [
        { id: "genre:drama", name: "Drama", movieCount: 20 },
        { id: "genre:fantasy", name: "Fantasy", movieCount: 10 },
      ],
    },
  };
}

test("returns grouped title, person, and genre suggestions", () => {
  const result = getTypeaheadSuggestions("nolan", runtime(), 8);
  assert.deepEqual(
    result.people.map(({ label }) => label),
    ["Christopher Nolan", "Nolan North"],
  );
  assert.equal(result.people[0].type, "Director");
  assert.deepEqual(result.titles, []);
});

test("ranks an exact surname token above a first-name prefix", () => {
  const result = getTypeaheadSuggestions("nolan", runtime(), 8);
  assert.equal(result.people[0].label, "Christopher Nolan");
  assert.equal(result.people[0].movieCount, 10);
});

test("prioritizes title prefixes and strips leading articles for matching", () => {
  const result = getTypeaheadSuggestions("lord of the", runtime(), 8);
  assert.equal(result.titles[0].label, "The Lord of the Rings");
  assert.equal(result.titles[0].type, "Movie");
  assert.equal(result.titles[0].year, 1978);
});

test("rejects short queries and applies the result limit", () => {
  assert.deepEqual(getTypeaheadSuggestions("a", runtime()), {
    query: "a",
    titles: [],
    people: [],
    genres: [],
  });
  assert.equal(getTypeaheadSuggestions("lo", runtime(), 1).titles.length, 1);
});
