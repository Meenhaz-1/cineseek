export type PersonSuggestionCandidate = {
  id: string;
  name: string;
  movieCount: number;
  roles?: ("actor" | "director")[];
};
export type PersonNameSuggestion = {
  entityId: string;
  canonicalName: string;
  roles: ("actor" | "director")[];
  matchedText: string;
  suggestedQuery: string;
  distance: number;
  confidence: number;
};
export function suggestPersonName(
  query: string,
  people: PersonSuggestionCandidate[],
): PersonNameSuggestion | null;
