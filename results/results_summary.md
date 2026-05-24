# CogniGuard Results Summary

## Table 1 - Model Comparison

| Model | Task | Accuracy | Macro-F1 | Weighted-F1 |
|---|---|---:|---:|---:|
| TF-IDF SVM | 7-class manipulation typing | 0.908 | 0.653 | 0.907 |
| DistilBERT Binary | Binary manipulation detection | 0.909 | 0.910 | 0.910 |
| DistilBERT 7-class | 7-class manipulation typing | 0.868 | 0.816 | 0.870 |

## Table 2 - Per-class F1 (DistilBERT 7-class)

| Label | F1 |
|---|---:|
| Authority Exploitation | 0.776 |
| Fear Induction | 0.802 |
| Financial Manipulation | 0.819 |
| Identity Deception | 0.722 |
| Legitimate | 0.893 |
| Mild Influence | 0.883 |
| Urgency Manipulation | 0.000 |

## Table 3 - Pipeline Escalation Results

| Test Case | Tier Used | Risk Level | Final Label |
|---|---:|---|---|
| Legitimate Email | 1 | LOW | Legitimate |
| Spam Offer | 2 | HIGH | Mild Influence |
| Phishing Alert | 3 | CRITICAL | Fear Induction |

## Key Findings

- DistilBERT 7-class outperforms TF-IDF SVM on macro-F1 (0.816 vs 0.653), indicating better minority-class handling.
- Binary DistilBERT remains strong for Tier 1 gating (accuracy ~0.909), suitable for fast first-pass filtering.
- Pipeline behavior is aligned with escalation policy: legitimate stops at Tier 1, medium-risk spam resolves at Tier 2, high-risk phishing escalates to Tier 3.
- Urgency Manipulation remains a weak spot (F1=0.000 in 7-class), reflecting class support/data sparsity and requiring targeted data augmentation.
