import { displayMovieLensTitle } from "../exact-title-index.mjs";
import {
  textKey,
  tokens,
  trigrams,
  graphemes,
  editDistance,
  scriptOf,
} from "./text.mjs";

// Reviewed spellings only attach to an existing matching catalogue name, never create entities.
const REVIEWED = {
  "dil se": ["दिल से"],
  "shah rukh khan": [
    "शाहरुख खान",
    "शाहरुख",
    "शाह रुख खान",
    "shahrukh khan",
    "shahrukh",
    "shah rukh",
  ],
  "shahrukh khan": [
    "शाहरुख खान",
    "शाहरुख",
    "शाह रुख खान",
    "shah rukh khan",
    "shahrukh",
  ],
};
function aliasesFor(name, supplied = []) {
  const canonical = name.replace(/\s*\(\d{4}\)\s*$/, "");
  const aliases = [
    { text: name, source: "catalogue", language: "und" },
    { text: canonical, source: "catalogue", language: "und" },
    ...(REVIEWED[textKey(canonical)] ?? []).map((text) => ({
      text,
      source: "reviewed",
      language: "hi",
    })),
    ...supplied,
  ];
  const seen = new Set();
  return aliases
    .filter(
      (alias) =>
        alias &&
        typeof alias.text === "string" &&
        typeof alias.source === "string",
    )
    .map((alias) => ({
      ...alias,
      language: alias.language ?? "und",
      script: alias.script ?? scriptOf(alias.text),
      key: textKey(alias.text),
    }))
    .filter((alias) => {
      if (!alias.key || seen.has(alias.key)) return false;
      seen.add(alias.key);
      return true;
    });
}
function indexEntities(entities) {
  const exact = new Map(),
    byToken = new Map(),
    byGram = new Map();
  const add = (map, key, id) => {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(id);
  };
  for (const entity of entities.values())
    for (const alias of entity.aliases) {
      alias.tokens = new Set(tokens(alias.key));
      alias.grams = trigrams(alias.key);
      add(exact, alias.key, entity.id);
      for (const token of alias.tokens) add(byToken, token, entity.id);
      for (const gram of alias.grams) add(byGram, gram, entity.id);
    }
  return { entities, exact, byToken, byGram };
}
export function buildAliasCatalog(documents, registry, supplemental = {}) {
  const movies = new Map(
    documents.map((doc) => {
      const id = String(doc._id),
        name = displayMovieLensTitle(doc.title);
      return [
        id,
        {
          id,
          name,
          year: doc.metadata?.year ?? null,
          aliases: aliasesFor(name, [
            ...(doc.aliases ?? []),
            ...(doc.metadata?.title_aliases ?? []),
            ...(supplemental.movies?.[id] ?? []),
            ...(doc.original_title
              ? [
                  {
                    text: doc.original_title,
                    source: "catalogue",
                    language: doc.original_language ?? "und",
                  },
                ]
              : []),
          ]),
        },
      ];
    }),
  );
  const people = new Map(
    (registry.entities?.people ?? []).map((person) => [
      String(person.id),
      {
        ...person,
        id: String(person.id),
        aliases: aliasesFor(person.name, [
          ...(person.aliases ?? []),
          ...(supplemental.people?.[person.id] ?? []),
        ]),
      },
    ]),
  );
  return {
    movies: indexEntities(movies),
    people: indexEntities(people),
    coverage: {
      movies: movies.size,
      people: people.size,
      moviesWithHindi: [...movies.values()].filter((e) =>
        e.aliases.some((a) => a.script === "Devanagari"),
      ).length,
      peopleWithHindi: [...people.values()].filter((e) =>
        e.aliases.some((a) => a.script === "Devanagari"),
      ).length,
    },
  };
}
function publicAlias(alias) {
  const { text, source, language, script } = alias;
  return { text, source, language, script };
}
export function matchAliases(
  index,
  query,
  { fuzzy = true, prefix = false } = {},
) {
  const key = textKey(query);
  if (!key) return [];
  const exactIds = index.exact.get(key);
  let ids = new Set(exactIds ?? []);
  if (!exactIds && fuzzy) {
    for (const token of tokens(key))
      for (const id of index.byToken.get(token) ?? []) ids.add(id);
    for (const gram of trigrams(key))
      for (const id of index.byGram.get(gram) ?? []) ids.add(id);
  }
  if (prefix)
    for (const entity of index.entities.values())
      if (entity.aliases.some((a) => a.key.startsWith(key))) ids.add(entity.id);
  const queryTokens = tokens(key),
    queryGrams = trigrams(key);
  const results = [];
  for (const id of ids) {
    const entity = index.entities.get(id);
    let best;
    for (const alias of entity.aliases) {
      let score =
        alias.key === key ? 1 : prefix && alias.key.startsWith(key) ? 0.9 : 0;
      if (!score && fuzzy) {
        const coverage =
          queryTokens.filter((t) => alias.tokens.has(t)).length /
          queryTokens.length;
        const overlap = [...queryGrams].filter((g) =>
          alias.grams.has(g),
        ).length;
        const dice = (2 * overlap) / (queryGrams.size + alias.grams.size || 1);
        if (coverage === 1) score = 0.8;
        else if (dice >= 0.3 && graphemes(key).length >= 4) {
          const similarity =
            1 -
            editDistance(key, alias.key) /
              Math.max(graphemes(key).length, graphemes(alias.key).length);
          if (similarity >= 0.65) score = 0.65 * similarity;
        }
      }
      if (score && (!best || score > best.score))
        best = { id, name: entity.name, score, alias: publicAlias(alias) };
    }
    if (best) results.push(best);
  }
  return results.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
export function suggestAliases(catalog, query, limit = 8) {
  if (graphemes(textKey(query)).length < 2) return [];
  return [
    ...matchAliases(catalog.movies, query, { fuzzy: false, prefix: true }).map(
      (m) => ({ ...m, type: "Movie", query: m.alias.text }),
    ),
    ...matchAliases(catalog.people, query, { fuzzy: false, prefix: true }).map(
      (m) => ({ ...m, type: "Person", query: m.alias.text }),
    ),
  ]
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}
