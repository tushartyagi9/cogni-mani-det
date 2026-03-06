/**
 * MindGuard Inter-Rater Agreement Metrics
 *
 * Implements:
 * - Pairwise Cohen's Kappa (ordinal)
 * - Averaged multi-rater kappa across all reviewer pairs
 * - Simple observed agreement percentage
 * - Fleiss-style per-class agreement
 */

export type RaterLabel = string;

// ─── Cohen's Kappa (pairwise) ─────────────────────────────────────────────────

/**
 * Computes Cohen's Kappa for two raters on the same set of items.
 *
 * κ = (P_o − P_e) / (1 − P_e)
 *
 * Interpretation:
 * κ < 0.20  → Slight agreement
 * 0.21–0.40 → Fair agreement
 * 0.41–0.60 → Moderate agreement
 * 0.61–0.80 → Substantial agreement
 * 0.81–1.00 → Almost perfect agreement
 */
export function cohenKappa(rater1: RaterLabel[], rater2: RaterLabel[]): number {
  if (rater1.length !== rater2.length || rater1.length === 0) return 0;

  const n          = rater1.length;
  const categories = [...new Set([...rater1, ...rater2])];

  // Observed agreement
  const Po = rater1.filter((l, i) => l === rater2[i]).length / n;

  // Expected agreement by chance
  let Pe = 0;
  for (const cat of categories) {
    const p1 = rater1.filter(l => l === cat).length / n;
    const p2 = rater2.filter(l => l === cat).length / n;
    Pe += p1 * p2;
  }

  if (Pe >= 1) return 1; // degenerate case
  return Math.round(((Po - Pe) / (1 - Pe)) * 1000) / 1000;
}

/** Human-readable kappa interpretation */
export function kappaInterpretation(kappa: number): string {
  if (kappa >= 0.81) return 'Almost perfect';
  if (kappa >= 0.61) return 'Substantial';
  if (kappa >= 0.41) return 'Moderate';
  if (kappa >= 0.21) return 'Fair';
  if (kappa >= 0.01) return 'Slight';
  return 'No agreement';
}

// ─── Multi-rater agreement ────────────────────────────────────────────────────

export interface ReviewerLabels {
  reviewer_1_label: RaterLabel;
  reviewer_2_label: RaterLabel;
  reviewer_3_label: RaterLabel;
}

export interface AgreementReport {
  // Observed agreement across all samples
  fullAgreementRate:       number; // % samples where all 3 reviewers agree
  majorityAgreementRate:   number; // % samples where ≥2 of 3 reviewers agree

  // Pairwise kappas
  kappa_r1_r2:  number;
  kappa_r1_r3:  number;
  kappa_r2_r3:  number;
  averageKappa: number;
  kappaInterpretation: string;

  // Samples with disagreement
  disagreementCount: number;
  disagreementRate:  number;

  // Per-class breakdown
  perClassAgreement: Record<string, { count: number; fullAgree: number; rate: number }>;
}

/**
 * Compute full inter-rater agreement statistics for a set of annotated samples.
 */
export function computeAgreementReport(samples: ReviewerLabels[]): AgreementReport {
  if (samples.length === 0) {
    return {
      fullAgreementRate: 1, majorityAgreementRate: 1,
      kappa_r1_r2: 1, kappa_r1_r3: 1, kappa_r2_r3: 1, averageKappa: 1,
      kappaInterpretation: 'Almost perfect',
      disagreementCount: 0, disagreementRate: 0,
      perClassAgreement: {},
    };
  }

  const r1 = samples.map(s => s.reviewer_1_label);
  const r2 = samples.map(s => s.reviewer_2_label);
  const r3 = samples.map(s => s.reviewer_3_label);

  // Full agreement: all 3 agree
  const fullAgree      = samples.filter(s => s.reviewer_1_label === s.reviewer_2_label && s.reviewer_2_label === s.reviewer_3_label);
  const majorityAgree  = samples.filter(s => {
    const labels = [s.reviewer_1_label, s.reviewer_2_label, s.reviewer_3_label];
    const counts = new Map<string, number>();
    for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
    return Math.max(...counts.values()) >= 2;
  });

  const k12 = cohenKappa(r1, r2);
  const k13 = cohenKappa(r1, r3);
  const k23 = cohenKappa(r2, r3);
  const avgK = Math.round(((k12 + k13 + k23) / 3) * 1000) / 1000;

  // Per-class breakdown (based on reviewer_1_label as reference)
  const perClassAgreement: AgreementReport['perClassAgreement'] = {};
  const allLabels = [...new Set(r1)];
  for (const cls of allLabels) {
    const classSamples    = samples.filter(s => s.reviewer_1_label === cls);
    const classFullAgree  = classSamples.filter(s =>
      s.reviewer_1_label === s.reviewer_2_label && s.reviewer_2_label === s.reviewer_3_label
    );
    perClassAgreement[cls] = {
      count:    classSamples.length,
      fullAgree:classFullAgree.length,
      rate:     classSamples.length > 0 ? Math.round((classFullAgree.length / classSamples.length) * 1000) / 1000 : 1,
    };
  }

  const disagreementCount = samples.length - fullAgree.length;

  return {
    fullAgreementRate:       Math.round((fullAgree.length     / samples.length) * 1000) / 1000,
    majorityAgreementRate:   Math.round((majorityAgree.length / samples.length) * 1000) / 1000,
    kappa_r1_r2: k12, kappa_r1_r3: k13, kappa_r2_r3: k23,
    averageKappa:    avgK,
    kappaInterpretation: kappaInterpretation(avgK),
    disagreementCount,
    disagreementRate: Math.round((disagreementCount / samples.length) * 1000) / 1000,
    perClassAgreement,
  };
}

// ─── OpenAI vs Local Extractor agreement ────────────────────────────────────

export interface ModelAgreement {
  agreeCount:      number;
  disagreeCount:   number;
  agreementRate:   number;
  kappa:           number;
  kappaLabel:      string;
}

/**
 * Compute agreement between local extractor predictions and OpenAI predictions.
 */
export function computeModelAgreement(
  localLabels: RaterLabel[],
  openaiLabels: RaterLabel[],
): ModelAgreement {
  if (localLabels.length === 0 || localLabels.length !== openaiLabels.length) {
    return { agreeCount: 0, disagreeCount: 0, agreementRate: 0, kappa: 0, kappaLabel: 'No data' };
  }

  const agreeCount  = localLabels.filter((l, i) => l === openaiLabels[i]).length;
  const kappa       = cohenKappa(localLabels, openaiLabels);

  return {
    agreeCount,
    disagreeCount:  localLabels.length - agreeCount,
    agreementRate:  Math.round((agreeCount / localLabels.length) * 1000) / 1000,
    kappa,
    kappaLabel:     kappaInterpretation(kappa),
  };
}
