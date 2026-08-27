# Starter relevance benchmark — provisional labels

This benchmark contains 82 intentionally varied search intents for MovieLens
Latest Small. It covers exact titles, misspellings, genre requests, moods, plot
descriptions, decades, structured filters, and mixed intents.

Every judgment is generated and **provisional**. Do not report these scores as
human relevance judgments. The set is useful for smoke tests, ranking iteration,
and demonstrating the evaluation workflow.

## Manual review protocol

1. Give each query to at least two reviewers without showing the generated label.
2. Pool the top 20 results from lexical, semantic, and hybrid systems.
3. Grade each pooled movie: 0 = not relevant, 1 = plausible, 2 = relevant,
   3 = exact or ideal.
4. Adjudicate disagreements of two or more grades and record reviewer notes.
5. Add relevant movies missed by every system where reviewers know of one.
6. Publish the reviewed set as a new split; never overwrite `provisional.tsv`.

MovieLens has titles, genres, tags, and ratings but no plot summaries. Plot and
mood labels therefore encode starter expectations and are especially important
to review after optional TMDB enrichment is enabled.

The project-owned query-planner case specification and workbook workflow are
documented in [`parser-cases/README.md`](parser-cases/README.md).
