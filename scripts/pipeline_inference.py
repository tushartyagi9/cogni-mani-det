#!/usr/bin/env python3
"""
MindGuard multi-tier inference pipeline.
"""

import json
from pathlib import Path
import sys

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from escalation import MindGuardEscalator


class MindGuardPipeline:
    def __init__(
        self,
        tier1_model_dir: str,
        tier2_model_dir: str,
        tier1_threshold: float = 0.70,
        tier2_threshold: float = 0.60,
        device: str = "auto",
    ):
        self.tier1_model_path = Path(tier1_model_dir)
        self.tier2_model_path = Path(tier2_model_dir)
        self.tier1_threshold = float(tier1_threshold)
        self.tier2_threshold = float(tier2_threshold)

        self._validate_model_dir(self.tier1_model_path, "Tier 1")
        self._validate_model_dir(self.tier2_model_path, "Tier 2")

        self.device = self._resolve_device(device)

        self.tier1_tokenizer = AutoTokenizer.from_pretrained(str(self.tier1_model_path))
        self.tier1_model = AutoModelForSequenceClassification.from_pretrained(
            str(self.tier1_model_path)
        )
        self.tier1_model.to(self.device)
        self.tier1_model.eval()

        self.tier2_tokenizer = AutoTokenizer.from_pretrained(str(self.tier2_model_path))
        self.tier2_model = AutoModelForSequenceClassification.from_pretrained(
            str(self.tier2_model_path)
        )
        self.tier2_model.to(self.device)
        self.tier2_model.eval()

        self.escalator = MindGuardEscalator(
            tier1_threshold=self.tier1_threshold,
            tier2_threshold=self.tier2_threshold,
        )

    def _validate_model_dir(self, model_dir: Path, tier_name: str) -> None:
        if not model_dir.exists() or not model_dir.is_dir():
            raise FileNotFoundError(
                f"{tier_name} model directory not found: {model_dir}. "
                "Please provide a valid model folder."
            )
        if not (model_dir / "config.json").exists():
            raise FileNotFoundError(
                f"{tier_name} model directory is missing config.json: {model_dir}"
            )

    def _resolve_device(self, device: str):
        if device == "auto":
            return torch.device("cuda" if torch.cuda.is_available() else "cpu")
        return torch.device(device)

    def _infer(self, model, tokenizer, text: str) -> tuple[int, float]:
        encoded = tokenizer(
            text,
            truncation=True,
            max_length=512,
            return_tensors="pt",
        )
        encoded = {k: v.to(self.device) for k, v in encoded.items()}

        with torch.no_grad():
            logits = model(**encoded).logits.squeeze(0)
            probs = torch.softmax(logits, dim=-1)
            confidence, pred_idx = torch.max(probs, dim=-1)

        return int(pred_idx.item()), float(confidence.item())

    def _tier2_label_name(self, pred_idx: int) -> str:
        id2label = getattr(self.tier2_model.config, "id2label", {})
        if pred_idx in id2label:
            return str(id2label[pred_idx])
        if str(pred_idx) in id2label:
            return str(id2label[str(pred_idx)])
        return str(pred_idx)

    def predict(self, text: str) -> dict:
        tier1_idx, tier1_conf = self._infer(self.tier1_model, self.tier1_tokenizer, text)
        tier1_result = {"label": tier1_idx, "confidence": tier1_conf}

        tier2_result = None
        if tier1_result["label"] == 1 or tier1_result["confidence"] < self.tier1_threshold:
            tier2_idx, tier2_conf = self._infer(self.tier2_model, self.tier2_tokenizer, text)
            tier2_result = {
                "label": self._tier2_label_name(tier2_idx),
                "confidence": tier2_conf,
            }

        decision = self.escalator.decide(
            tier1_label=tier1_result["label"],
            tier1_conf=tier1_result["confidence"],
            tier2_label=tier2_result["label"] if tier2_result else None,
            tier2_conf=tier2_result["confidence"] if tier2_result else None,
        )

        return {
            "text_preview": text[:100],
            "tier1": tier1_result,
            "tier2": tier2_result,
            "decision": decision,
        }

    def predict_batch(self, texts: list[str]) -> list[dict]:
        return [self.predict(t) for t in texts]


if __name__ == "__main__":
    tier1_dir = "models/manipulation_distilbert"
    tier2_dir = "models/7class_distilbert"

    try:
        pipeline = MindGuardPipeline(
            tier1_model_dir=tier1_dir,
            tier2_model_dir=tier2_dir,
            tier1_threshold=0.70,
            tier2_threshold=0.60,
            device="auto",
        )
    except FileNotFoundError as exc:
        print(f"ERROR: {exc}")
        sys.exit(1)

    sample_emails = [
        "Subject: Team Meeting Reminder\n\nHi team, reminder that our sprint planning starts at 10 AM tomorrow.",
        "Subject: Earn $5,000 weekly from home\n\nNo skills needed. Click now to activate your guaranteed payout!",
        "Subject: Urgent Account Verification Required\n\nYour bank account will be suspended today unless you verify credentials immediately via this secure link.",
    ]

    results = pipeline.predict_batch(sample_emails)

    print("=== MindGuard Pipeline Smoke Test ===")
    header = (
        f"{'Case':<6} {'Tier1':<8} {'T1Conf':<8} {'Tier2':<28} "
        f"{'T2Conf':<8} {'Final Label':<28} {'Escalate':<9} {'Risk':<9}"
    )
    print(header)
    print("-" * len(header))
    for i, row in enumerate(results, start=1):
        tier2_label = row["tier2"]["label"] if row["tier2"] else "-"
        tier2_conf = f"{row['tier2']['confidence']:.2f}" if row["tier2"] else "-"
        print(
            f"{i:<6} "
            f"{row['tier1']['label']:<8} "
            f"{row['tier1']['confidence']:.2f}     "
            f"{tier2_label:<28} "
            f"{tier2_conf:<8} "
            f"{row['decision']['final_label']:<28} "
            f"{str(row['decision']['escalate_to_tier3']):<9} "
            f"{row['decision']['risk_level']:<9}"
        )

    print("\nDetailed JSON:")
    print(json.dumps(results, indent=2))
