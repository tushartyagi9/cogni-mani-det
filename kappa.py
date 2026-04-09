#!/usr/bin/env python3
"""
Compute inter-annotator agreement for 3 annotators:
1) Pairwise Cohen's kappa
2) Fleiss' kappa across all annotators
3) JSON report export
4) Pairwise kappa heatmap export

Examples:
    python kappa.py
    python kappa.py --csv data/annotations_v2_kappa.csv
"""

from __future__ import annotations

import argparse
import json
from itertools import combinations
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from sklearn.metrics import cohen_kappa_score
from statsmodels.stats.inter_rater import fleiss_kappa


# Default input/output paths.
DEFAULT_CSV_PATH = Path("data/annotations.csv")
DEFAULT_RESULTS_JSON_PATH = Path("kappa_results.json")
DEFAULT_HEATMAP_PATH = Path("kappa_heatmap.png")
V2_CSV_NAME = "annotations_v2_kappa.csv"
V2_RESULTS_JSON_PATH = Path("kappa_results_v2.json")
V2_HEATMAP_PATH = Path("kappa_heatmap_v2.png")

# Expected annotation columns in the CSV.
ANNOTATOR_COLS = ["annotator_1", "annotator_2", "annotator_3"]

# Closed set of allowed labels.
LABELS = [
    "Legitimate",
    "Mild Influence",
    "Fear Induction",
    "Urgency Manipulation",
    "Authority Exploitation",
    "Financial Manipulation",
    "Identity Deception",
]


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(description="Compute pairwise Cohen's and Fleiss' kappa.")
    parser.add_argument(
        "--csv",
        default=str(DEFAULT_CSV_PATH),
        help="Path to annotation CSV (default: data/annotations.csv).",
    )
    return parser.parse_args()


def resolve_output_paths(csv_path: Path) -> tuple[Path, Path]:
    """Resolve output artifact names while preserving existing default behavior."""
    if csv_path.name.lower() == DEFAULT_CSV_PATH.name.lower():
        return DEFAULT_RESULTS_JSON_PATH, DEFAULT_HEATMAP_PATH

    if csv_path.name.lower() == V2_CSV_NAME.lower():
        return V2_RESULTS_JSON_PATH, V2_HEATMAP_PATH

    stem = csv_path.stem
    return Path(f"kappa_results_{stem}.json"), Path(f"kappa_heatmap_{stem}.png")


def interpret_kappa(score: float) -> str:
    """Convert a kappa score into a compact interpretation bucket."""
    if score >= 0.61:
        return "Substantial"
    if score >= 0.41:
        return "Moderate"
    return "Poor"


def validate_input(df: pd.DataFrame) -> None:
    """Validate required columns, nulls, and label vocabulary."""
    required_cols = ["sample_id", "text"] + ANNOTATOR_COLS
    missing_cols = [col for col in required_cols if col not in df.columns]
    if missing_cols:
        raise ValueError(
            f"Missing required columns: {missing_cols}. "
            f"Expected columns include: {required_cols}"
        )

    if df[ANNOTATOR_COLS].isnull().any().any():
        raise ValueError("Found missing annotation values. Fill/remove them before kappa computation.")

    observed_labels = set(pd.unique(df[ANNOTATOR_COLS].values.ravel()))
    unknown = observed_labels - set(LABELS)
    if unknown:
        raise ValueError(f"Unknown labels found in CSV: {sorted(unknown)}")


def build_fleiss_matrix(df: pd.DataFrame) -> np.ndarray:
    """Build item-category count matrix required by statsmodels.fleiss_kappa."""
    label_to_idx = {label: i for i, label in enumerate(LABELS)}
    mat = np.zeros((len(df), len(LABELS)), dtype=int)

    for row_i, row in enumerate(df[ANNOTATOR_COLS].itertuples(index=False, name=None)):
        for lab in row:
            mat[row_i, label_to_idx[lab]] += 1
    return mat


