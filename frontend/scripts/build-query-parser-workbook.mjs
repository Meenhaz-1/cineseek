import ExcelJS from "exceljs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const outputDir = path.join(
  repoRoot,
  "outputs",
  "query-understanding-parser-cases",
);
const outputPath = path.join(
  outputDir,
  "query-understanding-parser-cases.xlsx",
);
const casesPath = path.join(outputDir, "parser-cases.json");

const testCase = (
  caseId,
  category,
  query,
  expectedNormalized,
  options = {},
) => ({
  caseId,
  category,
  query,
  expectedNormalized,
  expectedCorrection: options.correction ?? "",
  expectedSuggestion: options.suggestion ?? "",
  expectedIntent: options.intent ?? "discovery",
  expectedGenres: options.genres ?? "",
  expectedPeople: options.people ?? "",
  expectedYearMin: options.yearMin ?? "",
  expectedYearMax: options.yearMax ?? "",
  expectedRatingSource: options.ratingSource ?? "",
  expectedRatingMin: options.ratingMin ?? "",
  expectedSort: options.sort ?? "",
  expectedConcepts: options.concepts ?? "",
  expectedUnresolved: options.unresolved ?? "",
  implementationStatus: options.status ?? "Supported",
  reviewStatus: "Draft",
  notes: options.notes ?? "",
  expectedRetrievalQuery: options.retrievalQuery ?? "",
});

