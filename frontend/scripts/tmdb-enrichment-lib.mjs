import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryDelay(response, attempt) {
  const retryAfter = response.headers?.get?.("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  }
  return 300 * 2 ** (attempt - 1);
}

export async function fetchMovieEnrichment({
  movieLensId,
  tmdbId,
  apiKey,
  bearerToken,
  fetchImpl = fetch,
  sleep = delay,
  timeoutMs = 20_000,
  maxAttempts = 3,
}) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const url = new URL(`https://api.themoviedb.org/3/movie/${tmdbId}`);
    url.searchParams.set("append_to_response", "credits,keywords");
    url.searchParams.set("language", "en-US");
    if (apiKey) url.searchParams.set("api_key", apiKey);

    try {
      const response = await fetchImpl(url, {
        headers: {
          ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        const error = new Error(
          `TMDB movie ${tmdbId} returned HTTP ${response.status}`,
        );
        error.retryable = RETRYABLE_STATUS_CODES.has(response.status);
        if (!error.retryable || attempt === maxAttempts) throw error;
        lastError = error;
        await sleep(retryDelay(response, attempt));
        continue;
      }

      const movie = await response.json();
      return {
        tmdb_id: movie.id,
        overview: movie.overview || "",
        poster_path: movie.poster_path || null,
        runtime: movie.runtime || null,
        cast: (movie.credits?.cast || []).slice(0, 12).map((person) => ({
          id: person.id,
          name: person.name,
          character: person.character || "",
        })),
        directors: (movie.credits?.crew || [])
          .filter((person) => person.job === "Director")
          .map((person) => ({ id: person.id, name: person.name })),
        keywords: (movie.keywords?.keywords || movie.keywords?.results || [])
          .slice(0, 20)
          .map((keyword) => ({ id: keyword.id, name: keyword.name })),
        source: "TMDB",
        movie_lens_id: movieLensId,
      };
    } catch (error) {
      lastError = error;
      if (error?.retryable === false) throw error;
      if (attempt === maxAttempts) break;
      await sleep(300 * 2 ** (attempt - 1));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`TMDB movie ${tmdbId} could not be enriched`);
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = {
          status: "fulfilled",
          value: await worker(items[index]),
        };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, runWorker),
  );
  return results;
}

export async function enrichCatalog({
  catalog,
  existingMovies = {},
  fetchOne,
  concurrency = 4,
}) {
  if (!Number.isInteger(concurrency) || concurrency < 1)
    throw new Error("Concurrency must be a positive integer");
  const movies = { ...existingMovies };
  const summary = { updated: 0, unchanged: 0, missingPoster: 0, failed: 0 };
  const failures = [];
  const results = await mapWithConcurrency(catalog, concurrency, fetchOne);

  results.forEach((result, index) => {
    const [movieLensId, tmdbId] = catalog[index];
    if (result.status === "rejected") {
      summary.failed += 1;
      failures.push({
        movieLensId,
        tmdbId,
        message:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      });
      return;
    }
    const { movie_lens_id: ignoredMovieLensId, ...record } = result.value;
    void ignoredMovieLensId;
    if (!record.poster_path) summary.missingPoster += 1;
    if (JSON.stringify(existingMovies[movieLensId]) === JSON.stringify(record))
      summary.unchanged += 1;
    else summary.updated += 1;
    movies[movieLensId] = record;
  });

  return { movies, summary, failures };
}

export function enrichmentRecordIsComplete(record) {
  return (
    Boolean(record) &&
    Array.isArray(record.cast) &&
    Array.isArray(record.directors) &&
    Array.isArray(record.keywords) &&
    Object.hasOwn(record, "overview")
  );
}

export async function readEnrichmentCache(outputPath) {
  try {
    return JSON.parse(await readFile(outputPath, "utf8"));
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return { movies: {} };
    throw error;
  }
}

export async function writeJsonAtomically(outputPath, value, space = 2) {
  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify(value, null, space)}\n`,
    "utf8",
  );
  await rename(temporaryPath, outputPath);
}
