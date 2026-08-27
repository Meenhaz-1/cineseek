import path from "node:path";
import {
  access,
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import {
  nextBenchmarkQueryId,
  parseBenchmarkQrels,
  parseBenchmarkQueries,
  serializeBenchmarkDraft,
  validateBenchmarkDraft,
} from "../../../lib/benchmark-editor.mjs";
import {
  displayMovieLensTitle,
  exactTitleKey,
} from "../../../lib/exact-title-index.mjs";
import {
  benchmarkWriteDisabledResponse,
  benchmarkWritesEnabled,
  isPortfolioMode,
  portfolioWriteResponse,
} from "../../../lib/deployment-mode.mjs";
import { getSearchRuntime } from "../../../lib/search-runtime.mjs";
import {
  RUNTIME_FILES,
  resolveRuntimeFile,
} from "../../../lib/runtime-data.mjs";
import { internalErrorResponse } from "../../../lib/api-errors.mjs";

export const runtime = "nodejs";

type CorpusMovie = {
  id: string;
  title: string;
  year: number | null;
  genres: string[];
  averageRating: number | null;
  ratingCount: number;
};
let corpusPromise:
  | Promise<{ movies: CorpusMovie[]; byId: Map<string, CorpusMovie> }>
  | undefined;

const benchmarkRoot = path.join(
  process.cwd(),
  "..",
  "data",
  "movielens",
  "benchmark",
);
const provisionalQueriesPath = path.join(
  benchmarkRoot,
  "queries.provisional.jsonl",
);
const provisionalQrelsPath = path.join(
  benchmarkRoot,
  "qrels",
  "provisional.tsv",
);
const draftQueriesPath = path.join(benchmarkRoot, "queries.draft.jsonl");
const draftQrelsPath = path.join(benchmarkRoot, "qrels", "draft.tsv");

async function loadCorpus() {
  const corpusPath = isPortfolioMode()
    ? (await getSearchRuntime()).corpusPath
    : await resolveRuntimeFile(RUNTIME_FILES.corpus, [
        path.join(process.cwd(), "..", "data", "movielens", "corpus.jsonl"),
        path.join(process.cwd(), "data", "movielens", "corpus.jsonl"),
      ]);
  corpusPromise ??= readFile(corpusPath, "utf8").then((contents) => {
    const movies = contents
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const document = JSON.parse(line);
        return {
          id: String(document._id),
          title: displayMovieLensTitle(document.title),
          year: document.metadata?.year ?? null,
          genres: document.metadata?.genres ?? [],
          averageRating: document.metadata?.average_rating ?? null,
          ratingCount: document.metadata?.rating_count ?? 0,
        };
      });
    return { movies, byId: new Map(movies.map((movie) => [movie.id, movie])) };
  });
  return corpusPromise;
}

async function exists(filePath: string) {
  return access(filePath)
    .then(() => true)
    .catch(() => false);
}

async function revisionFor(
  queryPath: string,
  qrelsPath: string,
  source: string,
) {
  const [queryStats, qrelStats] = await Promise.all([
    stat(queryPath),
    stat(qrelsPath),
  ]);
  return `${source}:${queryStats.size}:${queryStats.mtimeMs}:${qrelStats.size}:${qrelStats.mtimeMs}`;
}

