import { retrieveQueryContext } from "./grounding.mjs";
import { planQuery } from "../query-planner.mjs";
import { normalizeText, textKey } from "./text.mjs";
import { matchAliases } from "./catalog.mjs";
import { conforms, PROMPT_VERSION } from "./model.mjs";
import { localGenreRequest, GENRE_TERMS_VERSION } from "./genre-terms.mjs";

const CACHE_LIMIT = 256;
const elapsed = (start) => Number((performance.now() - start).toFixed(3));
function emptyInterpretation(query) {
  return {
    title: null,
    people: [],
    genres: [],
    genreMode: "any",
    filters: {
      yearMin: null,
      yearMax: null,
      ratingMin: null,
      ratingCountMin: null,
    },
    sort: null,
    unresolved: [],
    evidence: [{ text: query, meaning: "Literal catalogue lookup" }],
  };
}
function validInterpretation(value, query, genres) {
  if (!conforms(value) || value.genres.some((g) => !genres.includes(g)))
    return false;
  if (
    value.filters.yearMin !== null &&
    value.filters.yearMax !== null &&
    value.filters.yearMin > value.filters.yearMax
  )
    return false;
  const spans = [
    ...value.evidence.map((e) => e.text),
    ...value.people.map((p) => p.text),
    ...(value.title ? [value.title.text] : []),
    ...value.unresolved,
  ];
  if (spans.some((span) => !span.trim() || !query.includes(span))) return false;
  // Require source coverage: a model cannot omit trailing constraints without evidence.
  const covered = Array(query.length).fill(false);
  for (const span of value.evidence.map((e) => e.text)) {
    let start = query.indexOf(span);
    while (start !== -1) {
      covered.fill(true, start, start + span.length);
      start = query.indexOf(span, start + 1);
    }
  }
  return !textKey(
    query
      .split("")
      .map((_, i) => (covered[i] ? " " : query[i]))
      .join(""),
  );
}
function resolveMention(index, mention, fuzzy) {
  // Prefer catalogue evidence for the original text over model-supplied alternatives.
  const original = matchAliases(index, mention.text, { fuzzy: false });
  if (original.length) return original;
  const matches = new Map();
  for (const text of [mention.text, ...mention.alternatives])
    for (const match of matchAliases(index, text, { fuzzy })) {
      if (!matches.has(match.id) || matches.get(match.id).score < match.score)
        matches.set(match.id, match);
    }
  return [...matches.values()];
}
export function compileInterpretation(query, value, runtime, evidence = {}) {
  const { catalog, plannerIndexes } = runtime;
  const plan = structuredClone(
    planQuery("", plannerIndexes, { autocorrect: false }),
  );
  const titleMatches = value.title
    ? resolveMention(catalog.movies, value.title, true)
    : [];
  const personGroups = value.people.map((mention) => {
    const matches = resolveMention(catalog.people, mention, false).filter(
      (m) =>
        !mention.role ||
        catalog.people.entities.get(m.id).roles.includes(mention.role),
    );
    return { text: mention.text, role: mention.role, matches };
  });
  const unresolved = [...value.unresolved];
  if (value.title && !titleMatches.length)
    unresolved.push(`Title not found: ${value.title.text}`);
  for (const group of personGroups)
    if (group.matches.length !== 1)
      unresolved.push(
        `${group.matches.length ? "Ambiguous person" : "Person not found"}: ${group.text}`,
      );
  const people = personGroups
    .filter((g) => g.matches.length === 1)
    .map((group) => {
      const match = group.matches[0],
        person = catalog.people.entities.get(match.id);
      return {
        id: person.id,
        name: person.name,
        roles: person.roles,
        ...(group.role ? { role: group.role } : {}),
        matchedText: group.text,
        confidence: 1,
      };
    });
  const filters = {
    genres: value.genres,
    genreMode: value.genreMode,
    ...Object.fromEntries(
      Object.entries(value.filters).filter(([, v]) => v !== null),
    ),
  };
  const hasFilters =
    value.genres.length || Object.values(value.filters).some((v) => v !== null);
  const exact =
    value.title &&
    titleMatches.length &&
    titleMatches.every((m) => m.score === 1) &&
    !hasFilters &&
    !people.length;
  const recognized = Boolean(
    value.title || value.people.length || hasFilters || value.sort,
  );
  Object.assign(plan, {
    rawQuery: query,
    normalizedQuery: normalizeText(query),
    effectiveQuery: normalizeText(query),
    intent: exact
      ? "exact_title"
      : people.length
        ? "person_discovery"
        : hasFilters
          ? "filtered_discovery"
          : value.sort
            ? "sorted_discovery"
            : "general_search",
    filters,
    sort: value.sort ? { ...value.sort, source: query } : null,
    entities: { people, personCandidates: [], genres: value.genres },
    unavailableFilters: unresolved,
    routes: {
      ...plan.routes,
      strategy: exact ? "exact_title" : hasFilters ? "structured" : "dual",
      titleQuery: value.title?.text ?? "",
      fieldQuery: people.map((p) => p.name).join(" "),
      titlePriority: exact ? "exact" : value.title ? "primary" : "none",
      structuredGenreRanking: Boolean(
        value.genres.length && !value.title && !value.people.length,
      ),
      concepts: value.genres,
    },
    interpretation: {
      ...evidence,
      originalSpans: value.evidence,
      matchedAliases: [
        ...titleMatches,
        ...personGroups.flatMap((g) => g.matches),
      ],
      unresolved,
    },
    multilingual: {
      titleMatches,
      personGroups,
      blocked: unresolved.length > 0 || !recognized,
    },
    trace: value.evidence.map((e) => `${e.text} → ${e.meaning}`),
    explanations: {
      normalization:
        "NFC Unicode normalization; Devanagari digits normalized for filters.",
      routing:
        "Catalogue aliases resolve to existing IDs; supported constraints are applied before ranking.",
      intent: unresolved.length
        ? "Some parts need clarification before results can be shown."
        : "Interpreted Hindi, Hinglish or English search.",
    },
    planner: { ...plan.planner, id: "multilingual", version: PROMPT_VERSION },
  });
  return plan;
}
function deterministicFallback(query, runtime, reason) {
  const value = emptyInterpretation(query);
  const people = matchAliases(runtime.catalog.people, query, { fuzzy: false });
  if (people.length)
    value.people = [{ text: query, alternatives: [], role: null }];
  else if (/\p{Script=Devanagari}/u.test(query)) {
    // Never let the legacy ASCII parser erase Hindi constraints.
    const matches = matchAliases(runtime.catalog.movies, query);
    if (matches.length) value.title = { text: query, alternatives: [] };
    else value.unresolved = [query];
  } else {
    const legacy = planQuery(normalizeText(query), runtime.plannerIndexes, {
      autocorrect: false,
    });
    value.genres = legacy.filters.genres;
    value.genreMode = legacy.filters.genreMode;
    for (const key of Object.keys(value.filters))
      value.filters[key] = legacy.filters[key] ?? null;
    value.sort = legacy.sort
      ? { field: legacy.sort.field, direction: legacy.sort.direction }
      : null;
    value.people = legacy.entities.people.map((p) => ({
      text: p.matchedText,
      alternatives: [p.name],
      role: p.role ?? null,
    }));
    value.unresolved = [...legacy.unavailableFilters];
    const titleText = legacy.routes.titleQuery;
    if (titleText) {
      let residual = textKey(titleText);
      for (const person of value.people)
        residual = residual
          .replace(textKey(person.text), "")
          .replace(textKey(person.alternatives[0]), "");
      residual = residual
        .replace(
          /\b(?:movies?|films?|starring|featuring|directed|by|with|actor|director)\b/g,
          "",
        )
        .trim();
      if (residual) value.title = { text: residual, alternatives: [] };
    }
    if (
      !value.title &&
      !value.people.length &&
      !value.genres.length &&
      !value.sort &&
      Object.values(value.filters).every((v) => v === null)
    )
      value.title = { text: query, alternatives: [] };
  }
  value.evidence = [
    {
      text: query,
      meaning:
        "Limited deterministic fallback; model interpretation unavailable",
    },
  ];
  return compileInterpretation(query, value, runtime, {
    mode: "fallback",
    fallbackReason: reason,
    cacheHit: false,
  });
}
export async function planHindiQuery(query, runtime, options = {}) {
  const started = performance.now();
  if (typeof query !== "string" || !query.trim() || query.length > 300)
    throw new Error("query must contain 1-300 characters");
  const finish = (plan) => {
    plan.planner.planningMs = elapsed(started);
    return plan;
  };
  const exact = matchAliases(runtime.catalog.movies, query, { fuzzy: false });
  if (exact.length) {
    const value = emptyInterpretation(query);
    value.title = { text: query, alternatives: [] };
    return finish(
      compileInterpretation(query, value, runtime, {
        mode: "exact_alias",
        cacheHit: false,
      }),
    );
  }
  const localGenres = localGenreRequest(query, runtime.plannerIndexes.genres);
  if (localGenres) {
    const value = { ...emptyInterpretation(query), ...localGenres };
    value.evidence = [
      {
        text: query,
        meaning: `Local genre translation: ${value.genres.join(value.genreMode === "all" ? " AND " : " OR ")}`,
      },
    ];
    return finish(
      compileInterpretation(query, value, runtime, {
        mode: "local_genre",
        dictionaryVersion: GENRE_TERMS_VERSION,
        cacheHit: false,
        usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
      }),
    );
  }
  if (!options.interpret)
    return finish(
      deterministicFallback(
        query,
        runtime,
        options.disabledReason ?? "model_disabled",
      ),
    );
  const cache = (runtime.interpretationCache ??= new Map());
  // Raw text participates as well: cached source spans must still quote the current input.
  const key = JSON.stringify([
    normalizeText(query),
    query,
    options.model,
    PROMPT_VERSION,
    runtime.catalogueVersion,
  ]);
  if (cache.has(key)) {
    const cached = structuredClone(cache.get(key));
    return finish(
      compileInterpretation(query, cached.interpretation, runtime, {
        mode: "model",
        model: options.model,
        cacheHit: true,
        usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
        catalogueContext: cached.catalogueContext,
      }),
    );
  }
  const catalogueContext = retrieveQueryContext(runtime.catalog, query);
  const controller = new AbortController();
  let timer;
  try {
    const output = await Promise.race([
      options.interpret(query, {
        signal: controller.signal,
        genres: runtime.plannerIndexes.genres,
        catalogueCandidates: catalogueContext,
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("timeout"));
        }, options.timeoutMs ?? 5000);
      }),
    ]);
    if (
      !validInterpretation(
        output.interpretation,
        query,
        runtime.plannerIndexes.genres,
      )
    )
      throw new Error("invalid_output");
    const plan = compileInterpretation(query, output.interpretation, runtime, {
      mode: "model",
      model: options.model,
      cacheHit: false,
      usage: output.usage,
      catalogueContext,
    });
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
    cache.set(key, structuredClone({ ...output, catalogueContext }));
    return finish(plan);
  } catch (error) {
    const known = [
      "timeout",
      "refusal",
      "invalid_output",
      "incomplete_output",
      "provider_error",
    ];
    return finish(
      deterministicFallback(
        query,
        runtime,
        known.includes(error.message) ? error.message : "provider_error",
      ),
    );
  } finally {
    clearTimeout(timer);
  }
}
export const multilingualQueryPlanner = {
  id: "multilingual",
  version: PROMPT_VERSION,
  plan: planHindiQuery,
};
