# CineSeek brand identity

## Brand idea

**The cinematic search workbench.** CineSeek combines the atmosphere and taste
of film editorial with the clarity of a scientific instrument. It should feel
curious, exact, calm, and inviting—not like a generic streaming storefront or
an opaque analytics console.

## Personality

- **Cinematic:** titles and major moments have editorial character.
- **Transparent:** ranking logic is presented plainly and never hidden behind
  decorative effects.
- **Exploratory:** controls invite comparison and inspection.
- **Calm:** dense information uses rhythm, spacing, and hierarchy instead of
  visual noise.

## Typography

CineSeek uses three semantic font roles. Components select a role; they do not
invent their own font stack.

| Role | Stack | Use |
| --- | --- | --- |
| Display | Iowan Old Style, Palatino, Book Antiqua, Georgia | Movie titles, major headings, editorial statements |
| Interface | Inter, native system sans-serif | Navigation, explanations, labels, buttons, controls |
| Data | SFMono, Consolas, Liberation Mono, Menlo | Queries, formulas, scores, IDs, contribution math |

The stacks are local and system-based, avoiding font downloads and layout
shift. Dense UI copy starts at 12px, ordinary supporting copy at 13px, and
candidate titles at 16px. Data uses tabular numerals so score columns remain
easy to compare.

## Visual language

- Near-black surfaces create the screening-room backdrop.
- Warm ivory carries editorial content.
- Electric lime marks primary actions and active states.
- Cool cyan is reserved for calculated ranking output.
- Borders organize information; color is never the only carrier of meaning.

## Accessibility rules

- Never use text smaller than 12px in data-dense surfaces.
- Maintain visible keyboard focus on every interactive element.
- Pair status colors with text, labels, or symbols.
- Preserve comfortable line height and avoid long all-uppercase passages.
- Use the display face sparingly; interface and data faces carry dense content.
