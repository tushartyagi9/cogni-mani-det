# CogniGuard Benchmark Workflow

This document describes how to collect, label, import, and evaluate benchmark data for the CogniGuard manipulation detection system.

---

## 1. Collecting Samples

### What to collect

Gather real-world text samples across these **content types**:

| Type | Examples |
|------|----------|
| `news` | News articles, headlines, press coverage |
| `email` | Marketing emails, phishing attempts, newsletters |
| `social` | Social media posts, tweets, Facebook posts |
| `ad` | Advertisements, product pitches, infomercial scripts |
| `blog` | Blog posts, opinion pieces |
| `forum` | Reddit posts, forum discussions |
| `press_release` | Corporate/government press releases |
| `other` | Any text that doesn't fit above |

### Balance goals

Aim for roughly equal numbers across:
- **4 classes**: neutral, mild, moderate, strong
- **4+ content types**: news, email, social, ad (minimum)
- **Minimum 50 real samples** for moderate confidence
- **Minimum 10 per class** for per-class metric reliability

### Provenance requirements

Every real sample **must** include:
- `source_reference` — URL or formal citation (min 3 chars)
- `source_title` — original title of the source document
- `source_domain` — e.g. "bbc.com", "reddit.com"
- `source_date` — when the source was published (YYYY-MM-DD preferred)
- `language` — ISO code, e.g. "en", "es", "ar"

Samples missing any of these will generate provenance warnings.

---

## 2. Labeling Guidelines

### Manipulation classes

| Label | Score Range | Description |
|-------|------------|-------------|
| `neutral` | 0–20 | No meaningful manipulation. Factual, balanced reporting. |
| `mild` | 21–40 | Minor persuasive elements. Some bias, hedged claims, light emotional language. |
| `moderate` | 41–60 | Clear manipulation tactics. Selective framing, fear/urgency appeals, misleading authority claims. |
| `strong` | 61–100 | Multiple high-risk tactics. Extreme language, conspiracy framing, aggressive call-to-action. |

### Tactic categories

When labeling, identify which tactics are present:

1. **Urgency** — "act now", "limited time", "before it's too late"
2. **Fear** — "dangerous", "deadly", "threat to your family"
3. **Guilt** — "you owe it to", "how could you not"
4. **Bandwagon** — "everyone is", "millions agree"
5. **Sensationalism** — "shocking", "unbelievable", "you won't believe"
6. **Absolutist Language** — "always", "never", "guaranteed", "proven"
7. **Authority Misuse** — vague "experts say", "studies show" without citations
8. **Emotional Framing** — "heartbreaking", "outrageous", loaded language
9. **Lack of Evidence** — claims without sources or data
10. **Conspiracy Framing** — "they don't want you to know", "cover-up"
11. **Call-to-Action Pressure** — "sign now", "donate immediately"

### Reviewer rules

- **3 independent reviewers** must label each sample
- Each reviewer assigns:
  - A manipulation label (`neutral` / `mild` / `moderate` / `strong`)
  - A list of detected tactics
- **Consensus rule**: the `final_consensus_label` must match **at least 2 of 3** reviewer labels (majority rule)
- If all 3 reviewers disagree, hold a discussion and re-label, or add detailed `disagreement_notes`
- Reviewers should **not** see each other's labels before submitting their own

### Boundary cases

- Text with only one minor tactic → `mild`
- Text with 2–3 clear tactics → `moderate`
- Text with 4+ tactics or extreme language → `strong`
- Marketing with standard "sale ends soon" → `neutral` to `mild` depending on intensity
- News quoting manipulative sources but reporting neutrally → `neutral`

---

## 3. Import Format

### JSON format

Create a file with this structure:

```json
{
  "entries": [
    {
      "sample": {
        "id": "real_news_001",
        "text": "The full article text...",
        "content_type": "news",
        "human_label": "moderate",
        "expected_score_range": [41, 60],
        "tactics": ["urgency", "emotional_framing"],
        "notes": "Why this was labeled moderate",
        "source_reference": "https://example.com/article",
        "source_title": "Article Title",
        "source_domain": "example.com",
        "source_date": "2026-03-01",
        "is_synthetic": false,
        "language": "en"
      },
      "annotation": {
        "id": "real_news_001",
        "split": "holdout",
        "is_synthetic": false,
        "source_type": "news_website",
        "source_reference": "https://example.com/article",
        "source_title": "Article Title",
        "source_domain": "example.com",
        "source_date": "2026-03-01",
        "language": "en",
        "reviewer_1_label": "moderate",
        "reviewer_2_label": "moderate",
        "reviewer_3_label": "mild",
        "reviewer_1_tactics": ["urgency", "emotional_framing"],
        "reviewer_2_tactics": ["urgency", "sensationalism"],
        "reviewer_3_tactics": ["emotional_framing"],
        "final_consensus_label": "moderate",
        "disagreement_notes": "R3 rated mild; R1+R2 noted urgency qualifies as moderate"
      }
    }
  ]
}
```

### CSV format

Same fields as column headers, one row per sample. Array fields use semicolons:

