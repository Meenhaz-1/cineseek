import path from "node:path";
import { readFile } from "node:fs/promises";
import { getHindiRuntime } from "../lib/hindi-search/runtime.mjs";
import { fetchAliases } from "../lib/hindi-search/enrichment.mjs";
import { writeJsonAtomically } from "./tmdb-enrichment-lib.mjs";

const args = process.argv.slice(2);
const limitIndex = args.indexOf("--limit");
const limit = limitIndex < 0 ? 100 : Number(args[limitIndex + 1]);
if (!Number.isInteger(limit) || limit < 1)
  throw new Error("--limit must be a positive integer");
if (!process.env.TMDB_READ_TOKEN && !process.env.TMDB_API_KEY)
  throw new Error("Configure TMDB_READ_TOKEN or TMDB_API_KEY in .env.local");
const runtime = await getHindiRuntime();
const outputPath =
  process.env.CINESEEK_HINDI_ALIASES_PATH ||
  path.join(path.dirname(runtime.corpusPath), "hindi-aliases.json");
let supplemental = { schemaVersion: 1, movies: {}, people: {} };
try {
  supplemental = JSON.parse(await readFile(outputPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
supplemental.movies ??= {};
supplemental.people ??= {};
const jobs = [
  ...runtime.documents
    .filter((d) => d.metadata?.tmdb_id)
    .map((d) => ({
      kind: "movie",
      collection: "movies",
      id: String(d._id),
      tmdbId: d.metadata.tmdb_id,
    })),
  ...runtime.registry.entities.people
    .filter((p) => p.tmdbId)
    .map((p) => ({
      kind: "person",
      collection: "people",
      id: p.id,
      tmdbId: p.tmdbId,
    })),
]
  .filter(
    (job) =>
      (args.includes("--people")
        ? job.kind === "person"
        : job.kind === "movie") &&
      (args.includes("--refresh") ||
        !Object.hasOwn(supplemental[job.collection], job.id)),
  )
  .slice(0, limit);
let updated = 0,
  failed = 0;
for (const job of jobs) {
  try {
    const aliases = await fetchAliases(job.kind, job.tmdbId, {
      bearerToken: process.env.TMDB_READ_TOKEN,
      apiKey: process.env.TMDB_API_KEY,
    });
    const preserved = (supplemental[job.collection][job.id] ?? []).filter(
      (a) => !a.source.startsWith("TMDB:"),
    );
    supplemental[job.collection][job.id] = [...preserved, ...aliases];
    await writeJsonAtomically(outputPath, supplemental);
    updated++;
  } catch (error) {
    failed++;
    console.error(`${job.kind} ${job.id}: ${error.message}`);
  }
}
console.log(
  JSON.stringify(
    { outputPath, requested: jobs.length, updated, failed },
    null,
    2,
  ),
);
if (failed) process.exitCode = 1;
