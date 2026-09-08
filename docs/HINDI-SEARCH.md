# Hindi and Hinglish search experiment

Open **`/hindi-search`**. This is a separate page with separate API routes and
Unicode/alias indexes. The main page, original API routes, planner, tokenization,
and ranking behavior are unchanged. No main-page navigation link is added.

## Run locally

Use the normal CineSeek bootstrap and dev server. In `frontend/.env.local`:

```env
CINESEEK_DEPLOYMENT_MODE=local
CINESEEK_HINDI_MODEL_ENABLED=true
OPENAI_API_KEY=your-key
OPENAI_MODEL=gpt-5.4-nano
```

Use your configured model with Responses API structured-output support. Model
availability depends on your account. Restart the dev server after changing env.
Model requests require explicit opt-in and credentials and are disabled on Vercel
and outside local mode. With the model off, exact title aliases and direct person
aliases work; English parsing is limited and unhandled requests need rephrasing.
No Hindi UI toggle is required. Typing Hindi does not filter movie language.

The model receives the submitted query, supported genre vocabulary, and at most
five relevant catalogue name/alias candidates.
Autocomplete calls only local indexes. Exact title aliases bypass the model.
Responses use `store: false`, a 2,000-output-token cap, a five-second wall-clock
budget (including response parsing), and no automatic retry. Failures return a
visible deterministic fallback. Interpretations use a bounded 256-entry process
cache keyed by query, model, prompt and catalogue version. Source spelling also
participates so evidence spans always quote the current input. No results or IDs
from the model are trusted: entity names resolve against the local catalogue.

## Aliases and optional TMDB import

A small reviewed spelling list attaches `दिल से` and Shah Rukh Khan spellings
only when matching entities exist. It does not add movies or people. Optional
`aliases` on movie/person records and `metadata.title_aliases` on movies accept:

```json
{"text":"दिल से","language":"hi","script":"Devanagari","source":"reviewed"}
```

Movie `original_title` / `original_language` fields are also indexed. Aliases keep
provenance, map to existing IDs, and never accumulate ranking bonuses. Unicode
normalization preserves vowel marks and uses grapheme-based fuzzy comparisons.

To expand coverage, run from `frontend/` with TMDB credentials in `.env.local`:

```bash
node --env-file=.env.local scripts/enrich-hindi-aliases.mjs --limit 100
node --env-file=.env.local scripts/enrich-hindi-aliases.mjs --people --limit 100
```

The importer resumes with the next unprocessed records; `--refresh` refetches the
first selected records. It writes an independent, ignored `hindi-aliases.json`
beside the active corpus, never the main corpus or entity registry. Each success
is saved atomically; failures preserve previous aliases and result in a nonzero
exit status. Set `CINESEEK_HINDI_ALIASES_PATH` to use another supplemental file.
A supplemental file has `schemaVersion: 1`, `movies` keyed by MovieLens ID and
`people` keyed by existing person ID, each value an array of alias objects.
Non-TMDB aliases are retained during refresh. Country codes are not treated as
language codes. Empty translations are ignored. Coverage is shown in the UI.

## Semantics and diagnostics

The new planner implements the existing planner pattern and produces a QueryPlan
with isolated `interpretation` and `multilingual` extensions. It records original
spans, meanings, matched names/provenance, unresolved requests, model/cache status,
token usage and fallback reasons. Its retrieval adapter applies resolved title
and person constraints plus the existing genre/year/rating filters, then reuses
CineSeek's metadata/genre ranker and corpus priors. Unicode title matching uses the
best matching alias per movie, not the number of aliases. Explicit sorting occurs
before truncation; rating sorts require five ratings for average eligibility.

People resolve to real registry IDs and credits. Ambiguous people are displayed
for clarification; unresolved constraints block broad results. Title collisions
can return multiple actual catalogue entries. The model does not retrieve plots,
add missing films, or invent person/film IDs. Film-language filters, exclusions,
and plot discovery are unsupported and must appear in unresolved constraints.
Model semantic errors remain possible despite structural validation; evaluate
real queries before enabling a public model-backed release.

## Verify and evaluate

From `frontend/`:

```bash
node --test lib/hindi-search/hindi-search.test.mjs
node scripts/benchmark-hindi-search.mjs
node --env-file=.env.local scripts/benchmark-hindi-search.mjs --live
npm run test:title-index
npm run test:tmdb
npm run lint
npx tsc --noEmit
npm run build
```

The new test suite covers paired Hindi/Hinglish/English requests, script mixing,
Unicode equivalence, alias collisions, missing entities, constraint retention,
cache keys, provider failures, timeout cancellation, sorting and hosted guards.
The **38-case evaluation suite** is defined in
`frontend/lib/hindi-search/evaluation-cases.mjs`. It uses a synthetic 15-film
catalogue so expected titles, people, filters, sort order, and result IDs are
explicit. Ratings and credits in those fixtures are test data, not film facts.
The default mode injects expected interpretations and checks only pipeline
behavior. `--live` calls the configured model with the same five-second timeout
as the page. Model-required cases fail if they fall back, even when fallback
results happen to match. Five exact-alias cases are reported separately from the
33 cases requiring model interpretation. These are development cases, not a
held-out or representative production relevance study.

Coverage includes:

| Use case | Example | Expected behavior |
| --- | --- | --- |
| Exact names across scripts | `दिल से` / `dil se` | Same film; no model request |
| Unicode equivalence | `क़िला` / `क़िला` | Same title key |
| Preserve title meaning | `कल` | Match the title, not a request for tomorrow |
| Misspellings | `interstelar dikhao` / `sharukh ki movies` | Resolve catalogue title/person |
| Actor sorting | `shahrukh ki sabse achhi filmein` | Average rating descending |
| Mixed scripts | `शाहरुख ki best movies after 2000` | Person + year >= 2001 + rating sort |
| Director role | `नोलन द्वारा निर्देशित फिल्में` | Director credits only |
| Year boundaries | `२०१० के बाद की डरावनी फिल्में` | Horror, year >= 2011 |
| Inclusive range | `2010 se 2020 tak ki horror movies` | Both boundary years included |
| Genre intersection/union | `horror और thriller दोनों वाली फिल्में` | Require both genres |
| Rating vs rating count | `kam se kam 40 ratings wali horror movies` | At least 40 votes |
| Empty but valid results | `2030 ke baad ki horror movies` | No matches, no invented movie |
| Ambiguous or missing names | `khan ki movies` / unknown actor | Clarify; do not broaden results |
| Unsupported requirements | IMDb scores, exclusions, plot requests | Keep requirement visible; block broad matches |

The page's **Try more test cases** section also includes 12 clickable examples
with expected behavior for manual checking against the actual catalogue.

Each evaluation saves **report.json** and **report.md** under the ignored
`outputs/hindi-search-evaluation/` directory. Reports include pass/fail per case,
expected versus actual structured intent, results, raw structured model outputs,
validation/fallback failures, per-script and per-category accuracy, relevance
metrics, latency, and reported token usage. Empty expected-result sets use null
recall/MRR/nDCG, not artificial perfect scores. Timed-out calls can incur charges
even when token usage is unavailable.

From `frontend/`, `npm run benchmark:hindi:live` runs the full live suite.
You can also run all cases or focus on a failure directly:

```bash
node --env-file=.env.local scripts/benchmark-hindi-search.mjs --live
node --env-file=.env.local scripts/benchmark-hindi-search.mjs --live --case person-best-hi,person-typo
node --env-file=.env.local scripts/benchmark-hindi-search.mjs --live --category year-boundary
node scripts/benchmark-hindi-search.mjs --output ../outputs/hindi-search-evaluation/fixture
```

`--limit N` bounds the selected cases. `--concurrency N` accepts 1-4 (live default:
2). Cases run once with a fresh process cache; targeted reruns do not replace a
complete suite run. Record both baseline and final reports when tuning prompts.

Optional current per-million-token prices can be supplied via
`CINESEEK_MODEL_INPUT_USD_PER_MILLION`, `CINESEEK_MODEL_OUTPUT_USD_PER_MILLION`,
and `CINESEEK_MODEL_CACHED_INPUT_USD_PER_MILLION`. Without all three, estimated
cost is `null` rather than a guessed price.