```
id,text,content_type,human_label,expected_score_range,...,reviewer_1_tactics
real_news_001,"Full text...",news,moderate,"[41,60]",...,urgency;emotional_framing
```

### Split assignment

- If `split` is omitted, the CLI auto-assigns: **70% calibration, 30% holdout**
- Or specify `"split": "calibration"` or `"split": "holdout"` per entry
- **Critical**: never use holdout samples for threshold tuning

---

## 4. Importing Samples

### Via CLI (recommended)

```bash
npm run import-benchmark ./path/to/samples.json
npm run import-benchmark ./path/to/samples.csv
```

The CLI will:
1. Validate all fields against the schema
2. Check for duplicate IDs
3. Verify provenance completeness (warns on missing fields)
4. Enforce the majority reviewer rule (2 of 3 must match consensus)
5. Auto-assign splits if not specified
6. Append valid samples to the benchmark dataset
7. Print a summary with errors and warnings

### Via API

```bash
curl -X POST http://localhost:3001/api/evaluation/import \
  -H "Content-Type: application/json" \
  -d @samples.json
```

---

## 5. Checking Dataset Health

```bash
npm run dataset-health
```

This prints:
- Total sample counts (synthetic vs real)
- Per-class and per-content-type distribution
- Split breakdown (calibration vs holdout)
- Provenance completeness (missing fields)
- Reviewer agreement statistics (Cohen's kappa)
- Minimum threshold checks
- Actionable warnings

### Minimum thresholds

| Threshold | Value | Why |
|-----------|-------|-----|
| Real samples | ≥ 50 | Minimum for moderate confidence |
| Real holdout | ≥ 15 | Minimum for meaningful holdout evaluation |
| Class imbalance | ≤ 50% | Smallest class ≥ 50% of largest |
| Reviewer κ | ≥ 0.6 | "Substantial" agreement on Landis-Koch scale |

---

## 6. Running Evaluation

### Local extractor evaluation (free, instant)

```bash
# Start the server
npm run dev:server

# Visit the admin dashboard
open http://localhost:3001/admin/evaluation
```

Or via API:

```bash
# Full report
curl http://localhost:3001/api/evaluation

# Recalculate (bypass cache)
curl http://localhost:3001/api/evaluation?recalculate=true

# Quick status check
curl http://localhost:3001/api/evaluation/status
```

### OpenAI model evaluation (costs ~$0.01, takes ~45s)

```bash
# Trigger from the admin dashboard "Production Model" tab
# Or via API:
curl -X POST "http://localhost:3001/api/evaluation/run-openai?samples=16&split=holdout"

# Check status
curl http://localhost:3001/api/evaluation/openai-status

# Get results
curl http://localhost:3001/api/evaluation/openai-results
```

### Filtered evaluation

```bash
# Only real holdout samples
curl "http://localhost:3001/api/evaluation/filtered?split=holdout&is_synthetic=false"

# Only news content
curl "http://localhost:3001/api/evaluation/filtered?content_type=news"
```

---

## 7. Interpreting Metrics

### Key metrics

| Metric | Good | Acceptable | Concerning |
|--------|------|------------|------------|
| Accuracy | > 0.85 | 0.70–0.85 | < 0.70 |
| F1 Score | > 0.80 | 0.65–0.80 | < 0.65 |
| Cohen's κ | > 0.80 | 0.60–0.80 | < 0.60 |
| FP Rate | < 0.10 | 0.10–0.20 | > 0.20 |

### Synthetic vs real metrics

- **Synthetic metrics** validate internal rubric logic. High accuracy on synthetic data means the rubric phrase-matching works as designed.
- **Real metrics** validate real-world performance. This is the number that matters for production claims.
- **Holdout metrics** are the most honest — they were never used for calibration.
- A large gap between calibration and holdout accuracy suggests overfitting.

### What to do if metrics are low

1. Check the confusion matrix for systematic misclassifications
2. Review per-class metrics — which class is underperforming?
3. Inspect individual samples with `GET /api/evaluation/sample/:id`
4. Consider adjusting calibration thresholds (Calibration tab → Apply Suggestions)
5. Add more diverse benchmark samples to improve coverage

---

## 8. Dataset Versioning

Every evaluation report includes:

```json
{
  "datasetVersion": "1.1",
  "datasetSize": 120,
  "realSampleCount": 0,
  "holdoutSize": 32,
  "evaluationDate": "2026-03-07T..."
}
```

The `datasetVersion` tracks the annotation schema version. When you add real samples, the version is preserved from `benchmarkAnnotations.json`. Update the `"version"` field in that file when making structural changes to the dataset.

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `npm run import-benchmark ./file.json` | Import new benchmark samples |
| `npm run dataset-health` | Print dataset statistics and warnings |
| `npm run dev:all` | Start frontend + backend |
| Visit `/admin/evaluation` | Full admin dashboard |
| `GET /api/evaluation/status` | Quick health check |
| `GET /api/evaluation` | Full evaluation report |
| `POST /api/evaluation/run-openai` | Trigger OpenAI model evaluation |
