#!/usr/bin/env python3
"""
Compute inter-annotator agreement for 3 annotators:
1) Pairwise Cohen's kappa
2) Fleiss' kappa across all annotators
3) JSON report export
4) Pairwise kappa heatmap export
"""

from __future__ import annotations

import json
from itertools import combinations
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from sklearn.metrics import cohen_kappa_score
from statsmodels.stats.inter_rater import fleiss_kappa


# Input CSV path required by the user.
CSV_PATH = Path("data/annotations.csv")

# Output artifact paths.
RESULTS_JSON_PATH = Path("kappa_results.json")
HEATMAP_PATH = Path("kappa_heatmap.png")

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


def interpret_kappa(score: float) -> str:
    """
    Convert a kappa score into a compact interpretation bucket.
    """
    if score >= 0.61:
        return "Substantial"
    if score >= 0.41:
        return "Moderate"
    return "Poor"


def validate_input(df: pd.DataFrame) -> None:
    """
    Validate required columns, nulls, and label vocabulary.
    """
    required_cols = ["sample_id", "text"] + ANNOTATOR_COLS
    missing_cols = [col for col in required_cols if col not in df.columns]
    if missing_cols:
        raise ValueError(
            f"Missing required columns: {missing_cols}. "
            f"Expected columns include: {required_cols}"
        )

    if df[ANNOTATOR_COLS].isnull().any().any():
        raise ValueError("Found missing annotator labels. Fill missing values before running.")

    observed_labels = set(pd.unique(df[ANNOTATOR_COLS].values.ravel()))
    unexpected = sorted(observed_labels - set(LABELS))
    if unexpected:
        raise ValueError(
            f"Found unknown labels not in expected label set: {unexpected}"
        )


def build_fleiss_matrix(df: pd.DataFrame) -> np.ndarray:
    """
    Build the (n_items x n_categories) matrix required by statsmodels.fleiss_kappa.
    Each row counts how many annotators chose each label for one sample.
    """
    label_to_index = {label: idx for idx, label in enumerate(LABELS)}
    matrix = np.zeros((len(df), len(LABELS)), dtype=int)

    for row_idx, row in enumerate(df[ANNOTATOR_COLS].itertuples(index=False, name=None)):
        for label in row:
            matrix[row_idx, label_to_index[label]] += 1

    return matrix


def compute_pairwise_kappas(df: pd.DataFrame) -> dict[str, float]:
    """
    Compute Cohen's kappa for each annotator pair.
    """
    pairwise_kappas: dict[str, float] = {}
    for a, b in combinations(ANNOTATOR_COLS, 2):
        key = f"{a}_vs_{b}"
        pairwise_kappas[key] = cohen_kappa_score(df[a], df[b], labels=LABELS)
    return pairwise_kappas


def build_heatmap_matrix(pairwise_kappas: dict[str, float]) -> pd.DataFrame:
    """
    Build a symmetric 3x3 matrix for heatmap plotting.
    Diagonal is 1.0 (self-agreement).
    """
    annotator_labels = ["A1", "A2", "A3"]
    mat = np.eye(3)

    # Map dict keys to matrix coordinates.
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
    """
    Plot and save pairwise kappa heatmap.
    """
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
    # Step 1: Load CSV.
    if not CSV_PATH.exists():
        raise FileNotFoundError(
            f"CSV file not found at '{CSV_PATH}'. Please place your file there."
        )
    df = pd.read_csv(CSV_PATH)

    # Step 2: Validate schema and labels.
    validate_input(df)

    # Step 3: Compute pairwise Cohen's kappa values.
    pairwise_kappas = compute_pairwise_kappas(df)
    mean_cohen = float(np.mean(list(pairwise_kappas.values())))

    # Step 4: Compute Fleiss' kappa for all 3 annotators.
    fleiss_matrix = build_fleiss_matrix(df)
    fleiss = float(fleiss_kappa(fleiss_matrix, method="fleiss"))

    # Step 5: Use Fleiss' kappa as the overall interpretation anchor.
    interpretation = interpret_kappa(fleiss)

    # Step 6: Print a clean result table.
    print("Inter-Annotator Agreement Results")
    print("---------------------------------")
    print(f"κ(A1,A2): {pairwise_kappas['annotator_1_vs_annotator_2']:.2f}")
    print(f"κ(A1,A3): {pairwise_kappas['annotator_1_vs_annotator_3']:.2f}")
    print(f"κ(A2,A3): {pairwise_kappas['annotator_2_vs_annotator_3']:.2f}")
    print(f"Mean Cohen's κ: {mean_cohen:.2f}")
    print(f"Fleiss' κ: {fleiss:.2f}")
    print(f"Interpretation: {interpretation}")

    # Step 7: Save metrics to JSON.
    results_payload = {
        "input_csv": str(CSV_PATH),
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
    RESULTS_JSON_PATH.write_text(json.dumps(results_payload, indent=2), encoding="utf-8")

    # Step 8: Create and save pairwise kappa heatmap.
    heatmap_df = build_heatmap_matrix(pairwise_kappas)
    save_heatmap(heatmap_df, HEATMAP_PATH)

    print(f"\nSaved JSON results to: {RESULTS_JSON_PATH}")
    print(f"Saved heatmap image to: {HEATMAP_PATH}")


if __name__ == "__main__":
    main()
