import assert from "node:assert/strict";
import test from "node:test";
import {
  extractExplicitTitleText,
  metadataResidualTitleTerms,
  parseMetadataQuery,
} from "./metadata-query.mjs";

test("parses q062 metadata constraints without confusing rating count with average rating", () => {
  const parsed = parseMetadataQuery(
    "1990s crime movies with at least 100 ratings",
  );
  assert.deepEqual(parsed.genres, ["Crime"]);
  assert.equal(parsed.yearMin, 1990);
  assert.equal(parsed.yearMax, 1999);
  assert.equal(parsed.ratingMin, undefined);
  assert.equal(parsed.ratingCountMin, 100);
});

test("uses soft ANY matching for an unconnected multi-genre discovery phrase", () => {
  const parsed = parseMetadataQuery("science fiction thriller");
  assert.deepEqual(parsed.genres, ["Sci-Fi", "Thriller"]);
  assert.equal(parsed.genreMode, "any");
});

test("requires every genre when the query explicitly says and", () => {
  const parsed = parseMetadataQuery("science fiction and thriller");
  assert.equal(parsed.genreMode, "all");
});

test("treats romantic comedy as an established compound genre", () => {
  const parsed = parseMetadataQuery("romantic comedy");
  assert.deepEqual(parsed.genres, ["Comedy", "Romance"]);
  assert.equal(parsed.genreMode, "all");
  assert.equal(parsed.isCompoundGenre, true);
  assert.deepEqual(metadataResidualTitleTerms("romantic comedy", parsed), []);
});

test("consumes pure genre language before title scoring", () => {
  assert.deepEqual(metadataResidualTitleTerms("science fiction thriller"), []);
  assert.deepEqual(metadataResidualTitleTerms("war horse"), ["horse"]);
  assert.deepEqual(
    metadataResidualTitleTerms("1990s crime movies with at least 100 ratings"),
    [],
  );
});

test("routes an explicitly named title term away from genre parsing", () => {
  assert.equal(
    extractExplicitTitleText("movies with adventure in the title"),
    "adventure",
  );
  assert.equal(extractExplicitTitleText("title contains horror"), "horror");
  assert.deepEqual(
    parseMetadataQuery("movies with adventure in the title").genres,
    [],
  );
  assert.deepEqual(
    parseMetadataQuery("horror movies titled adventure").genres,
    ["Horror"],
  );
});
