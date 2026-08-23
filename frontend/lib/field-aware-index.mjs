import { exactTitleKey } from "./exact-title-index.mjs";
import { queryTitleTokens, titleTokens } from "./title-token-index.mjs";

export const SEARCHABLE_FIELD_WEIGHTS = {
  cast: 1,
  directors: 0.95,
  genres: 0.75,
  tags: 0.6,
  overview: 0.3,
};

const FIELD_LABELS = {
  cast: "Cast",
  directors: "Director",
  genres: "Genre",
  tags: "Tag",
  overview: "Description",
};

function fieldValues(record, field) {
  if (field === "overview") return record.overview ? [record.overview] : [];
  return Array.isArray(record[field]) ? record[field] : [];
}

function addPosting(index, token, id) {
  const postings = index.get(token) ?? [];
  if (postings.at(-1) !== id) postings.push(id);
  index.set(token, postings);
}

export function buildFieldAwareIndex(records) {
  const fields = Object.fromEntries(
    Object.keys(SEARCHABLE_FIELD_WEIGHTS).map((field) => [field, new Map()]),
  );
  const preparedById = new Map();
  let postingCount = 0;
  for (const record of records.values()) {
    const preparedFields = {};
    for (const field of Object.keys(fields)) {
      const values = fieldValues(record, field).map((source) => ({
        source,
        normalized: exactTitleKey(source),
      }));
      const tokens = new Set(
        values.flatMap(({ normalized }) => titleTokens(normalized)),
      );
      preparedFields[field] = { values, tokens };
      for (const token of tokens) {
        addPosting(fields[field], token, record.id);
        postingCount += 1;
      }
    }
    preparedById.set(record.id, preparedFields);
  }
  return { fields, records, preparedById, postingCount };
}

function scoreField(preparedField, field, queryText, queryTokens) {
  if (!preparedField?.values.length || !queryTokens.length) return undefined;
  const normalizedQuery = exactTitleKey(queryText);
  const matchedTokens = queryTokens.filter((token) =>
    preparedField.tokens.has(token),
  );
  const coverage = matchedTokens.length / queryTokens.length;
  const exactValue = preparedField.values.find(
    ({ normalized }) => normalized === normalizedQuery,
  );
  const entityInQuery =
    field === "cast" || field === "directors"
      ? preparedField.values.find(
          ({ normalized }) =>
            titleTokens(normalized).length > 1 &&
            normalizedQuery.includes(normalized),
        )
      : undefined;
  const phraseValue =
    exactValue ??
    preparedField.values.find(({ normalized }) =>
      normalized.includes(normalizedQuery),
    );
  if (!matchedTokens.length) return undefined;
  if (
    field === "overview" &&
    queryTokens.length > 1 &&
    matchedTokens.length < 2
  )
    return undefined;
  const exactEntityMatch = Boolean(exactValue || entityInQuery);
  if (
    (field === "cast" || field === "directors") &&
    queryTokens.length > 1 &&
    !exactEntityMatch
  )
    return undefined;
  const matchType = exactEntityMatch
    ? "exact_value"
    : phraseValue
      ? "phrase"
      : "token_coverage";
  const rawScore = exactEntityMatch ? 1 : phraseValue ? 0.9 : coverage;
  const score = Number((rawScore * SEARCHABLE_FIELD_WEIGHTS[field]).toFixed(6));
  const value =
    (exactValue ?? entityInQuery ?? phraseValue)?.source ??
    matchedTokens.join(" ");
  return {
    field,
    label: FIELD_LABELS[field],
    value,
    matchType,
    matchedTokens,
    coverage: Number(coverage.toFixed(6)),
    score,
    exactEntityMatch,
  };
}

export function lookupFieldAware(
  index,
  queryText,
  previewLimit = 12,
  options = {},
) {
  const { tokens, ignoredTokens } = queryTitleTokens(queryText);
  const allowedFields = options.allowedFields?.length
    ? new Set(options.allowedFields)
    : null;
  const nominatedIds = new Set();
  const postings = [];
  for (const [field, byToken] of Object.entries(index.fields)) {
    if (allowedFields && !allowedFields.has(field)) continue;
    const fieldNominationCounts = new Map();
    for (const token of tokens) {
      const movieIds = byToken.get(token) ?? [];
      movieIds.forEach((id) =>
        fieldNominationCounts.set(id, (fieldNominationCounts.get(id) ?? 0) + 1),
      );
      postings.push({ field, token, documentFrequency: movieIds.length });
    }
    const minimumFieldMatches =
      field === "overview" && tokens.length > 1 ? 2 : 1;
    for (const [id, matchCount] of fieldNominationCounts) {
      if (matchCount >= minimumFieldMatches) nominatedIds.add(id);
    }
  }

  const matchesById = new Map();
  for (const id of nominatedIds) {
    const record = index.records.get(id);
    const preparedFields = index.preparedById.get(id);
    if (!record || !preparedFields) continue;
    const matches = Object.keys(index.fields)
      .filter((field) => !allowedFields || allowedFields.has(field))
      .map((field) =>
        scoreField(preparedFields[field], field, queryText, tokens),
      )
      .filter(Boolean)
      .sort(
        (left, right) =>
          right.exactEntityMatch - left.exactEntityMatch ||
          right.score - left.score,
      );
    if (!matches.length) continue;
    matchesById.set(id, {
      score: matches[0].score,
      exactEntityMatch: matches.some(
        ({ exactEntityMatch }) => exactEntityMatch,
      ),
      bestMatch: matches[0],
      matches,
    });
  }

  const candidateIds = [...matchesById.keys()];
  return {
    tokens,
    ignoredTokens,
    postings,
    candidateIds,
    candidateCount: candidateIds.length,
    matchesById,
    candidatesPreview: candidateIds.slice(0, previewLimit).map((id) => ({
      ...index.records.get(id),
      fieldMatch: matchesById.get(id),
    })),
    truncated: candidateIds.length > previewLimit,
  };
}
