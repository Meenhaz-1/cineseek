import assert from "node:assert/strict";
import test from "node:test";
import {
  EXPECTED_MOVIE_COUNT,
  sha256,
  validateReleaseManifest,
  verifyReleaseFile,
} from "./data-release.mjs";

function manifest(overrides = {}) {
  const file = {
    pathname: "cineseek-data/release/file",
    sha256: "a".repeat(64),
    bytes: 1,
  };
  return {
    schemaVersion: 1,
    releaseId: "2026-08-25-abcdef",
    movieCount: EXPECTED_MOVIE_COUNT,
    expiresAt: "2026-12-01T00:00:00.000Z",
    files: {
      corpus: file,
      registry: file,
      queries: file,
      qrels: file,
      summary: file,
      parserCases: file,
    },
    ...overrides,
  };
}

test("validates a current immutable release manifest", () => {
  assert.equal(
    validateReleaseManifest(manifest(), new Date("2026-08-25T00:00:00Z"))
      .releaseId,
    "2026-08-25-abcdef",
  );
});

test("rejects expired and incomplete releases", () => {
  assert.throws(
    () => validateReleaseManifest(manifest(), new Date("2027-01-01T00:00:00Z")),
    /expired/,
  );
  assert.throws(
    () =>
      validateReleaseManifest(
        manifest({ movieCount: 20 }),
        new Date("2026-08-25T00:00:00Z"),
      ),
    /9742 movies/,
  );
});

test("verifies release file hashes and lengths", () => {
  const contents = Buffer.from("cineseek");
  const descriptor = { bytes: contents.byteLength, sha256: sha256(contents) };
  assert.doesNotThrow(() => verifyReleaseFile(contents, descriptor, "corpus"));
  assert.throws(
    () => verifyReleaseFile(Buffer.from("changed"), descriptor, "corpus"),
    /unexpected byte length|SHA-256/,
  );
});