const cases = [
  testCase("NORM-001", "Normalization", "DARK SCI-FI", "dark sci-fi", {
    genres: "Sci-Fi",
    concepts: "dark",
  }),
  testCase("NORM-002", "Normalization", "  dark   sci-fi  ", "dark sci-fi", {
    genres: "Sci-Fi",
    concepts: "dark",
  }),
  testCase("NORM-003", "Normalization", "SCI_FI comedy", "sci fi comedy", {
    genres: "Sci-Fi | Comedy",
  }),
  testCase("NORM-004", "Normalization", "Comedy—Drama", "comedy drama", {
    genres: "Comedy | Drama",
  }),

  testCase(
    "SPELL-001",
    "Automatic spelling",
    "moie with tom holland",
    "movie with tom holland",
    {
      correction: "moie → movie",
      intent: "person_discovery",
      people: "Tom Holland",
    },
  ),
  testCase("SPELL-002", "Automatic spelling", "comey movies", "comedy movies", {
    correction: "comey → comedy",
    genres: "Comedy",
  }),
  testCase(
    "SPELL-003",
    "Automatic spelling",
    "comdey movies",
    "comedy movies",
    { correction: "comdey → comedy", genres: "Comedy" },
  ),
  testCase("SPELL-004", "Automatic spelling", "funy movies", "funny movies", {
    correction: "funy → funny",
    concepts: "funny",
  }),
  testCase(
    "SPELL-005",
    "Automatic spelling",
    "romntic movies",
    "romantic movies",
    { correction: "romntic → romantic", genres: "Romance" },
  ),
  testCase("SPELL-006", "Automatic spelling", "newst action", "newest action", {
    correction: "newst → newest",
    intent: "sorted_discovery",
    genres: "Action",
    sort: "year_desc",
  }),
  testCase(
    "SPELL-007",
    "Automatic spelling",
    "thriler after 2010",
    "thriller after 2010",
    {
      correction: "thriler → thriller",
      intent: "filtered_discovery",
      genres: "Thriller",
      yearMin: 2011,
    },
  ),

  testCase("SUGG-001", "Did you mean", "touy story", "touy story", {
    suggestion: "toy story",
    intent: "discovery",
    status: "Supported",
    notes: "Do not apply until the suggestion is accepted.",
  }),
  testCase("SUGG-002", "Did you mean", "matrx", "matrx", {
    suggestion: "matrix",
    intent: "general_search",
  }),
  testCase(
    "SUGG-003",
    "Automatic title spelling",
    "intersteler",
    "interstellar",
    {
      correction: "intersteler → interstellar",
      intent: "exact_title",
      notes: "A unique long single-token title is safe to apply automatically.",
    },
  ),
  testCase(
    "SUGG-004",
    "Did you mean",
    "tom hollnd movies",
    "tom hollnd movies",
    { suggestion: "tom holland movies", intent: "discovery" },
  ),
  testCase("SUGG-005", "Did you mean", "spirited awya", "spirited awya", {
    suggestion: "spirited away",
    intent: "discovery",
  }),
  testCase("SUGG-006", "Did you mean", "mad max fuy road", "mad max fuy road", {
    suggestion: "mad max fury road",
    intent: "discovery",
  }),

  testCase("TITLE-001", "Exact title", "The Matrix", "the matrix", {
    intent: "exact_title",
  }),
  testCase("TITLE-002", "Exact title", "matrix", "matrix", {
    intent: "exact_title",
  }),
  testCase("TITLE-003", "Exact title", "Toy Story", "toy story", {
    intent: "exact_title",
  }),
  testCase(
    "TITLE-004",
    "Exact title",
    "Eternal Sunshine of the Spotless Mind",
    "eternal sunshine of the spotless mind",
    { intent: "exact_title" },
  ),
  testCase(
    "TITLE-005",
    "Exact title",
    "Mad Max: Fury Road",
    "mad max: fury road",
    { intent: "exact_title" },
  ),

  testCase(
    "PERSON-001",
    "People",
    "movies with tom holland",
    "movies with tom holland",
    { intent: "person_discovery", people: "Tom Holland" },
  ),
  testCase(
    "PERSON-002",
    "People",
    "Christian Bale films",
    "christian bale films",
    { intent: "person_discovery", people: "Christian Bale" },
  ),
  testCase(
    "PERSON-003",
    "People",
    "Leonardo DiCaprio sci-fi",
    "leonardo dicaprio sci-fi",
    {
      intent: "person_discovery",
      people: "Leonardo DiCaprio",
      genres: "Sci-Fi",
    },
  ),
  testCase(
    "PERSON-004",
    "People",
    "movies starring Anne Hathaway",
    "movies starring anne hathaway",
    { intent: "person_discovery", people: "Anne Hathaway" },
  ),
  testCase(
    "PERSON-005",
    "People",
    "directed by Christopher Nolan",
    "directed by christopher nolan",
    {
      intent: "person_discovery",
      people: "Christopher Nolan",
      notes: "Resolved against the full director registry.",
    },
  ),

  testCase("GENRE-001", "Genres", "animated fantasy", "animated fantasy", {
    genres: "Animation | Fantasy",
  }),
  testCase(
    "GENRE-002",
    "Genres",
    "science fiction thriller",
    "science fiction thriller",
    { genres: "Sci-Fi | Thriller" },
  ),
  testCase("GENRE-003", "Genres", "romantic comedy", "romantic comedy", {
    genres: "Romance | Comedy",
  }),
  testCase("GENRE-004", "Genres", "crime drama", "crime drama", {
    genres: "Crime | Drama",
  }),
  testCase("GENRE-005", "Genres", "western adventure", "western adventure", {
    genres: "Western | Adventure",
  }),

  testCase(
    "FILTER-001",
    "Years and ratings",
    "comedy from the 1990s",
    "comedy from the 1990s",
    {
      intent: "filtered_discovery",
      genres: "Comedy",
      yearMin: 1990,
      yearMax: 1999,
    },
  ),
  testCase(
    "FILTER-002",
    "Years and ratings",
    "drama after 2000",
    "drama after 2000",
    { intent: "filtered_discovery", genres: "Drama", yearMin: 2001 },
  ),
  testCase(
    "FILTER-003",
    "Years and ratings",
    "thriller since 2010",
    "thriller since 2010",
    { intent: "filtered_discovery", genres: "Thriller", yearMin: 2010 },
  ),
  testCase(
    "FILTER-004",
    "Years and ratings",
    "movies before 1990",
    "movies before 1990",
    { intent: "filtered_discovery", yearMax: 1989 },
  ),
  testCase(
    "FILTER-005",
    "Years and ratings",
    "rated above 4",
    "rated above 4",
    { intent: "filtered_discovery", ratingSource: "MovieLens", ratingMin: 4 },
  ),
  testCase(
    "FILTER-006",
    "Years and ratings",
    "rating at least 3.5",
    "rating at least 3.5",
    { intent: "filtered_discovery", ratingSource: "MovieLens", ratingMin: 3.5 },
  ),
  testCase(
    "FILTER-007",
    "Years and ratings",
    "comedy which is 8+ in imdb",
    "comedy which is 8+ in imdb",
    {
      genres: "Comedy",
      ratingSource: "IMDb",
      ratingMin: 8,
      unresolved: "IMDb rating values unavailable",
      status: "Supported",
    },
  ),
  testCase(
    "FILTER-008",
    "Years and ratings",
    "movies from 1995 to 2005",
    "movies from 1995 to 2005",
    {
      intent: "filtered_discovery",
      yearMin: 1995,
      yearMax: 2005,
      status: "Planned",
    },
  ),
  testCase(
    "FILTER-009",
    "Years and ratings",
    "shortlist popular adventure movies from 1995",
    "shortlist popular adventure movies from 1995",
    {
      intent: "filtered_discovery",
      genres: "Adventure",
      yearMin: 1995,
      yearMax: 1995,
    },
  ),

  testCase("SORT-001", "Sorting", "latest comedy", "latest comedy", {
    intent: "sorted_discovery",
    genres: "Comedy",
    sort: "year_desc",
  }),
  testCase("SORT-002", "Sorting", "newest sci-fi", "newest sci-fi", {
    intent: "sorted_discovery",
    genres: "Sci-Fi",
    sort: "year_desc",
  }),
  testCase("SORT-003", "Sorting", "oldest comedy", "oldest comedy", {
    intent: "sorted_discovery",
    genres: "Comedy",
    sort: "year_asc",
    status: "Planned",
  }),
  testCase(
    "SORT-004",
    "Sorting",
    "highest rated thriller",
    "highest rated thriller",
    {
      intent: "sorted_discovery",
      genres: "Thriller",
      sort: "rating_desc",
      status: "Planned",
    },
  ),

  testCase(
    "AMB-001",
    "Ambiguity and invalid input",
    "latest comedy after 199e",
    "latest comedy after 199e",
    {
      intent: "sorted_discovery",
      genres: "Comedy",
      sort: "year_desc",
      unresolved: "Malformed year: 199e",
      status: "Planned",
    },
  ),
  testCase(
    "AMB-002",
    "Ambiguity and invalid input",
    "movies after 201",
    "movies after 201",
    { unresolved: "Incomplete year: 201", status: "Planned" },
  ),
  testCase(
    "AMB-003",
    "Ambiguity and invalid input",
    "movies after 20O5",
    "movies after 20O5",
    {
      suggestion: "movies after 2005",
      unresolved: "Possible O → 0 substitution",
      status: "Planned",
    },
  ),
  testCase("AMB-004", "Ambiguity and invalid input", "It", "it", {
    intent: "general_search",
    unresolved: "Ambiguous title/common word",
    status: "Planned",
  }),
  testCase(
    "AMB-005",
    "Ambiguity and invalid input",
    "bhayanak sci-fi",
    "bhayanak sci-fi",
    {
      genres: "Sci-Fi",
      concepts: "bhayanak",
      unresolved: "Possible Hindi mood term: scary",
      status: "Planned",
    },
  ),

  testCase(
    "COMBO-001",
    "Combined queries",
    "dark sci-fi from the 1990s",
    "dark sci-fi from the 1990s",
    {
      intent: "filtered_discovery",
      genres: "Sci-Fi",
      yearMin: 1990,
      yearMax: 1999,
      concepts: "dark",
    },
  ),
  testCase(
    "COMBO-002",
    "Combined queries",
    "latest comey movie after 2010",
    "latest comedy movie after 2010",
    {
      correction: "comey → comedy",
      intent: "filtered_discovery",
      genres: "Comedy",
      yearMin: 2011,
      sort: "year_desc",
    },
  ),
  testCase(
    "COMBO-003",
    "Combined queries",
    "Tom Holland action movies after 2015",
    "tom holland action movies after 2015",
    {
      intent: "person_discovery",
      genres: "Action",
      people: "Tom Holland",
      yearMin: 2016,
    },
  ),
  testCase(
    "COMBO-004",
    "Combined queries",
    "dreamlike romance about memory",
    "dreamlike romance about memory",
    { genres: "Romance", concepts: "dreamlike | memory" },
  ),
  testCase(
    "COMBO-005",
    "Combined queries",
    "comedy without romance",
    "comedy without romance",
    {
      genres: "Comedy",
      unresolved: "Excluded genre: Romance",
      status: "Planned",
    },
  ),
  testCase(
    "COMBO-006",
    "Combined queries",
    "latest comedy which is 8+ in imdb",
    "latest comedy which is 8+ in imdb",
    {
      intent: "sorted_discovery",
      genres: "Comedy",
      ratingSource: "IMDb",
      ratingMin: 8,
      sort: "year_desc",
      unresolved: "IMDb rating values unavailable",
    },
  ),

  testCase("ROUTE-001", "Term routing", "wars star", "wars star", {
    intent: "general_search",
    concepts: "wars | star",
    retrievalQuery: "wars star",
    notes:
      "Preserve a plausible plural title token instead of autocorrecting it to the War genre.",
  }),
  testCase("ROUTE-002", "Term routing", "war horse", "war horse", {
    genres: "War",
    concepts: "horse",
    retrievalQuery: "war horse",
    notes:
      "Keep residual title-like words alongside the lower-priority genre fallback.",
  }),
];

