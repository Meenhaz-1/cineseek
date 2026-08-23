import enrichmentCache from "../data/tmdb-enrichment-teaching.json";

export type Movie = {
  id: string;
  title: string;
  year: number;
  genres: string[];
  tags: string[];
  rating: number;
  ratings: number;
  imdb: string;
  tmdb: number;
  palette: string;
  overview?: string;
  runtime?: number | null;
  posterPath?: string | null;
  cast?: { id: number; name: string; character: string }[];
  matchReason?: {
    field: string;
    label: string;
    value: string;
    matchType: string;
  };
  relevanceScore?: number;
  learningUseCase?: string;
};

const baseMovies: Movie[] = [
  {
    id: "2571",
    title: "The Matrix",
    year: 1999,
    genres: ["Action", "Sci-Fi", "Thriller"],
    tags: ["alternate universe", "philosophy", "post apocalyptic"],
    rating: 4.192,
    ratings: 278,
    imdb: "tt0133093",
    tmdb: 603,
    palette: "jade",
  },
  {
    id: "58559",
    title: "The Dark Knight",
    year: 2008,
    genres: ["Action", "Crime", "Drama"],
    tags: ["psychology", "superhero", "dark", "gritty"],
    rating: 4.238,
    ratings: 149,
    imdb: "tt0468569",
    tmdb: 155,
    palette: "gold",
  },
  {
    id: "1197",
    title: "The Princess Bride",
    year: 1987,
    genres: ["Action", "Adventure", "Comedy", "Fantasy", "Romance"],
    tags: ["Inigo Montoya", "six-fingered man"],
    rating: 4.232,
    ratings: 142,
    imdb: "tt0093779",
    tmdb: 2493,
    palette: "rose",
  },
  {
    id: "7361",
    title: "Eternal Sunshine of the Spotless Mind",
    year: 2004,
    genres: ["Drama", "Romance", "Sci-Fi"],
    tags: ["memory", "dreamlike", "melancholy", "mind-bending"],
    rating: 4.16,
    ratings: 131,
    imdb: "tt0338013",
    tmdb: 38,
    palette: "blue",
  },
  {
    id: "5618",
    title: "Spirited Away",
    year: 2001,
    genres: ["Adventure", "Animation", "Fantasy"],
    tags: ["anime"],
    rating: 4.155,
    ratings: 87,
    imdb: "tt0245429",
    tmdb: 129,
    palette: "violet",
  },
  {
    id: "79132",
    title: "Inception",
    year: 2010,
    genres: ["Action", "Drama", "Mystery", "Sci-Fi", "Thriller"],
    tags: ["dreamlike", "heist", "cerebral", "surreal"],
    rating: 4.066,
    ratings: 143,
    imdb: "tt1375666",
    tmdb: 27205,
    palette: "orange",
  },
  {
    id: "109487",
    title: "Interstellar",
    year: 2014,
    genres: ["Sci-Fi", "IMAX"],
    tags: ["black hole", "time-travel", "thought-provoking"],
    rating: 3.993,
    ratings: 73,
    imdb: "tt0816692",
    tmdb: 157336,
    palette: "indigo",
  },
  {
    id: "55820",
    title: "No Country for Old Men",
    year: 2007,
    genres: ["Crime", "Drama"],
    tags: ["tense", "western"],
    rating: 3.898,
    ratings: 64,
    imdb: "tt0477348",
    tmdb: 6977,
    palette: "sand",
  },
  {
    id: "122882",
    title: "Mad Max: Fury Road",
    year: 2015,
    genres: ["Action", "Adventure", "Sci-Fi", "Thriller"],
    tags: ["beautiful", "cinematography", "visually appealing"],
    rating: 3.819,
    ratings: 47,
    imdb: "tt1392190",
    tmdb: 76341,
    palette: "fire",
  },
  {
    id: "48394",
    title: "Pan's Labyrinth",
    year: 2006,
    genres: ["Drama", "Fantasy", "Thriller"],
    tags: ["atmospheric", "bittersweet", "visually appealing"],
    rating: 3.815,
    ratings: 81,
    imdb: "tt0457430",
    tmdb: 1417,
    palette: "teal",
  },
  {
    id: "109374",
    title: "The Grand Budapest Hotel",
    year: 2014,
    genres: ["Comedy", "Drama"],
    tags: ["quirky", "stylish"],
    rating: 3.779,
    ratings: 52,
    imdb: "tt2278388",
    tmdb: 120467,
    palette: "pink",
  },
  {
    id: "1",
    title: "Toy Story",
    year: 1995,
    genres: ["Adventure", "Animation", "Children", "Comedy", "Fantasy"],
    tags: ["pixar", "fun", "friendship"],
    rating: 3.921,
    ratings: 215,
    imdb: "tt0114709",
    tmdb: 862,
    palette: "sky",
  },
  {
    id: "99145",
    title: "The Impossible",
    year: 2012,
    genres: ["Drama", "Thriller"],
    tags: ["survival", "disaster", "family"],
    rating: 3.667,
    ratings: 3,
    imdb: "tt1649419",
    tmdb: 80278,
    palette: "sand",
  },
  {
    id: "2",
    title: "Jumanji",
    year: 1995,
    genres: ["Adventure", "Children", "Fantasy"],
    tags: ["fantasy", "magic board game", "Robin Williams", "game"],
    rating: 3.432,
    ratings: 110,
    imdb: "tt0113497",
    tmdb: 8844,
    palette: "jade",
  },
  {
    id: "541",
    title: "Blade Runner",
    year: 1982,
    genres: ["Action", "Sci-Fi", "Thriller"],
    tags: [
      "robots",
      "androids",
      "artificial intelligence",
      "atmospheric",
      "cyberpunk",
      "dreamlike",
      "existentialism",
      "philosophical",
    ],
    rating: 4.101,
    ratings: 124,
    imdb: "tt0083658",
    tmdb: 78,
    palette: "indigo",
  },
  {
    id: "1214",
    title: "Alien",
    year: 1979,
    genres: ["Horror", "Sci-Fi"],
    tags: ["aliens"],
    rating: 3.969,
    ratings: 146,
    imdb: "tt0078748",
    tmdb: 348,
    palette: "teal",
  },
  {
    id: "318",
    title: "The Shawshank Redemption",
    year: 1994,
    genres: ["Crime", "Drama"],
    tags: ["prison", "Stephen King", "wrongful imprisonment", "Morgan Freeman"],
    rating: 4.429,
    ratings: 317,
    imdb: "tt0111161",
    tmdb: 278,
    palette: "gold",
  },
  {
    id: "924",
    title: "2001: A Space Odyssey",
    year: 1968,
    genres: ["Adventure", "Drama", "Sci-Fi"],
    tags: [
      "artificial intelligence",
      "atmospheric",
      "philosophical",
      "space travel",
      "slow paced",
      "surreal",
    ],
    rating: 3.894,
    ratings: 109,
    imdb: "tt0062622",
    tmdb: 62,
    palette: "blue",
  },
  {
    id: "47",
    title: "Seven (a.k.a. Se7en)",
    year: 1995,
    genres: ["Mystery", "Thriller"],
    tags: ["mystery", "twist ending", "serial killer"],
    rating: 3.975,
    ratings: 203,
    imdb: "tt0114369",
    tmdb: 807,
    palette: "fire",
  },
  {
    id: "60069",
    title: "WALL·E",
    year: 2008,
    genres: ["Adventure", "Animation", "Children", "Romance", "Sci-Fi"],
    tags: [
      "last man on earth",
      "love story",
      "post apocalyptic",
      "social commentary",
    ],
    rating: 4.058,
    ratings: 104,
    imdb: "tt0910970",
    tmdb: 10681,
    palette: "sky",
  },
];

