# Query-planner cases

The executable parser-case definitions are maintained in
[`frontend/scripts/build-query-parser-workbook.mjs`](../../frontend/scripts/build-query-parser-workbook.mjs).
That source creates a reviewable workbook with 57 cases, including expected
normalization, corrections, intent, entities, filters, routing, and unsupported
constraints.

Keeping the definitions beside the workbook generator prevents a copied JSON
snapshot from drifting away from the executable specification. Run:

```bash
cd frontend
npm run workbook:parser-cases
npm run workbook:parser-cases:verify
```

The generated workbook is written under `outputs/` and is intentionally not
committed.