def compute_pairwise_kappas(df: pd.DataFrame) -> dict[str, float]:
    """Compute Cohen's kappa for all annotator pairs."""
    pairwise: dict[str, float] = {}
    for a, b in combinations(ANNOTATOR_COLS, 2):
        pairwise[f"{a}_vs_{b}"] = cohen_kappa_score(df[a], df[b], labels=LABELS)
    return pairwise


def build_heatmap_matrix(pairwise_kappas: dict[str, float]) -> pd.DataFrame:
    """Build symmetric matrix for heatmap plotting."""
    annotator_labels = ["A1", "A2", "A3"]
    mat = np.eye(3)
    key_to_coords = {
        "annotator_1_vs_annotator_2": (0, 1),
        "annotator_1_vs_annotator_3": (0, 2),
        "annotator_2_vs_annotator_3": (1, 2),
    }
    for key, (i, j) in key_to_coords.items():
        score = pairwise_kappas[key]
        mat[i, j] = score
        mat[j, i] = score
    return pd.DataFrame(mat, index=annotator_labels, columns=annotator_labels)


def save_heatmap(heatmap_df: pd.DataFrame, output_path: Path) -> None:
    """Plot and save pairwise kappa heatmap."""
    plt.figure(figsize=(6, 5))
    sns.heatmap(
        heatmap_df,
        annot=True,
        fmt=".2f",
        cmap="YlGnBu",
        vmin=0,
        vmax=1,
        square=True,
        cbar_kws={"label": "Kappa"},
    )
    plt.title("Annotator Agreement (Cohen's Kappa)")
    plt.tight_layout()
    plt.savefig(output_path, dpi=300)
    plt.close()


def main() -> None:
    args = parse_args()
    csv_path = Path(args.csv)
    results_json_path, heatmap_path = resolve_output_paths(csv_path)

    if not csv_path.exists():
        raise FileNotFoundError(
            f"CSV file not found at '{csv_path}'. Please place your file there."
        )
    df = pd.read_csv(csv_path)

    validate_input(df)

    pairwise_kappas = compute_pairwise_kappas(df)
    mean_cohen = float(np.mean(list(pairwise_kappas.values())))
    fleiss = float(fleiss_kappa(build_fleiss_matrix(df), method="fleiss"))
    interpretation = interpret_kappa(fleiss)

    print("Inter-Annotator Agreement Results")
    print("---------------------------------")
    print(f"kappa(A1,A2): {pairwise_kappas['annotator_1_vs_annotator_2']:.2f}")
    print(f"kappa(A1,A3): {pairwise_kappas['annotator_1_vs_annotator_3']:.2f}")
    print(f"kappa(A2,A3): {pairwise_kappas['annotator_2_vs_annotator_3']:.2f}")
    print(f"Mean Cohen's kappa: {mean_cohen:.2f}")
    print(f"Fleiss' kappa: {fleiss:.2f}")
    print(f"Interpretation: {interpretation}")

    results_payload = {
        "input_csv": str(csv_path),
        "n_samples": int(len(df)),
        "labels": LABELS,
        "pairwise_cohen_kappa": {
            "annotator_1_vs_annotator_2": round(pairwise_kappas["annotator_1_vs_annotator_2"], 6),
            "annotator_1_vs_annotator_3": round(pairwise_kappas["annotator_1_vs_annotator_3"], 6),
            "annotator_2_vs_annotator_3": round(pairwise_kappas["annotator_2_vs_annotator_3"], 6),
        },
        "mean_cohen_kappa": round(mean_cohen, 6),
        "fleiss_kappa": round(fleiss, 6),
        "interpretation": interpretation,
    }
    results_json_path.write_text(json.dumps(results_payload, indent=2), encoding="utf-8")

    save_heatmap(build_heatmap_matrix(pairwise_kappas), heatmap_path)

    print(f"\nSaved JSON results to: {results_json_path}")
    print(f"Saved heatmap image to: {heatmap_path}")


if __name__ == "__main__":
    main()
