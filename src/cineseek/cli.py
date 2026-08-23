from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from cineseek.corpus import (
    DatasetError,
    download_scifact,
    load_beir_dataset,
    load_dataset_files,
)
from cineseek.evaluation import evaluate, load_run
from cineseek.movielens import download_movielens, transform_movielens


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="cineseek",
        description="Prepare and evaluate CineSeek information-retrieval datasets.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    download = subparsers.add_parser(
        "download", help="Download a supported dataset."
    )
    download.add_argument("dataset", nargs="?", choices=("movielens", "scifact"), default="movielens")
    download.add_argument(
        "--destination", type=Path
    )
    download.add_argument("--force", action="store_true")

    inspect = subparsers.add_parser(
        "inspect", help="Validate a BEIR dataset and print a summary."
    )
    inspect.add_argument("dataset", type=Path)
    inspect.add_argument("--split", default="test")

    evaluate_parser = subparsers.add_parser(
        "evaluate", help="Evaluate a ranked JSONL run against a BEIR dataset."
    )
    evaluate_parser.add_argument("dataset", type=Path)
    evaluate_parser.add_argument("run", type=Path)
    evaluate_parser.add_argument("--split", default="test")
    evaluate_parser.add_argument("--k", type=int, default=10)
    evaluate_parser.add_argument("--recall-k", type=int, default=100)
    evaluate_parser.add_argument("--output", type=Path)
    evaluate_parser.add_argument("--corpus", type=Path)
    evaluate_parser.add_argument("--queries", type=Path)
    evaluate_parser.add_argument("--qrels", type=Path)
    evaluate_parser.add_argument("--require-fully-judged-at-k", action="store_true")

    transform = subparsers.add_parser(
        "transform-movielens", help="Build a searchable corpus from MovieLens CSVs."
    )
    transform.add_argument("--source", type=Path, default=Path("data/movielens/raw"))
    transform.add_argument("--output", type=Path, default=Path("data/movielens/corpus.jsonl"))
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "download":
            if args.dataset == "movielens":
                destination = args.destination or Path("data/movielens/raw")
                path = download_movielens(destination, force=args.force)
                count = transform_movielens(path, destination.parent / "corpus.jsonl")
                print(f"MovieLens is ready at {path} ({count:,} searchable movies)")
                return 0
            destination = args.destination or Path("data/scifact")
            path = download_scifact(destination, force=args.force)
            dataset = load_beir_dataset(path)
            print(f"SciFact is ready at {path}")
            _print_summary(dataset.summary())
            return 0

        if args.command == "transform-movielens":
            count = transform_movielens(args.source, args.output)
            print(f"Wrote {count:,} searchable movies to {args.output.resolve()}")
            return 0

        if args.command == "inspect":
            dataset = load_beir_dataset(args.dataset, split=args.split)
            print(f"Dataset is valid: {args.dataset.resolve()}")
            _print_summary(dataset.summary())
            return 0

        if args.command == "evaluate":
            explicit_files = (args.corpus, args.queries, args.qrels)
            if any(explicit_files) and not all(explicit_files):
                raise DatasetError(
                    "--corpus, --queries, and --qrels must be supplied together."
                )
            dataset = load_dataset_files(*explicit_files) if all(explicit_files) else load_beir_dataset(args.dataset, split=args.split)
            runs = load_run(args.run)
            unknown_documents = {
                result.document_id
                for run in runs.values()
                for result in run.results
                if result.document_id not in dataset.documents
            }
            if unknown_documents:
                raise DatasetError(
                    "Run references unknown documents: "
                    f"{sorted(unknown_documents)[:3]}"
                )
            report = evaluate(
                dataset.qrels,
                runs,
                k=args.k,
                recall_k=args.recall_k,
                query_categories={query_id: str(query.metadata.get("category", "uncategorized")) for query_id, query in dataset.queries.items()},
            )
            _print_evaluation(report.to_dict())
            if args.output:
                args.output.parent.mkdir(parents=True, exist_ok=True)
                args.output.write_text(
                    json.dumps(report.to_dict(), indent=2) + "\n",
                    encoding="utf-8",
                )
                print(f"Full report written to {args.output.resolve()}")
            if args.require_fully_judged_at_k and report.minimum_judged_at_k < 1.0:
                raise DatasetError(
                    f"Judged@{args.k} must be 1.0 for every query before comparison; minimum was {report.minimum_judged_at_k:.4f}."
                )
            return 0
    except (DatasetError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    return 1


def _print_summary(summary: dict[str, int]) -> None:
    for name, value in summary.items():
        print(f"  {name.replace('_', ' ').title():22} {value:,}")


def _print_evaluation(report: dict[str, object]) -> None:
    names = report["metric_names"]
    assert isinstance(names, dict)
    print(f"Evaluated queries: {report['evaluated_queries']}")
    candidate_recall = report["candidate_recall"]
    if isinstance(candidate_recall, float):
        print(f"  {'Candidate Recall':18} {candidate_recall:.4f}")
    print(f"  {names['precision']:18} {report['precision_at_k']:.4f}")
    print(f"  {names['recall']:18} {report['recall_at_k']:.4f}")
    print(
        f"  {names['deep_recall']:18} "
        f"{report['recall_at_recall_k']:.4f}"
    )
    print(f"  {names['mrr']:18} {report['mrr']:.4f}")
    print(f"  {names['ndcg']:18} {report['ndcg_at_k']:.4f}")
    print(f"  {names['precision_grade_2']:30} {report['precision_at_k_grade_2']:.4f}")
    print(f"  {names['pooled_recall_grade_2']:30} {report['pooled_recall_at_k_grade_2']:.4f}")
    print(f"  {names['mrr_grade_2']:30} {report['mrr_grade_2']:.4f}")
    print(f"  {names['judged']:30} {report['judged_at_k']:.4f}")
    mean_latency = report["mean_latency_ms"]
    p50_latency = report["p50_latency_ms"]
    p95_latency = report["p95_latency_ms"]
    if isinstance(mean_latency, float) and isinstance(p50_latency, float) and isinstance(p95_latency, float):
        print(f"  Mean latency       {mean_latency:.2f} ms")
        print(f"  p50 latency        {p50_latency:.2f} ms")
        print(f"  p95 latency        {p95_latency:.2f} ms")
    if report["missing_queries"]:
        print(f"  Missing query runs {report['missing_queries']}")


if __name__ == "__main__":
    raise SystemExit(main())
