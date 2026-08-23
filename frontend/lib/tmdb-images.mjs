const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";
const VALID_POSTER_PATH = /^\/[A-Za-z0-9_-]+\.(?:jpe?g|png|webp)$/i;
const VALID_POSTER_SIZES = new Set([
  "w92",
  "w154",
  "w185",
  "w342",
  "w500",
  "w780",
  "original",
]);

export function buildTmdbPosterUrl(posterPath, size = "w500") {
  if (typeof posterPath !== "string" || !VALID_POSTER_PATH.test(posterPath))
    return undefined;
  if (!VALID_POSTER_SIZES.has(size)) return undefined;
  return `${TMDB_IMAGE_BASE_URL}/${size}${posterPath}`;
}

export function isValidTmdbPosterPath(posterPath) {
  return typeof posterPath === "string" && VALID_POSTER_PATH.test(posterPath);
}
