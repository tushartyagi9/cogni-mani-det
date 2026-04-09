#!/usr/bin/env python3
"""
Train a TF-IDF + LinearSVC baseline on data/annotations_v2.csv.
"""

import json
import pickle
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC


DATA_PATH = Path("data/annotations_v2.csv")
OUTPUT_DIR = Path("models/tfidf_svm")

CLASS_ORDER = [
    "Legitimate",
    "Mild Influence",
    "Fear Induction",
    "Urgency Manipulation",
    "Authority Exploitation",
    "Financial Manipulation",
    "Identity Deception",
]


def load_data(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"Training data not found: {path}")

    df = pd.read_csv(path)
    required_cols = [
        "sample_id",
        "text",
        "domain",
        "original_label",
        "sublabel",
        "mapped_label",
        "manipulation_score",
        "risk_level",
    ]
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    df = df.copy()
    df["text"] = df["text"].fillna("").astype(str)
    df["mapped_label"] = df["mapped_label"].fillna("Mild Influence").astype(str)
    return df


def merge_rare_classes(df: pd.DataFrame, threshold: int = 5) -> tuple[pd.DataFrame, list]:
    """
    If any class has < threshold samples, merge it to 'Mild Influence'.
    """
    df = df.copy()
    counts = df["mapped_label"].value_counts()
    rare_classes = sorted(counts[counts < threshold].index.tolist())
    if rare_classes:
        df.loc[df["mapped_label"].isin(rare_classes), "mapped_label"] = "Mild Influence"
    return df, rare_classes


def split_data(df: pd.DataFrame):
    X = df["text"]
    y = df["mapped_label"]

    # 70% train, 30% temp (stratified)
    X_train, X_temp, y_train, y_temp = train_test_split(
        X,
        y,
        test_size=0.30,
        random_state=42,
        stratify=y,
    )

    # Split temp into 15% val and 15% test (stratified)
    X_val, X_test, y_val, y_test = train_test_split(
        X_temp,
        y_temp,
        test_size=0.50,
        random_state=42,
        stratify=y_temp,
    )

    return X_train, X_val, X_test, y_train, y_val, y_test


def build_pipeline() -> Pipeline:
    return Pipeline(
        steps=[
            (
                "tfidf",
                TfidfVectorizer(
                    max_features=50000,
                    ngram_range=(1, 3),
                    sublinear_tf=True,
                    min_df=2,
                    strip_accents="unicode",
                ),
            ),
            (
                "svm",
                LinearSVC(
                    class_weight="balanced",
                    C=1.0,
                    max_iter=2000,
                ),
            ),
        ]
    )


def save_confusion_matrix_plot(cm_norm: np.ndarray, labels: list, out_path: Path) -> None:
    plt.figure(figsize=(9, 7))
    sns.heatmap(
        cm_norm,
        annot=True,
        fmt=".2f",
        cmap="Blues",
        xticklabels=labels,
        yticklabels=labels,
        cbar=True,
        square=True,
    )
    plt.title("Normalized Confusion Matrix (Test)")
    plt.xlabel("Predicted")
    plt.ylabel("True")
    plt.tight_layout()
    plt.savefig(out_path, dpi=300)
    plt.close()


def main() -> None:
    df = load_data(DATA_PATH)
    df_merged, merged_classes = merge_rare_classes(df, threshold=5)

    X_train, X_val, X_test, y_train, y_val, y_test = split_data(df_merged)

    model = build_pipeline()
    model.fit(X_train, y_train)

    y_pred_test = model.predict(X_test)

    precision, recall, f1, support = precision_recall_fscore_support(
        y_test,
        y_pred_test,
        labels=CLASS_ORDER,
        zero_division=0,
    )
    macro_f1 = f1_score(y_test, y_pred_test, average="macro", zero_division=0)
    weighted_f1 = f1_score(y_test, y_pred_test, average="weighted", zero_division=0)
    accuracy = accuracy_score(y_test, y_pred_test)

    cm_norm = confusion_matrix(
        y_test,
        y_pred_test,
        labels=CLASS_ORDER,
        normalize="true",
    )
    cm_norm = np.nan_to_num(cm_norm, nan=0.0)

    report_text = classification_report(
        y_test,
        y_pred_test,
        labels=CLASS_ORDER,
        zero_division=0,
        digits=4,
    )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    model_path = OUTPUT_DIR / "model.pkl"
    metrics_path = OUTPUT_DIR / "metrics.json"
    cm_plot_path = OUTPUT_DIR / "confusion_matrix.png"
    report_path = OUTPUT_DIR / "classification_report.txt"

    with model_path.open("wb") as f:
        pickle.dump(model, f)

    per_class = []
    for i, label in enumerate(CLASS_ORDER):
        per_class.append(
            {
                "label": label,
                "precision": float(precision[i]),
                "recall": float(recall[i]),
                "f1": float(f1[i]),
                "support": int(support[i]),
            }
        )

    metrics_payload = {
        "data_path": str(DATA_PATH),
        "merged_classes_into_mild_influence": merged_classes,
        "split_sizes": {
            "train": int(len(X_train)),
            "val": int(len(X_val)),
            "test": int(len(X_test)),
        },
        "accuracy": float(accuracy),
        "macro_f1": float(macro_f1),
        "weighted_f1": float(weighted_f1),
        "per_class": per_class,
        "label_order": CLASS_ORDER,
        "confusion_matrix_normalized": cm_norm.tolist(),
    }
    metrics_path.write_text(json.dumps(metrics_payload, indent=2), encoding="utf-8")
    report_path.write_text(report_text, encoding="utf-8")
    save_confusion_matrix_plot(cm_norm, CLASS_ORDER, cm_plot_path)

    print("=== TF-IDF + SVM Baseline ===")
    print(f"Train: {len(X_train)} | Val: {len(X_val)} | Test: {len(X_test)}")
    if merged_classes:
        print(
            "Merged into 'Mild Influence' due to <5 samples: "
            + ", ".join(merged_classes)
        )
    else:
        print("Merged into 'Mild Influence' due to <5 samples: None")
    print(f"Macro-F1: {macro_f1:.2f}")
    print(f"Weighted-F1: {weighted_f1:.2f}")
    print(f"Accuracy: {accuracy:.2f}")

    print("Per-class F1:")
    print("Class                          | F1")
    print("------------------------------------")
    for item in per_class:
        print(f"{item['label']:<30} | {item['f1']:.2f}")


if __name__ == "__main__":
    main()