async function loadBenchmark() {
  if (isPortfolioMode()) {
    const [queryPath, qrelsPath] = await Promise.all([
      resolveRuntimeFile(RUNTIME_FILES.queries, [
        path.join(benchmarkRoot, "queries.provisional.jsonl"),
      ]),
      resolveRuntimeFile(RUNTIME_FILES.qrels, [
        path.join(benchmarkRoot, "qrels", "provisional.tsv"),
      ]),
    ]);
    const [queryContents, qrelsContents, revision] = await Promise.all([
      readFile(queryPath, "utf8"),
      readFile(qrelsPath, "utf8"),
      revisionFor(queryPath, qrelsPath, "provisional"),
    ]);
    return {
      source: "provisional",
      revision,
      queries: parseBenchmarkQueries(queryContents),
      judgments: parseBenchmarkQrels(qrelsContents),
    };
  }
  const hasDraft = await Promise.all([
    exists(draftQueriesPath),
    exists(draftQrelsPath),
  ]).then((values) => values.every(Boolean));
  const source = hasDraft ? "draft" : "provisional";
  const queryPath = hasDraft ? draftQueriesPath : provisionalQueriesPath;
  const qrelsPath = hasDraft ? draftQrelsPath : provisionalQrelsPath;
  const [queryContents, qrelsContents, revision] = await Promise.all([
    readFile(queryPath, "utf8"),
    readFile(qrelsPath, "utf8"),
    revisionFor(queryPath, qrelsPath, source),
  ]);
  return {
    source,
    revision,
    queries: parseBenchmarkQueries(queryContents),
    judgments: parseBenchmarkQrels(qrelsContents),
  };
}

async function saveAtomically(filePath: string, contents: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, contents, "utf8");
  await rename(temporaryPath, filePath);
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const movieQuery = params.get("movieQuery")?.trim();
    const corpus = await loadCorpus();
    if (movieQuery !== undefined) {
      const normalized = exactTitleKey(movieQuery);
      const matches = corpus.movies
        .filter(
          (movie) =>
            !normalized ||
            movie.id === movieQuery ||
            exactTitleKey(movie.title).includes(normalized),
        )
        .sort(
          (left, right) =>
            Number(right.id === movieQuery) - Number(left.id === movieQuery) ||
            Number(exactTitleKey(right.title) === normalized) -
              Number(exactTitleKey(left.title) === normalized) ||
            Number(exactTitleKey(right.title).startsWith(normalized)) -
              Number(exactTitleKey(left.title).startsWith(normalized)) ||
            right.ratingCount - left.ratingCount ||
            left.title.localeCompare(right.title),
        )
        .slice(0, 12);
      return Response.json({ query: movieQuery, items: matches });
    }
    const benchmark = await loadBenchmark();
    const judgments = benchmark.judgments.map((judgment) => ({
      ...judgment,
      movie: corpus.byId.get(judgment.corpusId),
    }));
    return Response.json({
      ...benchmark,
      judgments,
      suggestedNextId: nextBenchmarkQueryId(benchmark.queries),
      categories: [
        ...new Set(benchmark.queries.map(({ category }) => category)),
      ].sort(),
    });
  } catch (error) {
    return internalErrorResponse(
      "benchmark-editor",
      error,
      "Benchmark editor failed",
    );
  }
}

export async function POST(request: Request) {
  if (isPortfolioMode()) return portfolioWriteResponse();
  if (!benchmarkWritesEnabled()) return benchmarkWriteDisabledResponse();
  try {
    const input = (await request.json()) as {
      expectedRevision?: unknown;
      queries?: unknown;
      judgments?: unknown;
    };
    if (typeof input.expectedRevision !== "string")
      return Response.json(
        { error: "expectedRevision must be provided" },
        { status: 400 },
      );
    const current = await loadBenchmark();
    if (current.revision !== input.expectedRevision)
      return Response.json(
        {
          error:
            "The benchmark changed since this page loaded. Refresh before saving again.",
        },
        { status: 409 },
      );
    const corpus = await loadCorpus();
    const draft = validateBenchmarkDraft(
      { queries: input.queries, judgments: input.judgments },
      new Set(corpus.byId.keys()),
    );
    const serialized = serializeBenchmarkDraft(draft);
    await saveAtomically(draftQueriesPath, serialized.queries);
    await saveAtomically(draftQrelsPath, serialized.qrels);
    const revision = await revisionFor(
      draftQueriesPath,
      draftQrelsPath,
      "draft",
    );
    return Response.json({
      saved: true,
      source: "draft",
      revision,
      savedAt: new Date().toISOString(),
      queryCount: draft.queries.length,
      judgmentCount: draft.judgments.length,
    });
  } catch (error) {
    return internalErrorResponse(
      "benchmark-editor-write",
      error,
      "Benchmark draft could not be saved",
      400,
    );
  }
}
