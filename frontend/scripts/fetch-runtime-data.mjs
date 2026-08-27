import { get } from "@vercel/blob";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import {
  validateReleaseManifest,
  verifyReleaseFile,
} from "../lib/data-release.mjs";
import { RUNTIME_FILES } from "../lib/runtime-data.mjs";

const releaseId = process.env.CINESEEK_DATA_RELEASE?.trim();
if (!releaseId)
  throw new Error("CINESEEK_DATA_RELEASE is required for a Vercel build.");
const destination = path.resolve(import.meta.dirname, "..", ".runtime-data");
const localManifestPath = path.join(destination, RUNTIME_FILES.manifest);
const outputNames = {
  corpus: RUNTIME_FILES.corpus,
  registry: RUNTIME_FILES.registry,
  plannerRegistry: RUNTIME_FILES.plannerRegistry,
  queries: RUNTIME_FILES.queries,
  qrels: RUNTIME_FILES.qrels,
  summary: RUNTIME_FILES.summary,
  parserCases: RUNTIME_FILES.parserCases,
};

async function hasLocalRelease() {
  try {
    const localManifest = validateReleaseManifest(
      JSON.parse(await readFile(localManifestPath, "utf8")),
    );
    if (localManifest.releaseId !== releaseId) return false;

    await Promise.all(
      Object.entries(outputNames).map(async ([key, filename]) => {
        const fileStats = await stat(path.join(destination, filename));
        if (fileStats.size !== localManifest.files[key].bytes)
          throw new Error(`Runtime data ${key} has an unexpected byte length.`);
      }),
    );
    return true;
  } catch {
    return false;
  }
}

if (await hasLocalRelease()) {
  console.log(
    `Runtime data release ${releaseId} is already available locally.`,
  );
  process.exit(0);
}

if (!process.env.BLOB_READ_WRITE_TOKEN)
  throw new Error(
    "BLOB_READ_WRITE_TOKEN is required to fetch the private data release.",
  );

async function download(pathname) {
  const result = await get(pathname, {
    access: "private",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  if (!result || result.statusCode !== 200 || !result.stream)
    throw new Error(`Private Blob object was not found: ${pathname}`);
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

function decode(contents, descriptor) {
  if (descriptor.encoding === "gzip") return gunzipSync(contents);
  return contents;
}

async function writeAtomically(filePath, contents) {
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, contents);
  await rename(temporary, filePath);
}

const prefix = `cineseek-data/${releaseId}`;
const manifestContents = await download(`${prefix}/manifest.json`);
const manifest = validateReleaseManifest(
  JSON.parse(manifestContents.toString("utf8")),
);
if (manifest.releaseId !== releaseId)
  throw new Error("Requested release ID does not match its manifest.");

await mkdir(destination, { recursive: true });
for (const [key, outputName] of Object.entries(outputNames)) {
  const descriptor = manifest.files[key];
  const contents = decode(await download(descriptor.pathname), descriptor);
  verifyReleaseFile(contents, descriptor, key);
  await writeAtomically(path.join(destination, outputName), contents);
}
await writeAtomically(
  path.join(destination, RUNTIME_FILES.manifest),
  manifestContents,
);
console.log(
  `Verified CineSeek runtime release ${releaseId} (${manifest.movieCount} movies).`,
);
