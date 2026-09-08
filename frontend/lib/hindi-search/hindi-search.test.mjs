import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeText,
  textKey,
  tokens,
  editDistance,
  trigrams,
} from "./text.mjs";
import { matchAliases, suggestAliases } from "./catalog.mjs";
import { conforms, createInterpreter, modelConfiguration } from "./model.mjs";
import { planHindiQuery } from "./planner.mjs";
import { searchHindiPlan } from "./retrieval.mjs";
import { movieAliases, personAliases, fetchAliases } from "./enrichment.mjs";
import {
  fixtureRuntime,
  documents,
  registry,
  interpretation,
  cases,
} from "./fixtures.mjs";

const mock = (value) => async () => ({
  interpretation: value,
  usage: { inputTokens: 50, outputTokens: 25, cachedInputTokens: 0 },
});
test("Unicode keys preserve marks, normalize canonical equivalents and Hindi digits", () => {
  assert.equal(normalizeText("  २०१०  "), "2010");
  assert.equal(textKey("क़िला"), textKey("क़िला"));
  assert.deepEqual(tokens("शाहरुख की फिल्में २०१०"), [
    "शाहरुख",
    "की",
    "फिल्में",
    "2010",
  ]);
  assert.equal(editDistance("की", "का"), 1);
  assert.equal(editDistance("क़िला", "क़िला"), 0);
  assert.ok(trigrams("फिल्में").size > 0);
});
for (const item of cases)
  test(`paired interpretation and retrieval: ${item.query}`, async () => {
    const runtime = fixtureRuntime();
    const plan = await planHindiQuery(item.query, runtime, {
      interpret: mock(item.value),
      model: "fixture",
    });
    assert.equal(plan.interpretation.mode, "model");
    assert.deepEqual(
      plan.entities.people.map((p) => p.id),
      item.expectedPeople,
    );
    assert.equal(plan.multilingual.blocked, false);
    assert.deepEqual(
      searchHindiPlan(runtime, plan).items.map((r) => r.id),
      item.expected,
    );
  });
