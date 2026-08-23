import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  enrichCatalog,
  enrichmentRecordIsComplete,
  fetchMovieEnrichment,
  readEnrichmentCache,
  writeJsonAtomically,
} from "./tmdb-enrichment-lib.mjs";

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function positiveInteger(name, fallback) {
  const value = Number(argument(name, fallback));
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`--${name} must be a positive integer`);
  return value;
}

function corpusCatalog(contents) {
  return contents
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((document) => Number.isInteger(document.metadata?.tmdb_id))
    .map((document) => [String(document._id), document.metadata.tmdb_id]);
}

const configuredToken = process.env.TMDB_READ_TOKEN;
const configuredApiKey = process.env.TMDB_API_KEY;
const dryRun = process.argv.includes("--dry-run");
if (!dryRun && !configuredToken && !configuredApiKey) {
  throw new Error("Add TMDB_READ_TOKEN or TMDB_API_KEY to frontend/.env.local");
}
const tokenLooksLikeV3Key = Boolean(
  configuredToken && /^[a-f0-9]{32}$/i.test(configuredToken),
);
const apiKey =
  configuredApiKey || (tokenLooksLikeV3Key ? configuredToken : undefined);
const bearerToken = apiKey ? undefined : configuredToken;
const scope = argument("scope", "teaching");
if (!new Set(["teaching", "corpus"]).has(scope))
  throw new Error("--scope must be teaching or corpus");
const concurrency = positiveInteger("concurrency", 4);
const batchSize = positiveInteger("batch-size", 100);
const limitText = argument("limit", "");
const limit = limitText ? positiveInteger("limit", 1) : undefined;
const refresh = process.argv.includes("--refresh");

const teachingCatalog = [
  ["1", 862],
  ["2", 8844],
  ["47", 807],
  ["318", 278],
  ["541", 78],
  ["924", 62],
  ["1197", 2493],
  ["1214", 348],
  ["2571", 603],
  ["5618", 129],
  ["7361", 38],
  ["48394", 1417],
  ["55820", 6977],
  ["58559", 155],
  ["60069", 10681],
  ["79132", 27205],
  ["109374", 120467],
  ["109487", 157336],
  ["122882", 76341],
  ["99145", 80278],
];
const scriptDir = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(scriptDir, "../data/tmdb-enrichment.json");
const failurePath = resolve(scriptDir, "../data/tmdb-enrichment-failures.json");
const corpusPath = resolve(scriptDir, "../../data/movielens/corpus.jsonl");
const catalog =
  scope === "corpus"
    ? corpusCatalog(await readFile(corpusPath, "utf8"))
    : teachingCatalog;
const existingCache = await readEnrichmentCache(outputPath);
let movies = existingCache.movies ?? {};
const pending = catalog.filter(
  ([movieLensId]) =>
    refresh || !enrichmentRecordIsComplete(movies[movieLensId]),
);
const selected = limit ? pending.slice(0, limit) : pending;

process.stdout.write(
  `${JSON.stringify({ scope, linkedMovies: catalog.length, cachedMovies: Object.keys(movies).length, pendingMovies: pending.length, selectedMovies: selected.length, concurrency, batchSize, refresh, dryRun }, null, 2)}\n`,
);

if (!dryRun) {
  const failures = [];
  const totals = { updated: 0, unchanged: 0, missingPoster: 0, failed: 0 };
  for (let offset = 0; offset < selected.length; offset += batchSize) {
    const batch = selected.slice(offset, offset + batchSize);
    const result = await enrichCatalog({
      catalog: batch,
      existingMovies: movies,
      concurrency,
      fetchOne: ([movieLensId, tmdbId]) =>
        fetchMovieEnrichment({ movieLensId, tmdbId, apiKey, bearerToken }),
    });
    movies = result.movies;
    failures.push(...result.failures);
    Object.keys(totals).forEach((key) => {
      totals[key] += result.summary[key];
    });
    const completed = Math.min(offset + batch.length, selected.length);
    await writeJsonAtomically(outputPath, {
      schema_version: 2,
      fetched_at: new Date().toISOString(),
      movies,
      last_run: {
        scope,
        selected: selected.length,
        completed,
        failures: failures.length,
      },
    });
    await writeJsonAtomically(failurePath, {
      generated_at: new Date().toISOString(),
      scope,
      selected: selected.length,
      completed,
      failures,
    });
    process.stdout.write(
      `Checkpoint ${completed.toLocaleString()}/${selected.length.toLocaleString()} · cached ${Object.keys(movies).length.toLocaleString()} · failures ${failures.length.toLocaleString()}\n`,
    );
  }
  process.stdout.write(
    `${JSON.stringify({ output: outputPath, failureReport: failurePath, cachedMovies: Object.keys(movies).length, summary: totals, failures: failures.slice(0, 20) }, null, 2)}\n`,
  );
}
