import { normalizeText } from "./text.mjs";

// Reviewed category vocabulary, not generated translations. Only whole requests
// matching this bounded grammar are handled locally; unknown words are retained
// for the model. Exact catalogue title matches take precedence in the planner.
export const GENRE_TERMS_VERSION = "genre-terms-1";
export const genreTerms = {
  Action: ["एक्शन", "एक्शन वाली", "मारधाड़", "मार धाड़", "action"],
  Adventure: ["एडवेंचर", "साहसिक", "रोमांचक साहसिक", "adventure"],
  Animation: [
    "एनिमेशन",
    "एनीमेशन",
    "एनिमेटेड",
    "कार्टून",
    "animation",
    "animated",
    "cartoon",
  ],
  Children: [
    "बच्चों की",
    "बच्चों के लिए",
    "bachchon ki",
    "bachon ki",
    "kids",
    "children",
  ],
  Comedy: [
    "कॉमेडी",
    "हास्य",
    "मजेदार",
    "मज़ेदार",
    "मज़ेदार",
    "हँसाने वाली",
    "हंसाने वाली",
    "comedy",
    "comedies",
    "mazedar",
    "majedar",
    "hasane wali",
    "hansane wali",
  ],
  Crime: ["क्राइम", "अपराध", "अपराध वाली", "crime"],
  Documentary: ["डॉक्यूमेंट्री", "वृत्तचित्र", "documentary", "documentaries"],
  Drama: ["ड्रामा", "drama"],
  Fantasy: ["फैंटेसी", "फंतासी", "fantasy"],
  "Film-Noir": ["फिल्म नोयर", "film-noir", "film noir"],
  Horror: [
    "हॉरर",
    "डरावनी",
    "डरावना",
    "डरावने",
    "horror",
    "darawani",
    "darawane",
    "darawni",
    "daravni",
    "daravani",
    "daravne",
  ],
  Musical: ["म्यूजिकल", "संगीतमय", "musical", "musicals"],
  Mystery: ["मिस्ट्री", "रहस्य", "रहस्यमय", "mystery", "rahasya", "rahasyamay"],
  Romance: [
    "रोमांस",
    "रोमांटिक",
    "प्रेम",
    "प्यार वाली",
    "romance",
    "romantic",
    "pyaar wali",
    "pyar wali",
  ],
  "Sci-Fi": [
    "साइंस फिक्शन",
    "विज्ञान कथा",
    "science fiction",
    "sci-fi",
    "sci fi",
    "vigyan katha",
  ],
  Thriller: ["थ्रिलर", "thriller"],
  War: ["युद्ध", "युद्ध वाली", "जंग वाली", "war", "yudh", "yuddh", "jung wali"],
  Western: ["वेस्टर्न", "western"],
  IMAX: ["आईमैक्स", "imax"],
};
const key = (text) => normalizeText(text);
const terms = new Map(
  Object.entries(genreTerms).flatMap(([genre, aliases]) =>
    [genre, ...aliases].map((alias) => [key(alias), genre]),
  ),
);

export function localGenreRequest(query, supportedGenres) {
  // Do not tokenize away punctuation: operators, quotes, digits, exclusions and
  // unrecognized constraints must never turn into a broader local search.
  let text = key(query)
    .replace(/[.!?।]+$/u, "")
    .trim();
  text = text.replace(/^(?:show me|show|मुझे|mujhe) /u, "");
  text = text.replace(/ (?:दिखाओ|दिखाइए|dikhao|dikhaiye)$/u, "");
  text = text.replace(
    / (?:फिल्में|फ़िल्में|फिल्म|फ़िल्म|मूवीज़|मूवीज|movies?|films?|filmein|filme)$/u,
    "",
  );
  text = text.replace(/ (?:वाली|wali)$/u, "");
  // Some aliases include वाली/wali; look up both forms deliberately.
  const lookup = (part) =>
    terms.get(part) ?? terms.get(`${part} वाली`) ?? terms.get(`${part} wali`);
  const single = lookup(text);
  if (single && supportedGenres.includes(single))
    return { genres: [single], genreMode: "any" };
  let genreMode = "any";
  if (/ (?:दोनों|dono|both)$/u.test(text)) {
    genreMode = "all";
    text = text.replace(/ (?:दोनों|dono|both)$/u, "");
  }
  const parts = text.split(/ (?:और|and|aur|या|or|ya) /u);
  if (parts.length !== 2) return null;
  const hasOr = / (?:या|or|ya) /u.test(text);
  if (hasOr && genreMode === "all") return null;
  if (!hasOr) genreMode = "all";
  const genres = parts.map(lookup);
  if (genres.some((genre) => !genre || !supportedGenres.includes(genre)))
    return null;
  return { genres: [...new Set(genres)], genreMode };
}
