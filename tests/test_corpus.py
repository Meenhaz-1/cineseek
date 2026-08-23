from pathlib import Path

from cineseek.corpus import load_beir_dataset


FIXTURES = Path(__file__).parent / "fixtures"


def test_loads_and_summarizes_beir_dataset() -> None:
    dataset = load_beir_dataset(FIXTURES / "tiny-beir")

    assert dataset.documents["d1"].title == "Cats"
    assert dataset.queries["q2"].text == "loyal animal"
    assert dataset.qrels["q1"] == {"d1": 2, "d3": 1}
    assert dataset.summary() == {
        "documents": 3,
        "queries": 2,
        "judged_queries": 2,
        "judgments": 3,
        "positive_judgments": 3,
    }
