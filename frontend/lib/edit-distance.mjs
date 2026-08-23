import { exactTitleKey } from "./exact-title-index.mjs";

export function normalizeForEditDistance(value) {
  return exactTitleKey(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function levenshteinDistance(leftValue, rightValue) {
  const left = String(leftValue ?? "");
  const right = String(rightValue ?? "");
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }
    previous = current;
  }
  return previous[right.length];
}

export function scoreEditDistanceCandidate(normalizedQuery, record) {
  const queryText = normalizeForEditDistance(normalizedQuery);
  const titleText = normalizeForEditDistance(record.title);
  const editDistance = levenshteinDistance(queryText, titleText);
  const maximumLength = Math.max(queryText.length, titleText.length);
  return {
    ...record,
    queryText,
    titleText,
    editDistance,
    maximumLength,
    editSimilarity: maximumLength
      ? Number((1 - editDistance / maximumLength).toFixed(4))
      : 1,
  };
}

export function scoreEditDistanceCandidates(
  records,
  candidateIds,
  normalizedQuery,
  previewLimit = 12,
) {
  const candidates = candidateIds
    .map((id) => records.get(id))
    .filter(Boolean)
    .map((record) => scoreEditDistanceCandidate(normalizedQuery, record))
    .sort(
      (left, right) =>
        right.editSimilarity - left.editSimilarity ||
        left.editDistance - right.editDistance ||
        left.title.localeCompare(right.title),
    );
  return {
    method: "normalized_levenshtein",
    candidateCount: candidates.length,
    candidatesPreview: candidates.slice(0, previewLimit),
    truncated: candidates.length > previewLimit,
  };
}
