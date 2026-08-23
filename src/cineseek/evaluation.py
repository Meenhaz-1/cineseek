from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable

from cineseek.corpus import DatasetError


@dataclass(frozen=True)
class SearchResult:
    document_id: str
    score: float


@dataclass(frozen=True)
class QueryRun:
    query_id: str
    results: tuple[SearchResult, ...]
    latency_ms: float | None = None
    candidate_ids: tuple[str, ...] | None = None


@dataclass(frozen=True)
class QueryMetrics:
    query_id: str
    category: str
    candidate_recall: float | None
    precision_at_k: float
    recall_at_k: float
    recall_at_recall_k: float
    reciprocal_rank: float
    ndcg_at_k: float
    candidate_recall_grade_2: float | None
    precision_at_k_grade_2: float
    pooled_recall_at_k_grade_2: float
    pooled_recall_at_recall_k_grade_2: float
    reciprocal_rank_grade_2: float
    judged_at_k: float
    first_grade_3_rank: int | None
    first_grade_2_rank: int | None
    retrieved: int
    relevant: int
    latency_ms: float | None


@dataclass(frozen=True)
class EvaluationReport:
    evaluated_queries: int
    k: int
    recall_k: int
    candidate_recall: float | None
    precision_at_k: float
    recall_at_k: float
    recall_at_recall_k: float
    mrr: float
    ndcg_at_k: float
    candidate_recall_grade_2: float | None
    precision_at_k_grade_2: float
    pooled_recall_at_k_grade_2: float
    pooled_recall_at_recall_k_grade_2: float
    mrr_grade_2: float
    judged_at_k: float
    minimum_judged_at_k: float
    category_reports: dict[str, dict[str, float | int | None]]
    mean_latency_ms: float | None
    p50_latency_ms: float | None
    p95_latency_ms: float | None
    missing_queries: int
    per_query: tuple[QueryMetrics, ...]

    def to_dict(self) -> dict[str, Any]:
        result = asdict(self)
        result["metric_names"] = {
            "precision": f"Precision@{self.k}",
            "recall": f"Recall@{self.k}",
            "deep_recall": f"Recall@{self.recall_k}",
            "ndcg": f"nDCG@{self.k}",
            "mrr": "MRR",
            "precision_grade_2": f"Precision@{self.k} (grade >= 2)",
            "pooled_recall_grade_2": f"Pooled Recall@{self.k} (grade >= 2)",
            "deep_pooled_recall_grade_2": f"Pooled Recall@{self.recall_k} (grade >= 2)",
            "mrr_grade_2": "MRR (grade >= 2)",
            "judged": f"Judged@{self.k}",
        }
        return result


def load_run(path: Path) -> dict[str, QueryRun]:
    """Load one JSON object per query from a JSONL run file."""
    runs: dict[str, QueryRun] = {}
    try:
        with path.open("r", encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, start=1):
                if not line.strip():
                    continue
                try:
                    item = json.loads(line)
                except json.JSONDecodeError as exc:
                    raise DatasetError(
                        f"Invalid run JSON on line {line_number}: {exc.msg}"
                    ) from exc
                query_run = _parse_query_run(item, line_number)
                if query_run.query_id in runs:
                    raise DatasetError(
                        f"Duplicate query {query_run.query_id!r} in run file."
                    )
                runs[query_run.query_id] = query_run
    except FileNotFoundError as exc:
        raise DatasetError(f"Run file does not exist: {path}") from exc
    return runs


