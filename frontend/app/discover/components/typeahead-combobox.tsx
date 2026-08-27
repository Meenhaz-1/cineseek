import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import type {
  TypeaheadSuggestion,
  TypeaheadSuggestions,
} from "../search-contracts";

function groups(suggestions: TypeaheadSuggestions) {
  return [
    { key: "titles", label: "Movies", items: suggestions.titles },
    { key: "people", label: "People", items: suggestions.people },
    { key: "genres", label: "Genres", items: suggestions.genres },
  ].filter(({ items }) => items.length > 0);
}

function orderedGroups(suggestions: TypeaheadSuggestions, input: string) {
  const available = groups(suggestions);
  const preferredKeys = input.trim().includes(" ")
    ? ["people", "titles", "genres"]
    : ["titles", "people", "genres"];
  return preferredKeys
    .map((key) => available.find((group) => group.key === key))
    .filter((group): group is (typeof available)[number] => Boolean(group));
}

export function TypeaheadCombobox({
  id,
  input,
  suggestions,
  onInputChange,
  onSelect,
  placeholder,
}: {
  id: string;
  input: string;
  suggestions?: TypeaheadSuggestions;
  onInputChange: (value: string) => void;
  onSelect: (suggestion: TypeaheadSuggestion) => void;
  placeholder: string;
}) {
  const listboxId = `${useId()}-suggestions`;
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dismissedQuery, setDismissedQuery] = useState<string>();
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const visibleGroups = suggestions ? orderedGroups(suggestions, input) : [];
  const visibleItems = visibleGroups.flatMap(({ items }) => items);
  const open =
    visibleItems.length > 0 &&
    input.trim().length >= 2 &&
    suggestions?.query === input.trim().toLowerCase() &&
    dismissedQuery !== input.trim().toLowerCase() &&
    isFocused;

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node))
        setIsFocused(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      // Suggestions are anchored to the input, so do not leave a stale menu
      // floating over unrelated content after the page moves.
      setActiveIndex(-1);
      setIsFocused(false);
      setDismissedQuery(input.trim().toLowerCase());
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [input]);
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % visibleItems.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        current <= 0 ? visibleItems.length - 1 : current - 1,
      );
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      onSelect(visibleItems[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setActiveIndex(-1);
      setDismissedQuery(input.trim().toLowerCase());
    }
  }

  function handleInputChange(value: string) {
    setDismissedQuery(undefined);
    onInputChange(value);
  }

  return (
    <div className="typeahead" ref={containerRef}>
      <input
        id={id}
        value={input}
        onChange={(event) => handleInputChange(event.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={
          activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
        }
      />
      {open && (
        <div className="typeaheadMenu" id={listboxId} role="listbox">
          {visibleGroups.map(({ key, label, items }, groupIndex) => {
            const itemOffset = visibleGroups
              .slice(0, groupIndex)
              .reduce((total, group) => total + group.items.length, 0);
            return (
              <section key={key} className="typeaheadGroup">
                <h3>{label}</h3>
                {items.map((suggestion, index) => {
                  const currentIndex = itemOffset + index;
                  return (
                    <button
                      key={`${suggestion.type}-${suggestion.id}`}
                      id={`${listboxId}-option-${currentIndex}`}
                      type="button"
                      role="option"
                      aria-selected={activeIndex === currentIndex}
                      className={
                        activeIndex === currentIndex ? "active" : undefined
                      }
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onSelect(suggestion)}
                    >
                      <span>{suggestion.label}</span>
                      <small>
                        {suggestion.type}
                        {suggestion.year ? ` · ${suggestion.year}` : ""}
                      </small>
                    </button>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
