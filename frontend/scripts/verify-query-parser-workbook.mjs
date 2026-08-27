import ExcelJS from "exceljs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const workbookPath = path.join(
  repoRoot,
  "outputs",
  "query-understanding-parser-cases",
  "query-understanding-parser-cases.xlsx",
);

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(workbookPath);

const expectedSheets = ["How to Use", "Parser Cases", "Summary"];
const actualSheets = workbook.worksheets.map((sheet) => sheet.name);
if (JSON.stringify(actualSheets) !== JSON.stringify(expectedSheets))
  throw new Error(`Unexpected sheets: ${actualSheets.join(", ")}`);

const parserSheet = workbook.getWorksheet("Parser Cases");
const summary = workbook.getWorksheet("Summary");
if (!parserSheet || !summary) throw new Error("Required sheet missing.");
if (parserSheet.rowCount !== 59)
  throw new Error(
    `Expected 58 cases plus header, found ${parserSheet.rowCount}.`,
  );
if (parserSheet.getCell("G2").dataValidation.type !== "list")
  throw new Error("Intent validation is missing.");
if (parserSheet.getCell("Q2").dataValidation.type !== "list")
  throw new Error("Implementation status validation is missing.");
if (parserSheet.getCell("R2").dataValidation.type !== "list")
  throw new Error("Review status validation is missing.");
if (!parserSheet.autoFilter) throw new Error("Parser Cases filter is missing.");
if (parserSheet.views[0]?.state !== "frozen")
  throw new Error("Parser Cases frozen panes are missing.");
if (parserSheet.getRow(1).height !== 34)
  throw new Error("Parser Cases header height is incorrect.");
if (
  parserSheet.getColumn("C").width < 30 ||
  parserSheet.getColumn("S").width < 40
)
  throw new Error("Key text columns are too narrow.");
if (parserSheet.getRow(1).fill?.fgColor?.argb !== "FF172033")
  throw new Error("Parser Cases header styling is missing.");
if (workbook.getWorksheet("How to Use")?.model.merges.length < 10)
  throw new Error("How to Use layout merges are missing.");
if (summary.model.merges.length < 5)
  throw new Error("Summary card layout merges are missing.");

const ids = new Set();
const categories = new Map();
const statuses = new Map();
for (let row = 2; row <= parserSheet.rowCount; row += 1) {
  const id = String(parserSheet.getCell(`A${row}`).value ?? "");
  if (!id || ids.has(id))
    throw new Error(`Missing or duplicate case ID at row ${row}: ${id}`);
  ids.add(id);
  const category = String(parserSheet.getCell(`B${row}`).value ?? "");
  const status = String(parserSheet.getCell(`Q${row}`).value ?? "");
  categories.set(category, (categories.get(category) ?? 0) + 1);
  statuses.set(status, (statuses.get(status) ?? 0) + 1);
}

const formulaCells = [
  "A5",
  "C5",
  "E5",
  ...Array.from({ length: categories.size }, (_, index) => `B${10 + index}`),
];
for (const address of formulaCells) {
  const value = summary.getCell(address).value;
  if (!value || typeof value !== "object" || !("formula" in value))
    throw new Error(`Expected formula missing from Summary!${address}`);
}

const stats = await fs.stat(workbookPath);
console.log(
  JSON.stringify({
    workbookPath,
    bytes: stats.size,
    sheets: actualSheets,
    cases: ids.size,
    categories: Object.fromEntries(categories),
    implementationStatuses: Object.fromEntries(statuses),
    validationsChecked: [
      "Expected Intent",
      "Implementation Status",
      "Review Status",
    ],
    formulasChecked: formulaCells.length,
    layoutChecks: [
      "column widths",
      "row heights",
      "header styling",
      "merged sections",
    ],
  }),
);