def _parse_query_run(item: Any, line_number: int) -> QueryRun:
    if not isinstance(item, dict):
        raise DatasetError(f"Run line {line_number} must be a JSON object.")
    query_id = str(item.get("query_id", "")).strip()
    if not query_id:
        raise DatasetError(f"Run line {line_number} has no query_id.")
    raw_results = item.get("results")
    if not isinstance(raw_results, list):
        raise DatasetError(f"Run line {line_number} must contain a results list.")

    results: list[SearchResult] = []
    seen: set[str] = set()
    for rank, raw_result in enumerate(raw_results, start=1):
        if not isinstance(raw_result, dict):
            raise DatasetError(
                f"Result {rank} on run line {line_number} must be an object."
            )
        document_id = str(raw_result.get("doc_id", "")).strip()
        if not document_id:
            raise DatasetError(
                f"Result {rank} on run line {line_number} has no doc_id."
            )
        if document_id in seen:
            raise DatasetError(
                f"Query {query_id!r} returns document {document_id!r} twice."
            )
        seen.add(document_id)
        try:
            score = float(raw_result.get("score", 0.0))
        except (TypeError, ValueError) as exc:
            raise DatasetError(
                f"Invalid score for document {document_id!r} on line {line_number}."
            ) from exc
        if not math.isfinite(score):
            raise DatasetError(
                f"Non-finite score for document {document_id!r} on line {line_number}."
            )
        results.append(SearchResult(document_id=document_id, score=score))

    latency = item.get("latency_ms")
    if latency is not None:
        try:
            latency = float(latency)
        except (TypeError, ValueError) as exc:
            raise DatasetError(f"Invalid latency on run line {line_number}.") from exc
        if not math.isfinite(latency) or latency < 0:
            raise DatasetError(f"Latency must be a finite non-negative number.")

    raw_candidate_ids = item.get("candidate_ids")
    candidate_ids: tuple[str, ...] | None = None
    if raw_candidate_ids is not None:
        if not isinstance(raw_candidate_ids, list):
            raise DatasetError(
                f"candidate_ids on run line {line_number} must be a list."
            )
        normalized_candidate_ids = tuple(
            str(document_id).strip() for document_id in raw_candidate_ids
        )
        if any(not document_id for document_id in normalized_candidate_ids):
            raise DatasetError(
                f"candidate_ids on run line {line_number} contains an empty id."
            )
        if len(set(normalized_candidate_ids)) != len(normalized_candidate_ids):
            raise DatasetError(
                f"candidate_ids on run line {line_number} contains duplicates."
            )
        candidate_ids = normalized_candidate_ids

    return QueryRun(
        query_id=query_id,
        results=tuple(results),
        latency_ms=latency,
        candidate_ids=candidate_ids,
    )


def precision_at_k(ranked_ids: Iterable[str], relevant: set[str], k: int) -> float:
    top_k = list(ranked_ids)[:k]
    return sum(document_id in relevant for document_id in top_k) / k


def recall_at_k(ranked_ids: Iterable[str], relevant: set[str], k: int) -> float:
    if not relevant:
        return 0.0
    top_k = list(ranked_ids)[:k]
    return sum(document_id in relevant for document_id in top_k) / len(relevant)


def candidate_recall(candidate_ids: Iterable[str], relevant: set[str]) -> float:
    if not relevant:
        return 0.0
    candidates = set(candidate_ids)
    return sum(document_id in candidates for document_id in relevant) / len(relevant)


def reciprocal_rank(ranked_ids: Iterable[str], relevant: set[str]) -> float:
    for rank, document_id in enumerate(ranked_ids, start=1):
        if document_id in relevant:
            return 1.0 / rank
    return 0.0


def judged_at_k(ranked_ids: Iterable[str], judgments: dict[str, int], k: int) -> float:
    top_k = list(ranked_ids)[:k]
    return sum(document_id in judgments for document_id in top_k) / len(top_k) if top_k else 0.0


def first_relevant_rank(ranked_ids: Iterable[str], judgments: dict[str, int], minimum_grade: int) -> int | None:
    for rank, document_id in enumerate(ranked_ids, start=1):
        if judgments.get(document_id, 0) >= minimum_grade:
            return rank
    return None


def ndcg_at_k(
    ranked_ids: Iterable[str], judgments: dict[str, int], k: int
) -> float:
    gains = [judgments.get(document_id, 0) for document_id in list(ranked_ids)[:k]]
    actual = _dcg(gains)
    ideal = _dcg(sorted(judgments.values(), reverse=True)[:k])
    return actual / ideal if ideal else 0.0


def _dcg(relevance_scores: Iterable[int]) -> float:
    return sum(
        (2**score - 1) / math.log2(rank + 1)
        for rank, score in enumerate(relevance_scores, start=1)
    )