test("exact cross-script titles skip model and aliases do not inflate ranking", async () => {
  const runtime = fixtureRuntime();
  for (const query of ["दिल से", "dil se"]) {
    const plan = await planHindiQuery(query, runtime, {
      interpret: () => {
        throw new Error("must not call model");
      },
    });
    assert.equal(plan.interpretation.mode, "exact_alias");
    assert.deepEqual(
      searchHindiPlan(runtime, plan).items.map((r) => [r.id, r.score]),
      [["1", 1]],
    );
  }
  const extra = fixtureRuntime(documents, registry, {
    movies: {
      1: [
        { text: "दिल से", source: "reviewed" },
        { text: "dil see", source: "generated" },
      ],
    },
  });
  assert.equal(matchAliases(extra.catalog.movies, "dil se").length, 1);
  assert.equal(matchAliases(extra.catalog.movies, "dil se")[0].score, 1);
});
test("exact titles with instruction words win over genre parsing", async () => {
  const runtime = fixtureRuntime([
    ...documents,
    {
      _id: "6",
      title: "Horror",
      aliases: [{ text: "डरावनी फिल्में", source: "reviewed" }],
      metadata: { genres: ["Comedy"], year: 2000 },
    },
  ]);
  const plan = await planHindiQuery("डरावनी फिल्में", runtime, {
    interpret: () => assert.fail("model called"),
  });
  assert.deepEqual(
    searchHindiPlan(runtime, plan).items.map((r) => r.id),
    ["6"],
  );
});
test("ambiguous and missing people never become fabricated or broad matches", async () => {
  const reg = structuredClone(registry);
  reg.entities.people.push({ ...reg.entities.people[0], id: "person:2" });
  const runtime = fixtureRuntime(documents, reg);
  for (const name of ["shahrukh", "unknown actor"]) {
    const q = `${name} movies`;
    const plan = await planHindiQuery(q, runtime, {
      interpret: mock(
        interpretation(q, {
          people: [{ text: name, alternatives: [], role: "actor" }],
        }),
      ),
    });
    assert.equal(plan.multilingual.blocked, true);
    assert.equal(searchHindiPlan(runtime, plan).total, 0);
    assert.equal(plan.entities.people.length, 0);
    assert.ok(plan.interpretation.unresolved.length);
  }
});
test("unsupported constraints remain visible; Hindi does not imply movie language", async () => {
  const runtime = fixtureRuntime();
  const q = "horror movies in Hindi";
  const plan = await planHindiQuery(q, runtime, {
    interpret: mock(
      interpretation(q, { genres: ["Horror"], unresolved: ["in Hindi"] }),
    ),
  });
  assert.deepEqual(plan.unavailableFilters, ["in Hindi"]);
  assert.equal(searchHindiPlan(runtime, plan).total, 0);
  const good = await planHindiQuery(cases[3].query, runtime, {
    interpret: mock(cases[3].value),
  });
  assert.deepEqual(Object.keys(good.filters).sort(), [
    "genreMode",
    "genres",
    "yearMin",
  ]);
});
test("strict validation catches schema errors, invented spans, genres and reversed years", async () => {
  for (const value of [
    interpretation("horror please", { bogus: 1 }),
    interpretation("horror please", { genres: ["invented"] }),
    interpretation("not in query"),
    interpretation("horror please", {
      filters: {
        yearMin: 2020,
        yearMax: 2000,
        ratingMin: null,
        ratingCountMin: null,
      },
    }),
    interpretation("horror please", {
      evidence: [{ text: "hor", meaning: "Dropped rest" }],
    }),
  ]) {
    const plan = await planHindiQuery("horror please", fixtureRuntime(), {
      interpret: mock(value),
    });
    assert.equal(plan.interpretation.fallbackReason, "invalid_output");
  }
  assert.equal(conforms(interpretation("horror please")), true);
});
test("model cache keys include model, prompt/catalogue version and preserve source spans", async () => {
  const runtime = fixtureRuntime();
  let calls = 0;
  const interpret = async () => {
    calls++;
    return { interpretation: cases[0].value };
  };
  await planHindiQuery(cases[0].query, runtime, { interpret, model: "one" });
  const cached = await planHindiQuery(cases[0].query, runtime, {
    interpret,
    model: "one",
  });
  assert.equal(cached.interpretation.cacheHit, true);
  assert.equal(calls, 1);
  await planHindiQuery(cases[0].query, runtime, { interpret, model: "two" });
  runtime.catalogueVersion = "fixture-2";
  await planHindiQuery(cases[0].query, runtime, { interpret, model: "two" });
  assert.equal(calls, 3);
});
test("timeout aborts, fallback is visible and failures are not cached", async () => {
  const runtime = fixtureRuntime();
  let signal;
  const interpret = async (_, options) => {
    signal = options.signal;
    return new Promise(() => {});
  };
  const plan = await planHindiQuery("शाहरुख", runtime, {
    interpret,
    timeoutMs: 10,
  });
  assert.equal(signal.aborted, true);
  assert.equal(plan.interpretation.fallbackReason, "timeout");
  assert.deepEqual(
    searchHindiPlan(runtime, plan).items.map((r) => r.id),
    ["1", "2"],
  );
  assert.equal(runtime.interpretationCache.size, 0);
  for (const reason of ["refusal", "provider_error", "incomplete_output"]) {
    const failed = await planHindiQuery("शाहरुख", runtime, {
      interpret: async () => {
        throw new Error(reason);
      },
    });
    assert.equal(failed.interpretation.fallbackReason, reason);
  }
});
test("local opt-in is mandatory and hosted model spending stays disabled", () => {
  const env = {
    OPENAI_API_KEY: "test",
    OPENAI_MODEL: "test",
    CINESEEK_HINDI_MODEL_ENABLED: "true",
  };
  assert.equal(modelConfiguration(env).enabled, true);
  assert.equal(
    modelConfiguration({ ...env, CINESEEK_DEPLOYMENT_MODE: "portfolio" })
      .enabled,
    false,
  );
  assert.equal(modelConfiguration({ ...env, VERCEL: "1" }).enabled, false);
  assert.equal(
    modelConfiguration({ ...env, CINESEEK_HINDI_MODEL_ENABLED: "false" })
      .enabled,
    false,
  );
});
test("suggestions use local aliases only and return unique entity IDs", () => {
  const runtime = fixtureRuntime();
  const suggestions = suggestAliases(runtime.catalog, "शाह");
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].id, "person:1");
  assert.equal(suggestAliases(runtime.catalog, "दिल")[0].id, "1");
});
test("sort is applied before truncation and insufficient rating evidence ranks last", async () => {
  const runtime = fixtureRuntime(),
    query = "latest horror movies";
  const plan = await planHindiQuery(query, runtime, {
    interpret: mock(
      interpretation(query, {
        genres: ["Horror"],
        sort: { field: "year", direction: "desc" },
      }),
    ),
  });
  assert.equal(searchHindiPlan(runtime, plan, 1).items[0].id, "5");
  const rated = await planHindiQuery("best horror movies", runtime, {
    interpret: mock(
      interpretation("best horror movies", {
        genres: ["Horror"],
        sort: { field: "rating", direction: "desc" },
      }),
    ),
  });
  assert.equal(searchHindiPlan(runtime, rated).items.at(-1).id, "4");
});
test("provider uses strict structured outputs, no storage, and captures token usage", async () => {
  let body;
  const interpret = createInterpreter({
    apiKey: "fake",
    model: "fixture",
    fetchImpl: async (_, init) => {
      body = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({
          status: "completed",
          output: [
            {
              type: "message",
              content: [
                { type: "output_text", text: JSON.stringify(cases[0].value) },
              ],
            },
          ],
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
      };
    },
  });
  const output = await interpret(cases[0].query, {
    genres: ["Horror"],
    signal: new AbortController().signal,
  });
  assert.equal(body.store, false);
  assert.equal(body.text.format.strict, true);
  assert.equal(output.usage.inputTokens, 10);
});
test("TMDB alias extraction keeps provenance, never treats country as language", async () => {
  const movie = {
    id: 7,
    original_title: "Dil Se",
    original_language: "hi",
    translations: {
      translations: [{ iso_639_1: "hi", data: { title: "दिल से" } }],
    },
    alternative_titles: { titles: [{ iso_3166_1: "IN", title: "Dil Se.." }] },
  };
  const aliases = movieAliases(movie);
  assert.equal(aliases[1].script, "Devanagari");
  assert.equal(aliases[1].source, "TMDB:translation");
  assert.equal(
    personAliases({ name: "Shah Rukh Khan", also_known_as: ["शाहरुख खान"] })
      .length,
    2,
  );
  let url;
  await fetchAliases("movie", 7, {
    fetchImpl: async (u) => {
      url = u;
      return { ok: true, json: async () => movie };
    },
  });
  assert.equal(
    url.searchParams.get("append_to_response"),
    "translations,alternative_titles",
  );
});

test("retrieved context grounds noisy names and remains bounded and deduplicated", async () => {
  const { retrieveQueryContext } = await import("./grounding.mjs");
  const runtime = fixtureRuntime();
  const context = retrieveQueryContext(runtime.catalog, "sharukh ki movies");
  assert.ok(context.some((c) => c.name === "Shah Rukh Khan"));
  assert.ok(context.length <= 5);
  assert.equal(
    new Set(context.map((c) => `${c.type}:${c.name}`)).size,
    context.length,
  );
  let seen;
  const query = "sharukh ki movies";
  const plan = await planHindiQuery(query, runtime, {
    interpret: async (_, input) => {
      seen = input.catalogueCandidates;
      return {
        interpretation: interpretation(query, {
          people: [
            { text: "sharukh", alternatives: ["Shah Rukh Khan"], role: null },
          ],
        }),
      };
    },
  });
  assert.deepEqual(plan.interpretation.catalogueContext, seen);
  assert.deepEqual(
    plan.entities.people.map((p) => p.id),
    ["person:1"],
  );
});
test("fallback retains filters alongside a matched title and cannot erase Hindi words", async () => {
  const runtime = fixtureRuntime();
  const filtered = await planHindiQuery("dil se after 2010", runtime);
  assert.equal(filtered.filters.yearMin, 2011);
  assert.equal(searchHindiPlan(runtime, filtered).total, 0);
  const unsupported = await planHindiQuery("horror movies बिना हिंसा", runtime);
  assert.equal(unsupported.multilingual.blocked, true);
});
test("suggested people remain searchable when the model is disabled", async () => {
  const runtime = fixtureRuntime();
  const suggestion = suggestAliases(runtime.catalog, "शाह")[0];
  const plan = await planHindiQuery(suggestion.query, runtime);
  assert.equal(plan.multilingual.blocked, false);
  assert.deepEqual(
    searchHindiPlan(runtime, plan).items.map((r) => r.id),
    ["1", "2"],
  );
});
test("missing titles remain unresolved instead of yielding unrelated movies", async () => {
  const runtime = fixtureRuntime(),
    query = "show me Zzzxqvv";
  const plan = await planHindiQuery(query, runtime, {
    interpret: mock(
      interpretation(query, { title: { text: "Zzzxqvv", alternatives: [] } }),
    ),
  });
  assert.equal(plan.multilingual.blocked, true);
  assert.equal(searchHindiPlan(runtime, plan).total, 0);
  assert.ok(plan.interpretation.unresolved[0].includes("Zzzxqvv"));
});
test("mixed script intent and Hindi spelling variants resolve the same catalogue entry", async () => {
  const runtime = fixtureRuntime(),
    query = "शाहरुख ki best movies after 1990";
  const plan = await planHindiQuery(query, runtime, {
    interpret: mock(
      interpretation(query, {
        people: [{ text: "शाहरुख", alternatives: [], role: "actor" }],
        filters: {
          yearMin: 1991,
          yearMax: null,
          ratingMin: null,
          ratingCountMin: null,
        },
        sort: { field: "rating", direction: "desc" },
      }),
    ),
  });
  assert.deepEqual(
    searchHindiPlan(runtime, plan).items.map((r) => r.id),
    ["1", "2"],
  );
});

const { evaluationCases, evaluationRuntime } =
  await import("./evaluation-cases.mjs");
const { assessCase, summarizeCases } = await import("./evaluation.mjs");
for (const item of evaluationCases)
  test(`evaluation oracle: ${item.id}`, async () => {
    const runtime = evaluationRuntime();
    const plan = await planHindiQuery(item.query, runtime, {
      interpret: mock(item.value),
    });
    const assessment = assessCase(
      item,
      plan,
      searchHindiPlan(runtime, plan, 100),
    );
    assert.deepEqual(assessment.failedChecks, []);
  });
test("live evaluation cannot count a successful fallback as model success", async () => {
  const runtime = evaluationRuntime(),
    item = evaluationCases.find((c) => c.id === "genre-after-en");
  const plan = await planHindiQuery(item.query, runtime);
  const assessment = assessCase(
    item,
    plan,
    searchHindiPlan(runtime, plan, 100),
    { live: true },
  );
  assert.equal(assessment.checks.results, true);
  assert.equal(assessment.checks.execution, false);
  assert.equal(assessment.passed, false);
});
test("empty-result oracles have null relevance scores, not NaN or automatic perfect recall", async () => {
  const runtime = evaluationRuntime(),
    item = evaluationCases.find((c) => c.id === "empty-valid");
  const plan = await planHindiQuery(item.query, runtime, {
    interpret: mock(item.value),
  });
  const row = assessCase(item, plan, searchHindiPlan(runtime, plan));
  assert.equal(row.recall, null);
  assert.equal(row.ndcg10, null);
  assert.equal(row.passed, true);
  assert.equal(
    summarizeCases([
      { ...row, fastPath: false, mode: "model", endToEndMs: 1, usage: null },
    ]).usage.unreportedCalls,
    1,
  );
});

const { localGenreRequest, genreTerms } = await import("./genre-terms.mjs");
test("reviewed genre vocabulary covers each supported category in both scripts", () => {
  const supported = Object.keys(genreTerms);
  for (const [genre, aliases] of Object.entries(genreTerms)) {
    for (const alias of aliases) {
      assert.deepEqual(
        localGenreRequest(alias, supported)?.genres,
        [genre],
        alias,
      );
    }
  }
  assert.equal(localGenreRequest("डरावनी फिल्में", ["Comedy"]), null);
});
test("common genres bypass the model, including disabled-model mode, with matching retrieval", async () => {
  let calls = 0;
  for (const query of [
    "डरावनी फिल्में",
    "darawni movies",
    "HORROR movies!",
    "मुझे डरावनी फिल्में दिखाओ",
    "show me horror movies",
  ]) {
    const runtime = evaluationRuntime();
    const plan = await planHindiQuery(query, runtime, {
      interpret: async () => {
        calls++;
        throw new Error("unexpected model call");
      },
    });
    assert.equal(plan.interpretation.mode, "local_genre", query);
    assert.deepEqual(plan.filters.genres, ["Horror"]);
    assert.equal(plan.multilingual.blocked, false);
    assert.deepEqual(
      plan.interpretation.originalSpans.map((e) => e.text),
      [query],
    );
    assert.equal(plan.interpretation.usage.inputTokens, 0);
    assert.equal(searchHindiPlan(runtime, plan).total, 5);
    assert.equal(
      (await planHindiQuery(query, runtime)).interpretation.mode,
      "local_genre",
    );
  }
  assert.equal(calls, 0);
});
test("genre fast paths preserve explicit AND/OR and are counted separately from model accuracy", async () => {
  assert.equal(evaluationCases.filter((c) => c.expected.localMode).length, 4);
  for (const item of evaluationCases.filter((c) => c.expected.localMode)) {
    let calls = 0;
    const runtime = evaluationRuntime();
    const plan = await planHindiQuery(item.query, runtime, {
      interpret: async () => {
        calls++;
        return { interpretation: item.value };
      },
    });
    assert.equal(calls, 0, item.id);
    assert.equal(plan.interpretation.mode, "local_genre");
    assert.equal(
      assessCase(item, plan, searchHindiPlan(runtime, plan, 100), {
        live: true,
      }).passed,
      true,
      item.id,
    );
  }
});
test("unknown words, title requests, and unsupported constraints cannot be erased by genre mapping", async () => {
  const queries = [
    "horror after 2010",
    "सबसे नई डरावनी फिल्में",
    "हिंदी भाषा की डरावनी फिल्में",
    "बिना हिंसा वाली डरावनी फिल्में",
    "no horror movies",
    "horror -comedy",
    "horror/comedy",
    "horror ४",
    "शाहरुख की डरावनी फिल्में",
    "horror nonsense movies",
    "Comedy नाम की फिल्म",
    "comedy या horror दोनों फिल्में",
    '"horror" movies',
  ];
  for (const query of queries) {
    let calls = 0;
    const plan = await planHindiQuery(query, evaluationRuntime(), {
      interpret: async () => {
        calls++;
        return {
          interpretation: interpretation(query, { unresolved: [query] }),
        };
      },
    });
    assert.equal(calls, 1, query);
    assert.notEqual(plan.interpretation.mode, "local_genre", query);
    assert.equal(plan.multilingual.blocked, true, query);
  }
  const plan = await planHindiQuery("Horror", evaluationRuntime());
  assert.equal(plan.interpretation.mode, "exact_alias");
  assert.deepEqual(
    plan.multilingual.titleMatches.map((m) => m.id),
    ["8"],
  );
});
