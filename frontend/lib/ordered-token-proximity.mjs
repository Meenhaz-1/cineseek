import { exactTitleKey } from "./exact-title-index.mjs";
import { queryTitleTokens } from "./title-token-index.mjs";

export function orderedTitleTokens(value) {
  return exactTitleKey(value).match(/[a-z0-9]+/g) ?? [];
}

function compareAlignments(left, right) {
  if (left.length !== right.length) return left.length - right.length;
  if (!left.length) return 0;
  const leftSpan = left.at(-1).titleIndex - left[0].titleIndex + 1;
  const rightSpan = right.at(-1).titleIndex - right[0].titleIndex + 1;
  if (leftSpan !== rightSpan) return rightSpan - leftSpan;
  if (left[0].queryIndex !== right[0].queryIndex)
    return right[0].queryIndex - left[0].queryIndex;
  return right[0].titleIndex - left[0].titleIndex;
}

export function alignOrderedTokens(queryTokens, candidateTokens) {
  const pathsByMatch = [];
  let best = [];

  for (let queryIndex = 0; queryIndex < queryTokens.length; queryIndex += 1) {
    for (
      let titleIndex = 0;
      titleIndex < candidateTokens.length;
      titleIndex += 1
    ) {
      if (queryTokens[queryIndex] !== candidateTokens[titleIndex]) continue;
      let predecessor = [];
      for (const path of pathsByMatch) {
        const last = path.at(-1);
        if (last.queryIndex >= queryIndex || last.titleIndex >= titleIndex)
          continue;
        if (
          path.length > predecessor.length ||
          (path.length === predecessor.length &&
            path[0].titleIndex > (predecessor[0]?.titleIndex ?? -1))
        )
          predecessor = path;
      }
      const path = [
        ...predecessor,
        { token: queryTokens[queryIndex], queryIndex, titleIndex },
      ];
      pathsByMatch.push(path);
      if (compareAlignments(path, best) > 0) best = path;
    }
  }

  return best;
}

export function scoreOrderedTokenProximityCandidate(normalizedQuery, record) {
  const queryTokens = queryTitleTokens(normalizedQuery).tokens;
  const candidateTokens = orderedTitleTokens(record.title);
  const alignment = alignOrderedTokens(queryTokens, candidateTokens);
  const matchedQueryIndexes = new Set(
    alignment.map(({ queryIndex }) => queryIndex),
  );
  const matchedTitleIndexes = alignment.map(({ titleIndex }) => titleIndex);
  const matchedTokenCount = alignment.length;
  const queryTokenCount = queryTokens.length;
  const candidateTokenSet = new Set(candidateTokens);
  const presentTokenCount = queryTokens.filter((token) =>
    candidateTokenSet.has(token),
  ).length;
  const tokenCoverage = queryTokenCount
    ? Number((presentTokenCount / queryTokenCount).toFixed(4))
    : 0;
  const matchSpan = matchedTokenCount
    ? matchedTitleIndexes.at(-1) - matchedTitleIndexes[0] + 1
    : 0;
  const gapCount = matchedTokenCount ? matchSpan - matchedTokenCount : 0;
  const orderedCoverage = queryTokenCount
    ? Number((matchedTokenCount / queryTokenCount).toFixed(4))
    : 0;
  const proximity = matchSpan
    ? Number((matchedTokenCount / matchSpan).toFixed(4))
    : 0;
  const phraseMatch =
    queryTokenCount > 0 &&
    matchedTokenCount === queryTokenCount &&
    matchSpan === queryTokenCount;

  return {
    ...record,
    queryTokens,
    candidateTokens,
    alignment,
    matchedTokens: alignment.map(({ token }) => token),
    missingTokens: queryTokens.filter(
      (_, index) => !matchedQueryIndexes.has(index),
    ),
    matchedTitleIndexes,
    matchedTokenCount,
    queryTokenCount,
    tokenCoverage,
    orderedCoverage,
    matchSpan,
    gapCount,
    proximity,
    phraseMatch,
  };
}

export function scoreOrderedTokenProximityCandidates(
  records,
  candidateIds,
  normalizedQuery,
  previewLimit = 12,
) {
  const candidates = candidateIds
    .map((id) => records.get(id))
    .filter(Boolean)
    .map((record) =>
      scoreOrderedTokenProximityCandidate(normalizedQuery, record),
    )
    .sort(
      (left, right) =>
        right.orderedCoverage - left.orderedCoverage ||
        right.tokenCoverage - left.tokenCoverage ||
        Number(right.phraseMatch) - Number(left.phraseMatch) ||
        right.proximity - left.proximity ||
        left.gapCount - right.gapCount ||
        left.candidateTokens.length - right.candidateTokens.length ||
        left.title.localeCompare(right.title),
    );

  return {
    method: "ordered_token_proximity",
    candidateCount: candidates.length,
    queryTokens: queryTitleTokens(normalizedQuery).tokens,
    candidatesPreview: candidates.slice(0, previewLimit),
    truncated: candidates.length > previewLimit,
  };
}
