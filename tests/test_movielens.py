import json
from pathlib import Path

from cineseek.movielens import transform_movielens


def test_transform_movielens_builds_searchable_metadata(tmp_path: Path) -> None:
    source = Path(__file__).parent / "fixtures" / "tiny-movielens"
    output = tmp_path / "corpus.jsonl"

    assert transform_movielens(source, output) == 2
    movies = [json.loads(line) for line in output.read_text(encoding="utf-8").splitlines()]
    toy_story = movies[0]
    assert toy_story["title"] == "Toy Story"
    assert toy_story["metadata"]["year"] == 1995
    assert toy_story["metadata"]["genres"] == ["Adventure", "Animation", "Children", "Comedy", "Fantasy"]
    assert toy_story["metadata"]["tags"] == ["Pixar", "friendship"]
    assert toy_story["metadata"]["average_rating"] == 4.5
    assert toy_story["metadata"]["rating_count"] == 2
    assert toy_story["metadata"]["imdb_id"] == "tt0114709"
    assert toy_story["metadata"]["tmdb_id"] == 862
    assert "Genres: Adventure" in toy_story["text"]
