import type { FormEvent, RefObject } from "react";

import { examples, heroMovies } from "../../data";
import { MoviePoster } from "../../movie-poster";
import type {
  TypeaheadSuggestion,
  TypeaheadSuggestions,
} from "../search-contracts";
import { TypeaheadCombobox } from "./typeahead-combobox";

export function SearchHero({
  input,
  automaticCorrection,
  suggestedQuery,
  suggestedQueryLabel,
  heroSearchRef,
  onInputChange,
  onSubmit,
  onAcceptSuggestion,
  onSearchOriginal,
  onRunExample,
  suggestions,
  onSelectSuggestion,
}: {
  input: string;
  automaticCorrection?: {
    correctedQuery: string;
    originalQuery: string;
  };
  suggestedQuery?: string;
  suggestedQueryLabel?: string;
  heroSearchRef: RefObject<HTMLFormElement | null>;
  onInputChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onAcceptSuggestion: () => void;
  onSearchOriginal: () => void;
  onRunExample: (example: string) => void;
  suggestions?: TypeaheadSuggestions;
  onSelectSuggestion: (suggestion: TypeaheadSuggestion) => void;
}) {
  return (
    <section className="hero" id="top">
      <div className="heroGlow" />
      <div className="heroCopy">
        <span className="eyebrow">Explainable movie discovery</span>
        <h1>
          Search the feeling.
          <br />
          <em>Find the film.</em>
        </h1>
        <p>
          Explore 9,742 MovieLens titles while seeing how lexical, entity,
          metadata, and ranking signals shape every result.
        </p>
        <form
          className="search"
          onSubmit={onSubmit}
          role="search"
          ref={heroSearchRef}
        >
          <label className="srOnly" htmlFor="movie-search">
            Search movies
          </label>
          <TypeaheadCombobox
            id="movie-search"
            name="query"
            input={input}
            onInputChange={onInputChange}
            onSelect={onSelectSuggestion}
            placeholder="Search titles, people, genres, or moods"
            suggestions={suggestions}
          />
          <button type="submit">
            Search <span aria-hidden="true">→</span>
          </button>
        </form>
        {automaticCorrection ? (
          <div className="automaticCorrection" role="status" aria-live="polite">
            <span>
              Showing results for{" "}
              <strong>{automaticCorrection.correctedQuery}</strong>
            </span>
            <button type="button" onClick={onSearchOriginal}>
              <span>Search instead for:</span>
              <strong>“{automaticCorrection.originalQuery}”</strong>
            </button>
          </div>
        ) : suggestedQuery ? (
          <div className="didYouMean" role="status">
            <span>Did you mean</span>
            <button type="button" onClick={onAcceptSuggestion}>
              {suggestedQueryLabel ?? suggestedQuery}
            </button>
            <span>?</span>
          </div>
        ) : null}
        <div className="examples">
          <span>Try</span>
          {examples.map((item) => (
            <button key={item} onClick={() => onRunExample(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="heroArt" aria-hidden="true">
        {heroMovies.map((movie, index) => (
          <div
            key={movie.id}
            className={`heroArtTile${index === 0 ? " featured" : ""}`}
          >
            <MoviePoster
              movieId={movie.id}
              title={movie.title}
              palette={movie.palette}
              posterPath={movie.posterPath}
              rank={index + 1}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
