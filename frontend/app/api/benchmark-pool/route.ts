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
  buildGenreReviewPool,
  GENRE_QUERY_IDS,
  genrePublicationReadiness,
  judgmentStatus,
  reviewProgress,
  reviewRevision,
  serializeGenreReviewedV1,
  upsertAdjudication,
  upsertReview,
} from "../../../lib/genre-benchmark.mjs";
import type {
  GenreRecord,
  GenreReviewState,
} from "../../../lib/genre-benchmark.mjs";
import {
  parseBenchmarkQrels,
  parseBenchmarkQueries,
} from "../../../lib/benchmark-editor.mjs";
import { getSearchRuntime } from "../../../lib/search-runtime.mjs";
import { planQuery } from "../../../lib/query-planner.mjs";
import { runTitleSearch } from "../../../lib/title-search-pipeline.mjs";

export const runtime = "nodejs";

const benchmarkRoot = path.join(
  process.cwd(),
  "..",
  "data",
  "movielens",
  "benchmark",
);
const queriesPath = path.join(benchmarkRoot, "queries.provisional.jsonl");
const qrelsPath = path.join(benchmarkRoot, "qrels", "provisional.tsv");
const activePath = path.join(
  benchmarkRoot,
  "reviews",
  "genre-review-active.json",
);
const baselineRunPath = path.join(
  process.cwd(),
  "..",
  "outputs",
  "query-planner-migration",
  "unified-planner.run.jsonl",
);
const published = {
  queries: path.join(benchmarkRoot, "queries.genre-reviewed-v1.jsonl"),
  qrels: path.join(benchmarkRoot, "qrels", "genre-reviewed-v1.tsv"),
  pool: path.join(benchmarkRoot, "reviews", "genre-reviewed-v1.pool.json"),
  audit: path.join(benchmarkRoot, "reviews", "genre-reviewed-v1.audit.jsonl"),
};

async function exists(filePath: string) {
  return access(filePath)
    .then(() => true)
    .catch(() => false);
}

async function writeAtomically(filePath: string, contents: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, contents, "utf8");
  await rename(temporary, filePath);
}

function parseRun(contents: string) {
  return new Map(
    contents
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const row = JSON.parse(line);
        return [
          String(row.query_id),
          (row.results ?? []).map((result: { doc_id: unknown }) =>
            String(result.doc_id),
          ),
        ];
      }),
  );
}

async function sourceData() {
  const runtimeState = await getSearchRuntime();
  const [queryText, qrelsText, baselineText, corpusStats] = await Promise.all([
    readFile(queriesPath, "utf8"),
    readFile(qrelsPath, "utf8"),
    readFile(baselineRunPath, "utf8"),
    stat(runtimeState.corpusPath),
  ]);
  const queries = parseBenchmarkQueries(queryText);
  const qrels = parseBenchmarkQrels(qrelsText);
  const currentResultsByQuery = new Map<string, string[]>();
  for (const query of queries.filter(({ id }) =>
    GENRE_QUERY_IDS.includes(id),
  )) {
    const plan = planQuery(query.text, runtimeState.plannerIndexes);
    const result = runTitleSearch(runtimeState.searchIndexes, plan, {
      rankLimit: 10,
    });
    currentResultsByQuery.set(
      query.id,
      result.evaluation.rankedResults.map(({ id }: { id: string }) => id),
    );
  }
  return {
    queries,
    qrels,
    currentResultsByQuery,
    baselineResultsByQuery: parseRun(baselineText),
    records: runtimeState.searchIndexes.tokens.records,
    corpusKey: `${runtimeState.corpusPath}:${corpusStats.size}:${corpusStats.mtimeMs}`,
  };
}

async function loadState() {
  return JSON.parse(await readFile(activePath, "utf8")) as GenreReviewState;
}

function publicState(
  state: GenreReviewState,
  records: Map<string, GenreRecord>,
  currentResultsByQuery: Map<string, string[]>,
  reviewerId?: string | null,
) {
  return {
    version: state.version,
    status: state.status,
    createdAt: state.createdAt,
    revision: reviewRevision(state),
    queryIds: state.queryIds,
    progress: reviewProgress(state),
    publication: genrePublicationReadiness(
      state,
      currentResultsByQuery,
      records,
    ),
    pool: state.pool.map((query) => ({
      queryId: query.queryId,
      queryText: query.queryText,
      documents: query.documents.map((document) => {
        const status = judgmentStatus(state, query.queryId, document.docId);
        const ownReview = status.reviews.find(
          (review) => review.reviewerId === reviewerId,
        );
        return {
          ...records.get(document.docId),
          docId: document.docId,
          ownReview,
          reviewCount: status.reviews.length,
          conflict: status.conflict,
          adjudication: status.adjudication,
          finalGrade: status.finalGrade,
          nominations: ownReview ? document.nominations : undefined,
        };
      }),
    })),
  };
}

