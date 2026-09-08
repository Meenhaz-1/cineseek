import { tokens, trigrams, editDistance, graphemes } from "./text.mjs";

// A bounded lexical retrieval stage supplies context, not a correction decision.
// It can later be compared with multilingual embedding retrieval on the same evals.
export function retrieveQueryContext(catalog, query, limit = 5) {
  const words = tokens(query).slice(0, 32);
  const windows = [];
  for (let size = 1; size <= Math.min(5, words.length); size++) {
    for (let start = 0; start + size <= words.length; start++) {
      const key = words.slice(start, start + size).join(" ");
      windows.push({ key, size, grams: trigrams(key) });
    }
  }
  const queryGrams = trigrams(query);
  const found = [];
  for (const [type, index] of [
    ["movie", catalog.movies],
    ["person", catalog.people],
  ]) {
    const nominated = new Map();
    const add = (id, score) =>
      nominated.set(id, (nominated.get(id) ?? 0) + score);
    for (const window of windows)
      for (const id of index.exact.get(window.key) ?? [])
        add(id, 100 + window.size);
    for (const word of new Set(words))
      for (const id of index.byToken.get(word) ?? []) add(id, 2);
    for (const gram of queryGrams)
      for (const id of index.byGram.get(gram) ?? []) add(id, 1);
    const shortlist = [...nominated]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 30);
    for (const [id] of shortlist) {
      const entity = index.entities.get(id);
      let best;
      const exactAliases = entity.aliases.filter((a) =>
        windows.some((w) => w.key === a.key),
      );
      for (const alias of exactAliases.length
        ? exactAliases
        : entity.aliases.slice(0, 12)) {
        const size = tokens(alias.key).length;
        for (const window of windows) {
          if (Math.abs(size - window.size) > 1) continue;
          let score = 0;
          if (alias.key === window.key) score = 1;
          else if (window.key.length >= 4) {
            const overlap = [...window.grams].filter((gram) =>
              alias.grams.has(gram),
            ).length;
            const dice =
              (2 * overlap) / (window.grams.size + alias.grams.size || 1);
            if (dice < 0.45) continue;
            const similarity =
              1 -
              editDistance(alias.key, window.key) /
                Math.max(
                  graphemes(alias.key).length,
                  graphemes(window.key).length,
                );
            if (similarity >= 0.65) score = similarity * 0.85;
          }
          if (score && (!best || score > best.score))
            best = {
              type,
              name: entity.name,
              alias: alias.text,
              source: alias.source,
              script: alias.script,
              matchedText: window.key,
              score,
              ...(type === "movie"
                ? { year: entity.year }
                : { roles: entity.roles }),
            };
        }
      }
      if (best) found.push({ ...best, id });
    }
  }
  return found
    .sort(
      (a, b) =>
        b.score - a.score ||
        tokens(b.matchedText).length - tokens(a.matchedText).length ||
        a.id.localeCompare(b.id),
    )
    .slice(0, limit)
    .map(({ id, ...match }) => {
      void id;
      return match;
    });
}
