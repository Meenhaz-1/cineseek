import math
from pathlib import Path

import pytest

from cineseek.corpus import load_beir_dataset
from cineseek.evaluation import candidate_recall, evaluate, judged_at_k, load_run, ndcg_at_k


FIXTURES = Path(__file__).parent / "fixtures"


def test_evaluates_ranked_run() -> None:
    dataset = load_beir_dataset(FIXTURES / "tiny-beir")
    runs = load_run(FIXTURES / "tiny-run.jsonl")

    report = evaluate(dataset.qrels, runs, k=2, recall_k=3)

    assert report.evaluated_queries == 2
    assert report.candidate_recall == pytest.approx(1.0)
    assert report.precision_at_k == pytest.approx(0.75)
    assert report.recall_at_k == pytest.approx(1.0)
    assert report.recall_at_recall_k == pytest.approx(1.0)
    assert report.mrr == pytest.approx(1.0)
    assert report.mean_latency_ms == pytest.approx(15.0)
    assert report.p50_latency_ms == pytest.approx(10.0)
    assert report.p95_latency_ms == pytest.approx(20.0)


def test_ndcg_uses_graded_relevance() -> None:
    score = ndcg_at_k(["d3", "d1"], {"d1": 2, "d3": 1}, k=2)
    expected = (1 + 3 / math.log2(3)) / (3 + 1 / math.log2(3))

    assert score == pytest.approx(expected)


def test_grade_two_metrics_ignore_plausible_results() -> None:
    dataset = load_beir_dataset(FIXTURES / "tiny-beir")
    runs = load_run(FIXTURES / "tiny-run.jsonl")
    qrels = {"q1": {"d1": 1, "d2": 3}}
    report = evaluate(qrels, {"q1": runs["q1"]}, k=2, recall_k=3, query_categories={"q1": "genre"})

    assert report.per_query[0].first_grade_2_rank == 3
    assert report.per_query[0].reciprocal_rank == pytest.approx(0.5)
    assert report.per_query[0].reciprocal_rank_grade_2 == pytest.approx(1 / 3)
    assert report.category_reports["genre"]["mrr_grade_2"] == pytest.approx(1 / 3)


def test_judged_at_k_distinguishes_unjudged_from_grade_zero() -> None:
    assert judged_at_k(["d1", "d2", "d3"], {"d1": 3, "d2": 0}, 3) == pytest.approx(2 / 3)


def test_candidate_recall_uses_the_unranked_candidate_set() -> None:
    assert candidate_recall(["d1", "d4"], {"d1", "d2"}) == pytest.approx(0.5)


def test_missing_query_is_scored_as_empty_run() -> None:
    dataset = load_beir_dataset(FIXTURES / "tiny-beir")
    runs = load_run(FIXTURES / "tiny-run.jsonl")

    report = evaluate(dataset.qrels, {"q1": runs["q1"]}, k=2)

    assert report.missing_queries == 1
    assert report.recall_at_k == pytest.approx(0.5)
