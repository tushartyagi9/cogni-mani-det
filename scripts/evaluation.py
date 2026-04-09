#!/usr/bin/env python3
"""
Reusable evaluation utilities for classification experiments.
"""

import json
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    cohen_kappa_score,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
)


def compute_metrics(y_true, y_pred, labels, output_dir, prefix="test") -> dict:
    """
    Compute core classification metrics and save classification report to disk.
    """
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)
    labels = list(labels)

    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    report_path = out_dir / f"{prefix}_classification_report.txt"

    precision, recall, f1, support = precision_recall_fscore_support(
        y_true,
        y_pred,
        labels=labels,
        zero_division=0,
    )
    macro_f1 = f1_score(y_true, y_pred, labels=labels, average="macro", zero_division=0)
    weighted_f1 = f1_score(
        y_true, y_pred, labels=labels, average="weighted", zero_division=0
    )
    accuracy = accuracy_score(y_true, y_pred)
    kappa = cohen_kappa_score(y_true, y_pred, labels=labels)

    report_text = classification_report(
        y_true,
        y_pred,
        labels=labels,
        zero_division=0,
        digits=4,
    )
    report_path.write_text(report_text, encoding="utf-8")

    per_class = []
    for idx, label in enumerate(labels):
        per_class.append(
            {
                "label": label,
                "precision": float(precision[idx]),
                "recall": float(recall[idx]),
                "f1": float(f1[idx]),
                "support": int(support[idx]),
            }
        )

    return {
        "accuracy": float(accuracy),
        "macro_f1": float(macro_f1),
        "weighted_f1": float(weighted_f1),
        "cohen_kappa": float(kappa),
        "per_class": per_class,
        "classification_report_path": str(report_path),
    }


def plot_confusion_matrix(y_true, y_pred, labels, output_path, normalize=True):
    """
    Plot and save a confusion matrix heatmap.
    """
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)
    labels = list(labels)

    cm = confusion_matrix(
        y_true,
        y_pred,
        labels=labels,
        normalize="true" if normalize else None,
    )
    cm = np.nan_to_num(cm, nan=0.0)

    out_path = Path(output_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    plt.figure(figsize=(9, 7))
    sns.heatmap(
        cm,
        annot=True,
        fmt=".2f" if normalize else "d",
        cmap="Blues",
        xticklabels=labels,
        yticklabels=labels,
        cbar=True,
        square=True,
    )
    title_prefix = "Normalized " if normalize else ""
    plt.title(f"{title_prefix}Confusion Matrix")
    plt.xlabel("Predicted")
    plt.ylabel("True")
    plt.tight_layout()
    plt.savefig(out_path, dpi=300)
    plt.close()


def domain_breakdown(y_true, y_pred, domains, labels) -> dict:
    """
    Compute macro-F1 and per-class F1 by domain.
    """
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)
    domains = np.asarray(domains)
    labels = list(labels)

    df = pd.DataFrame({"domain": domains, "y_true": y_true, "y_pred": y_pred})
    result = {}

    for domain_name, group in df.groupby("domain", dropna=False):
        domain_true = group["y_true"].to_numpy()
        domain_pred = group["y_pred"].to_numpy()

        _, _, f1, _ = precision_recall_fscore_support(
            domain_true,
            domain_pred,
            labels=labels,
            zero_division=0,
        )
        macro_f1 = f1_score(
            domain_true,
            domain_pred,
            labels=labels,
            average="macro",
            zero_division=0,
        )

        per_class_f1 = {label: float(f1[idx]) for idx, label in enumerate(labels)}
        result[str(domain_name)] = {
            "macro_f1": float(macro_f1),
            "n_samples": int(len(group)),
            "per_class_f1": per_class_f1,
        }

    return result


def confidence_stats(y_proba, y_true, y_pred, labels) -> dict:
    """
    Compute confidence diagnostics per class:
    - mean confidence when prediction is correct vs wrong
    - minimum confidence threshold where precision >= 0.90 (on predicted samples)
    """
    probs = np.asarray(y_proba)
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)
    labels = list(labels)

    if probs.ndim != 2:
        raise ValueError("y_proba must be a 2D array with shape (n_samples, n_classes).")
    if probs.shape[0] != len(y_true):
        raise ValueError("y_proba row count must match y_true length.")
    if probs.shape[1] != len(labels):
        raise ValueError("y_proba column count must match labels length.")

    class_stats = {}

    for idx, label in enumerate(labels):
        class_conf = probs[:, idx]
        predicted_mask = y_pred == label
        correct_mask = predicted_mask & (y_true == label)
        wrong_mask = predicted_mask & (y_true != label)

        mean_correct = (
            float(np.mean(class_conf[correct_mask])) if np.any(correct_mask) else None
        )
        mean_wrong = float(np.mean(class_conf[wrong_mask])) if np.any(wrong_mask) else None

        thresholds = np.unique(class_conf[predicted_mask]) if np.any(predicted_mask) else np.array([])
        threshold_for_90p = None
        selected_count = 0
        selected_precision = None

        for threshold in np.sort(thresholds):
            selected = predicted_mask & (class_conf >= threshold)
            denom = int(np.sum(selected))
            if denom == 0:
                continue
            prec = float(np.sum(selected & (y_true == label)) / denom)
            if prec >= 0.90:
                threshold_for_90p = float(threshold)
                selected_count = denom
                selected_precision = prec
                break

        class_stats[label] = {
            "mean_confidence_correct": mean_correct,
            "mean_confidence_wrong": mean_wrong,
            "threshold_precision_ge_0_90": threshold_for_90p,
            "n_predicted_as_class": int(np.sum(predicted_mask)),
            "n_selected_at_threshold": int(selected_count),
            "precision_at_threshold": selected_precision,
        }

    return {"label_order": labels, "class_stats": class_stats}
