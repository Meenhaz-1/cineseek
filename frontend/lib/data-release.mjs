import { createHash } from "node:crypto";

export const DATA_RELEASE_SCHEMA_VERSION = 1;
export const EXPECTED_MOVIE_COUNT = 9_742;

export function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

export function countJsonLines(contents) {
  return contents.toString("utf8").split(/\r?\n/).filter(Boolean).length;
}

export function validateReleaseManifest(manifest, now = new Date()) {
  if (!manifest || typeof manifest !== "object")
    throw new Error("Runtime data manifest must be a JSON object.");
  if (manifest.schemaVersion !== DATA_RELEASE_SCHEMA_VERSION)
    throw new Error(
      `Unsupported runtime data schema ${manifest.schemaVersion ?? "unknown"}.`,
    );
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{5,79}$/.test(manifest.releaseId ?? ""))
    throw new Error("Runtime data releaseId is invalid.");
  if (manifest.movieCount !== EXPECTED_MOVIE_COUNT)
    throw new Error(
      `Runtime data must contain ${EXPECTED_MOVIE_COUNT} movies; found ${manifest.movieCount ?? "unknown"}.`,
    );
  if (!manifest.files || typeof manifest.files !== "object")
    throw new Error("Runtime data manifest has no files map.");
  for (const key of [
    "corpus",
    "registry",
    "queries",
    "qrels",
    "summary",
    "parserCases",
  ]) {
    const file = manifest.files[key];
    if (
      !file ||
      typeof file.pathname !== "string" ||
      !/^[a-f0-9]{64}$/.test(file.sha256 ?? "") ||
      !Number.isInteger(file.bytes) ||
      file.bytes < 1
    )
      throw new Error(`Runtime data manifest entry ${key} is invalid.`);
  }
  const expiresAt = new Date(manifest.expiresAt);
  if (!Number.isFinite(expiresAt.valueOf()) || expiresAt <= now)
    throw new Error(
      "Runtime data release is expired. Publish a fresh release.",
    );
  return manifest;
}

export function verifyReleaseFile(contents, descriptor, key) {
  if (contents.byteLength !== descriptor.bytes)
    throw new Error(`Runtime data ${key} has an unexpected byte length.`);
  const actualHash = sha256(contents);
  if (actualHash !== descriptor.sha256)
    throw new Error(`Runtime data ${key} failed SHA-256 verification.`);
}