def evaluate(
    qrels: dict[str, dict[str, int]],
    runs: dict[str, QueryRun],
    k: int = 10,
    recall_k: int = 100,
    query_categories: dict[str, str] | None = None,
) -> EvaluationReport:
    if k < 1 or recall_k < 1:
        raise ValueError("Metric cutoffs must be positive integers.")
    if not qrels:
        raise ValueError("At least one judged query is required.")

    per_query: list[QueryMetrics] = []
    for query_id, judgments in sorted(qrels.items()):
        relevant = {
            document_id
            for document_id, score in judgments.items()
            if score > 0
        }
        strongly_relevant = {
            document_id
            for document_id, score in judgments.items()
            if score >= 2
        }
        run = runs.get(query_id, QueryRun(query_id=query_id, results=()))
        ranked_ids = [result.document_id for result in run.results]
        per_query.append(
            QueryMetrics(
                query_id=query_id,
                category=(query_categories or {}).get(query_id, "uncategorized"),
                candidate_recall=candidate_recall(run.candidate_ids, relevant)
                if run.candidate_ids is not None
                else None,
                precision_at_k=precision_at_k(ranked_ids, relevant, k),
                recall_at_k=recall_at_k(ranked_ids, relevant, k),
                recall_at_recall_k=recall_at_k(
                    ranked_ids, relevant, recall_k
                ),
                reciprocal_rank=reciprocal_rank(ranked_ids, relevant),
                ndcg_at_k=ndcg_at_k(ranked_ids, judgments, k),
                candidate_recall_grade_2=candidate_recall(run.candidate_ids, strongly_relevant)
                if run.candidate_ids is not None else None,
                precision_at_k_grade_2=precision_at_k(ranked_ids, strongly_relevant, k),
                pooled_recall_at_k_grade_2=recall_at_k(ranked_ids, strongly_relevant, k),
                pooled_recall_at_recall_k_grade_2=recall_at_k(ranked_ids, strongly_relevant, recall_k),
                reciprocal_rank_grade_2=reciprocal_rank(ranked_ids, strongly_relevant),
                judged_at_k=judged_at_k(ranked_ids, judgments, k),
                first_grade_3_rank=first_relevant_rank(ranked_ids, judgments, 3),
                first_grade_2_rank=first_relevant_rank(ranked_ids, judgments, 2),
                retrieved=len(ranked_ids),
                relevant=len(relevant),
                latency_ms=run.latency_ms,
            )
        )

    latencies = sorted(
        metric.latency_ms
        for metric in per_query
        if metric.latency_ms is not None
    )
    count = len(per_query)
    candidate_recalls = [
        metric.candidate_recall
        for metric in per_query
        if metric.candidate_recall is not None
    ]
    strong_candidate_recalls = [metric.candidate_recall_grade_2 for metric in per_query if metric.candidate_recall_grade_2 is not None]
    category_reports = {}
    for category in sorted({metric.category for metric in per_query}):
        rows = [metric for metric in per_query if metric.category == category]
        category_reports[category] = {
            "queries": len(rows),
            "ndcg_at_k": _mean(metric.ndcg_at_k for metric in rows),
            "precision_at_k_grade_2": _mean(metric.precision_at_k_grade_2 for metric in rows),
            "pooled_recall_at_k_grade_2": _mean(metric.pooled_recall_at_k_grade_2 for metric in rows),
            "mrr_grade_2": _mean(metric.reciprocal_rank_grade_2 for metric in rows),
            "judged_at_k": _mean(metric.judged_at_k for metric in rows),
        }
    return EvaluationReport(
        evaluated_queries=count,
        k=k,
        recall_k=recall_k,
        candidate_recall=_mean(candidate_recalls) if candidate_recalls else None,
        precision_at_k=_mean(metric.precision_at_k for metric in per_query),
        recall_at_k=_mean(metric.recall_at_k for metric in per_query),
        recall_at_recall_k=_mean(
            metric.recall_at_recall_k for metric in per_query
        ),
        mrr=_mean(metric.reciprocal_rank for metric in per_query),
        ndcg_at_k=_mean(metric.ndcg_at_k for metric in per_query),
        candidate_recall_grade_2=_mean(strong_candidate_recalls) if strong_candidate_recalls else None,
        precision_at_k_grade_2=_mean(metric.precision_at_k_grade_2 for metric in per_query),
        pooled_recall_at_k_grade_2=_mean(metric.pooled_recall_at_k_grade_2 for metric in per_query),
        pooled_recall_at_recall_k_grade_2=_mean(metric.pooled_recall_at_recall_k_grade_2 for metric in per_query),
        mrr_grade_2=_mean(metric.reciprocal_rank_grade_2 for metric in per_query),
        judged_at_k=_mean(metric.judged_at_k for metric in per_query),
        minimum_judged_at_k=min(metric.judged_at_k for metric in per_query),
        category_reports=category_reports,
        mean_latency_ms=_mean(latencies) if latencies else None,
        p50_latency_ms=_percentile_nearest_rank(latencies, 0.50)
        if latencies
        else None,
        p95_latency_ms=_percentile_nearest_rank(latencies, 0.95)
        if latencies
        else None,
        missing_queries=sum(query_id not in runs for query_id in qrels),
        per_query=tuple(per_query),
    )


def _mean(values: Iterable[float]) -> float:
    values = list(values)
    return sum(values) / len(values) if values else 0.0


def _percentile_nearest_rank(values: list[float], percentile: float) -> float:
    rank = max(1, math.ceil(percentile * len(values)))
    return values[rank - 1]
