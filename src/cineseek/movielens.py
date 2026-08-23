from __future__ import annotations

import csv
import hashlib
import json
import re
import shutil
import ssl
import urllib.error
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path
from statistics import fmean

import certifi

from cineseek.corpus import DatasetError


MOVIELENS_URL = (
    "https://files.grouplens.org/datasets/movielens/ml-latest-small.zip"
)
MOVIELENS_MD5_URL = f"{MOVIELENS_URL}.md5"
MAX_ARCHIVE_BYTES = 8 * 1024 * 1024
MAX_EXTRACTED_BYTES = 64 * 1024 * 1024
REQUIRED_FILES = {"movies.csv", "ratings.csv", "tags.csv", "links.csv"}
YEAR_PATTERN = re.compile(r"\s*\((\d{4})\)\s*$")


def _download(url: str, path: Path, max_bytes: int) -> None:
    context = ssl.create_default_context(cafile=certifi.where())
    request = urllib.request.Request(url, headers={"User-Agent": "CineSeek/0.2"})
    try:
        with urllib.request.urlopen(request, context=context, timeout=60) as response:
            length = response.headers.get("Content-Length")
            if length and int(length) > max_bytes:
                raise DatasetError(f"Download exceeds the {max_bytes:,}-byte limit.")
            received = 0
            with path.open("wb") as handle:
                while chunk := response.read(64 * 1024):
                    received += len(chunk)
                    if received > max_bytes:
                        raise DatasetError(
                            f"Download exceeds the {max_bytes:,}-byte limit."
                        )
                    handle.write(chunk)
    except (OSError, urllib.error.URLError) as exc:
        path.unlink(missing_ok=True)
        raise DatasetError(f"Could not download MovieLens securely: {exc}") from exc


def download_movielens(destination: Path, force: bool = False) -> Path:
    """Download, verify, and safely extract MovieLens Latest Small."""
    destination = destination.resolve()
    if (destination / "movies.csv").exists() and not force:
        return destination

    destination.parent.mkdir(parents=True, exist_ok=True)
    archive_path = destination.parent / "ml-latest-small.zip"
    checksum_path = destination.parent / "ml-latest-small.zip.md5"
    extraction_root = destination.parent / ".movielens-extract"
    try:
        _download(MOVIELENS_URL, archive_path, MAX_ARCHIVE_BYTES)
        _download(MOVIELENS_MD5_URL, checksum_path, 1024)
        checksum_text = checksum_path.read_text(encoding="ascii").lower()
        checksum_match = re.search(r"\b[0-9a-f]{32}\b", checksum_text)
        if not checksum_match:
            raise DatasetError("MovieLens checksum response was malformed.")
        expected = checksum_match.group(0)
        actual = hashlib.md5(archive_path.read_bytes()).hexdigest()  # nosec B303
        if actual != expected:
            raise DatasetError("MovieLens archive checksum did not match GroupLens.")

        if extraction_root.exists():
            shutil.rmtree(extraction_root)
        extraction_root.mkdir()
        with zipfile.ZipFile(archive_path) as archive:
            members = archive.infolist()
            if sum(member.file_size for member in members) > MAX_EXTRACTED_BYTES:
                raise DatasetError("MovieLens archive expands beyond the safety limit.")
            root = extraction_root.resolve()
            for member in members:
                target = (extraction_root / member.filename).resolve()
                if root != target and root not in target.parents:
                    raise DatasetError(f"Unsafe archive path: {member.filename}")
            archive.extractall(extraction_root)

        extracted = extraction_root / "ml-latest-small"
        missing = REQUIRED_FILES - {path.name for path in extracted.iterdir()}
        if missing:
            raise DatasetError(f"MovieLens archive is missing: {sorted(missing)}")
        if destination.exists():
            shutil.rmtree(destination)
        shutil.move(str(extracted), str(destination))
    finally:
        archive_path.unlink(missing_ok=True)
        checksum_path.unlink(missing_ok=True)
        if extraction_root.exists():
            shutil.rmtree(extraction_root)
    return destination


def _read_csv(path: Path) -> list[dict[str, str]]:
    try:
        with path.open("r", encoding="utf-8", newline="") as handle:
            return list(csv.DictReader(handle))
    except FileNotFoundError as exc:
        raise DatasetError(f"Required MovieLens file is missing: {path}") from exc


def transform_movielens(source: Path, destination: Path) -> int:
    """Transform MovieLens CSVs into the project's BEIR-style corpus JSONL."""
    ratings: dict[str, list[float]] = defaultdict(list)
    for row in _read_csv(source / "ratings.csv"):
        ratings[row["movieId"]].append(float(row["rating"]))

    tags: dict[str, list[str]] = defaultdict(list)
    seen_tags: dict[str, set[str]] = defaultdict(set)
    for row in _read_csv(source / "tags.csv"):
        movie_id, tag = row["movieId"], row["tag"].strip()
        normalized = tag.casefold()
        if tag and normalized not in seen_tags[movie_id]:
            seen_tags[movie_id].add(normalized)
            tags[movie_id].append(tag)

    links = {row["movieId"]: row for row in _read_csv(source / "links.csv")}
    destination.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with destination.open("w", encoding="utf-8", newline="\n") as output:
        for movie in _read_csv(source / "movies.csv"):
            movie_id = movie["movieId"]
            match = YEAR_PATTERN.search(movie["title"])
            year = int(match.group(1)) if match else None
            title = YEAR_PATTERN.sub("", movie["title"]).strip()
            genres = [] if movie["genres"] == "(no genres listed)" else movie["genres"].split("|")
            movie_ratings = ratings.get(movie_id, [])
            movie_links = links.get(movie_id, {})
            metadata = {
                "year": year,
                "genres": genres,
                "tags": tags.get(movie_id, []),
                "average_rating": round(fmean(movie_ratings), 3) if movie_ratings else None,
                "rating_count": len(movie_ratings),
                "imdb_id": f"tt{movie_links['imdbId']}" if movie_links.get("imdbId") else None,
                "tmdb_id": int(movie_links["tmdbId"]) if movie_links.get("tmdbId") else None,
                "source": "MovieLens Latest Small",
            }
            searchable = ". ".join(
                part for part in [
                    f"{title} ({year})" if year else title,
                    "Genres: " + ", ".join(genres) if genres else "",
                    "Tags: " + ", ".join(tags.get(movie_id, [])) if tags.get(movie_id) else "",
                ] if part
            )
            output.write(json.dumps({"_id": movie_id, "title": title, "text": searchable, "metadata": metadata}, ensure_ascii=False) + "\n")
            count += 1
    return count
