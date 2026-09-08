// Kept separate from the original ASCII search experiment.
const segmenter = new Intl.Segmenter("hi", { granularity: "grapheme" });
export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[०-९]/gu, (digit) => String(digit.codePointAt(0) - 0x966))
    .replace(/[_–—]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
export function tokens(value) {
  return normalizeText(value).match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*/gu) ?? [];
}
export const textKey = (value) => tokens(value).join(" ");
export const graphemes = (value) =>
  Array.from(segmenter.segment(normalizeText(value)), ({ segment }) => segment);
export function editDistance(left, right) {
  const a = graphemes(left),
    b = graphemes(right);
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++)
      next.push(
        Math.min(next[j] + 1, row[j + 1] + 1, row[j] + Number(a[i] !== b[j])),
      );
    row = next;
  }
  return row[b.length];
}
export function trigrams(value) {
  const chars = ["^", ...graphemes(textKey(value)), "$"];
  return new Set(
    chars.slice(0, -2).map((_, i) => chars.slice(i, i + 3).join("")),
  );
}
export function scriptOf(text) {
  const devanagari = /\p{Script=Devanagari}/u.test(text),
    latin = /\p{Script=Latin}/u.test(text);
  return devanagari && latin
    ? "mixed"
    : devanagari
      ? "Devanagari"
      : latin
        ? "Latin"
        : "other";
}
