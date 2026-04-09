#!/usr/bin/env python3
"""
Fix label imbalance by remapping records using sublabel-driven rules.

Usage:
    python fix_label_mapping.py
"""

from __future__ import annotations

import csv
import json
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List


INPUT_FILES = [
    Path(r"C:\Users\ASAD AHMAD\OneDrive\Desktop\mindguard\files\mindguard_email_FINAL_v2.1_1.json"),
    Path(r"C:\Users\ASAD AHMAD\OneDrive\Desktop\mindguard\files\mindguard_email_PRODUCTION_v3_2.json"),
]

OUTPUT_DIR = Path("data")
OUTPUT_CSV = OUTPUT_DIR / "annotations_v2.csv"

STANDARD_LABELS = [
    "Legitimate",
    "Mild Influence",
    "Fear Induction",
    "Urgency Manipulation",
    "Authority Exploitation",
    "Financial Manipulation",
    "Identity Deception",
]

# Exact + keyword mapping derived from user's rules.
SUBLABEL_KEYWORDS = {
    "Legitimate": ["legitimate", "easy_ham", "hard_ham", "ham"],
    "Mild Influence": ["general_spam", "promotional", "newsletter", "marketing_spam", "telecom_spam", "tech_spam", "commercial_spam", "spam"],
    "Fear Induction": ["phishing", "upi_phishing", "bank_phishing", "tax_phishing", "corporate_phishing", "google_phishing", "paypal_phishing", "whatsapp_phishing", "microsoft_phishing", "ai_generated_phishing", "it_helpdesk_phishing", "health_spam", "credential", "account"],
    "Financial Manipulation": ["financial_spam", "lottery_spam", "get_rich_spam", "ai_trading_spam", "real_estate_fraud", "financial", "lottery", "money", "bank", "investment", "refund", "invoice", "payment"],
    "Authority Exploitation": ["bec", "cbi_impersonation", "cbi-impersonation", "authority", "impersonation", "official", "rbi", "police", "trai", "ceo_fraud"],
    "Urgency Manipulation": ["whatsapp_otp", "aadhaar_update", "urgency", "time_pressure", "deadline", "urgent", "otp", "suspend", "block"],
    "Identity Deception": ["identity", "social_engineering", "hijack", "doctor_appointment"],
}

# Fallback mapping from original label if sublabel does not match.
ORIGINAL_LABEL_FALLBACK = {
    "ham": "Legitimate",
    "spam": "Mild Influence",
    "phishing": "Fear Induction",
    "urgency": "Urgency Manipulation",
    "authority": "Authority Exploitation",
    "financial": "Financial Manipulation",
    "identity": "Identity Deception",
}


def normalize(value: Any) -> str:
    """Normalize labels/sublabels for robust matching."""
    if value is None:
        return ""
    text = str(value).strip().lower()
    text = text.replace("-", "_").replace(" ", "_")
    return "_".join(part for part in text.split("_") if part)


def infer_domain(file_name: str) -> str:
    """Infer domain from filename."""
    return "News" if "news" in file_name.lower() else "Email"


def map_label_from_sublabel(sublabel: Any, original_label: Any) -> str:
    """
    Map to one of 7 standard labels using sublabel-first strategy.
    Unmapped values fallback to original label, then default to Mild Influence.
    """
    sublabel_norm = normalize(sublabel)
    original_norm = normalize(original_label)

    # Pass 1: exact match after normalization to prevent generic terms like "spam"
    # from overriding specific labels such as "financial_spam".
    for target_label, keywords in SUBLABEL_KEYWORDS.items():
        for keyword in keywords:
            if sublabel_norm == normalize(keyword):
                return target_label

    # Pass 2: substring match for broader coverage (also normalized).
    for target_label, keywords in SUBLABEL_KEYWORDS.items():
        if any(normalize(keyword) in sublabel_norm for keyword in keywords):
            return target_label

    if original_norm in ORIGINAL_LABEL_FALLBACK:
        return ORIGINAL_LABEL_FALLBACK[original_norm]

    return "Mild Influence"


def load_samples() -> List[Dict[str, Any]]:
    """Load and flatten samples from both JSON files."""
    rows: List[Dict[str, Any]] = []

    for path in INPUT_FILES:
        if not path.exists():
            raise FileNotFoundError(f"Input file not found: {path}")

        payload = json.loads(path.read_text(encoding="utf-8"))
        samples = payload.get("samples", [])
        if not isinstance(samples, list):
            raise ValueError(f"Invalid JSON structure in {path}. Expected 'samples' list.")

        domain = infer_domain(path.name)

        for idx, sample in enumerate(samples):
            if not isinstance(sample, dict):
                continue

            sample_id = sample.get("id")
            if not sample_id:
                sample_id = f"{path.stem}_{idx}"

            original_label = sample.get("label", "")
            sublabel = sample.get("sublabel", "")
            mapped_label = map_label_from_sublabel(sublabel, original_label)

            rows.append(
                {
                    "sample_id": str(sample_id),
                    "text": str(sample.get("text", "")),
                    "domain": domain,
                    "original_label": str(original_label),
                    "sublabel": str(sublabel),
                    "mapped_label": mapped_label,
                    "manipulation_score": sample.get("manipulation_score", ""),
                    "risk_level": sample.get("risk_level", ""),
                }
            )

    return rows


def save_csv(rows: List[Dict[str, Any]]) -> None:
    """Save remapped rows to data/annotations_v2.csv."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "sample_id",
        "text",
        "domain",
        "original_label",
        "sublabel",
        "mapped_label",
        "manipulation_score",
        "risk_level",
    ]
    with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def print_summary(rows: List[Dict[str, Any]]) -> None:
    """Print unique sublabels and mapped label distribution."""
    unique_sublabels = sorted({normalize(r["sublabel"]) for r in rows})
    print("Unique sublabel values found:")
    for value in unique_sublabels:
        print(f"  {value}")
    print(f"\nTotal unique sublabels: {len(unique_sublabels)}")

    dist = Counter(r["mapped_label"] for r in rows)
    print("\nNew label distribution after mapping:")
    print(f"  Total samples: {len(rows)}")
    for label in STANDARD_LABELS:
        count = dist.get(label, 0)
        print(f"  {label}: {count}")

    print("\nCategory health checks:")
    for label in STANDARD_LABELS:
        count = dist.get(label, 0)
        if count < 50:
            add_needed = 50 - count
            print(
                f"  WARNING: {label} has {count} samples (< 50). "
                f"Suggested target after oversampling: 50 (+{add_needed})."
            )


def main() -> None:
    rows = load_samples()
    save_csv(rows)
    print_summary(rows)
    print(f"\nSaved updated annotations to: {OUTPUT_CSV.resolve()}")


if __name__ == "__main__":
    main()
