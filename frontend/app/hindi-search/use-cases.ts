export const searchUseCases = [
  {
    category: "Local genre translations · no model call",
    cases: [
      {
        query: "डरावनी फिल्में",
        expectation: "Horror movies, translated locally.",
      },
      {
        query: "pyaar wali filmein",
        expectation: "Romance movies, translated locally.",
      },
      {
        query: "हँसाने वाली फिल्में",
        expectation: "Comedy movies, translated locally.",
      },
    ],
  },
  {
    category: "Titles & spelling",
    cases: [
      {
        query: "इन्सेप्शन फिल्म दिखाओ",
        expectation:
          "Resolve the title to Inception, if it is in the catalogue.",
      },
      {
        query: "interstelar dikhao",
        expectation: "Resolve the misspelled title to Interstellar.",
      },
    ],
  },
  {
    category: "People & mixed scripts",
    cases: [
      {
        query: "sharukh ki movies",
        expectation: "Resolve the spelling to Shah Rukh Khan.",
      },
      {
        query: "शाहरुख ki best movies after 2000",
        expectation: "Person match, year 2001 onward, highest rated first.",
      },
      {
        query: "नोलन द्वारा निर्देशित फिल्में",
        expectation: "Find Christopher Nolan's director credits.",
      },
    ],
  },
  {
    category: "Genres & dates",
    cases: [
      {
        query: "२०१० के बाद की डरावनी फिल्में",
        expectation: "Horror films from 2011 onward.",
      },
      {
        query: "2010 se 2020 tak ki horror movies",
        expectation: "Horror films from 2010 through 2020, inclusive.",
      },
      {
        query: "horror और thriller दोनों वाली फिल्में",
        expectation: "Require both Horror and Thriller genres.",
      },
    ],
  },
  {
    category: "Ratings & sorting",
    cases: [
      {
        query: "sabse purani horror movies",
        expectation: "Horror films, oldest first.",
      },
      {
        query: "kam se kam 40 ratings wali horror movies",
        expectation:
          "Require at least 40 ratings, not an average rating of 40.",
      },
    ],
  },
  {
    category: "Requests needing clarification",
    cases: [
      {
        query: "IMDb 8 se upar wali horror movies",
        expectation:
          "Explain that IMDb scores are unsupported; do not convert them to MovieLens ratings.",
      },
      {
        query: "बिना हिंसा वाली डरावनी फिल्में",
        expectation:
          "Flag the unsupported violence exclusion rather than silently ignoring it.",
      },
    ],
  },
];
