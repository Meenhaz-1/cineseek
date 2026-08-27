# Deploy CineSeek to Vercel

CineSeek deploys as a read-only portfolio application. Search and entity APIs
use a versioned private Vercel Blob release; benchmark writes are local-only.

## 1. Build the enriched data locally

Run the regular bootstrap and optional TMDB enrichment. The deployment release
requires these generated files:

- `data/movielens/corpus.enriched.jsonl`
- `data/movielens/entity-registry.json`
- `outputs/query-understanding-parser-cases/query-understanding-parser-cases.xlsx`

The corpus and registry must both contain 9,742 MovieLens movies. Runtime data,
the TMDB cache, and credentials remain ignored by Git.

## 2. Create the Vercel project and private Blob store

1. Import `Meenhaz-1/cineseek` in the Vercel dashboard.
2. Set **Root Directory** to `frontend` and **Node.js Version** to 24.
3. In the project's Storage tab, create a **Private Blob** store and connect it
   to Preview and Production. This supplies `BLOB_READ_WRITE_TOKEN`.
4. Pull or copy that token into an ignored local environment for the one-time
   release upload.

## 3. Publish an immutable data release

From `frontend/`, with `BLOB_READ_WRITE_TOKEN` available in the process:

```bash
npm run data:release
```

Validate the complete release locally without contacting Vercel:

```bash
npm run data:release:check
```

The command validates row counts and entity relationships, uploads every data
file without overwrite permission, uploads the manifest last, and prints the
release ID. To choose a release ID explicitly:

```bash
npm run data:release -- --release 2026-08-25-initial
```

## 4. Configure Preview and Production

Add these variables to both environments:

```text
CINESEEK_DATA_RELEASE=<release ID printed above>
CINESEEK_DEPLOYMENT_MODE=portfolio
NEXT_PUBLIC_CINESEEK_DEPLOYMENT_MODE=portfolio
```

Do not add `TMDB_API_KEY` or `TMDB_READ_TOKEN` to the public
deployment. `vercel.json` runs `npm run vercel-build`, which downloads the
pinned release, verifies every SHA-256 hash, and packages `.runtime-data` with
the required server functions.

## 5. Verify the Preview deployment

Before promoting it, verify:

- `/api/health` reports `status: ok`, the expected release ID, and 9,742 movies.
- `star wars`, `tom cuise`, `directed by steven spielburg`, `romantic comedy`,
  and a structured year/rating query return results.
- Actor, director, genre, and tag entity pages load related movies.
- Posters load from `image.tmdb.org`.
- The benchmark is visibly read-only.
- POST requests to `/api/benchmark-editor` and `/api/benchmark-pool` return 403.
- Browser console, accessibility checks, and Vercel function logs show no
  errors.

## Local benchmark writes

Benchmark editor and review-pool writes are disabled by default. To enable them
for local development only, add both lines to `frontend/.env.local`:

```dotenv
CINESEEK_DEPLOYMENT_MODE=local
CINESEEK_ALLOW_BENCHMARK_WRITES=true
```

Do not add `CINESEEK_ALLOW_BENCHMARK_WRITES` to Vercel. The write routes remain
disabled unless the deployment is explicitly in local mode and the opt-in is
set to `true`.

## Updating and rolling back data

Publish a new immutable release, update `CINESEEK_DATA_RELEASE`, and deploy a
Preview before promoting it. Roll back by promoting the previous successful
deployment or restoring the prior release ID and redeploying. Retain at least
the two most recent releases.

Private Blob storage has usage-based limits and pricing. Review usage in Vercel
after launch and add shared rate limiting before moving beyond light portfolio
traffic.