const workbook = new ExcelJS.Workbook();
workbook.creator = "CineSeek";
workbook.title = "Query Understanding Parser Cases";
workbook.subject =
  "Editable deterministic parser specification and review tracker";
workbook.description =
  "Cases for validating deterministic movie-search query understanding.";
workbook.created = new Date();
workbook.modified = new Date();
workbook.calcProperties.fullCalcOnLoad = true;

const colors = {
  ink: "FF111827",
  navy: "FF172033",
  lime: "FFD9FF62",
  cream: "FFF7F4EA",
  muted: "FF64748B",
  line: "FFD7DEE8",
  white: "FFFFFFFF",
  green: "FFDDF7E5",
  amber: "FFFFF2CC",
  rose: "FFFFE0E0",
};

const instructions = workbook.addWorksheet("How to Use", {
  views: [{ showGridLines: false }],
});
instructions.mergeCells("A1:H2");
instructions.getCell("A1").value =
  "CineSeek · Query Understanding Test Workbook";
instructions.getCell("A1").font = {
  name: "Georgia",
  size: 22,
  bold: true,
  color: { argb: colors.white },
};
instructions.getCell("A1").fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: colors.navy },
};
instructions.getCell("A1").alignment = {
  vertical: "middle",
  horizontal: "left",
};
instructions.mergeCells("A4:H4");
instructions.getCell("A4").value = "Purpose";
instructions.getCell("A5").value =
  "Use one row per query to define what the deterministic parser should produce. Edit expected values first; automated tests can later read the same specification.";
