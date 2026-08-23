import { readFile } from "node:fs/promises";
import path from "node:path";
import { writeJsonAtomically } from "./tmdb-enrichment-lib.mjs";

const teachingIds = new Set([
  "1",
  "2",
  "47",
  "318",
  "541",
  "924",
  "1197",
  "1214",
  "2571",
  "5618",
  "7361",
  "48394",
  "55820",
  "58559",
  "60069",
  "79132",
  "109374",
  "109487",
  "122882",
  "99145",
]);
const sourcePath = path.resolve(process.cwd(), "data/tmdb-enrichment.json");
const outputPath = path.resolve(
  process.cwd(),
  "data/tmdb-enrichment-teaching.json",
);
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const movies = Object.fromEntries(
  Object.entries(source.movies ?? {}).filter(([movieLensId]) =>
    teachingIds.has(movieLensId),
  ),
);
await writeJsonAtomically(outputPath, {
  fetched_at: source.fetched_at,
  movies,
});
console.log(
  JSON.stringify(
    { output: outputPath, movies: Object.keys(movies).length },
    null,
    2,
  ),
);
