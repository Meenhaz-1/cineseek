import type {
  CombinedWeightKey,
  CombinedWeights,
  GenreWeightKey,
} from "./search-contracts";

export const DEFAULT_RANKER_WEIGHTS: CombinedWeights = {
  tokenCoverage: 25,
  orderedCoverage: 20,
  phraseMatch: 15,
  proximity: 10,
  dice: 15,
  editSimilarity: 15,
};

export const RESULT_PAGE_SIZE = 24;
export const DEFAULT_EXAMPLE_QUERY = "dark sci-fi with philosophy";
export const RESULT_PALETTES = [
  "jade",
  "gold",
  "rose",
  "blue",
  "violet",
  "orange",
  "indigo",
  "sand",
  "fire",
  "teal",
  "pink",
  "sky",
];

export const WEIGHT_CONTROLS: {
  key: CombinedWeightKey;
  label: string;
  hint: string;
}[] = [
  {
    key: "tokenCoverage",
    label: "Token coverage",
    hint: "Complete query words present",
  },
  {
    key: "orderedCoverage",
    label: "Ordered coverage",
    hint: "Words preserved left to right",
  },
  {
    key: "phraseMatch",
    label: "Phrase bonus",
    hint: "Complete adjacent phrase",
  },
  {
    key: "proximity",
    label: "Proximity",
    hint: "Matched words close together",
  },
  { key: "dice", label: "Dice similarity", hint: "Shared character trigrams" },
  {
    key: "editSimilarity",
    label: "Edit similarity",
    hint: "Whole-string character closeness",
  },
];

export const GENRE_WEIGHT_CONTROLS: {
  key: GenreWeightKey;
  label: string;
  hint: string;
}[] = [
  {
    key: "genreFocus",
    label: "Genre centrality",
    hint: "How concentrated the movie is in the requested genre",
  },
  {
    key: "bayesianRating",
    label: "Rating quality",
    hint: "MovieLens rating adjusted toward the corpus average",
  },
  {
    key: "ratingEvidence",
    label: "Rating-count evidence",
    hint: "Log-scaled MovieLens rating count as a popularity proxy",
  },
];