instructions.mergeCells("A5:H6");
instructions.mergeCells("A8:H8");
instructions.getCell("A8").value = "Review workflow";
const steps = [
  "1. Enter or edit the query and expected parser fields on Parser Cases.",
  "2. Use pipe-separated values for multiple genres, people, or concepts.",
  "3. Mark Implementation Status as Supported, Partial, or Planned.",
  "4. Run the parser tests, compare actual output, and record differences in Notes.",
  "5. Change Review Status to Reviewed only after manually checking the expectation.",
];
steps.forEach((step, index) => {
  instructions.mergeCells(`A${10 + index}:H${10 + index}`);
  instructions.getCell(`A${10 + index}`).value = step;
});
instructions.mergeCells("A17:H17");
instructions.getCell("A17").value = "Conventions";
const conventions = [
  ["Blank cell", "No value is expected for that field."],
  ["Pipe separator", "Use Genre A | Genre B for multi-value cells."],
  ["Expected Normalized", "The query after safe automatic corrections only."],
  [
    "Expected Suggestion",
    "A correction that requires the learner to accept Did you mean?.",
  ],
  [
    "Unresolved",
    "A recognized constraint that is ambiguous, malformed, or lacks data.",
  ],
];
instructions.getCell("A19").value = "Field";
instructions.getCell("C19").value = "Meaning";
conventions.forEach(([field, meaning], index) => {
  const row = 20 + index;
  instructions.mergeCells(`A${row}:B${row}`);
  instructions.mergeCells(`C${row}:H${row}`);
  instructions.getCell(`A${row}`).value = field;
  instructions.getCell(`C${row}`).value = meaning;
});
instructions.columns = [
  { width: 16 },
  { width: 3 },
  { width: 20 },
  { width: 14 },
  { width: 14 },
  { width: 14 },
  { width: 14 },
  { width: 14 },
];
instructions.getColumn(1).alignment = { vertical: "top", wrapText: true };
instructions.getColumn(3).alignment = { vertical: "top", wrapText: true };
for (const row of [4, 8, 17]) {
  instructions.getCell(`A${row}`).font = {
    bold: true,
    color: { argb: colors.ink },
    size: 13,
  };
  instructions.getCell(`A${row}`).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: colors.lime },
  };
}
instructions.getRow(19).font = { bold: true, color: { argb: colors.white } };
instructions.getRow(19).fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: colors.navy },
};
instructions.getCell("A5").alignment = { vertical: "top", wrapText: true };
instructions.getRow(5).height = 28;

