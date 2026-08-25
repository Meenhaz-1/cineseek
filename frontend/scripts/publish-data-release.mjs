import { put } from "@vercel/blob";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  DATA_RELEASE_SCHEMA_VERSION,
  EXPECTED_MOVIE_COUNT,
  countJsonLines,
  sha256,
} from "../lib/data-release.mjs";

const frontendRoot = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(frontendRoot, "..");

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const corpusPath = path.resolve(
  frontendRoot,
  argument("corpus", "../data/movielens/corpus.enriched.jsonl"),
);
const registryPath = path.resolve(
  frontendRoot,
  argument("registry", "../data/movielens/entity-registry.json"),
);
const enrichmentCachePath = path.resolve(
  frontendRoot,
  argument("enrichment-cache", "data/tmdb-enrichment.json"),
);
const dryRun = process.argv.includes("--dry-run");
const sources = {
  corpus: { localPath: corpusPath, filename: "corpus.enriched.jsonl" },
  registry: { localPath: registryPath, filename: "entity-registry.json" },
  queries: {
    localPath: path.join(
      repositoryRoot,
      "benchmark",
      "queries.provisional.jsonl",
    ),
    filename: "benchmark-queries.jsonl",
  },
  qrels: {
    localPath: path.join(
      repositoryRoot,
      "benchmark",
      "qrels",
      "provisional.tsv",
    ),
    filename: "benchmark-qrels.tsv",
  },
  summary: {
    localPath: path.join(frontendRoot, "data", "benchmark-summary.json"),
    filename: "benchmark-summary.json",
  },
  parserCases: {
    localPath: path.join(
      repositoryRoot,
      "outputs",
      "query-understanding-parser-cases",
      "parser-cases.json",
    ),
    filename: "parser-cases.json",
  },
};

if (!dryRun && !process.env.BLOB_READ_WRITE_TOKEN)
  throw new Error(
    "BLOB_READ_WRITE_TOKEN is required to publish a private data release.",
  );

const contentsByKey = Object.fromEntries(
  await Promise.all(
    Object.entries(sources).map(async ([key, source]) => [
      key,
      await readFile(source.localPath),
    ]),
  ),
);
const movieCount = countJsonLines(contentsByKey.corpus);
if (movieCount !== EXPECTED_MOVIE_COUNT)
  throw new Error(
    `Expected ${EXPECTED_MOVIE_COUNT} corpus rows; found ${movieCount}.`,
  );

const registry = JSON.parse(contentsByKey.registry.toString("utf8"));
if (registry.stats?.movies !== movieCount)
  throw new Error("Entity registry movie count does not match the corpus.");
const plannerRegistry = {
  stats: registry.stats,
  entities: {
    people: registry.entities.people.map(
      ({
        id,
        name,
        roles,
        movieCount,
        actorMovieCount,
        directorMovieCount,
      }) => ({
        id,
        name,
        roles,
        movieCount,
        actorMovieCount,
        directorMovieCount,
      }),
    ),
    genres: registry.entities.genres.map(({ id, name }) => ({ id, name })),
    tags: registry.entities.tags.map(({ id, name }) => ({ id, name })),
  },
};
sources.plannerRegistry = {
  localPath: null,
  filename: "planner-registry.json",
};
contentsByKey.plannerRegistry = Buffer.from(JSON.stringify(plannerRegistry));
const enrichmentCache = JSON.parse(await readFile(enrichmentCachePath, "utf8"));
const enrichmentFetchedAt = new Date(enrichmentCache.fetched_at);
if (!Number.isFinite(enrichmentFetchedAt.valueOf()))
  throw new Error("TMDB enrichment cache has no valid fetched_at timestamp.");
const expiresAtDate = new Date(
  enrichmentFetchedAt.valueOf() + 180 * 24 * 60 * 60 * 1_000,
);
if (expiresAtDate <= new Date())
  throw new Error(
    "TMDB enrichment is older than 180 days. Refresh it before release.",
  );

const corpusHash = sha256(contentsByKey.corpus);
const releaseId =
  argument("release", "") ||
  `${new Date().toISOString().slice(0, 10)}-${corpusHash.slice(0, 8)}`;
if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{5,79}$/.test(releaseId))
  throw new Error(
    "Release ID may contain only letters, numbers, dots, dashes, and underscores.",
  );
const prefix = `cineseek-data/${releaseId}`;
const expiresAt = expiresAtDate.toISOString();
const files = {};

if (dryRun) {
  console.log(
    JSON.stringify(
      {
        valid: true,
        releaseId,
        movieCount,
        entityStats: registry.stats,
        enrichmentFetchedAt: enrichmentFetchedAt.toISOString(),
        expiresAt,
        files: Object.fromEntries(
          Object.entries(sources).map(([key, source]) => [
            key,
            { filename: source.filename, bytes: contentsByKey[key].byteLength },
          ]),
        ),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

for (const [key, source] of Object.entries(sources)) {
  const contents = contentsByKey[key];
  const pathname = `${prefix}/${source.filename}`;
  await put(pathname, contents, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    multipart: contents.byteLength > 4_000_000,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  files[key] = {
    pathname,
    sha256: sha256(contents),
    bytes: contents.byteLength,
  };
}

const corpusStats = await stat(corpusPath);
const manifest = {
  schemaVersion: DATA_RELEASE_SCHEMA_VERSION,
  releaseId,
  generatedAt: new Date().toISOString(),
  expiresAt,
  movieCount,
  entityStats: registry.stats,
  provenance: {
    movieLens: "ml-latest-small",
    corpusModifiedAt: corpusStats.mtime.toISOString(),
    tmdbEnrichmentFetchedAt: enrichmentFetchedAt.toISOString(),
    tmdbCacheIncluded: false,
  },
  files,
};
const manifestContents = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
await put(`${prefix}/manifest.json`, manifestContents, {
  access: "private",
  addRandomSuffix: false,
  allowOverwrite: false,
  token: process.env.BLOB_READ_WRITE_TOKEN,
});

console.log(`Published CineSeek data release ${releaseId}.`);
console.log(`Set CINESEEK_DATA_RELEASE=${releaseId} in Vercel.`);