Model comparisons can override the benchmark model without editing `.env.local`
or the application default:

```sh
npm run benchmark:hindi:live -- --model gpt-4.1-mini --output ../outputs/hindi-search-evaluation/mini-trial
npm run benchmark:hindi:live -- --model gpt-5.6-luna --reasoning none --output ../outputs/hindi-search-evaluation/luna-trial
```

`--reasoning` is an evaluation-only request override and is recorded in the JSON
report. Only supply it for models that support that setting. Compare model-only
latency separately from the five local exact-alias cases, repeat runs, and keep
the prompt and timeout fixed when comparing models.

Sources: [Unicode normalization](https://www.unicode.org/faq/normalization.html),
[structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
[TMDB translations](https://developer.themoviedb.org/reference/movie-translations),
[alternative titles](https://developer.themoviedb.org/reference/movie-alternative-titles),
[person details](https://developer.themoviedb.org/reference/person-details).

## Learning from Zepto

[Zepto's multilingual correction article](https://blog.zepto.com/lost-in-translation-how-we-fix-misspelled-multilingual-queries-with-llms-173ce00c2ba1)
informed a retrieval-before-interpretation step: bounded token/trigram candidate
retrieval and grapheme-aware comparison select up to five relevant movie/person
names for the prompt. The shortlist is deduplicated, versioned with the catalogue,
and visible in diagnostics. Movie-specific examples protect titles from literal
translation and preserve unsupported constraints. Candidates are evidence, not
forced replacements or a closed list of possible entities.

This implementation uses the existing lexical data, not Zepto's vector retrieval.
A later evaluation can compare multilingual embeddings on difficult phonetic
misspellings. Query-reformulation learning is also deferred: repeated searches are
not automatically trusted as corrections, and no user-query logging was added.
The article's prompt-based "instruct fine-tuning" does not update model weights.
Its reported conversion improvement should not be assumed to transfer to movies.

## Live development run — 2026-09-08

With `gpt-5.4-nano`, the first expanded live run passed **20/38** cases. It had
12 invalid outputs, two timeouts, and four interpretation failures. Prompt
revision `hindi-4` clarified handled request words versus unsupported constraints,
average scores versus vote counts, and exact source-text quoting.

The complete rerun passed **37/38 (97.4%)**: **32/33 model-required cases**, plus
all five exact-alias cases. All 33 model requests returned validated outputs;
there were no fallbacks in that run. Median end-to-end latency was 1.70 seconds,
and p95 was 2.70 seconds under the unchanged five-second timeout.

| Input style | Passed |
| --- | --- |
| Hindi | 14/14 |
| Hinglish | 14/15 |
| English | 5/5 |
| Mixed scripts | 4/4 |

The remaining failure was `pyaar wali filmein`: the model's evidence mentioned
romance, but `genres` was empty. This is retained as a failed case, not silently
accepted as a pass. The prompt was refined on these development examples, so the
result is **not held-out accuracy** and does not establish production relevance.
Timeouts occurred in earlier runs and may recur; a single run is not a latency
SLA. Catalogue coverage is evaluated separately from these synthetic fixtures.

Local reports:
- `outputs/hindi-search-evaluation/live-expanded-baseline/report.md`
- `outputs/hindi-search-evaluation/live-expanded-final/report.md`
- Corresponding `report.json` files contain case-level expected/actual data.

The final full run reported 34,104 input and 3,548 output tokens. Using the
[documented model prices](https://developers.openai.com/api/docs/models/gpt-5.4-nano)
checked on the run date ($0.20/M input, $0.02/M cached input, $1.25/M output), its
estimated token cost was **$0.01126**. This covers that final run only; earlier
runs included timeouts with unreported usage.

## Model latency comparison — 2026-09-08

Two fresh-process rounds per model reused the unchanged `hindi-4` prompt,
38 cases, concurrency two, and five-second timeout. Model order was reversed in
the second round. The table excludes the five local exact-alias cases per round
from both accuracy and latency; failures and timeouts remain included.

| Model | Model cases passed | Median | P95 | Fallbacks |
| --- | --- | --- | --- | --- |
| gpt-5.4-nano (current) | 64/66 | 1.74 s | 2.32 s | 0 |
| gpt-4.1-mini | 58/66 | 1.73 s | 2.70 s | 2 |
| gpt-5.6-luna, reasoning none | 63/66 | 2.21 s | 3.71 s | 2 |

Retain **gpt-5.4-nano**. Mini's median improvement was negligible and it made
more mistakes, including arbitrary year limits for newest/oldest requests.
Luna had similar observed accuracy but was slower and hit two timeouts.
These repeated development cases do not establish statistical significance or
held-out accuracy. No app default, main-page behavior, or production activation
was changed by the experiment.

Full results, per-round latency, failures, and reported token costs:
`outputs/hindi-search-evaluation/model-comparison/comparison.md` and
`comparison.json`; each model-round directory contains raw case reports.

## Reasoning effort comparison — 2026-09-08

Repeated the same experiment on `gpt-5.4-nano`, explicitly setting `none`,
`low`, and `medium`, two rounds each. The official model documentation identifies
`none` as the default, so the existing app already uses the lowest effort.
The prompt, 2,000 output-token cap, five-second timeout, and concurrency two
were unchanged. Model-only results (excluding local exact-alias cases):

| Effort | Model cases passed | Median | P95 | Fallbacks |
| --- | --- | --- | --- | --- |
| none | 62/66 | 1.79 s | 3.01 s | 2 |
| low | 61/66 | 2.10 s | 4.08 s | 3 |
| medium | 64/66 | 2.15 s | 3.36 s | 2 |

Keep `none` for the latency objective. Medium passed two additional cases but
added roughly 20% median latency; it is a candidate for further accuracy testing,
not a speed improvement. Low did not provide a consistent accuracy benefit.
The sample is small, repeated development cases are not independent held-out
examples, and timeouts occurred at every effort. These results assess the
current runtime limits, not accuracy with unlimited time or reasoning tokens.
The application configuration remains unchanged.

Reports: `outputs/hindi-search-evaluation/effort-comparison/comparison.md`,
`comparison.json`, and per-effort/per-round raw reports. Reproduce with:

```sh
npm run benchmark:hindi:live -- --model gpt-5.4-nano --reasoning low --output ../outputs/hindi-search-evaluation/low-trial
```

## Local genre translations

The separate Hindi search now checks a reviewed genre dictionary after exact
catalogue title matching and before model configuration, caching, or calls.
`frontend/lib/hindi-search/genre-terms.mjs` contains the versioned mappings for
19 catalogue categories, including Hindi script, common Hinglish variants, and
English names. Only categories present in the runtime catalogue are accepted.

Examples that skip the model:

| Query | Genre |
| --- | --- |
| डरावनी फिल्में / darawni movies | Horror |
| हँसाने वाली फिल्में / mazedar movies | Comedy |
| प्यार वाली फिल्में / pyaar wali filmein | Romance |
| विज्ञान कथा फिल्में / science fiction movies | Sci-Fi |
| horror और thriller दोनों वाली फिल्में | Horror AND Thriller |
| comedy या romance फिल्में | Comedy OR Romance |

The small grammar accepts bare category names, movie/film request words, and
common show/dikhao wrappers. Exact title/alias matches always win, including
movies named Horror. Unknown words, dates, ratings, sorting, people, quotes,
language restrictions, and exclusions do not get stripped away: the complete
original request continues to the existing model/fallback path. Local mappings
also work when model spending is disabled. The understanding panel displays
“Local genre translation · no model call” and the recognized genres.

The existing 38-case evaluation now has nine local fast paths (five title,
four genre), leaving 29 model-required cases. Historical model comparisons
above used the earlier 33-case model subset; do not compare their denominators
as if unchanged. The new fixture evaluation passed 38/38 and all 179 search
tests passed, including zero-call assertions, category vocabulary coverage,
constraints, title precedence, and local AND/OR retrieval. Fixture results
verify the pipeline, not new model accuracy. Report:
`outputs/hindi-search-evaluation/local-genres/report.md`.
