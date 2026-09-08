import { scriptOf, textKey } from "./text.mjs";
const alias = (text, language, source) => ({
  text,
  language: language || "und",
  script: scriptOf(text || ""),
  source,
});
function unique(aliases) {
  const seen = new Set();
  return aliases.filter((a) => {
    const key = textKey(a.text);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function movieAliases(movie) {
  return unique([
    alias(movie.original_title, movie.original_language, "TMDB:original_title"),
    ...(movie.translations?.translations ?? [])
      .filter((t) => ["hi", "en"].includes(t.iso_639_1))
      .map((t) => alias(t.data?.title, t.iso_639_1, "TMDB:translation")),
    ...(movie.alternative_titles?.titles ?? [])
      .filter((t) => ["IN", "US", "GB"].includes(t.iso_3166_1))
      .map((t) => alias(t.title, "und", "TMDB:alternative_title")),
  ]);
}
export function personAliases(person) {
  return unique([
    alias(person.name, "und", "TMDB:name"),
    ...(person.also_known_as ?? []).map((name) =>
      alias(name, "und", "TMDB:also_known_as"),
    ),
  ]);
}
export async function fetchAliases(
  kind,
  id,
  { apiKey, bearerToken, fetchImpl = fetch },
) {
  if (!["movie", "person"].includes(kind) || !/^\d+$/.test(String(id)))
    throw new Error("Invalid TMDB entity");
  const url = new URL(`https://api.themoviedb.org/3/${kind}/${id}`);
  if (kind === "movie")
    url.searchParams.set(
      "append_to_response",
      "translations,alternative_titles",
    );
  if (apiKey) url.searchParams.set("api_key", apiKey);
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`TMDB returned HTTP ${response.status}`);
  const value = await response.json();
  if (String(value.id) !== String(id))
    throw new Error("TMDB entity ID mismatch");
  return kind === "movie" ? movieAliases(value) : personAliases(value);
}
