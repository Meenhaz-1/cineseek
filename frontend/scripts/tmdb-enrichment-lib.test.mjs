import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  enrichCatalog,
  enrichmentRecordIsComplete,
  fetchMovieEnrichment,
  writeJsonAtomically,
} from "./tmdb-enrichment-lib.mjs";

function movieResponse({ posterPath = "/poster.jpg" } = {}) {
  return new Response(
    JSON.stringify({
      id: 603,
      overview: "A simulated reality.",
      poster_path: posterPath,
      runtime: 136,
      credits: {
        cast: [{ id: 1, name: "Actor", character: "Hero" }],
        crew: [
          { id: 2, name: "Director", job: "Director" },
          { id: 3, name: "Writer", job: "Screenplay" },
        ],
      },
      keywords: { keywords: [{ id: 4, name: "simulated reality" }] },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

test("fetchMovieEnrichment maps successful and missing-poster responses", async () => {
  const enriched = await fetchMovieEnrichment({
    movieLensId: "2571",
    tmdbId: 603,
    fetchImpl: async () => movieResponse(),
    maxAttempts: 1,
  });
  assert.equal(enriched.poster_path, "/poster.jpg");
  assert.equal(enriched.cast[0].name, "Actor");
  assert.deepEqual(enriched.directors, [{ id: 2, name: "Director" }]);
  assert.deepEqual(enriched.keywords, [{ id: 4, name: "simulated reality" }]);

  const missing = await fetchMovieEnrichment({
    movieLensId: "2571",
    tmdbId: 603,
    fetchImpl: async () => movieResponse({ posterPath: null }),
    maxAttempts: 1,
  });
  assert.equal(missing.poster_path, null);
});

test("recognizes cache records that contain the full searchable enrichment shape", () => {
  assert.equal(
    enrichmentRecordIsComplete({
      overview: "",
      cast: [],
      directors: [],
      keywords: [],
    }),
    true,
  );
  assert.equal(enrichmentRecordIsComplete({ overview: "", cast: [] }), false);
});

test("retries rate limits using Retry-After before succeeding", async () => {
  let calls = 0;
  const sleeps = [];
  const result = await fetchMovieEnrichment({
    movieLensId: "2571",
    tmdbId: 603,
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? new Response("rate limited", {
            status: 429,
            headers: { "retry-after": "0" },
          })
        : movieResponse();
    },
    sleep: async (milliseconds) => sleeps.push(milliseconds),
  });
  assert.equal(result.tmdb_id, 603);
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [0]);
});

test("does not retry permanent HTTP failures", async () => {
  let calls = 0;
  await assert.rejects(
    fetchMovieEnrichment({
      movieLensId: "x",
      tmdbId: 404,
      fetchImpl: async () => {
        calls += 1;
        return new Response("missing", { status: 404 });
      },
    }),
    /HTTP 404/,
  );
  assert.equal(calls, 1);
});

test("aborts timed-out requests", async () => {
  const neverCompletes = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
    });
  await assert.rejects(
    fetchMovieEnrichment({
      movieLensId: "2571",
      tmdbId: 603,
      fetchImpl: neverCompletes,
      timeoutMs: 5,
      maxAttempts: 1,
    }),
    /timeout|aborted/i,
  );
});

test("bounds concurrency and preserves cached records after partial failure", async () => {
  const catalog = [
    ["a", 1],
    ["b", 2],
    ["c", 3],
    ["d", 4],
  ];
  const existingA = {
    tmdb_id: 1,
    overview: "",
    poster_path: "/a.jpg",
    runtime: null,
    cast: [],
    source: "TMDB",
  };
  const existingC = {
    tmdb_id: 3,
    overview: "cached",
    poster_path: "/c.jpg",
    runtime: null,
    cast: [],
    source: "TMDB",
  };
  let active = 0;
  let maximumActive = 0;
  const { movies, summary } = await enrichCatalog({
    catalog,
    existingMovies: { a: existingA, c: existingC },
    concurrency: 2,
    fetchOne: async ([movieLensId, tmdbId]) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      if (movieLensId === "c") throw new Error("temporary failure");
      const posterPath = movieLensId === "b" ? null : `/${movieLensId}.jpg`;
      return {
        tmdb_id: tmdbId,
        overview: "",
        poster_path: posterPath,
        runtime: null,
        cast: [],
        source: "TMDB",
        movie_lens_id: movieLensId,
      };
    },
  });
  assert.equal(maximumActive, 2);
  assert.deepEqual(movies.a, existingA);
  assert.deepEqual(movies.c, existingC);
  assert.deepEqual(summary, {
    updated: 2,
    unchanged: 1,
    missingPoster: 1,
    failed: 1,
  });
});

test("atomically replaces an existing JSON cache", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cineseek-tmdb-"));
  const outputPath = join(directory, "cache.json");
  try {
    await writeFile(outputPath, '{"old":true}\n', "utf8");
    await writeJsonAtomically(outputPath, {
      movies: { 1: { poster_path: "/one.jpg" } },
    });
    assert.deepEqual(JSON.parse(await readFile(outputPath, "utf8")), {
      movies: { 1: { poster_path: "/one.jpg" } },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
