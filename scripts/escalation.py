#!/usr/bin/env python3
"""
Escalation policy for CogniGuard's 3-tier architecture.
"""

from dataclasses import dataclass
import json


@dataclass
class CogniGuardEscalator:
    tier1_threshold: float = 0.70
    tier2_threshold: float = 0.60
    high_risk_categories: list = None

    def __post_init__(self):
        if self.high_risk_categories is None:
            self.high_risk_categories = [
                "Fear Induction",
                "Authority Exploitation",
                "Identity Deception",
            ]

    def decide(
        self,
        tier1_label: int,
        tier1_conf: float,
        tier2_label: str = None,
        tier2_conf: float = None,
    ) -> dict:
        """
        Decide final label and escalation status from tier outputs.
        """
        if tier1_label not in (0, 1):
            raise ValueError("tier1_label must be 0 (legit) or 1 (manipulative).")

        # Rule 1: Tier 1 uncertain => escalate.
        if tier1_conf < self.tier1_threshold:
            return {
                "final_label": "Uncertain (Needs Tier 3 Review)",
                "escalate_to_tier3": True,
                "tier_used": 3,
                "reason": (
                    f"Tier 1 confidence {tier1_conf:.2f} is below threshold "
                    f"{self.tier1_threshold:.2f}."
                ),
                "risk_level": "MEDIUM",
            }

        # Rule 2: Tier 1 confidently legitimate => stop.
        if tier1_label == 0 and tier1_conf >= self.tier1_threshold:
            return {
                "final_label": "Legitimate",
                "escalate_to_tier3": False,
                "tier_used": 1,
                "reason": "Tier 1 predicts legitimate with sufficient confidence.",
                "risk_level": "LOW",
            }

        # Remaining path: tier1_label == 1 (manipulative).
        # Rule 3: High-risk category => critical escalation.
        if tier2_label in self.high_risk_categories:
            return {
                "final_label": tier2_label,
                "escalate_to_tier3": True,
                "tier_used": 3,
                "reason": (
                    f"Predicted high-risk category '{tier2_label}', auto-escalated."
                ),
                "risk_level": "CRITICAL",
            }

        # Rule 4: Tier 2 uncertain => escalate.
        if tier2_conf is None or tier2_conf < self.tier2_threshold:
            return {
                "final_label": tier2_label if tier2_label else "Manipulative",
                "escalate_to_tier3": True,
                "tier_used": 3,
                "reason": (
                    "Tier 2 confidence unavailable or below threshold "
                    f"({self.tier2_threshold:.2f})."
                ),
                "risk_level": "MEDIUM",
            }

        # Rule 5: Tier 2 confident manipulative subtype => no escalation.
        return {
            "final_label": tier2_label if tier2_label else "Manipulative",
            "escalate_to_tier3": False,
            "tier_used": 2,
            "reason": "Tier 2 confidence is above threshold for manipulative subtype.",
            "risk_level": "HIGH",
        }

    def batch_decide(self, records: list[dict]) -> list[dict]:
        """
        Run decide() for each record and append escalation fields.
        """
        enriched = []
        for rec in records:
            decision = self.decide(
                tier1_label=rec.get("tier1_label"),
                tier1_conf=rec.get("tier1_conf"),
                tier2_label=rec.get("tier2_label"),
                tier2_conf=rec.get("tier2_conf"),
            )
            merged = dict(rec)
            merged.update(decision)
            enriched.append(merged)
        return enriched


if __name__ == "__main__":
    escalator = CogniGuardEscalator()

    examples = [
        {
            "id": "ex1_uncertain_t1",
            "tier1_label": 1,
            "tier1_conf": 0.55,
            "tier2_label": "Mild Influence",
            "tier2_conf": 0.80,
        },
        {
            "id": "ex2_legit_confident",
            "tier1_label": 0,
            "tier1_conf": 0.92,
            "tier2_label": None,
            "tier2_conf": None,
        },
        {
            "id": "ex3_high_risk",
            "tier1_label": 1,
            "tier1_conf": 0.94,
            "tier2_label": "Identity Deception",
            "tier2_conf": 0.71,
        },
        {
            "id": "ex4_low_t2_conf",
            "tier1_label": 1,
            "tier1_conf": 0.89,
            "tier2_label": "Mild Influence",
            "tier2_conf": 0.45,
        },
        {
            "id": "ex5_t2_confident",
            "tier1_label": 1,
            "tier1_conf": 0.91,
            "tier2_label": "Financial Manipulation",
            "tier2_conf": 0.86,
        },
    ]

    decisions = escalator.batch_decide(examples)

    print("=== CogniGuard Escalation Smoke Test ===")
    header = (
        f"{'ID':<20} {'Final Label':<28} {'Escalate':<10} "
        f"{'Tier':<6} {'Risk':<10} Reason"
    )
    print(header)
    print("-" * len(header))
    for row in decisions:
        print(
            f"{row['id']:<20} "
            f"{row['final_label']:<28} "
            f"{str(row['escalate_to_tier3']):<10} "
            f"{row['tier_used']:<6} "
            f"{row['risk_level']:<10} "
            f"{row['reason']}"
        )

    print("\nJSON output:")
    print(json.dumps(decisions, indent=2))
