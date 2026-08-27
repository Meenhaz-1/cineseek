import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { planQuery } from "../../../lib/query-planner.mjs";
import { getSearchRuntime } from "../../../lib/search-runtime.mjs";
import {
  RUNTIME_FILES,
  resolveRuntimeFile,
} from "../../../lib/runtime-data.mjs";
import { internalErrorResponse } from "../../../lib/api-errors.mjs";

export const runtime = "nodejs";

type Mismatch = { field: string; expected: string; actual: string };
type ParserCaseResult = {
  caseId: string;
  category: string;
  query: string;
  passed: boolean;
  mismatches: Mismatch[];
};
type ParserCase = {
  caseId: string;
  category: string;
  query: string;
  expectedNormalized: string;
  expectedCorrection: string;
  expectedSuggestion: string;
  expectedIntent: string;
  expectedGenres: string;
  expectedPeople: string;
  expectedYearMin: string | number;
  expectedYearMax: string | number;
  expectedRatingSource: string;
  expectedRatingMin: string | number;
  expectedSort: string;
  expectedConcepts: string;
  expectedUnresolved: string;
  implementationStatus: string;
  expectedRetrievalQuery: string;
};

function splitValues(value: string) {
  return value
    ? value
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function sameMembers(left: string[], right: string[]) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function display(value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  return Array.isArray(value) ? value.join(" | ") || "—" : String(value);
}

async function loadCasesPath() {
  try {
    return await resolveRuntimeFile(RUNTIME_FILES.parserCases);
  } catch {
    // Fall back to the generated local case specification below.
  }
  const candidates = [
    path.resolve(
      process.cwd(),
      "../outputs/query-understanding-parser-cases/parser-cases.json",
    ),
    path.resolve(
      process.cwd(),
      "outputs/query-understanding-parser-cases/parser-cases.json",
    ),
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next local project layout.
    }
  }
  throw new Error(
    "Parser cases not found. Run npm.cmd run workbook:parser-cases from frontend first.",
  );
}

export async function POST() {
  try {
    const cases = JSON.parse(
      await fs.readFile(
        /* turbopackIgnore: true */ await loadCasesPath(),
        "utf8",
      ),
    ) as ParserCase[];
    if (!Array.isArray(cases))
      throw new Error("The parser case file is invalid.");
    const { plannerIndexes } = await getSearchRuntime();
    const results: ParserCaseResult[] = [];
    let planned = 0;

    for (const parserCase of cases) {
      if (parserCase.implementationStatus !== "Supported") {
        planned += 1;
        continue;
      }
      const { caseId, category, query } = parserCase;
      const analysis = planQuery(query, plannerIndexes);
      const mismatches: Mismatch[] = [];
      const check = (field: string, expected: unknown, actual: unknown) => {
        if (display(expected) !== display(actual))
          mismatches.push({
            field,
            expected: display(expected),
            actual: display(actual),
          });
      };
      const checkMembers = (
        field: string,
        expected: string[],
        actual: string[],
      ) => {
        if (!sameMembers(expected, actual))
          mismatches.push({
            field,
            expected: display(expected),
            actual: display(actual),
          });
      };

      check(
        "normalized",
        parserCase.expectedNormalized,
        analysis.effectiveQuery,
      );
      check(
        "correction",
        parserCase.expectedCorrection,
        analysis.corrections
          .filter(({ policy }) => policy === "automatic")
          .map(
            ({ original, replacement }) =>
              `${original} → ${replacement.toLowerCase()}`,
          )
          .join(" | "),
      );
      check(
        "suggestion",
        parserCase.expectedSuggestion,
        analysis.suggestedQuery,
      );
      check("intent", parserCase.expectedIntent, analysis.intent);
      checkMembers(
        "genres",
        splitValues(parserCase.expectedGenres),
        analysis.entities.genres,
      );
      checkMembers(
        "people",
        splitValues(parserCase.expectedPeople),
        analysis.entities.people.map(({ name }) => name),
      );
      check("year min", parserCase.expectedYearMin, analysis.filters.yearMin);
      check("year max", parserCase.expectedYearMax, analysis.filters.yearMax);

      const ratingSource = parserCase.expectedRatingSource;
      const expectedRating = parserCase.expectedRatingMin;
      if (ratingSource === "IMDb") {
        check(
          "IMDb rating min",
          expectedRating,
          analysis.unavailableFilters.some((item) =>
            item.includes(String(expectedRating)),
          )
            ? expectedRating
            : undefined,
        );
      } else {
        check(
          "MovieLens rating min",
          expectedRating,
          analysis.filters.ratingMin,
        );
      }
      check(
        "sort",
        parserCase.expectedSort,
        analysis.sort?.field === "year" && analysis.sort.direction === "desc"
          ? "year_desc"
          : "",
      );
      checkMembers(
        "ranking concepts",
        splitValues(parserCase.expectedConcepts),
        analysis.routes.concepts,
      );
      check(
        "unresolved",
        parserCase.expectedUnresolved,
        analysis.unavailableFilters.length
          ? "IMDb rating values unavailable"
          : "",
      );
      if (String(parserCase.expectedRetrievalQuery).trim())
        check(
          "retrieval query",
          parserCase.expectedRetrievalQuery,
          analysis.routes.titleQuery,
        );
      results.push({
        caseId,
        category,
        query,
        passed: mismatches.length === 0,
        mismatches,
      });
    }

    const passed = results.filter((result) => result.passed).length;
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      planner: { id: "deterministic", version: "1.0.0" },
      totals: {
        all: results.length + planned,
        executed: results.length,
        passed,
        failed: results.length - passed,
        planned,
      },
      results,
    });
  } catch (error) {
    return internalErrorResponse(
      "query-parser-tests",
      error,
      "Parser cases could not be executed.",
    );
  }
}
