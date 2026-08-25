export const RUNTIME_FILES: Readonly<{
  corpus: string;
  registry: string;
  plannerRegistry: string;
  queries: string;
  qrels: string;
  summary: string;
  parserCases: string;
  manifest: string;
}>;
export function firstReadable(paths: string[]): Promise<string>;
export function resolveRuntimeFile(
  name: string,
  fallbackPaths?: string[],
): Promise<string>;
export function loadRuntimeManifest(): Promise<Record<string, unknown> | null>;