const parserSheet = workbook.addWorksheet("Parser Cases", {
  views: [{ state: "frozen", xSplit: 3, ySplit: 1, showGridLines: false }],
});
parserSheet.columns = [
  { header: "Case ID", key: "caseId", width: 14 },
  { header: "Category", key: "category", width: 24 },
  { header: "Query", key: "query", width: 36 },
  { header: "Expected Normalized", key: "expectedNormalized", width: 36 },
  { header: "Expected Correction", key: "expectedCorrection", width: 22 },
  { header: "Expected Suggestion", key: "expectedSuggestion", width: 32 },
  { header: "Expected Intent", key: "expectedIntent", width: 22 },
  { header: "Expected Genres", key: "expectedGenres", width: 24 },
  { header: "Expected People", key: "expectedPeople", width: 24 },
  { header: "Year Min", key: "expectedYearMin", width: 12 },
  { header: "Year Max", key: "expectedYearMax", width: 12 },
  { header: "Rating Source", key: "expectedRatingSource", width: 16 },
  { header: "Rating Min", key: "expectedRatingMin", width: 12 },
  { header: "Expected Sort", key: "expectedSort", width: 18 },
  { header: "Ranking Concepts", key: "expectedConcepts", width: 25 },
  { header: "Expected Unresolved", key: "expectedUnresolved", width: 34 },
  { header: "Implementation Status", key: "implementationStatus", width: 21 },
  { header: "Review Status", key: "reviewStatus", width: 18 },
  { header: "Notes", key: "notes", width: 44 },
  {
    header: "Expected Retrieval Query",
    key: "expectedRetrievalQuery",
    width: 34,
  },
];
parserSheet.addRows(cases);
parserSheet.autoFilter = { from: "A1", to: "T1" };
parserSheet.getRow(1).height = 34;
parserSheet.getRow(1).font = { bold: true, color: { argb: colors.white } };
parserSheet.getRow(1).fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: colors.navy },
};
parserSheet.getRow(1).alignment = {
  vertical: "middle",
  horizontal: "left",
  wrapText: true,
};
parserSheet.eachRow((row, rowNumber) => {
  if (rowNumber === 1) return;
  row.height = 35;
  row.alignment = { vertical: "top", wrapText: true };
  row.eachCell((cell) => {
    cell.border = { bottom: { style: "hair", color: { argb: colors.line } } };
  });
});
for (let row = 2; row <= cases.length + 1; row += 1) {
  parserSheet.getCell(`G${row}`).dataValidation = {
    type: "list",
    allowBlank: false,
    formulae: [
      '"exact_title,person_discovery,filtered_discovery,sorted_discovery,discovery,general_search"',
    ],
  };
  parserSheet.getCell(`Q${row}`).dataValidation = {
    type: "list",
    allowBlank: false,
    formulae: ['"Supported,Partial,Planned"'],
  };
  parserSheet.getCell(`R${row}`).dataValidation = {
    type: "list",
    allowBlank: false,
    formulae: ['"Draft,Reviewed,Needs discussion"'],
  };
}
parserSheet.addConditionalFormatting({
  ref: `Q2:Q${cases.length + 1}`,
  rules: [
    {
      type: "containsText",
      operator: "containsText",
      text: "Supported",
      style: {
        fill: {
          type: "pattern",
          pattern: "solid",
          bgColor: { argb: colors.green },
        },
      },
    },
    {
      type: "containsText",
      operator: "containsText",
      text: "Partial",
      style: {
        fill: {
          type: "pattern",
          pattern: "solid",
          bgColor: { argb: colors.amber },
        },
      },
    },
    {
      type: "containsText",
      operator: "containsText",
      text: "Planned",
      style: {
        fill: {
          type: "pattern",
          pattern: "solid",
          bgColor: { argb: colors.rose },
        },
      },
    },
  ],
});
parserSheet.addConditionalFormatting({
  ref: `R2:R${cases.length + 1}`,
  rules: [
    {
      type: "containsText",
      operator: "containsText",
      text: "Reviewed",
      style: {
        fill: {
          type: "pattern",
          pattern: "solid",
          bgColor: { argb: colors.green },
        },
      },
    },
  ],
});
parserSheet.getColumn("A").font = {
  name: "Consolas",
  size: 10,
  color: { argb: colors.muted },
};
parserSheet.getColumn("C").font = {
  name: "Consolas",
  size: 10,
  color: { argb: colors.ink },
};
parserSheet.getColumn("D").font = {
  name: "Consolas",
  size: 10,
  color: { argb: colors.ink },
};
parserSheet.getColumn("J").numFmt = "0";
parserSheet.getColumn("K").numFmt = "0";
parserSheet.getColumn("M").numFmt = "0.0";

