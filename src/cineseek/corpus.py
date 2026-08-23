from __future__ import annotations

import csv
import json
import shutil
import ssl
import urllib.error
import urllib.request
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

import certifi


SCIFACT_URL = (
    "https://public.ukp.informatik.tu-darmstadt.de/thakur/"
    "BEIR/datasets/scifact.zip"
)


class DatasetError(ValueError):
    """Raised when a dataset does not satisfy the expected BEIR contract."""


@dataclass(frozen=True)
class Document:
    id: str
    title: str
    text: str
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Query:
    id: str
    text: str
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Dataset:
    documents: dict[str, Document]
    queries: dict[str, Query]
    qrels: dict[str, dict[str, int]]

    def summary(self) -> dict[str, int]:
        judgment_count = sum(len(items) for items in self.qrels.values())
        relevant_count = sum(
            score > 0
            for items in self.qrels.values()
            for score in items.values()
        )
        return {
            "documents": len(self.documents),
            "queries": len(self.queries),
            "judged_queries": len(self.qrels),
            "judgments": judgment_count,
            "positive_judgments": relevant_count,
        }


def _read_jsonl(path: Path) -> Iterable[dict[str, Any]]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, start=1):
                if not line.strip():
                    continue
                try:
                    value = json.loads(line)
                except json.JSONDecodeError as exc:
                    raise DatasetError(
                        f"Invalid JSON in {path} on line {line_number}: {exc.msg}"
                    ) from exc
                if not isinstance(value, dict):
                    raise DatasetError(
                        f"Expected an object in {path} on line {line_number}."
                    )
                yield value
    except FileNotFoundError as exc:
        raise DatasetError(f"Required dataset file is missing: {path}") from exc


def load_documents(path: Path) -> dict[str, Document]:
    documents: dict[str, Document] = {}
    for item in _read_jsonl(path):
        document_id = str(item.get("_id", "")).strip()
        if not document_id:
            raise DatasetError(f"A document in {path} has no _id.")
        if document_id in documents:
            raise DatasetError(f"Duplicate document id {document_id!r} in {path}.")
        documents[document_id] = Document(
            id=document_id,
            title=str(item.get("title", "")),
            text=str(item.get("text", "")),
            metadata=item.get("metadata") or {},
        )
    return documents


def load_queries(path: Path) -> dict[str, Query]:
    queries: dict[str, Query] = {}
    for item in _read_jsonl(path):
        query_id = str(item.get("_id", "")).strip()
        if not query_id:
            raise DatasetError(f"A query in {path} has no _id.")
        if query_id in queries:
            raise DatasetError(f"Duplicate query id {query_id!r} in {path}.")
        queries[query_id] = Query(
            id=query_id,
            text=str(item.get("text", "")),
            metadata=item.get("metadata") or {},
        )
    return queries


def load_qrels(path: Path) -> dict[str, dict[str, int]]:
    qrels: dict[str, dict[str, int]] = {}
    try:
        with path.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle, delimiter="\t")
            expected = {"query-id", "corpus-id", "score"}
            if not reader.fieldnames or not expected.issubset(reader.fieldnames):
                raise DatasetError(
                    f"{path} must contain tab-separated columns: "
                    "query-id, corpus-id, score."
                )
            for row_number, row in enumerate(reader, start=2):
                query_id = str(row["query-id"]).strip()
                document_id = str(row["corpus-id"]).strip()
                try:
                    score = int(row["score"])
                except (TypeError, ValueError) as exc:
                    raise DatasetError(
                        f"Invalid relevance score in {path} on line {row_number}."
                    ) from exc
                query_judgments = qrels.setdefault(query_id, {})
                if document_id in query_judgments:
                    raise DatasetError(
                        f"Duplicate judgment for query {query_id!r} and "
                        f"document {document_id!r}."
                    )
                query_judgments[document_id] = score
    except FileNotFoundError as exc:
        raise DatasetError(f"Required qrels file is missing: {path}") from exc
    return qrels


def load_beir_dataset(dataset_dir: Path, split: str = "test") -> Dataset:
    dataset_dir = dataset_dir.resolve()
    return load_dataset_files(
        dataset_dir / "corpus.jsonl",
        dataset_dir / "queries.jsonl",
        dataset_dir / "qrels" / f"{split}.tsv",
    )


def load_dataset_files(
    corpus_path: Path, query_path: Path, qrels_path: Path
) -> Dataset:
    dataset = Dataset(
        documents=load_documents(corpus_path.resolve()),
        queries=load_queries(query_path.resolve()),
        qrels=load_qrels(qrels_path.resolve()),
    )
    validate_dataset(dataset)
    return dataset


def validate_dataset(dataset: Dataset) -> None:
    if not dataset.documents:
        raise DatasetError("The corpus contains no documents.")
    if not dataset.queries:
        raise DatasetError("The dataset contains no queries.")
    if not dataset.qrels:
        raise DatasetError("The selected split contains no relevance judgments.")

    unknown_queries = set(dataset.qrels) - set(dataset.queries)
    if unknown_queries:
        sample = sorted(unknown_queries)[:3]
        raise DatasetError(f"Judgments reference unknown queries: {sample}")

    unknown_documents = {
        document_id
        for judgments in dataset.qrels.values()
        for document_id in judgments
        if document_id not in dataset.documents
    }
    if unknown_documents:
        sample = sorted(unknown_documents)[:3]
        raise DatasetError(f"Judgments reference unknown documents: {sample}")

    no_relevant = [
        query_id
        for query_id, judgments in dataset.qrels.items()
        if not any(score > 0 for score in judgments.values())
    ]
    if no_relevant:
        raise DatasetError(
            "Every evaluated query must have a positive judgment; missing for "
            f"{no_relevant[:3]}."
        )


def download_scifact(destination: Path, force: bool = False) -> Path:
    """Download and safely extract the BEIR SciFact dataset."""
    destination = destination.resolve()
    marker = destination / "corpus.jsonl"
    if marker.exists() and not force:
        return destination

    destination.parent.mkdir(parents=True, exist_ok=True)
    archive_path = destination.parent / "scifact.zip"
    tls_context = ssl.create_default_context(cafile=certifi.where())
    try:
        with urllib.request.urlopen(
            SCIFACT_URL, context=tls_context, timeout=60
        ) as response, archive_path.open("wb") as archive_handle:
            shutil.copyfileobj(response, archive_handle)
    except (OSError, urllib.error.URLError) as exc:
        archive_path.unlink(missing_ok=True)
        raise DatasetError(f"Could not download SciFact securely: {exc}") from exc

    extraction_root = destination.parent / ".scifact-extract"
    if extraction_root.exists():
        shutil.rmtree(extraction_root)
    extraction_root.mkdir(parents=True)

    try:
        with zipfile.ZipFile(archive_path) as archive:
            root = extraction_root.resolve()
            for member in archive.infolist():
                target = (extraction_root / member.filename).resolve()
                if root != target and root not in target.parents:
                    raise DatasetError(
                        f"Unsafe path in SciFact archive: {member.filename}"
                    )
            archive.extractall(extraction_root)

        extracted = extraction_root / "scifact"
        if not extracted.exists():
            raise DatasetError("SciFact archive did not contain a scifact folder.")
        if destination.exists():
            shutil.rmtree(destination)
        shutil.move(str(extracted), str(destination))
    finally:
        archive_path.unlink(missing_ok=True)
        if extraction_root.exists():
            shutil.rmtree(extraction_root)

    load_beir_dataset(destination)
    return destination
