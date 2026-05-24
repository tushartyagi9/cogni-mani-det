#!/usr/bin/env python3
"""
Prepare synthetic 3-annotator CSV data from existing email JSON datasets.

Usage:
    python prepare_annotations.py
"""

from __future__ import annotations

import csv
import json
import random
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List


DATASET_FILES = [
    r"C:\Users\ASAD AHMAD\OneDrive\Desktop\cogniguard\files\email_benchmark_dataset.json",
    r"C:\Users\ASAD AHMAD\OneDrive\Desktop\cogniguard\files\cogniguard_email_FINAL_v2.1_1.json",
    r"C:\Users\ASAD AHMAD\OneDrive\Desktop\cogniguard\files\cogniguard_email_PRODUCTION_v3_2.json",
]

OUTPUT_DIR = Path("data")
OUTPUT_CSV = OUTPUT_DIR / "annotations.csv"
INPUT_V2_MAPPED_CSV = OUTPUT_DIR / "annotations_v2.csv"
OUTPUT_V2_KAPPA_CSV = OUTPUT_DIR / "annotations_v2_kappa.csv"
RANDOM_SEED = 42

STANDARD_LABELS = [
    "Legitimate",
    "Mild Influence",
    "Fear Induction",
    "Urgency Manipulation",
    "Authority Exploitation",
    "Financial Manipulation",
    "Identity Deception",
]

# Direct mapping requested by the user.
BASE_LABEL_MAP = {
    "ham": "Legitimate",
    "spam": "Mild Influence",
    "phishing": "Fear Induction",
    "urgency": "Urgency Manipulation",
    "authority": "Authority Exploitation",
    "financial": "Financial Manipulation",
    "identity": "Identity Deception",
}


def normalize(value: Any) -> str:
    """Normalize labels for robust matching."""
    if value is None:
        return ""
    text = str(value).strip().lower()
    text = text.replace("-", " ").replace("_", " ")
    return " ".join(text.split())


def map_to_standard_label(label: Any, sublabel: Any) -> str:
    """
    Map original label to one of 7 standard labels.

    Rules:
    1) Try direct map from label.
    2) If unmapped, try direct map from sublabel.
    3) If still unmapped, try keyword hints from sublabel/label text.
    4) Default to "Mild Influence".
    """
    label_norm = normalize(label)
    sublabel_norm = normalize(sublabel)

    if label_norm in BASE_LABEL_MAP:
        return BASE_LABEL_MAP[label_norm]
    if sublabel_norm in BASE_LABEL_MAP:
        return BASE_LABEL_MAP[sublabel_norm]

    combined = f"{label_norm} {sublabel_norm}"
    if "urgent" in combined or "urgency" in combined:
        return "Urgency Manipulation"
    if "authority" in combined or "official" in combined:
        return "Authority Exploitation"
    if "financial" in combined or "money" in combined or "payment" in combined:
        return "Financial Manipulation"
    if "identity" in combined or "impersonat" in combined:
        return "Identity Deception"
    if "fear" in combined or "threat" in combined or "phish" in combined:
        return "Fear Induction"

    return "Mild Influence"


def simulate_annotator(
    truth_label: str, match_probability: float, rng: random.Random
) -> str:
    """
    Simulate an annotator that matches ground truth with given probability.
    On mismatch, select a random valid label different from truth.
    """
    if rng.random() < match_probability:
        return truth_label

    alternatives = [label for label in STANDARD_LABELS if label != truth_label]
    return rng.choice(alternatives)


def infer_domain(file_path: Path, payload: Dict[str, Any]) -> str:
    """Infer domain from metadata or filename. Falls back to Email for this project."""
    meta = payload.get("_meta", {})
    if isinstance(meta, dict):
        domain = meta.get("domain")
        if isinstance(domain, str) and domain.strip():
            return domain.strip().title()

    name = file_path.name.lower()
    if "news" in name:
        return "News"
    return "Email"


def load_records() -> List[Dict[str, Any]]:
    """Load and flatten samples from all dataset files."""
    records: List[Dict[str, Any]] = []

    for file_path_str in DATASET_FILES:
        file_path = Path(file_path_str)
        if not file_path.exists():
            raise FileNotFoundError(f"Missing dataset file: {file_path}")

        with file_path.open("r", encoding="utf-8") as f:
            payload = json.load(f)

        samples = payload.get("samples", [])
        if not isinstance(samples, list):
            raise ValueError(f"Invalid 'samples' in {file_path}: expected list.")

        domain = infer_domain(file_path, payload)

        for idx, sample in enumerate(samples):
            if not isinstance(sample, dict):
                continue

            sample_id = sample.get("id")
            if sample_id is None or str(sample_id).strip() == "":
                sample_id = f"{file_path.stem}_{idx}"

            record = {
                "sample_id": str(sample_id),
                "text": str(sample.get("text", "")),
                "domain": domain,
                "original_label": str(sample.get("label", "")),
                "sublabel": sample.get("sublabel", ""),
                "manipulation_score": sample.get("manipulation_score", ""),
                "risk_level": sample.get("risk_level", ""),
            }
            records.append(record)

    return records