const summary = workbook.addWorksheet("Summary", {
  views: [{ showGridLines: false }],
});
summary.mergeCells("A1:F2");
summary.getCell("A1").value = "Parser Case Coverage";
summary.getCell("A1").font = {
  name: "Georgia",
  size: 22,
  bold: true,
  color: { argb: colors.white },
};
summary.getCell("A1").fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: colors.navy },
};
summary.getCell("A1").alignment = { vertical: "middle" };
const cards = [
  ["A4", "Total cases", `=COUNTA('Parser Cases'!A2:A200)`],
  ["C4", "Supported", `=COUNTIF('Parser Cases'!Q2:Q200,"Supported")`],
  ["E4", "Reviewed", `=COUNTIF('Parser Cases'!R2:R200,"Reviewed")`],
];
for (const [cell, label, formula] of cards) {
  const column = summary.getCell(cell).col;
  const row = summary.getCell(cell).row;
  summary.mergeCells(row, column, row, column + 1);
  summary.getCell(row, column).value = label;
  summary.mergeCells(row + 1, column, row + 2, column + 1);
  summary.getCell(row + 1, column).value = { formula };
  summary.getCell(row, column).font = {
    bold: true,
    color: { argb: colors.muted },
  };
  summary.getCell(row + 1, column).font = {
    bold: true,
    size: 24,
    color: { argb: colors.ink },
  };
  summary.getCell(row + 1, column).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: colors.cream },
  };
  summary.getCell(row + 1, column).alignment = {
    vertical: "middle",
    horizontal: "center",
  };
}
summary.getCell("A9").value = "Category";
summary.getCell("B9").value = "Cases";
const categories = [...new Set(cases.map((item) => item.category))];
categories.forEach((category, index) => {
  const row = 10 + index;
  summary.getCell(`A${row}`).value = category;
  summary.getCell(`B${row}`).value = {
    formula: `=COUNTIF('Parser Cases'!$B$2:$B$200,A${row})`,
  };
});
summary.getRow(9).font = { bold: true, color: { argb: colors.white } };
summary.getRow(9).fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: colors.navy },
};
summary.columns = [
  { width: 30 },
  { width: 12 },
  { width: 16 },
  { width: 12 },
  { width: 16 },
  { width: 12 },
];
summary.getColumn("B").numFmt = "0";

instructions.pageSetup = {
  orientation: "landscape",
  fitToPage: true,
  fitToWidth: 1,
  fitToHeight: 1,
  paperSize: 9,
};
summary.pageSetup = {
  orientation: "landscape",
  fitToPage: true,
  fitToWidth: 1,
  fitToHeight: 1,
  paperSize: 9,
};
parserSheet.pageSetup = {
  orientation: "landscape",
  fitToPage: true,
  fitToWidth: 1,
  fitToHeight: 0,
  paperSize: 9,
};
instructions.headerFooter.oddFooter = "CineSeek · Query Understanding";
summary.headerFooter.oddFooter = "CineSeek · Query Understanding";
parserSheet.headerFooter.oddFooter = "CineSeek · Query Understanding";

await fs.mkdir(outputDir, { recursive: true });
await workbook.xlsx.writeFile(outputPath);
await fs.writeFile(casesPath, `${JSON.stringify(cases, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify({
    outputPath,
    casesPath,
    caseCount: cases.length,
    sheets: workbook.worksheets.map((sheet) => sheet.name),
  }),
);
