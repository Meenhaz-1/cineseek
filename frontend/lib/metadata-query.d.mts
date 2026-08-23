export type MetadataFilters = {
  genres?: string[];
  genreMode?: "any" | "all";
  yearMin?: number;
  yearMax?: number;
  ratingMin?: number;
  ratingCountMin?: number;
};

export const GENRE_ALIASES: Record<string, string>;
export function extractExplicitTitleText(normalizedQuery: string): string;
export function metadataResidualTitleTerms(
  normalizedQuery: string,
  parsed?: ReturnType<typeof parseMetadataQuery>,
): string[];
export function parseMetadataQuery(normalizedQuery: string): MetadataFilters & {
  genres: string[];
  genreMode: "any" | "all";
  matchedGenreEntries: [string, string][];
  explicitTitleText: string;
  matches: {
    decade: RegExpMatchArray | null;
    after: RegExpMatchArray | null;
    before: RegExpMatchArray | null;
    rating: RegExpMatchArray | null;
    ratingCount: RegExpMatchArray | null;
  };
};