export async function GET(request: Request) {
  try {
    if (!(await exists(activePath)))
      return Response.json({ status: "not_built", queryIds: GENRE_QUERY_IDS });
    const [state, data] = await Promise.all([loadState(), sourceData()]);
    const reviewerId = new URL(request.url).searchParams.get("reviewerId");
    return Response.json(
      publicState(state, data.records, data.currentResultsByQuery, reviewerId),
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Genre review pool failed",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }
  try {
    if (body.action === "build") {
      if (await exists(activePath)) {
        const [state, data] = await Promise.all([loadState(), sourceData()]);
        return Response.json(
          publicState(
            state,
            data.records,
            data.currentResultsByQuery,
            typeof body.reviewerId === "string" ? body.reviewerId : undefined,
          ),
        );
      }
      const data = await sourceData();
      const state = buildGenreReviewPool(data);
      await writeAtomically(activePath, `${JSON.stringify(state, null, 2)}\n`);
      return Response.json(
        publicState(
          state,
          data.records,
          data.currentResultsByQuery,
          typeof body.reviewerId === "string" ? body.reviewerId : undefined,
        ),
        { status: 201 },
      );
    }

    if (!(await exists(activePath)))
      return Response.json(
        { error: "Build and freeze the review pool first." },
        { status: 409 },
      );
    const state = await loadState();
    const revision = reviewRevision(state);
    if (body.expectedRevision !== revision)
      return Response.json(
        { error: "The review pool changed. Reload before saving.", revision },
        { status: 409 },
      );
    let nextState;
    if (body.action === "review")
      nextState = upsertReview(state, {
        queryId: String(body.queryId ?? ""),
        docId: String(body.docId ?? ""),
        reviewerId: String(body.reviewerId ?? ""),
        grade: Number(body.grade),
        notes: String(body.notes ?? ""),
      });
    else if (body.action === "adjudicate")
      nextState = upsertAdjudication(state, {
        queryId: String(body.queryId ?? ""),
        docId: String(body.docId ?? ""),
        adjudicatorId: String(body.adjudicatorId ?? ""),
        finalGrade: Number(body.finalGrade),
        notes: String(body.notes ?? ""),
      });
    else if (body.action === "publish") {
      if (
        await Promise.all(Object.values(published).map(exists)).then((values) =>
          values.some(Boolean),
        )
      ) {
        return Response.json(
          {
            error:
              "genre-reviewed-v1 is immutable and has already been published.",
          },
          { status: 409 },
        );
      }
      const data = await sourceData();
      const publication = genrePublicationReadiness(
        state,
        data.currentResultsByQuery,
        data.records,
      );
      const blocked = publication.queries.find(({ ready }) => !ready);
      if (blocked?.missingFromPool.length) {
        const titles = blocked.missingFromPool
          .slice(0, 3)
          .map(({ title }) => title)
          .join(", ");
        return Response.json(
          {
            error: `Not ready to publish. ${blocked.queryId} is missing ${blocked.missingFromPool.length} movie${blocked.missingFromPool.length === 1 ? "" : "s"} from its current top 10: ${titles}. Next: build a new pool that includes them, then review those movies.`,
          },
          { status: 409 },
        );
      }
      if (blocked?.awaitingReviews.length) {
        const titles = blocked.awaitingReviews
          .slice(0, 3)
          .map(
            ({ title, reviewCount }) => `${title} (${reviewCount}/2 reviews)`,
          )
          .join(", ");
        return Response.json(
          {
            error: `Not ready to publish. All of ${blocked.queryId}'s current top 10 movies are already in the pool—no expansion is needed. ${blocked.awaitingReviews.length} still need a final grade, including ${titles}. Next: give each movie two reviews and resolve any disagreements.`,
          },
          { status: 409 },
        );
      }
      const files = serializeGenreReviewedV1(state, data.queries);
      await Promise.all([
        writeAtomically(published.queries, files.queries),
        writeAtomically(published.qrels, files.qrels),
        writeAtomically(published.pool, files.pool),
        writeAtomically(published.audit, files.audit),
      ]);
      nextState = {
        ...state,
        status: "published",
        publishedAt: new Date().toISOString(),
      };
      await writeAtomically(
        activePath,
        `${JSON.stringify(nextState, null, 2)}\n`,
      );
      return Response.json({
        published: true,
        version: "genre-reviewed-v1",
        files: published,
      });
    } else
      return Response.json(
        { error: "action must be build, review, adjudicate, or publish" },
        { status: 400 },
      );

    await writeAtomically(
      activePath,
      `${JSON.stringify(nextState, null, 2)}\n`,
    );
    const data = await sourceData();
    return Response.json(
      publicState(
        nextState,
        data.records,
        data.currentResultsByQuery,
        typeof body.reviewerId === "string" ? body.reviewerId : undefined,
      ),
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Genre review action failed",
      },
      { status: 400 },
    );
  }
}
