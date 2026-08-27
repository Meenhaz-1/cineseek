import { readFile } from "node:fs/promises";
import {
  buildCharacterTrigramIndex,
  lookupCharacterTrigrams,
} from "./character-trigram-index.mjs";
import {
  levenshteinDistance,
  normalizeForEditDistance,
} from "./edit-distance.mjs";
import { buildExactTitleIndex, exactTitleKey } from "./exact-title-index.mjs";
import {
  GENRE_ALIASES,
  metadataResidualTitleTerms,
  parseMetadataQuery,
} from "./metadata-query.mjs";
import { suggestPersonName } from "./person-name-suggestion.mjs";

export const QUERY_PLANNER_ID = "deterministic";
export const QUERY_PLANNER_VERSION = "1.4.0";
export const SEMANTIC_SYNONYMS = {
  dark: ["gritty", "crime", "thriller"],
  space: ["sci-fi", "black hole"],
  thoughtful: ["philosophy", "thought-provoking", "cerebral"],
  romantic: ["romance", "love"],
  dreamy: ["dreamlike", "surreal"],
  kids: ["children", "animation"],
  funny: ["comedy", "fun"],
};

const MEDIA_WORDS = new Set(["movie", "movies", "film", "films"]);
const CONTROL_WORDS = new Set([
  "movie",
  "movies",
  "film",
  "films",
  "latest",
  "newest",
  "recent",
  "oldest",
  "rated",
  "rating",
  "ratings",
  "after",
  "before",
  "since",
  "with",
  "from",
  "about",
  "featuring",
  "starring",
  "directed",
  "director",
  "actor",
  "actress",
  "called",
  "named",
  "titled",
  "title",
  "contains",
  "minimum",
  "least",
  "imdb",
  "which",
  "is",
  "funny",
]);
const TITLE_CONTEXT = /\b(?:movie|film)?\s*(?:called|named|titled)\s+(.+)$/;
const DIRECTOR_CONTEXT = /\b(?:directed\s+by|director)\b/;
const ACTOR_CONTEXT = /\b(?:starring|featuring|with|actor|actress|cast)\b/;
const EXPLICIT_ACTOR_CONTEXT = /\b(?:starring|featuring|actor|actress|cast)\b/;

