import type { FormEvent, RefObject } from "react";

import { examples } from "../../data";

export function SearchHero({
  input,
  suggestedQuery,
  heroSearchRef,
  onInputChange,
  onSubmit,
  onAcceptSuggestion,
  onRunExample,
}: {
  input: string;
  suggestedQuery?: string;
  heroSearchRef: RefObject<HTMLFormElement | null>;
  onInputChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onAcceptSuggestion: () => void;
  onRunExample: (example: string) => void;
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
          <input
            id="movie-search"
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            placeholder="Search titles, people, genres, or moods"
            autoComplete="off"
          />
          <button type="submit" disabled={!input.trim()}>
            Search <span aria-hidden="true">→</span>
          </button>
        </form>
        {suggestedQuery && (
          <div className="didYouMean" role="status">
            <span>Did you mean</span>
            <button type="button" onClick={onAcceptSuggestion}>
              {suggestedQuery}
            </button>
            <span>?</span>
          </div>
        )}
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
        <div className="orb orb1" />
        <div className="orb orb2" />
        <div className="filmTitle">
          INTER
          <br />
          STELLAR<small>BEYOND THE STARS</small>
        </div>
        <div className="heroRating">
          ★ 4.0 <span>73 ratings</span>
        </div>
      </div>
    </section>
  );
}