const learningUseCases: Record<string, string> = {
  "2571": "Natural title order versus MovieLens's trailing article format",
  "58559": "Genre, dark-mood tags, and high-rating filters",
  "1197": "A title spanning several genres",
  "7361": "Long-title matching plus memory and dreamlike concepts",
  "5618": "Animation, fantasy, and anime vocabulary",
  "79132": "Plot and mood concepts that need semantic retrieval",
  "109487": "Rare-token retrieval and misspelling recovery",
  "55820": "Stop words inside a long exact title",
  "122882": "Several misspelled words in one title query",
  "48394": "Punctuation normalization and atmospheric tags",
  "109374": "Newest sorting and comedy/drama filtering",
  "1": "Common title words and spelling suggestions",
  "99145": "Person lookup through optional TMDB cast enrichment",
  "2": "A rare title token with a very small postings list",
  "541": "Title matching versus mood and philosophical tags",
  "1214": "Short-title ambiguity plus horror, sci-fi, and decade filters",
  "318": "Trailing-article normalization and high-rating ranking",
  "924": "Numeric titles, punctuation, and rich semantic tags",
  "47": "Aliases and stylized title forms such as Se7en",
  "60069": "Unicode punctuation and exact-title normalization",
};

type Enrichment = {
  overview: string;
  poster_path: string | null;
  runtime: number | null;
  cast: { id: number; name: string; character: string }[];
  directors?: { id: number; name: string }[];
  keywords?: { id: number; name: string }[];
};
const enrichment = enrichmentCache.movies as Record<string, Enrichment>;
export const movies: Movie[] = baseMovies.map((movie) => {
  const extra = enrichment[movie.id];
  const learningUseCase = learningUseCases[movie.id];
  return extra
    ? {
        ...movie,
        learningUseCase,
        overview: extra.overview,
        posterPath: extra.poster_path,
        runtime: extra.runtime,
        cast: extra.cast,
      }
    : { ...movie, learningUseCase };
});

export const examples = [
  "all movies",
  "intersteler",
  "dark sci-fi with philosophy",
  "horror sci-fi from the 1970s",
  "moie with tom holland",
];
