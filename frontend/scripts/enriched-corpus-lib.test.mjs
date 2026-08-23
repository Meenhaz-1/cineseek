import assert from "node:assert/strict";
import test from "node:test";
import { buildSearchableDocument } from "./enriched-corpus-lib.mjs";

test("adds overview, cast, directors, keywords, and provenance to searchable text", () => {
  const document = {
    _id: "1",
    title: "Toy Story",
    text: "Toy Story (1995). Genres: Animation",
    metadata: { year: 1995 },
  };
  const enriched = buildSearchableDocument(document, {
    overview: "Toys come alive.",
    cast: [{ name: "Tom Hanks" }, { name: "Tom Hanks" }],
    directors: [{ name: "John Lasseter" }],
    keywords: [{ name: "friendship" }],
  });
  assert.match(enriched.text, /Overview: Toys come alive\./);
  assert.match(enriched.text, /Cast: Tom Hanks/);
  assert.match(enriched.text, /Directors: John Lasseter/);
  assert.match(enriched.text, /TMDB keywords: friendship/);
  assert.deepEqual(enriched.metadata.cast, ["Tom Hanks"]);
  assert.equal(enriched.metadata.enrichment_source, "TMDB");
});

test("leaves unenriched corpus records unchanged", () => {
  const document = { _id: "2", text: "Jumanji" };
  assert.equal(buildSearchableDocument(document), document);
});
