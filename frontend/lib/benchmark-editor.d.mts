export type BenchmarkQuery = { id: string; text: string; category: string };
export type BenchmarkJudgment = {
  queryId: string;
  corpusId: string;
  score: number;
};
export function parseBenchmarkQueries(contents: string): BenchmarkQuery[];
export function parseBenchmarkQrels(contents: string): BenchmarkJudgment[];
export function validateBenchmarkDraft(
  input: unknown,
  corpusIds: Set<string>,
): { queries: BenchmarkQuery[]; judgments: BenchmarkJudgment[] };
export function serializeBenchmarkDraft(draft: {
  queries: BenchmarkQuery[];
  judgments: BenchmarkJudgment[];
}): { queries: string; qrels: string };
export function nextBenchmarkQueryId(queries: BenchmarkQuery[]): string;
