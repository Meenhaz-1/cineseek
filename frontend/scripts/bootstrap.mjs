import { spawnSync } from "node:child_process";
import { access, cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const frontendRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(frontendRoot, "..");

async function exists(filePath) {
  return access(filePath)
    .then(() => true)
    .catch(() => false);
}

function run(command, args, cwd = repoRoot) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status}.`,
    );
}

function findPython() {
  const configured = process.env.CINESEEK_PYTHON;
  const candidates = configured
    ? [configured]
    : process.platform === "win32"
      ? ["python"]
      : ["python3", "python"];
  for (const candidate of candidates) {
    const result = spawnSync(
      candidate,
      ["-c", "import sys; print('.'.join(map(str, sys.version_info[:3])))"],
      { encoding: "utf8", shell: false },
    );
    if (result.status !== 0) continue;
    const [major, minor] = result.stdout.trim().split(".").map(Number);
    if (major > 3 || (major === 3 && minor >= 11)) return candidate;
  }
  throw new Error(
    "CineSeek requires Python 3.11 or newer. Set CINESEEK_PYTHON if it is not available as python/python3.",
  );
}

const [nodeMajor] = process.versions.node.split(".").map(Number);
if (nodeMajor < 20)
  throw new Error(
    `CineSeek requires Node.js 20 or newer; found ${process.versions.node}.`,
  );

const python = findPython();

console.log("Installing project dependencies…");
if (process.platform === "win32") {
  run(
    process.env.ComSpec ?? "cmd.exe",
    ["/d", "/s", "/c", "npm install"],
    frontendRoot,
  );
} else {
  run("npm", ["install"], frontendRoot);
}
run(python, ["-m", "pip", "install", "-e", ".[dev]"], repoRoot);

console.log("Preparing MovieLens Latest Small…");
run(python, ["-m", "cineseek", "download", "movielens"], repoRoot);

const runtimeBenchmark = path.join(repoRoot, "data", "movielens", "benchmark");
await mkdir(path.join(runtimeBenchmark, "qrels"), { recursive: true });
await cp(
  path.join(repoRoot, "benchmark", "queries.provisional.jsonl"),
  path.join(runtimeBenchmark, "queries.provisional.jsonl"),
);
await cp(
  path.join(repoRoot, "benchmark", "qrels", "provisional.tsv"),
  path.join(runtimeBenchmark, "qrels", "provisional.tsv"),
);
await cp(
  path.join(repoRoot, "benchmark", "README.md"),
  path.join(runtimeBenchmark, "README.md"),
);

const enrichmentDir = path.join(frontendRoot, "data");
const enrichmentPath = path.join(enrichmentDir, "tmdb-enrichment.json");
await mkdir(enrichmentDir, { recursive: true });
if (!(await exists(enrichmentPath))) {
  await writeFile(
    enrichmentPath,
    `${JSON.stringify({ schema_version: 2, fetched_at: null, movies: {} }, null, 2)}\n`,
    "utf8",
  );
}

console.log("Building searchable documents and entity indexes…");
run(process.execPath, ["scripts/build-enriched-corpus.mjs"], frontendRoot);
run(process.execPath, ["scripts/build-entity-registry.mjs"], frontendRoot);
run(process.execPath, ["scripts/build-teaching-tmdb-cache.mjs"], frontendRoot);
run(
  process.execPath,
  ["scripts/build-query-parser-workbook.mjs"],
  frontendRoot,
);

console.log("Generating the frozen provisional baseline…");
run(
  process.execPath,
  [
    "scripts/run-title-benchmark.mjs",
    "--output",
    "../outputs/query-planner-migration/unified-planner.run.jsonl",
  ],
  frontendRoot,
);

console.log("CineSeek setup is complete. Start the product with: npm run dev");
