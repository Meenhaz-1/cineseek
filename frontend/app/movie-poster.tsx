"use client";

import Image from "next/image";
import { useState } from "react";
import { buildTmdbPosterUrl } from "../lib/tmdb-images.mjs";

type MoviePosterProps = {
  movieId: string;
  title: string;
  palette: string;
  posterPath?: string | null;
  rank: number;
  scorePercent?: number;
};

export function MoviePoster({
  movieId,
  title,
  palette,
  posterPath,
  rank,
  scorePercent,
}: MoviePosterProps) {
  const posterUrl = buildTmdbPosterUrl(posterPath);
  const [failedUrl, setFailedUrl] = useState<string>();
  const [loadedUrl, setLoadedUrl] = useState<string>();
  const showRemotePoster = Boolean(posterUrl && failedUrl !== posterUrl);

  return (
    <div
      className={`poster ${palette} ${showRemotePoster ? "hasRemotePoster" : "usesFallback"}`}
    >
      {showRemotePoster && posterUrl ? (
        <Image
          key={`${movieId}-${posterUrl}`}
          className={`posterImage ${loadedUrl === posterUrl ? "isLoaded" : ""}`}
          src={posterUrl}
          alt=""
          fill
          unoptimized
          sizes="(max-width: 700px) 190px, (max-width: 1000px) 33vw, (min-width: 1350px) 18vw, 25vw"
          loading="lazy"
          decoding="async"
          onLoad={() => setLoadedUrl(posterUrl)}
          onError={() => setFailedUrl(posterUrl)}
        />
      ) : null}
      <div className="posterFallback" aria-hidden="true">
        <div className="posterGlyph">{title.slice(0, 1)}</div>
      </div>
      <div className="posterShade" aria-hidden="true" />
      <span className="rank">{String(rank).padStart(2, "0")}</span>
      {scorePercent !== undefined && (
        <span
          className="match"
          title="Normalized ranking score; this is not a probability"
          aria-label={`${scorePercent} percent normalized ranking score`}
        >
          {scorePercent}% score
        </span>
      )}
    </div>
  );
}
