import ExcelJS from "exceljs";
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { planQuery } from "../../../lib/query-planner.mjs";
import { getSearchRuntime } from "../../../lib/search-runtime.mjs";

export const runtime = "nodejs";

type Mismatch = { field: string; expected: string; actual: string };
type ParserCaseResult = {
  caseId: string;
  category: string;
  query: string;
  passed: boolean;
  mismatches: Mismatch[];
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

async function loadWorkbookPath() {
  const candidates = [
    path.resolve(
      process.cwd(),
      "../outputs/query-understanding-parser-cases/query-understanding-parser-cases.xlsx",
    ),
    path.resolve(
      process.cwd(),
      "outputs/query-understanding-parser-cases/query-understanding-parser-cases.xlsx",
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
    "Parser workbook not found. Run npm.cmd run workbook:parser-cases from frontend first.",
  );
}

export async function POST() {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(await loadWorkbookPath());
    const sheet = workbook.getWorksheet("Parser Cases");
    if (!sheet) throw new Error("The Parser Cases sheet is missing.");
    const { plannerIndexes } = await getSearchRuntime();
    const results: ParserCaseResult[] = [];
    let planned = 0;

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      if (row.getCell(17).text.trim() !== "Supported") {
        planned += 1;
        continue;
      }
      const caseId = row.getCell(1).text.trim();
      const category = row.getCell(2).text.trim();
      const query = row.getCell(3).text;
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

      check("normalized", row.getCell(4).text, analysis.effectiveQuery);
      check(
        "correction",
        row.getCell(5).text,
        analysis.corrections
          .filter(({ policy }) => policy === "automatic")
          .map(
            ({ original, replacement }) =>
              `${original} → ${replacement.toLowerCase()}`,
          )
          .join(" | "),
      );
      check("suggestion", row.getCell(6).text, analysis.suggestedQuery);
      check("intent", row.getCell(7).text, analysis.intent);
      checkMembers(
        "genres",
        splitValues(row.getCell(8).text),
        analysis.entities.genres,
      );
      checkMembers(
        "people",
        splitValues(row.getCell(9).text),
        analysis.entities.people.map(({ name }) => name),
      );
      check("year min", row.getCell(10).text, analysis.filters.yearMin);
      check("year max", row.getCell(11).text, analysis.filters.yearMax);

      const ratingSource = row.getCell(12).text.trim();
      const expectedRating = row.getCell(13).text;
      if (ratingSource === "IMDb") {
        check(
          "IMDb rating min",
          expectedRating,
          analysis.unavailableFilters.some((item) =>
            item.includes(expectedRating),
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
        row.getCell(14).text,
        analysis.sort?.field === "year" && analysis.sort.direction === "desc"
          ? "year_desc"
          : "",
      );
      checkMembers(
        "ranking concepts",
        splitValues(row.getCell(15).text),
        analysis.routes.concepts,
      );
      check(
        "unresolved",
        row.getCell(16).text,
        analysis.unavailableFilters.length
          ? "IMDb rating values unavailable"
          : "",
      );
      if (row.getCell(20).text.trim())
        check(
          "retrieval query",
          row.getCell(20).text,
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
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Parser cases could not be executed.",
      },
      { status: 500 },
    );
  }
}
