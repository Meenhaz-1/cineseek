import type { FormEvent } from "react";

import type { Movie } from "../../data";
import type {
  Mode,
  TypeaheadSuggestion,
  TypeaheadSuggestions,
} from "../search-contracts";
import { TypeaheadCombobox } from "./typeahead-combobox";

export function StickySearch({
  input,
  mode,
  onInputChange,
  onSubmit,
  suggestions,
  onSelectSuggestion,
}: {
  input: string;
  mode: Mode;
  onInputChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  suggestions?: TypeaheadSuggestions;
  onSelectSuggestion: (suggestion: TypeaheadSuggestion) => void;
}) {
  return (
    <form
      className="stickySearchDock"
      onSubmit={onSubmit}
      role="search"
      aria-label="Persistent movie search"
    >
      <span className="stickySearchMark" aria-hidden="true">
        C
      </span>
      <label className="srOnly" htmlFor="sticky-movie-search">
        Search movies from anywhere on the page
      </label>
      <TypeaheadCombobox
        id="sticky-movie-search"
        input={input}
        onInputChange={onInputChange}
        onSelect={onSelectSuggestion}
        placeholder="Search movies, people, or genres"
        suggestions={suggestions}
      />
      <span className="stickySearchMode" aria-hidden="true">
        {mode}
      </span>
      <button type="submit" disabled={!input.trim()}>
        Search <span aria-hidden="true">→</span>
      </button>
    </form>
  );
}

export function MovieDetailsDialog({
  movie,
  onClose,
}: {
  movie: Movie;
  onClose: () => void;
}) {
  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="movie-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="close" onClick={onClose} aria-label="Close details">
          ×
        </button>
        <span className="sectionKicker">MovieLens ID {movie.id}</span>
        <h2 id="movie-title">{movie.title}</h2>
        <p>
          {movie.year} · {movie.genres.join(" · ")}
        </p>
        {movie.learningUseCase && (
          <div className="learningFocus">
            <b>Why this movie is in the teaching sample</b>
            <p>{movie.learningUseCase}</p>
          </div>
        )}
        {movie.overview && <p>{movie.overview}</p>}
        <div className="chips">
          {movie.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        {movie.cast?.length ? (
          <div>
            <small>Cast from optional TMDB enrichment</small>
            <div className="chips">
              {movie.cast.slice(0, 6).map((person) => (
                <span key={person.id}>{person.name}</span>
              ))}
            </div>
          </div>
        ) : null}
        <dl>
          <div>
            <dt>Average rating</dt>
            <dd>★ {movie.rating.toFixed(3)}</dd>
          </div>
          <div>
            <dt>Rating count</dt>
            <dd>{movie.ratings}</dd>
          </div>
          <div>
            <dt>IMDb</dt>
            <dd>{movie.imdb}</dd>
          </div>
          <div>
            <dt>TMDB</dt>
            <dd>{movie.tmdb}</dd>
          </div>
        </dl>
        <small>
          MovieLens-derived record with optional cached TMDB enrichment. When no
          poster is available, CineSeek uses a generated fallback treatment.
        </small>
      </section>
    </div>
  );
}
