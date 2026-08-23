import assert from "node:assert/strict";
import test from "node:test";
import { buildTmdbPosterUrl, isValidTmdbPosterPath } from "./tmdb-images.mjs";

test("builds a w500 TMDB poster URL from a safe relative path", () => {
  assert.equal(
    buildTmdbPosterUrl("/uXDfjJbdP4ijW5hWSBrPrlKpxab.jpg"),
    "https://image.tmdb.org/t/p/w500/uXDfjJbdP4ijW5hWSBrPrlKpxab.jpg",
  );
  assert.equal(
    buildTmdbPosterUrl("/poster.png", "w342"),
    "https://image.tmdb.org/t/p/w342/poster.png",
  );
});

test("rejects missing, external, traversing, queried, and unsupported poster values", () => {
  for (const value of [
    undefined,
    null,
    "",
    "https://example.com/poster.jpg",
    "/../poster.jpg",
    "/poster.jpg?x=1",
    "/poster.svg",
  ]) {
    assert.equal(buildTmdbPosterUrl(value), undefined);
    assert.equal(isValidTmdbPosterPath(value), false);
  }
  assert.equal(buildTmdbPosterUrl("/poster.jpg", "w999"), undefined);
});

test("representative enrichment records contain a safe poster path or explicit null", () => {
  const records = [
    { movie_id: "1", poster_path: "/uXDfjJbdP4ijW5hWSBrPrlKpxab.jpg" },
    { movie_id: "2", poster_path: null },
  ];
  records.forEach((record) => {
    assert.ok(
      record.poster_path === null || isValidTmdbPosterPath(record.poster_path),
    );
  });
});
