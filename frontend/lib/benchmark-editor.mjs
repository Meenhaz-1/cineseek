const QUERY_ID = /^q\d{3,}$/;
const CATEGORY = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

export function parseBenchmarkQueries(contents) {
  return contents
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const query = JSON.parse(line);
      return {
        id: String(query._id),
        text: String(query.text),
        category: String(query.metadata?.category ?? "uncategorized"),
      };
    });
}

export function parseBenchmarkQrels(contents) {
  return contents
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const [queryId, corpusId, rawScore] = line.split("\t");
      return { queryId, corpusId, score: Number(rawScore) };
    });
}

export function validateBenchmarkDraft(input, corpusIds) {
  if (
    !input ||
    !Array.isArray(input.queries) ||
    !Array.isArray(input.judgments)
  )
    throw new Error("queries and judgments must be arrays");
  if (!input.queries.length || input.queries.length > 500)
    throw new Error("A draft must contain from 1 to 500 queries");
  const queryIds = new Set();
  const queries = input.queries.map((query, index) => {
    const id = String(query?.id ?? "").trim();
    const text = String(query?.text ?? "").trim();
    const category = String(query?.category ?? "")
      .trim()
      .toLowerCase();
    if (!QUERY_ID.test(id))
      throw new Error(`Query ${index + 1} must use an ID such as q081`);
    if (queryIds.has(id)) throw new Error(`Duplicate query ID: ${id}`);
    if (!text || text.length > 300)
      throw new Error(`${id} text must contain from 1 to 300 characters`);
    if (!CATEGORY.test(category))
      throw new Error(
        `${id} category must use lowercase words separated by underscores`,
      );
    queryIds.add(id);
    return { id, text, category };
  });
  const judgmentKeys = new Set();
  const judgments = input.judgments.map((judgment, index) => {
    const queryId = String(judgment?.queryId ?? "").trim();
    const corpusId = String(judgment?.corpusId ?? "").trim();
    const score = Number(judgment?.score);
    if (!queryIds.has(queryId))
      throw new Error(
        `Judgment ${index + 1} references unknown query ${queryId}`,
      );
    if (!corpusIds.has(corpusId))
      throw new Error(
        `Judgment ${index + 1} references unknown MovieLens ID ${corpusId}`,
      );
    if (!Number.isInteger(score) || score < 0 || score > 3)
      throw new Error(`Judgment ${index + 1} score must be 0, 1, 2, or 3`);
    const key = `${queryId}:${corpusId}`;
    if (judgmentKeys.has(key))
      throw new Error(
        `Duplicate judgment for ${queryId} and MovieLens ${corpusId}`,
      );
    judgmentKeys.add(key);
    return { queryId, corpusId, score };
  });
  queries.sort((left, right) =>
    left.id.localeCompare(right.id, undefined, { numeric: true }),
  );
  judgments.sort(
    (left, right) =>
      left.queryId.localeCompare(right.queryId, undefined, { numeric: true }) ||
      left.corpusId.localeCompare(right.corpusId, undefined, { numeric: true }),
  );
  return { queries, judgments };
}

export function serializeBenchmarkDraft(draft) {
  const queries = `${draft.queries.map((query) => JSON.stringify({ _id: query.id, text: query.text, metadata: { category: query.category, label_status: "draft_manual" } })).join("\n")}\n`;
  const qrels = `query-id\tcorpus-id\tscore\n${draft.judgments.map(({ queryId, corpusId, score }) => `${queryId}\t${corpusId}\t${score}`).join("\n")}\n`;
  return { queries, qrels };
}

export function nextBenchmarkQueryId(queries) {
  const largest = queries.reduce(
    (maximum, { id }) => Math.max(maximum, Number(id.slice(1)) || 0),
    0,
  );
  return `q${String(largest + 1).padStart(3, "0")}`;
}
