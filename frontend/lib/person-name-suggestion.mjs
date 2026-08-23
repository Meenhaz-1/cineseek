function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function editDistance(left, right) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const previous = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      diagonal = previous;
    }
  }
  return row[right.length];
}

function candidateWindows(queryTokens, nameTokens) {
  if (nameTokens.length > queryTokens.length) return [];
  return Array.from(
    { length: queryTokens.length - nameTokens.length + 1 },
    (_, start) => ({
      start,
      tokens: queryTokens.slice(start, start + nameTokens.length),
    }),
  );
}

export function suggestPersonName(query, people) {
  const normalizedQuery = normalize(query);
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  if (queryTokens.length < 2) return null;

  let best = null;
  for (const person of people) {
    const normalizedName = normalize(person.name);
    const nameTokens = normalizedName.split(" ").filter(Boolean);
    if (nameTokens.length < 2 || nameTokens.length > 4) continue;

    for (const window of candidateWindows(queryTokens, nameTokens)) {
      const windowText = window.tokens.join(" ");
      if (windowText === normalizedName) continue;

      const exactTokens = nameTokens.filter(
        (token, index) => token === window.tokens[index],
      ).length;
      const matchingInitials = nameTokens.filter(
        (token, index) => token[0] === window.tokens[index]?.[0],
      ).length;
      if (exactTokens === 0 && matchingInitials !== nameTokens.length) continue;

      const distance = editDistance(windowText, normalizedName);
      const maximumDistance = Math.min(
        3,
        Math.max(1, Math.floor(normalizedName.length * 0.2)),
      );
      if (distance > maximumDistance) continue;
      const similarity =
        1 - distance / Math.max(windowText.length, normalizedName.length);
      if (similarity < 0.82) continue;

      const candidate = {
        person,
        normalizedName,
        window,
        distance,
        similarity,
      };
      if (
        !best ||
        candidate.similarity > best.similarity ||
        (candidate.similarity === best.similarity &&
          candidate.distance < best.distance) ||
        (candidate.similarity === best.similarity &&
          candidate.distance === best.distance &&
          person.movieCount > best.person.movieCount)
      ) {
        best = candidate;
      }
    }
  }

  if (!best) return null;
  const suggestedTokens = [...queryTokens];
  suggestedTokens.splice(
    best.window.start,
    best.window.tokens.length,
    ...best.normalizedName.split(" "),
  );
  return {
    entityId: best.person.id,
    canonicalName: best.person.name,
    roles: best.person.roles ?? [],
    matchedText: best.window.tokens.join(" "),
    suggestedQuery: suggestedTokens.join(" "),
    distance: best.distance,
    confidence: Number(best.similarity.toFixed(3)),
  };
}
