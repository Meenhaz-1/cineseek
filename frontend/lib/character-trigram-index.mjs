import { displayMovieLensTitle, exactTitleKey } from "./exact-title-index.mjs";

export function characterTrigrams(value) {
  const normalized = exactTitleKey(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!normalized) return [];
  const padded = `^${normalized}$`;
  const trigrams = new Set();
  for (let index = 0; index <= padded.length - 3; index += 1) {
    trigrams.add(padded.slice(index, index + 3));
  }
  return [...trigrams];
}

export function buildCharacterTrigramIndex(documents) {
  const byTrigram = new Map();
  const records = new Map();
  let postingCount = 0;

  for (const document of documents) {
    const id = String(document._id);
    const record = {
      id,
      title: displayMovieLensTitle(document.title),
      year: document.metadata?.year ?? null,
    };
    const titleTrigrams = characterTrigrams(record.title);
    record.trigramCount = titleTrigrams.length;
    records.set(id, record);
    for (const trigram of titleTrigrams) {
      const postings = byTrigram.get(trigram) ?? [];
      postings.push(id);
      byTrigram.set(trigram, postings);
      postingCount += 1;
    }
  }

  return {
    byTrigram,
    records,
    titleCount: records.size,
    trigramCount: byTrigram.size,
    postingCount,
  };
}

export function scoreCharacterTrigramCandidate(queryTrigrams, record) {
  const titleTrigrams = characterTrigrams(record.title);
  const querySet = new Set(queryTrigrams);
  const matchedTrigrams = titleTrigrams.reduce(
    (count, trigram) => count + (querySet.has(trigram) ? 1 : 0),
    0,
  );
  const unionTrigramCount =
    queryTrigrams.length + titleTrigrams.length - matchedTrigrams;
  return {
    ...record,
    trigramCount: titleTrigrams.length,
    matchedTrigrams,
    queryTrigramCount: queryTrigrams.length,
    unionTrigramCount,
    jaccard: unionTrigramCount
      ? Number((matchedTrigrams / unionTrigramCount).toFixed(4))
      : 0,
    dice:
      queryTrigrams.length + titleTrigrams.length
        ? Number(
            (
              (2 * matchedTrigrams) /
              (queryTrigrams.length + titleTrigrams.length)
            ).toFixed(4),
          )
        : 0,
  };
}

export function scoreCharacterTrigramCandidates(
  index,
  candidateIds,
  normalizedQuery,
  previewLimit = 12,
) {
  const queryTrigrams = characterTrigrams(normalizedQuery);
  const candidates = candidateIds
    .map((id) => index.records.get(id))
    .filter(Boolean)
    .map((record) => scoreCharacterTrigramCandidate(queryTrigrams, record))
    .sort(
      (left, right) =>
        right.dice - left.dice ||
        right.jaccard - left.jaccard ||
        right.matchedTrigrams - left.matchedTrigrams ||
        left.title.localeCompare(right.title),
    );
  return {
    method: "dice",
    candidateCount: candidates.length,
    candidatesPreview: candidates.slice(0, previewLimit),
    truncated: candidates.length > previewLimit,
  };
}

export function lookupCharacterTrigrams(
  index,
  normalizedQuery,
  previewLimit = 12,
) {
  const trigrams = characterTrigrams(normalizedQuery);
  const minimumMatches = trigrams.length
    ? Math.max(2, Math.ceil(trigrams.length * 0.12))
    : 0;
  const matchedCounts = new Map();
  const postings = trigrams.map((trigram) => {
    const movieIds = index.byTrigram.get(trigram) ?? [];
    for (const id of movieIds)
      matchedCounts.set(id, (matchedCounts.get(id) ?? 0) + 1);
    return {
      trigram,
      documentFrequency: movieIds.length,
      movieIdsPreview: movieIds.slice(0, previewLimit),
      truncated: movieIds.length > previewLimit,
    };
  });
  const candidates = [...matchedCounts.entries()]
    .filter(([, matchedTrigrams]) => matchedTrigrams >= minimumMatches)
    .map(([id, matchedTrigrams]) => {
      const record = index.records.get(id);
      const unionTrigramCount =
        trigrams.length + record.trigramCount - matchedTrigrams;
      return {
        ...record,
        matchedTrigrams,
        queryTrigramCount: trigrams.length,
        unionTrigramCount,
        coverage: trigrams.length
          ? Number((matchedTrigrams / trigrams.length).toFixed(3))
          : 0,
        jaccard: unionTrigramCount
          ? Number((matchedTrigrams / unionTrigramCount).toFixed(4))
          : 0,
        dice:
          trigrams.length + record.trigramCount
            ? Number(
                (
                  (2 * matchedTrigrams) /
                  (trigrams.length + record.trigramCount)
                ).toFixed(4),
              )
            : 0,
      };
    })
    .sort(
      (left, right) =>
        right.matchedTrigrams - left.matchedTrigrams ||
        left.title.localeCompare(right.title),
    );

  return {
    trigrams,
    minimumMatches,
    postings,
    candidateIds: candidates.map(({ id }) => id),
    candidateCount: candidates.length,
    candidatesPreview: candidates.slice(0, previewLimit),
    truncated: candidates.length > previewLimit,
  };
}
