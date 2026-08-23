import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const ignoredNames = new Set([
  ".git",
  ".local",
  ".next",
  ".npm-cache",
  ".pytest_cache",
  "__pycache__",
  "data",
  "node_modules",
  "outputs",
  "reports",
]);
const ignoredFiles = new Set([".env.local"]);
const textExtensions = new Set([
  "",
  ".css",
  ".json",
  ".jsonl",
  ".md",
  ".mjs",
  ".mts",
  ".py",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml",
]);
const rules = [
  { name: "OpenAI API key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { name: "GitHub token", pattern: /\bgh[opurs]_[A-Za-z0-9]{20,}\b/g },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  {
    name: "private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
  { name: "committed local environment", pattern: /(?:^|[\\/])\.env\.local$/g },
];

async function collect(directory, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignoredNames.has(entry.name) || ignoredFiles.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(absolute, files);
    else if (textExtensions.has(path.extname(entry.name).toLowerCase()))
      files.push(absolute);
  }
  return files;
}

const findings = [];
for (const file of await collect(repoRoot)) {
  const content = await readFile(file, "utf8");
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(content)) {
      findings.push(`${path.relative(repoRoot, file)}: ${rule.name}`);
    }
  }
}

if (findings.length) {
  console.error("Potential secrets detected (values intentionally hidden):");
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exitCode = 1;
} else {
  console.log(
    "No high-confidence secret patterns found in public source files.",
  );
}