def build_annotation_rows(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Map labels and simulate 3 annotators."""
    rng = random.Random(RANDOM_SEED)
    rows: List[Dict[str, Any]] = []

    for rec in records:
        mapped_label = map_to_standard_label(rec["original_label"], rec.get("sublabel", ""))

        annotator_1 = mapped_label
        annotator_2 = simulate_annotator(mapped_label, 0.82, rng)
        annotator_3 = simulate_annotator(mapped_label, 0.76, rng)

        rows.append(
            {
                "sample_id": rec["sample_id"],
                "text": rec["text"],
                "domain": rec["domain"],
                "original_label": rec["original_label"],
                "annotator_1": annotator_1,
                "annotator_2": annotator_2,
                "annotator_3": annotator_3,
                "manipulation_score": rec["manipulation_score"],
                "risk_level": rec["risk_level"],
            }
        )

    return rows


def build_annotation_rows_from_v2_csv(v2_csv_path: Path) -> List[Dict[str, Any]]:
    """Build simulated annotator rows from mapped labels in annotations_v2.csv."""
    if not v2_csv_path.exists():
        raise FileNotFoundError(
            f"Missing required mapped CSV: {v2_csv_path}. "
            "Run fix_label_mapping.py first."
        )

    rng = random.Random(RANDOM_SEED)
    rows: List[Dict[str, Any]] = []

    with v2_csv_path.open("r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for idx, rec in enumerate(reader):
            sample_id = str(rec.get("sample_id", "")).strip() or f"v2_{idx}"
            mapped_label = str(rec.get("mapped_label", "")).strip()
            truth_label = mapped_label if mapped_label in STANDARD_LABELS else "Mild Influence"

            annotator_1 = truth_label
            annotator_2 = simulate_annotator(truth_label, 0.82, rng)
            annotator_3 = simulate_annotator(truth_label, 0.76, rng)

            rows.append(
                {
                    "sample_id": sample_id,
                    "text": str(rec.get("text", "")),
                    "domain": str(rec.get("domain", "")),
                    "original_label": str(rec.get("original_label", "")),
                    "annotator_1": annotator_1,
                    "annotator_2": annotator_2,
                    "annotator_3": annotator_3,
                    "manipulation_score": rec.get("manipulation_score", ""),
                    "risk_level": rec.get("risk_level", ""),
                }
            )

    return rows


def write_csv(rows: List[Dict[str, Any]], output_path: Path) -> None:
    """Write final annotation table to a CSV path."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    fieldnames = [
        "sample_id",
        "text",
        "domain",
        "original_label",
        "annotator_1",
        "annotator_2",
        "annotator_3",
        "manipulation_score",
        "risk_level",
    ]

    with output_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def print_summary(rows: List[Dict[str, Any]], name: str, output_path: Path) -> None:
    """Print total samples, label distribution, and annotator agreement rates."""
    print(f"\n=== {name} ===")
    total = len(rows)
    if total == 0:
        print("No rows generated.")
        return

    label_dist = Counter(row["annotator_1"] for row in rows)

    agree_12 = sum(row["annotator_1"] == row["annotator_2"] for row in rows) / total
    agree_13 = sum(row["annotator_1"] == row["annotator_3"] for row in rows) / total
    agree_23 = sum(row["annotator_2"] == row["annotator_3"] for row in rows) / total
    unanimous = (
        sum(
            row["annotator_1"] == row["annotator_2"] == row["annotator_3"]
            for row in rows
        )
        / total
    )

    print(f"Total samples: {total}")
    print("\nLabel distribution (annotator_1):")
    for label in STANDARD_LABELS:
        print(f"  {label}: {label_dist.get(label, 0)}")

    print("\nAgreement rate between annotators:")
    print(f"  annotator_1 vs annotator_2: {agree_12:.2%}")
    print(f"  annotator_1 vs annotator_3: {agree_13:.2%}")
    print(f"  annotator_2 vs annotator_3: {agree_23:.2%}")
    print(f"  unanimous (all three): {unanimous:.2%}")
    print(f"\nSaved: {output_path.resolve()}")


def main() -> None:
    records = load_records()
    rows = build_annotation_rows(records)
    write_csv(rows, OUTPUT_CSV)
    print_summary(rows, "annotations.csv (original mapping)", OUTPUT_CSV)

    v2_rows = build_annotation_rows_from_v2_csv(INPUT_V2_MAPPED_CSV)
    write_csv(v2_rows, OUTPUT_V2_KAPPA_CSV)
    print_summary(
        v2_rows,
        "annotations_v2_kappa.csv (mapped_label ground truth)",
        OUTPUT_V2_KAPPA_CSV,
    )


if __name__ == "__main__":
    main()
