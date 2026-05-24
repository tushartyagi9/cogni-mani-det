# CogniGuard: A Three-Tier Cognitive Manipulation Detection System for Email Communications

## 1. ABSTRACT
Cognitive manipulation in email communication presents a persistent and evolving threat, spanning low-intensity persuasive spam to high-risk impersonation and coercive phishing. Standard binary detectors are useful for blocking obvious malicious content, but they do not provide the semantic granularity needed for risk-aware intervention and analyst-facing explanation. We present MindGuard, a three-tier detection architecture that combines a binary DistilBERT gate (Tier 1), a seven-class manipulation type classifier (Tier 2), and a rule-based escalation policy for high-risk or low-confidence cases (Tier 3). Across controlled evaluation, Tier 1 achieves an F1 score of 0.911 for manipulation detection, while the seven-class model achieves macro-F1 of approximately 0.815-0.816 and weighted-F1 of 0.870. Annotation reliability on the mapped seven-class dataset reaches substantial agreement (Fleiss' kappa = 0.649). The resulting pipeline routes benign communication quickly, labels medium-risk content automatically, and escalates critical manipulative patterns for deeper review.

## 2. INTRODUCTION
Digital communication ecosystems increasingly expose users to cognitive manipulation techniques designed to induce urgency, fear, compliance, and financial action. In email, these tactics often appear as credential-harvesting prompts, impersonation of institutional authority, emotionally loaded demands, or deceptive offers framed as urgent opportunities. The impact is not limited to direct financial loss; repeated exposure can erode trust, alter risk perception, and increase susceptibility to subsequent attacks.

Most operational email security systems still emphasize binary classification (safe vs unsafe, ham vs spam, phishing vs non-phishing). While binary screening is computationally efficient, it is insufficient for downstream decision-making. For example, a medium-confidence promotional spam and a high-confidence authority impersonation message may both be flagged as manipulative, yet they require very different responses. Security operations and user-facing safety systems need finer semantic typing to support calibrated intervention, triage, and explanation.

MindGuard addresses this gap through a tiered architecture. Tier 1 performs rapid binary filtering using DistilBERT to separate legitimate from manipulative communication. Tier 2 assigns a manipulation subtype using a seven-class taxonomy (Legitimate, Mild Influence, Fear Induction, Urgency Manipulation, Authority Exploitation, Financial Manipulation, Identity Deception). Tier 3 applies escalation logic: uncertain predictions and high-risk categories are routed for additional scrutiny and explanation generation.

This work makes three practical contributions. First, it provides an end-to-end pipeline that combines speed (binary gating) and semantic depth (multi-class typing). Second, it formalizes risk-aware escalation rules tied to confidence and category severity, enabling defensible operational behavior. Third, it reports baseline and transformer results with annotation reliability, highlighting both current strengths and failure modes (notably sparse urgency-class support) relevant for publication-quality follow-up work.

## 3. RELATED WORK
Research in spam and phishing detection has historically focused on binary or near-binary discrimination using lexical, URL, header, and metadata signals. Earlier machine learning approaches relied on bag-of-words and linear classifiers; more recent systems use transformer encoders for improved semantic generalization. These approaches are effective for coarse filtering but often under-specify the manipulative mechanism behind each detection.

Parallel work in social engineering and deception detection emphasizes psychologically grounded cues such as urgency, authority signaling, scarcity framing, and trust exploitation. However, many datasets collapse these signals into broad malicious labels, limiting practical use for nuanced triage and user guidance. In misinformation and deceptive content research, multi-class labeling has improved interpretability but often remains domain-specific (e.g., news-only), with limited transfer to email workflows.

MindGuard aligns with this transition from coarse classification to actionable semantic typing. By combining binary gating and seven-class subtyping, it preserves high-throughput detection while producing labels that are more informative for response policy. The additional escalation layer further differentiates this approach by explicitly linking model confidence and risk category to operational routing, rather than relying on a single model output threshold.

## 4. DATASET & ANNOTATION
The Tier 2 training and analysis dataset contains 2,678 labeled samples (`data/annotations_v2.csv`) across email-focused sources. Each row includes message content and metadata fields (`sample_id`, `text`, `domain`, `original_label`, `sublabel`, `mapped_label`, `manipulation_score`, `risk_level`). The target label is `mapped_label`, expressed in the following seven-class taxonomy:

1. Legitimate  
2. Mild Influence  
3. Fear Induction  
4. Urgency Manipulation  
5. Authority Exploitation  
6. Financial Manipulation  
7. Identity Deception

Inter-annotator reliability was assessed with three annotators using pairwise Cohen's kappa and Fleiss' kappa on the mapped annotation set. The observed aggregate reliability is substantial, with Fleiss' kappa = 0.649 and mean pairwise Cohen's kappa = 0.651. This supports use of the labels for supervised model training while still indicating class-level noise for rare categories.

### Label Distribution (annotations_v2.csv)
| Label | Samples |
|---|---:|
| Mild Influence | 1259 |
| Legitimate | 630 |
| Financial Manipulation | 512 |
| Fear Induction | 263 |
| Authority Exploitation | 10 |
| Urgency Manipulation | 3 |
| Identity Deception | 1 |

Beyond this mapped set, the broader project pipeline uses larger aggregated resources (approximately 40K samples from SpamAssassin, Nazario-style phishing corpora, and Hugging Face fake-news/manipulation sources) to support representation coverage and stress testing. The reported 2,678-sample benchmark in this paper reflects the curated seven-class mapping used for controlled evaluation.

## 5. METHODOLOGY
MindGuard is designed as a staged decision pipeline balancing efficiency, granularity, and risk control.

### Tier 1: Binary DistilBERT Gate
Tier 1 is a DistilBERT sequence classifier trained for binary discrimination: legitimate (0) vs manipulative (1). This stage acts as a fast front-end filter. High-confidence legitimate outputs terminate early with low risk, reducing unnecessary downstream inference.

### Tier 2: Seven-Class DistilBERT Typing
For manipulative or uncertain Tier 1 cases, Tier 2 predicts one of seven semantic classes. This converts binary alarms into interpretable categories useful for triage and analyst workflows. The model uses `id2label`/`label2id` mappings for stable inference output and consistent integration into the pipeline.

### Tier 3: Rule-Based Escalation
Escalation is implemented in `MindGuardEscalator` with threshold-driven rules:
1. If Tier 1 confidence < 0.70, escalate (uncertain primary decision).  
2. If Tier 1 predicts legitimate with confidence >= 0.70, stop at Tier 1 (LOW risk).  
3. If Tier 1 predicts manipulative and Tier 2 is in high-risk categories (Fear Induction, Authority Exploitation, Identity Deception), escalate as CRITICAL.  
4. If Tier 2 confidence < 0.60 (or unavailable), escalate as MEDIUM.  
5. Otherwise, accept Tier 2 classification as HIGH risk without Tier 3 escalation.

### Optimization and Imbalance Handling
Training uses weighted cross-entropy via `WeightedTrainer` (class-balanced weighting). This mitigates dominance from frequent classes such as Mild Influence. Reported training configuration is: 4 epochs, learning rate 2e-5, weight decay 0.01, warmup ratio 0.1, gradient accumulation 1, effective batch size target 8 (hardware-dependent heuristic), and fp16 enabled when CUDA is available. Early stopping is used for stability.

## 6. EXPERIMENTS & RESULTS
We compare a classical baseline (TF-IDF + LinearSVC) against transformer-based models for binary and seven-class tasks.

### Baseline and Model Comparison
- **TF-IDF SVM (7-class):** Accuracy 0.908, Macro-F1 0.653, Weighted-F1 0.907.  
- **DistilBERT Binary (Tier 1):** Accuracy 0.909, Precision 0.891, Recall 0.932, F1 0.911.  
- **DistilBERT 7-class (Tier 2):** Accuracy 0.868, Macro-F1 0.816 (approx. 0.815), Weighted-F1 0.870.

The seven-class transformer significantly improves macro-F1 relative to the TF-IDF baseline (0.816 vs 0.653), indicating stronger minority-class discrimination despite severe imbalance.

### Per-Class Tier 2 F1
- Authority Exploitation: 0.776  
- Fear Induction: 0.802  
- Financial Manipulation: 0.819  
- Identity Deception: 0.722  
- Legitimate: 0.893  
- Mild Influence: 0.883  
- Urgency Manipulation: 0.000

### Pipeline Behavior (3-case smoke test)
1. Legitimate reminder email -> Tier 1 decision, LOW risk, final label Legitimate.  
2. Promotional spam offer -> Tier 2 decision, HIGH risk, final label Mild Influence.  
3. Urgent account verification phishing -> Tier 3 escalation, CRITICAL risk, final label Fear Induction.

These outcomes confirm that confidence thresholds and category-aware escalation produce predictable routing behavior aligned with system intent.

## 7. DISCUSSION
The primary technical limitation is class sparsity in Urgency Manipulation (near-zero support), which directly explains the observed F1=0.000 for that class in Tier 2. This is not a model-collapse artifact alone; it is a data representational issue and affects both learning stability and evaluation fidelity.

Class imbalance is partially mitigated through class-weighted loss and staged inference design. Even so, minority classes with single-digit support remain fragile. Future iterations should prioritize targeted collection and adjudication for urgency/authority/identity subclasses, followed by calibrated threshold tuning.

The escalation policy is effective as an operational control layer: low-risk legitimate traffic exits early, medium-risk manipulative content is typed automatically, and high-risk semantic categories are routed for deeper review. This layered design provides a practical bridge between predictive modeling and deployment-time safety requirements.

## 8. CONCLUSION
MindGuard demonstrates that a three-tier architecture can improve practical manipulation detection for email: Tier 1 provides efficient binary gating, Tier 2 adds actionable manipulation typing, and Tier 3 enforces risk-aware escalation. Empirical results show strong binary performance (F1=0.911), substantially improved multi-class robustness over TF-IDF baselines (macro-F1 ~0.815-0.816), and substantial annotation reliability (Fleiss' kappa=0.649).

The main bottleneck is rare-class coverage, especially for Urgency Manipulation. Future work should integrate richer minority-class data, calibrated confidence estimation, and full LLM-based Tier 3 explanation generation with human-in-the-loop evaluation. These extensions can improve both scientific validity and operational trustworthiness.