function normalize(value) {
  return exactTitleKey(value)
    .replace(/[_–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value) {
  return normalize(value).match(/[a-z0-9]+/g) ?? [];
}

function isAdjacentTransposition(left, right) {
  if (left.length !== right.length) return false;
  const differences = [...left]
    .map((character, index) => (character === right[index] ? -1 : index))
    .filter((index) => index >= 0);
  return (
    differences.length === 2 &&
    differences[1] === differences[0] + 1 &&
    left[differences[0]] === right[differences[1]] &&
    left[differences[1]] === right[differences[0]]
  );
}

function correctionDistance(left, right) {
  return isAdjacentTransposition(left, right)
    ? 1
    : levenshteinDistance(left, right);
}

function roundedMs(startedAt) {
  return Number((performance.now() - startedAt).toFixed(3));
}

function normalizedPerson(person) {
  return {
    id: String(person.id),
    name: String(person.name),
    roles: Array.isArray(person.roles)
      ? person.roles.filter((role) => role === "actor" || role === "director")
      : [],
    movieCount: Number(person.movieCount ?? 0),
    actorMovieCount: Number(person.actorMovieCount ?? 0),
    directorMovieCount: Number(person.directorMovieCount ?? 0),
  };
}

function personRole(person, preferredRole) {
  if (preferredRole && person.roles.includes(preferredRole))
    return preferredRole;
  if (
    person.directorMovieCount > person.actorMovieCount &&
    person.roles.includes("director")
  )
    return "director";
  return person.roles.includes("actor") ? "actor" : person.roles[0];
}

function buildPersonPhraseIndex(people) {
  const byPhrase = new Map();
  for (const person of people) {
    const key = normalize(person.name);
    const count = tokens(key).length;
    if (count < 2 || count > 4) continue;
    const matches = byPhrase.get(key) ?? [];
    matches.push(person);
    byPhrase.set(key, matches);
  }
  return byPhrase;
}

function buildPersonInitialIndex(people) {
  const byInitials = new Map();
  for (const person of people) {
    const nameTokens = tokens(person.name);
    if (nameTokens.length < 2 || nameTokens.length > 4) continue;
    const key = nameTokens.map((token) => token[0]).join("");
    const matches = byInitials.get(key) ?? [];
    matches.push(person);
    byInitials.set(key, matches);
  }
  return byInitials;
}

function displayTitlePhrase(phrase) {
  const minorWords = new Set(["a", "an", "and", "of", "the", "to"]);
  return tokens(phrase)
    .map((token, index) =>
      index > 0 && minorWords.has(token)
        ? token
        : `${token[0].toUpperCase()}${token.slice(1)}`,
    )
    .join(" ");
}

function buildRecurringTitlePhrases(titleAliasesById) {
  const movieIdsByPhrase = new Map();
  for (const [id, aliases] of titleAliasesById) {
    for (const alias of aliases) {
      const aliasTokens = tokens(alias);
      while (
        aliasTokens.length > 1 &&
        ["a", "an", "the"].includes(aliasTokens[0])
      )
        aliasTokens.shift();
      for (
        let length = 2;
        length <= Math.min(4, aliasTokens.length);
        length++
      ) {
        const phrase = aliasTokens.slice(0, length).join(" ");
        const movieIds = movieIdsByPhrase.get(phrase) ?? new Set();
        movieIds.add(id);
        movieIdsByPhrase.set(phrase, movieIds);
      }
    }
  }
  return [...movieIdsByPhrase]
    .filter(([, movieIds]) => movieIds.size >= 2)
    .map(([phrase, movieIds]) => ({
      phrase,
      display: displayTitlePhrase(phrase),
      movieCount: movieIds.size,
      phraseTokens: tokens(phrase),
    }));
}

function recurringTitlePhraseShape(phraseTokens) {
  return `${phraseTokens.length}:${phraseTokens
    .map((token) => token[0])
    .join("")}`;
}

function indexRecurringTitlePhrases(phrases) {
  const byShape = new Map();
  for (const phrase of phrases) {
    const shape = recurringTitlePhraseShape(phrase.phraseTokens);
    const matches = byShape.get(shape) ?? [];
    matches.push(phrase);
    byShape.set(shape, matches);
  }
  return byShape;
}

export function buildPlannerIndexes(documents, registry, sharedIndexes = {}) {
  const startedAt = performance.now();
  if (!Array.isArray(documents) || !documents.length)
    throw new Error("Planner corpus must contain at least one movie.");
  if (!registry?.entities || !Array.isArray(registry.entities.people))
    throw new Error("Entity registry is missing people.");
  const people = registry.entities.people.map(normalizedPerson);
  const exactTitles =
    sharedIndexes.exactTitles ?? buildExactTitleIndex(documents);
  const titleTrigrams =
    sharedIndexes.titleTrigrams ?? buildCharacterTrigramIndex(documents);
  const titleById = new Map(
    [...titleTrigrams.records].map(([id, record]) => [id, record]),
  );
  const titleAliasesById = new Map(
    [...titleById].map(([id, record]) => {
      const full = normalizeForEditDistance(record.title);
      const withoutParenthetical = normalizeForEditDistance(
        record.title.replace(/\s+\([^)]*\).*$/, ""),
      );
      const aliases = [
        ...new Set(
          [
            full,
            withoutParenthetical,
            full.replace(/^(?:a|an|the)\s+/, ""),
            withoutParenthetical.replace(/^(?:a|an|the)\s+/, ""),
          ].filter(Boolean),
        ),
      ];
      return [id, aliases];
    }),
  );
  const normalizedTitles = new Map();
  for (const [id, aliases] of titleAliasesById)
    for (const alias of aliases) {
      const matches = normalizedTitles.get(alias) ?? [];
      matches.push(id);
      normalizedTitles.set(alias, matches);
    }
  const recurringTitlePhrases = buildRecurringTitlePhrases(titleAliasesById);
  const genres = [
    ...new Set([
      ...Object.values(GENRE_ALIASES),
      ...(registry.entities.genres ?? []).map(({ name }) => String(name)),
    ]),
  ];
  const tags = (registry.entities.tags ?? []).map(({ name }) => String(name));
  return {
    exactTitles,
    titleTrigrams,
    titleById,
    titleAliasesById,
    normalizedTitles,
    recurringTitlePhrases,
    recurringTitlePhraseSet: new Set(
      recurringTitlePhrases.map(({ phrase }) => phrase),
    ),
    recurringTitlePhrasesByShape: indexRecurringTitlePhrases(
      recurringTitlePhrases,
    ),
    people,
    actors: people.filter(({ roles }) => roles.includes("actor")),
    directors: people.filter(({ roles }) => roles.includes("director")),
    peopleByPhrase: buildPersonPhraseIndex(people),
    peopleByInitials: buildPersonInitialIndex(people),
    genres,
    genreTerms: [
      ...new Set([...Object.keys(GENRE_ALIASES), ...genres.map(normalize)]),
    ],
    tags,
    controlWords: [...CONTROL_WORDS],
    corpusSize: documents.length,
    registryStats: registry.stats ?? {},
    planCache: new Map(),
    buildMs: roundedMs(startedAt),
  };
}

export async function loadPlannerIndexes(corpusPath, registryPath) {
  const [corpusContents, registryContents] = await Promise.all([
    readFile(corpusPath, "utf8"),
    readFile(registryPath, "utf8"),
  ]);
  const documents = corpusContents
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return buildPlannerIndexes(documents, JSON.parse(registryContents));
}

function exactPeople(query, indexes, preferredRole) {
  const queryTokens = tokens(query);
  const found = [];
  const rolePool =
    preferredRole === "director"
      ? new Set(indexes.directors.map(({ id }) => id))
      : preferredRole === "actor"
        ? new Set(indexes.actors.map(({ id }) => id))
        : null;
  for (let size = Math.min(4, queryTokens.length); size >= 2; size -= 1) {
    for (let start = 0; start <= queryTokens.length - size; start += 1) {
      const phrase = queryTokens.slice(start, start + size).join(" ");
      const matches = (indexes.peopleByPhrase.get(phrase) ?? []).filter(
        ({ id }) => !rolePool || rolePool.has(id),
      );
      if (!matches.length) continue;
      const person = [...matches].sort(
        (left, right) => right.movieCount - left.movieCount,
      )[0];
      if (!found.some(({ id }) => id === person.id))
        found.push({
          ...person,
          matchedText: phrase,
          role: personRole(person, preferredRole),
          confidence: 1,
        });
    }
  }
  return found;
}

function partialPersonCandidates(query, indexes, preferredRole) {
  const meaningfulTokens = tokens(query).filter(
    (token) => !CONTROL_WORDS.has(token),
  );
  if (meaningfulTokens.length !== 1 || meaningfulTokens[0].length < 3)
    return [];
  const matchedText = meaningfulTokens[0];
  const rolePool =
    preferredRole === "director"
      ? indexes.directors
      : preferredRole === "actor"
        ? indexes.actors
        : indexes.people;
  return rolePool
    .map((person) => {
      const matchedNameToken = tokens(person.name)[0];
      if (!matchedNameToken?.startsWith(matchedText)) return null;
      if (matchedNameToken !== matchedText && matchedText.length < 4)
        return null;
      const role = personRole(person, preferredRole);
      const roleMovieCount =
        role === "director"
          ? person.directorMovieCount
          : person.actorMovieCount;
      return {
        id: person.id,
        name: person.name,
        roles: person.roles,
        role,
        movieCount: person.movieCount,
        roleMovieCount,
        matchedText,
        confidence: Number(
          Math.min(1, matchedText.length / matchedNameToken.length).toFixed(3),
        ),
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftPopularity = preferredRole
        ? left.roleMovieCount
        : left.movieCount;
      const rightPopularity = preferredRole
        ? right.roleMovieCount
        : right.movieCount;
      return (
        rightPopularity - leftPopularity ||
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id)
      );
    });
}

function personCorrection(query, indexes, preferredRole) {
  if (exactPeople(query, indexes, preferredRole).length) return null;
  const queryTokens = tokens(query);
  if (
    !preferredRole &&
    queryTokens.length !== 2 &&
    !queryTokens.some((token) => MEDIA_WORDS.has(token))
  )
    return null;
  const rolePool =
    preferredRole === "director"
      ? new Set(indexes.directors.map(({ id }) => id))
      : preferredRole === "actor"
        ? new Set(indexes.actors.map(({ id }) => id))
        : null;
  const candidateMap = new Map();
  for (let size = 2; size <= Math.min(4, queryTokens.length); size += 1) {
    for (let start = 0; start <= queryTokens.length - size; start += 1) {
      const signature = queryTokens
        .slice(start, start + size)
        .map((token) => token[0])
        .join("");
      for (const person of indexes.peopleByInitials.get(signature) ?? []) {
        if (!rolePool || rolePool.has(person.id))
          candidateMap.set(person.id, person);
      }
    }
  }
  const pool = [...candidateMap.values()];
  if (!pool.length) return null;
  const suggestion = suggestPersonName(query, pool);
  if (!suggestion) return null;
  const person = pool.find(({ id }) => id === suggestion.entityId);
  if (!person) return null;
  const automatic =
    queryTokens.length === tokens(person.name).length ||
    DIRECTOR_CONTEXT.test(query) ||
    EXPLICIT_ACTOR_CONTEXT.test(query);
  return {
    original: suggestion.matchedText,
    replacement: person.name,
    replacementText: normalize(person.name),
    entityType: "person",
    role: personRole(person, preferredRole),
    confidence: suggestion.confidence,
    policy: automatic ? "automatic" : "suggest",
    entity: person,
  };
}

function genreCorrection(query, indexes) {
  const queryTokens = tokens(query);
  const hasGenreContext =
    queryTokens.some((token) => MEDIA_WORDS.has(token)) ||
    /\b(?:genre|after|before|since|latest|newest|recent)\b/.test(query);
  if (!hasGenreContext) return null;
  const canonicalTerms = indexes.genreTerms.filter(
    (term) => tokens(term).length === 1,
  );
  for (const token of queryTokens) {
    if (token.length < 4 || GENRE_ALIASES[token]) continue;
    const candidates = canonicalTerms
      .map((term) => ({ term, distance: correctionDistance(token, term) }))
      .filter(({ distance }) => distance === 1)
      .sort((left, right) => left.term.localeCompare(right.term));
    const uniqueGenres = [
      ...new Set(
        candidates.map(
          ({ term }) =>
            GENRE_ALIASES[term] ??
            indexes.genres.find((genre) => normalize(genre) === term),
        ),
      ),
    ].filter(Boolean);
    if (uniqueGenres.length !== 1) continue;
    const replacementTerm =
      candidates.find(
        ({ term }) =>
          (GENRE_ALIASES[term] ??
            indexes.genres.find((genre) => normalize(genre) === term)) ===
          uniqueGenres[0],
      )?.term ?? normalize(uniqueGenres[0]);
    const displayReplacement =
      replacementTerm === normalize(uniqueGenres[0])
        ? uniqueGenres[0]
        : replacementTerm;
    return {
      original: token,
      replacement: displayReplacement,
      replacementText: replacementTerm,
      entityType: "genre",
      confidence: Number(
        (
          1 -
          1 / Math.max(token.length, normalize(uniqueGenres[0]).length)
        ).toFixed(3),
      ),
      policy: "automatic",
    };
  }
  return null;
}

function controlCorrection(query, indexes) {
  for (const token of tokens(query)) {
    if (token.length < 4 || CONTROL_WORDS.has(token)) continue;
    const matches = indexes.controlWords.filter(
      (candidate) => correctionDistance(token, candidate) === 1,
    );
    if (matches.length !== 1) continue;
    const replacement = matches[0];
    return {
      original: token,
      replacement,
      replacementText: replacement,
      entityType: "control",
      confidence: Number(
        (1 - 1 / Math.max(token.length, replacement.length)).toFixed(3),
      ),
      policy: "automatic",
    };
  }
  return null;
}

function titleTarget(query) {
  const contextual =
    query.match(TITLE_CONTEXT) ??
    query.match(/\btitle\s+(?:contains?|containing|has|with)\s+(.+)$/);
  if (contextual) return { text: normalize(contextual[1]), contextual: true };
  const queryTokens = tokens(query);
  if (queryTokens.length === 1)
    return { text: queryTokens[0], contextual: false };
  return queryTokens.length <= 8
    ? { text: queryTokens.join(" "), contextual: false }
    : null;
}

function recurringTitlePhraseCorrection(target, indexes) {
  const targetTokens = tokens(target.text);
  if (targetTokens.length < 2 || targetTokens.length > 4) return null;
  const exactTarget = targetTokens.join(" ");
  if (indexes.recurringTitlePhraseSet.has(exactTarget)) return null;
  const phraseCandidates =
    indexes.recurringTitlePhrasesByShape.get(
      recurringTitlePhraseShape(targetTokens),
    ) ?? [];
  const candidates = phraseCandidates
    .map((candidate) => {
      const tokenDistances = targetTokens.map((token, index) =>
        correctionDistance(token, candidate.phraseTokens[index]),
      );
      const distance = tokenDistances.reduce((sum, value) => sum + value, 0);
      const maximumLength = Math.max(
        target.text.length,
        candidate.phrase.length,
      );
      return {
        ...candidate,
        tokenDistances,
        distance,
        similarity: maximumLength ? 1 - distance / maximumLength : 1,
      };
    })
    .filter(
      ({ tokenDistances, distance, similarity }) =>
        distance > 0 &&
        distance <= 2 &&
        tokenDistances.every((value) => value <= 1) &&
        similarity >= 0.8,
    )
    .sort(
      (left, right) =>
        left.distance - right.distance ||
        right.movieCount - left.movieCount ||
        left.phrase.localeCompare(right.phrase),
    );
  const [best, runnerUp] = candidates;
  if (!best || (runnerUp && runnerUp.distance === best.distance)) return null;
  return {
    original: target.text,
    replacement: best.display,
    replacementText: best.phrase,
    entityType: "title",
    confidence: Number(best.similarity.toFixed(3)),
    policy:
      best.tokenDistances.filter((distance) => distance > 0).length > 1
        ? "automatic"
        : "suggest",
  };
}

function titleCorrection(query, indexes) {
  const target = titleTarget(query);
  if (
    !target?.text ||
    indexes.normalizedTitles.has(normalizeForEditDistance(target.text))
  )
    return null;
  const recurringPhraseCorrection = recurringTitlePhraseCorrection(
    target,
    indexes,
  );
  if (recurringPhraseCorrection) return recurringPhraseCorrection;
  const lookup = lookupCharacterTrigrams(
    indexes.titleTrigrams,
    target.text,
    200,
  );
  const candidates = lookup.candidateIds
    .slice(0, 200)
    .map((id) => {
      const record = indexes.titleById.get(id);
      const aliases = indexes.titleAliasesById.get(id) ?? [
        normalizeForEditDistance(record.title),
      ];
      const bestAlias = aliases
        .map((titleText) => {
          const distance = correctionDistance(target.text, titleText);
          const maximumLength = Math.max(target.text.length, titleText.length);
          return {
            titleText,
            distance,
            similarity: maximumLength ? 1 - distance / maximumLength : 1,
          };
        })
        .sort(
          (left, right) =>
            right.similarity - left.similarity ||
            left.distance - right.distance,
        )[0];
      return { record, ...bestAlias };
    })
    .sort(
      (left, right) =>
        right.similarity - left.similarity ||
        left.distance - right.distance ||
        left.record.title.localeCompare(right.record.title),
    );
  const [best, runnerUp] = candidates;
  const minimumSimilarity = tokens(target.text).length === 1 ? 0.8 : 0.86;
  if (
    !best ||
    best.similarity < minimumSimilarity ||
    best.distance > Math.max(2, Math.floor(target.text.length * 0.15))
  )
    return null;
  if (runnerUp && best.similarity - runnerUp.similarity < 0.08) return null;
  return {
    original: target.text,
    replacement: best.record.title,
    replacementText: best.titleText,
    entityType: "title",
    confidence: Number(best.similarity.toFixed(3)),
    policy:
      target.contextual ||
      (tokens(target.text).length === 1 && target.text.length >= 9)
        ? "automatic"
        : "suggest",
  };
}

export const TitleCandidateProvider = { provide: titleCorrection };
export const PersonCandidateProvider = { provide: personCorrection };
export const GenreCandidateProvider = { provide: genreCorrection };
export const ControlWordCandidateProvider = { provide: controlCorrection };

function applyCorrection(query, correction) {
  if (!correction || correction.policy !== "automatic") return query;
  const escaped = correction.original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return query.replace(
    new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`),
    (_, prefix) => `${prefix}${correction.replacementText}`,
  );
}

function publicCorrection(correction) {
  if (!correction) return null;
  const {
    replacementText: _replacementText,
    entity: _entity,
    ...result
  } = correction;
  void _replacementText;
  void _entity;
  return result;
}

function querySort(query) {
  const match =
    query.match(/\b(latest|newest|recent)\b/) ??
    (tokens(query).some((token) => MEDIA_WORDS.has(token))
      ? query.match(/\bnew\b/)
      : null);
  return match ? { field: "year", direction: "desc", source: match[0] } : null;
}

function unsupportedConstraints(query) {
  const imdb =
    query.match(/\b(\d(?:\.\d)?)\s*\+\s*(?:(?:in|on)\s+)?imdb\b/) ??
    query.match(/\bimdb\s*(\d(?:\.\d)?)\s*\+/);
  return imdb ? [`IMDb rating >= ${imdb[1]}`] : [];
}

export function planQuery(rawQuery, indexes, options = {}) {
  const startedAt = performance.now();
  const raw = String(rawQuery ?? "");
  const autocorrect = options.autocorrect !== false;
  const cacheKey = `${autocorrect ? "auto" : "literal"}:${raw}`;
  const cachedPlan = indexes.planCache?.get(cacheKey);
  if (cachedPlan)
    return {
      ...cachedPlan,
      planner: { ...cachedPlan.planner, planningMs: roundedMs(startedAt) },
    };
  const normalizedQuery = normalize(raw);
  const preferredRole = DIRECTOR_CONTEXT.test(normalizedQuery)
    ? "director"
    : ACTOR_CONTEXT.test(normalizedQuery)
      ? "actor"
      : undefined;
  const rawExactTitle = indexes.normalizedTitles.has(
    normalizeForEditDistance(normalizedQuery),
  );
  const rawMetadata = parseMetadataQuery(normalizedQuery);
  const rawHasMetadata =
    rawMetadata.genres.length > 0 ||
    rawMetadata.yearMin !== undefined ||
    rawMetadata.yearMax !== undefined ||
    rawMetadata.ratingMin !== undefined ||
    rawMetadata.ratingCountMin !== undefined;
  const personCandidates =
    rawExactTitle || rawHasMetadata
      ? []
      : partialPersonCandidates(normalizedQuery, indexes, preferredRole);

  const candidates = {
    person: rawExactTitle
      ? null
      : PersonCandidateProvider.provide(
          normalizedQuery,
          indexes,
          preferredRole,
        ),
    genre: rawExactTitle
      ? null
      : GenreCandidateProvider.provide(normalizedQuery, indexes),
    title: rawExactTitle
      ? null
      : TitleCandidateProvider.provide(normalizedQuery, indexes),
    control: rawExactTitle
      ? null
      : ControlWordCandidateProvider.provide(normalizedQuery, indexes),
  };
  const priority = preferredRole
    ? ["person", "title", "genre", "control"]
    : TITLE_CONTEXT.test(normalizedQuery) ||
        /\btitle\s+(?:contains?|containing|has|with)\b/.test(normalizedQuery)
      ? ["title", "person", "genre", "control"]
      : candidates.genre
        ? ["genre", "person", "title", "control"]
        : ["person", "title", "genre", "control"];
  const selected =
    candidates[priority.find((kind) => candidates[kind])] ?? null;
  const activeCorrection =
    selected?.policy === "automatic" && !autocorrect
      ? { ...selected, policy: "suggest" }
      : selected;
  const effectiveQuery = applyCorrection(normalizedQuery, activeCorrection);
  const corrections = [publicCorrection(activeCorrection)].filter(Boolean);
  const suggested =
    activeCorrection?.policy === "suggest"
      ? applyCorrection(normalizedQuery, {
          ...activeCorrection,
          policy: "automatic",
        })
      : undefined;

  const people = exactPeople(effectiveQuery, indexes, preferredRole).map(
    (person) => ({
      id: person.id,
      name: person.name,
      roles: person.roles,
      role: person.role,
      matchedText: person.matchedText,
      confidence: person.confidence,
    }),
  );
  const metadata = parseMetadataQuery(effectiveQuery);
  const hasMetadata =
    metadata.genres.length > 0 ||
    metadata.yearMin !== undefined ||
    metadata.yearMax !== undefined ||
    metadata.ratingMin !== undefined ||
    metadata.ratingCountMin !== undefined;
  const residualTitleTerms = metadataResidualTitleTerms(
    effectiveQuery,
    metadata,
  );
  const personTokenSet = new Set(people.flatMap(({ name }) => tokens(name)));
  for (const candidate of personCandidates)
    personTokenSet.add(candidate.matchedText);
  const personResidualTerms = residualTitleTerms.filter(
    (token) =>
      !personTokenSet.has(token) &&
      ![
        "directed",
        "director",
        "by",
        "actor",
        "actress",
        "cast",
        "starring",
        "featuring",
        "with",
      ].includes(token),
  );
  const ownsPersonRouting = Boolean(
    preferredRole || selected?.entityType === "person",
  );
  const ownsPartialPersonRouting = Boolean(
    preferredRole && personCandidates.length,
  );
  const titleQuery =
    metadata.explicitTitleText ||
    ((people.length && ownsPersonRouting) || ownsPartialPersonRouting
      ? personResidualTerms.join(" ")
      : hasMetadata && residualTitleTerms.length === 0
        ? ""
        : effectiveQuery);
  const isPureGenreDiscovery = Boolean(
    metadata.genres.length > 0 &&
    (metadata.genres.length === 1 || metadata.isCompoundGenre) &&
    metadata.yearMin === undefined &&
    metadata.yearMax === undefined &&
    metadata.ratingMin === undefined &&
    metadata.ratingCountMin === undefined &&
    residualTitleTerms.length === 0 &&
    !metadata.explicitTitleText &&
    people.length === 0,
  );
  const fieldQuery =
    people.length && ownsPersonRouting
      ? people.map(({ name }) => normalize(name)).join(" ")
      : ownsPartialPersonRouting
        ? personCandidates[0].matchedText
        : isPureGenreDiscovery
          ? ""
          : effectiveQuery;
  const genreTitleFallbackQuery = [
    ...new Set([
      ...metadata.matchedGenreEntries.map(([alias]) => alias),
      ...(titleQuery ? titleQuery.split(" ") : []),
    ]),
  ].join(" ");
  const filters = {
    genres: metadata.genres,
    genreMode: metadata.genreMode,
    yearMin: metadata.yearMin,
    yearMax: metadata.yearMax,
    ratingMin: metadata.ratingMin,
    ratingCountMin: metadata.ratingCountMin,
  };
  const sort = querySort(effectiveQuery);
  const unavailableFilters = unsupportedConstraints(effectiveQuery);
  const exactTitle = indexes.normalizedTitles.has(
    normalizeForEditDistance(effectiveQuery),
  );
  const hasFilters = Object.entries(filters).some(
    ([key, value]) =>
      key !== "genres" && key !== "genreMode" && value !== undefined,
  );
  const suggestedTitleDiscovery =
    selected?.entityType === "title" &&
    selected.policy === "suggest" &&
    tokens(normalizedQuery).length > 1;
  const intent =
    exactTitle && metadata.genres.length === 0
      ? "exact_title"
      : people.length
        ? "person_discovery"
        : hasFilters
          ? "filtered_discovery"
          : sort
            ? "sorted_discovery"
            : suggestedTitleDiscovery ||
                metadata.genres.length ||
                tokens(effectiveQuery).some((token) => MEDIA_WORDS.has(token))
              ? "discovery"
              : "general_search";
  const structural = tokens(effectiveQuery).filter(
    (token) =>
      MEDIA_WORDS.has(token) ||
      [
        "about",
        "featuring",
        "starring",
        "with",
        "directed",
        "by",
        "called",
        "named",
        "titled",
        "title",
        "contains",
      ].includes(token),
  );
  const genreTokens = new Set(
    metadata.matchedGenreEntries.flatMap(([alias]) => tokens(alias)),
  );
  const structuralSet = new Set(structural);
  const suggestedTokens = new Set(
    selected?.policy === "suggest" ? tokens(selected.original) : [],
  );
  const concepts =
    exactTitle && metadata.genres.length === 0
      ? []
      : residualTitleTerms.filter(
          (token) =>
            !genreTokens.has(token) &&
            !personTokenSet.has(token) &&
            !structuralSet.has(token) &&
            (token === "funny" || !CONTROL_WORDS.has(token)) &&
            !suggestedTokens.has(token),
        );
  const trace = ["Normalized case, punctuation, and whitespace on the server."];
  for (const correction of corrections)
    trace.push(
      `${correction.policy === "automatic" ? "Applied" : "Suggested"} ${correction.entityType} correction: ${correction.original} -> ${correction.replacement}.`,
    );
  if (people.length)
    trace.push(
      `Linked ${people.map(({ name, role }) => `${name}${role ? ` (${role})` : ""}`).join(", ")} to the full entity registry.`,
    );
  if (personCandidates.length)
    trace.push(
      `Found ${personCandidates.length} partial person-name signals for movie ranking; catalog size can contribute to relevance without changing the search intent.`,
    );
  if (metadata.genres.length)
    trace.push(
      `Parsed genre metadata: ${metadata.genres.join(", ")} (${metadata.genreMode.toUpperCase()}).`,
    );
  if (titleQuery) trace.push(`Routed "${titleQuery}" to title retrieval.`);
  else
    trace.push(
      "Structured parsing consumed all title text; title retrieval is skipped.",
    );
  const planningMs = roundedMs(startedAt);

  const plan = {
    rawQuery: raw,
    normalizedQuery,
    effectiveQuery,
    intent,
    corrections,
    suggestedQuery: suggested,
    routes: {
      strategy: exactTitle
        ? "exact_title"
        : metadata.explicitTitleText
          ? "title"
          : hasMetadata
            ? titleQuery
              ? "genre_fallback"
              : "structured"
            : "dual",
      titleQuery,
      fieldQuery,
      fieldRole:
        people.length === 1 || personCandidates.length
          ? preferredRole
          : undefined,
      genreTitleFallbackQuery,
      titlePriority: exactTitle
        ? "exact"
        : titleQuery
          ? hasMetadata
            ? "secondary"
            : "primary"
          : "none",
      structural,
      concepts,
      semanticExpansions: concepts
        .filter((term) => SEMANTIC_SYNONYMS[term])
        .map((term) => ({ term, values: SEMANTIC_SYNONYMS[term] })),
      structuredGenreRanking: isPureGenreDiscovery,
    },
    entities: {
      people,
      personCandidates: personCandidates.slice(0, 5),
      genres: metadata.genres,
    },
    filters,
    sort,
    unavailableFilters,
    trace,
    explanations: {
      normalization: corrections.length
        ? `The planner ${corrections[0].policy === "automatic" ? "applied" : "proposed"} a typed ${corrections[0].entityType} correction.`
        : "The query required no spelling correction.",
      routing: titleQuery
        ? "Residual text enters title retrieval while the complete effective query enters metadata fields."
        : "Only structured metadata and searchable fields remain after parsing.",
      intent: `The planner classified this as ${intent.replaceAll("_", " ")}.`,
    },
    planner: {
      id: QUERY_PLANNER_ID,
      version: QUERY_PLANNER_VERSION,
      planningMs,
      indexBuildMs: indexes.buildMs,
      corpusSize: indexes.corpusSize,
      entityCount:
        indexes.people.length + indexes.genres.length + indexes.tags.length,
    },
  };
  indexes.planCache?.set(cacheKey, plan);
  return plan;
}

export const deterministicQueryPlanner = {
  id: QUERY_PLANNER_ID,
  version: QUERY_PLANNER_VERSION,
  async plan(rawQuery, indexes) {
    return planQuery(rawQuery, indexes);
  },
};

export function titleSearchInputFromPlan(plan, weights) {
  return {
    normalizedQuery: plan.effectiveQuery,
    retrievalQuery: plan.routes.titleQuery,
    fieldQuery: plan.routes.fieldQuery,
    fieldRole: plan.routes.fieldRole,
    genreTitleFallbackQuery: plan.routes.genreTitleFallbackQuery,
    filters: plan.filters,
    weights,
    sort: plan.sort ?? undefined,
  };
}
