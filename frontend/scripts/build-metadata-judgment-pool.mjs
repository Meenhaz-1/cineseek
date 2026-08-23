import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  exactTitleKey,
  displayMovieLensTitle,
} from "../lib/exact-title-index.mjs";
import { parseMetadataQuery } from "../lib/metadata-query.mjs";

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function jsonl(contents) {
  return contents
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function tsvCell(value) {
  return String(value ?? "").replace(/[\t\r\n]+/g, " ");
}

const queryId = argument("query-id", "q062");
const corpusPath = path.resolve(
  process.cwd(),
  argument("corpus", "../data/movielens/corpus.jsonl"),
);
const queriesPath = path.resolve(
  process.cwd(),
  argument("queries", "../data/movielens/benchmark/queries.provisional.jsonl"),
);
const qrelsPath = path.resolve(
  process.cwd(),
  argument("qrels", "../data/movielens/benchmark/qrels/provisional.tsv"),
);
const outputPath = path.resolve(
  process.cwd(),
  argument(
    "output",
    `../outputs/title-ranking-evaluation/${queryId}-judgment-pool.tsv`,
  ),
);

const [documents, queries, qrelsText] = await Promise.all([
  readFile(corpusPath, "utf8").then(jsonl),
  readFile(queriesPath, "utf8").then(jsonl),
  readFile(qrelsPath, "utf8"),
]);
const query = queries.find((item) => String(item._id) === queryId);
if (!query) throw new Error(`Unknown query ID: ${queryId}`);
const parsed = parseMetadataQuery(exactTitleKey(query.text));
const currentGrades = new Map(
  qrelsText
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const [qid, documentId, grade] = line.split("\t");
      return [`${qid}:${documentId}`, grade];
    }),
);
const matches = documents
  .filter((document) => {
    const metadata = document.metadata ?? {};
    const genreMatches = parsed.genres.map((genre) =>
      metadata.genres?.includes(genre),
    );
    return (
      (!parsed.genres.length ||
        (parsed.genreMode === "all"
          ? genreMatches.every(Boolean)
          : genreMatches.some(Boolean))) &&
      (parsed.yearMin === undefined || metadata.year >= parsed.yearMin) &&
      (parsed.yearMax === undefined || metadata.year <= parsed.yearMax) &&
      (parsed.ratingMin === undefined ||
        metadata.average_rating >= parsed.ratingMin) &&
      (parsed.ratingCountMin === undefined ||
        metadata.rating_count >= parsed.ratingCountMin)
    );
  })
  .sort(
    (left, right) =>
      (right.metadata.average_rating ?? 0) -
        (left.metadata.average_rating ?? 0) ||
      (right.metadata.rating_count ?? 0) - (left.metadata.rating_count ?? 0) ||
      left.title.localeCompare(right.title),
  );

const header = [
  "query_id",
  "query_text",
  "doc_id",
  "title",
  "year",
  "genres",
  "average_rating",
  "rating_count",
  "current_provisional_grade",
  "review_grade_0_to_3",
  "review_notes",
];
const rows = matches.map((document) => [
  queryId,
  query.text,
  document._id,
  displayMovieLensTitle(document.title),
  document.metadata.year,
  document.metadata.genres.join(" | "),
  document.metadata.average_rating,
  document.metadata.rating_count,
  currentGrades.get(`${queryId}:${document._id}`) ?? "",
  "",
  "",
]);
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${[header, ...rows].map((row) => row.map(tsvCell).join("\t")).join("\n")}\n`,
  "utf8",
);
console.log(
  JSON.stringify(
    {
      output: outputPath,
      queryId,
      query: query.text,
      pooledDocuments: rows.length,
    },
    null,
    2,
  ),
);
