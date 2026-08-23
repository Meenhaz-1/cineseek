import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildSearchableDocument } from "./enriched-corpus-lib.mjs";

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const corpusPath = path.resolve(
  process.cwd(),
  argument("corpus", "../data/movielens/corpus.jsonl"),
);
const cachePath = path.resolve(
  process.cwd(),
  argument("cache", "data/tmdb-enrichment.json"),
);
const outputPath = path.resolve(
  process.cwd(),
  argument("output", "../data/movielens/corpus.enriched.jsonl"),
);
const [corpusText, cacheText] = await Promise.all([
  readFile(corpusPath, "utf8"),
  readFile(cachePath, "utf8"),
]);
const cache = JSON.parse(cacheText);
let enrichedDocuments = 0;
const rows = corpusText
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    const document = JSON.parse(line);
    const enrichment = cache.movies?.[String(document._id)];
    if (enrichment) enrichedDocuments += 1;
    return JSON.stringify(buildSearchableDocument(document, enrichment));
  });
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${rows.join("\n")}\n`, "utf8");
console.log(
  JSON.stringify(
    {
      output: outputPath,
      documents: rows.length,
      enrichedDocuments,
      coverage: Number((enrichedDocuments / rows.length).toFixed(4)),
    },
    null,
    2,
  ),
);
