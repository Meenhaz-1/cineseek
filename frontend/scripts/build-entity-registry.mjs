import path from "node:path";
import { readFile } from "node:fs/promises";
import { buildEntityRegistry } from "./entity-registry-lib.mjs";
import { writeJsonAtomically } from "./tmdb-enrichment-lib.mjs";

const frontendRoot = path.resolve(import.meta.dirname, "..");
const corpusPath = path.resolve(frontendRoot, "../data/movielens/corpus.jsonl");
const enrichmentPath = path.resolve(frontendRoot, "data/tmdb-enrichment.json");
const outputPath = path.resolve(
  frontendRoot,
  "../data/movielens/entity-registry.json",
);

const [corpusContents, enrichmentContents] = await Promise.all([
  readFile(corpusPath, "utf8"),
  readFile(enrichmentPath, "utf8"),
]);
const documents = corpusContents
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const enrichment = JSON.parse(enrichmentContents);
const registry = buildEntityRegistry(documents, enrichment.movies);
await writeJsonAtomically(outputPath, registry, 0);
console.log(JSON.stringify({ output: outputPath, ...registry.stats }, null, 2));
