import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";

export const RUNTIME_FILES = Object.freeze({
  corpus: "corpus.enriched.jsonl",
  registry: "entity-registry.json",
  queries: "benchmark-queries.jsonl",
  qrels: "benchmark-qrels.tsv",
  summary: "benchmark-summary.json",
  parserCases: "parser-cases.json",
  manifest: "manifest.json",
});

function runtimeRoots() {
  const configured = process.env.CINESEEK_RUNTIME_DATA_DIR?.trim();
  return [
    configured && path.resolve(configured),
    path.resolve(process.cwd(), ".runtime-data"),
  ].filter(Boolean);
}

export async function firstReadable(paths) {
  for (const candidate of paths) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next supported local or deployed layout.
    }
  }
  throw new Error(`No readable data source found: ${paths.join(", ")}`);
}

export async function resolveRuntimeFile(name, fallbackPaths = []) {
  return firstReadable([
    ...runtimeRoots().map((root) => path.join(root, name)),
    ...fallbackPaths,
  ]);
}

let manifestPromise;
let manifestKey;

export async function loadRuntimeManifest() {
  try {
    const manifestPath = await resolveRuntimeFile(RUNTIME_FILES.manifest);
    const fileStats = await stat(manifestPath);
    const key = `${manifestPath}:${fileStats.size}:${fileStats.mtimeMs}`;
    if (!manifestPromise || manifestKey !== key) {
      manifestKey = key;
      manifestPromise = readFile(manifestPath, "utf8").then(JSON.parse);
    }
    return await manifestPromise;
  } catch {
    return null;
  }
}
