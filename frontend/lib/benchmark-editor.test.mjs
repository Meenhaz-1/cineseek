import assert from "node:assert/strict";
import test from "node:test";
import {
  nextBenchmarkQueryId,
  parseBenchmarkQrels,
  parseBenchmarkQueries,
  serializeBenchmarkDraft,
  validateBenchmarkDraft,
} from "./benchmark-editor.mjs";

test("parses and serializes the benchmark draft formats", () => {
  const queries = parseBenchmarkQueries(
    '{"_id":"q001","text":"Toy Story","metadata":{"category":"exact_title"}}\n',
  );
  const judgments = parseBenchmarkQrels(
    "query-id\tcorpus-id\tscore\nq001\t1\t3\n",
  );
  const draft = validateBenchmarkDraft({ queries, judgments }, new Set(["1"]));
  const serialized = serializeBenchmarkDraft(draft);
  assert.match(serialized.queries, /"label_status":"draft_manual"/);
  assert.equal(serialized.qrels, "query-id\tcorpus-id\tscore\nq001\t1\t3\n");
});

test("rejects duplicate queries, missing movies, and invalid grades", () => {
  const query = { id: "q081", text: "Tom Cruise", category: "person" };
  assert.throws(
    () =>
      validateBenchmarkDraft(
        { queries: [query, query], judgments: [] },
        new Set(),
      ),
    /Duplicate query/,
  );
  assert.throws(
    () =>
      validateBenchmarkDraft(
        {
          queries: [query],
          judgments: [{ queryId: "q081", corpusId: "999", score: 3 }],
        },
        new Set(),
      ),
    /unknown MovieLens/,
  );
  assert.throws(
    () =>
      validateBenchmarkDraft(
        {
          queries: [query],
          judgments: [{ queryId: "q081", corpusId: "1", score: 4 }],
        },
        new Set(["1"]),
      ),
    /score must be/,
  );
});

test("allocates the next zero-padded query ID", () => {
  assert.equal(nextBenchmarkQueryId([{ id: "q009" }, { id: "q080" }]), "q081");
});
