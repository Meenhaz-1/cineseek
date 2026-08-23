const TRAILING_ARTICLE = /^(.*),\s+(A|An|The)$/i;
const LEADING_ARTICLE = /^(a|an|the)\s+/i;

export function exactTitleKey(value) {
  return typeof value === "string"
    ? value
        .toLocaleLowerCase("en-US")
        .replace(/[_–—]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";
}

export function displayMovieLensTitle(title) {
  const match = title.match(TRAILING_ARTICLE);
  return match ? `${match[2]} ${match[1]}` : title;
}

function keysForTitle(title) {
  const displayTitle = displayMovieLensTitle(title);
  const keys = new Set([exactTitleKey(title), exactTitleKey(displayTitle)]);
  if (LEADING_ARTICLE.test(displayTitle))
    keys.add(exactTitleKey(displayTitle.replace(LEADING_ARTICLE, "")));
  keys.delete("");
  return { displayTitle, keys };
}

export function buildExactTitleIndex(documents) {
  const byKey = new Map();
  for (const document of documents) {
    const { displayTitle, keys } = keysForTitle(document.title);
    const record = {
      id: String(document._id),
      title: displayTitle,
      sourceTitle: document.title,
      year: document.metadata?.year ?? null,
    };
    for (const key of keys) {
      const matches = byKey.get(key) ?? [];
      matches.push(record);
      byKey.set(key, matches);
    }
  }
  return {
    byKey,
    titleCount: documents.length,
    keyCount: byKey.size,
    collisionCount: [...byKey.values()].filter((matches) => matches.length > 1)
      .length,
  };
}

export function lookupExactTitle(index, normalizedQuery) {
  const lookupKey = exactTitleKey(normalizedQuery);
  return { lookupKey, matches: index.byKey.get(lookupKey) ?? [] };
}
