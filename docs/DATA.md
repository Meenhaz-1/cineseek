# Data sources and attribution

CineSeek keeps project code and benchmark specifications in Git. Runtime
datasets, third-party media, enrichment caches, generated registries, and
private reviewer activity are rebuilt locally and ignored.

## MovieLens

Base mode downloads **MovieLens Latest Small** from GroupLens and transforms it
into searchable documents. Review the [MovieLens dataset page](https://grouplens.org/datasets/movielens/)
and its accompanying README before redistribution or commercial use. MovieLens
data is not covered by CineSeek's MIT license.

## TMDB enrichment

Enriched mode is optional. Each user supplies their own TMDB API credential and
creates a local cache containing posters, overviews, actors, and directors.
Those snapshots are not committed. Refresh or remove them in accordance with
the [TMDB API terms](https://www.themoviedb.org/api-terms-of-use).

> This product uses TMDB and the TMDB APIs but is not endorsed, certified, or
> otherwise approved by TMDB.

TMDB data and images retain their applicable terms and are not covered by the
CineSeek code license.

## Benchmarks and reviews

The `benchmark/` directory contains CineSeek-authored query specifications,
provisional qrels, and review protocols. Generated runs and active reviewer
records remain local. Provisional judgments are incomplete and must not be
presented as exhaustive ground truth.
