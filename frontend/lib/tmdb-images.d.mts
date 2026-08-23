export type TmdbPosterSize =
  "w92" | "w154" | "w185" | "w342" | "w500" | "w780" | "original";

export function buildTmdbPosterUrl(
  posterPath?: string | null,
  size?: TmdbPosterSize,
): string | undefined;
export function isValidTmdbPosterPath(
  posterPath: unknown,
): posterPath is string;
