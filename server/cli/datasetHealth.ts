#!/usr/bin/env tsx
/**
 * MindGuard Dataset Health Check CLI
 *
 * Usage:
 *   npm run dataset-health
 *
 * Prints a comprehensive report of dataset statistics, provenance, balance,
 * reviewer agreement, and actionable warnings.
 */

import { getDatasetSummary, getEnrichedSamples } from '../lib/datasetManager.js';

// ─── Colour helpers ──────────────────────────────────────────────────────────

const RED    = '\x1b[31m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const DIM    = '\x1b[2m';
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';

function logSection(title: string): void { console.log(`\n${CYAN}${BOLD}── ${title} ──${RESET}`); }
function logRow(label: string, value: string | number, color = ''): void {
  const c = color || RESET;
  console.log(`  ${DIM}${label.padEnd(32)}${RESET}${c}${value}${RESET}`);
}
function logBar(label: string, count: number, total: number, color = CYAN): void {
  const pct  = total > 0 ? count / total : 0;
  const barW = 20;
  const filled = Math.round(pct * barW);
  const bar  = `${color}${'█'.repeat(filled)}${DIM}${'░'.repeat(barW - filled)}${RESET}`;
  console.log(`  ${label.padEnd(16)} ${bar} ${count}/${total} (${(pct * 100).toFixed(0)}%)`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  console.log(`\n${BOLD}${CYAN}MindGuard Benchmark Dataset Health Report${RESET}\n`);

  const summary = getDatasetSummary();
  const all     = getEnrichedSamples();

  // ── Overview
  logSection('Overview');
  logRow('Total samples',       summary.totalSamples);
  logRow('Synthetic',           summary.syntheticCount, DIM);
  logRow('Real-world',          summary.realWorldCount, summary.realWorldCount > 0 ? GREEN : RED);
  logRow('Human-reviewed (provenance)', summary.humanReviewedCount, summary.humanReviewedCount > 0 ? GREEN : YELLOW);
  logRow('Samples with disagreement',   summary.samplesWithDisagreement, YELLOW);

  // ── Splits
  logSection('Split Distribution');
  logRow('Calibration set',  summary.calibrationCount);
  logRow('Holdout set',      summary.holdoutCount);
  logRow('Real in holdout',  summary.realHoldoutCount, summary.realHoldoutCount > 0 ? GREEN : YELLOW);

  // ── Class balance
  logSection('Class Distribution');
  const classLabels = ['neutral', 'mild', 'moderate', 'strong'] as const;
  for (const label of classLabels) {
    const b = summary.byLabel[label];
    if (!b) continue;
    logBar(label, b.total, summary.totalSamples, label === 'neutral' ? CYAN : label === 'mild' ? GREEN : label === 'moderate' ? YELLOW : RED);
    if (b.real > 0) logRow(`  └─ real`, b.real, GREEN);
  }

  // Check imbalance
  const classCounts = classLabels.map(l => summary.byLabel[l]?.total ?? 0);
  const maxClass = Math.max(...classCounts);
  const minClass = Math.min(...classCounts);
  if (maxClass > 0 && minClass / maxClass < 0.5) {
    console.log(`  ${YELLOW}⚠ Class imbalance detected: smallest class is ${((minClass / maxClass) * 100).toFixed(0)}% of largest${RESET}`);
  }

  // ── Content-type balance
  logSection('Content-Type Distribution');
  for (const [ct, data] of Object.entries(summary.byContentType)) {
    logBar(ct, data.total, summary.totalSamples);
    if (data.real > 0) logRow(`  └─ real`, data.real, GREEN);
  }

  // ── Provenance
  logSection('Provenance');
  logRow('Status', summary.provenanceStatement.status, summary.provenanceStatement.status === 'synthetic_only' ? YELLOW : GREEN);

  // Check for missing provenance in real samples
  const realSamples = all.filter(s => !s.is_synthetic);
  let missingFields = 0;
  for (const s of realSamples) {
    if (!s.source_reference || s.source_reference.length < 3) missingFields++;
    if (!(s.source_title ?? '') || (s.source_title ?? '').length < 3) missingFields++;
    if (!(s.source_domain ?? '') || (s.source_domain ?? '').length < 3) missingFields++;
  }
  if (realSamples.length > 0) {
    logRow('Real samples',      realSamples.length, GREEN);
    logRow('Missing prov fields', missingFields, missingFields > 0 ? RED : GREEN);
  } else {
    logRow('Real samples', '0 — no external validity', RED);
  }

  // ── Reviewer agreement
  logSection('Reviewer Agreement');
  const ag = summary.agreementReport;
  logRow('Full agreement (3/3)',    `${(ag.fullAgreementRate * 100).toFixed(0)}%`);
  logRow('Majority agreement (≥2/3)', `${(ag.majorityAgreementRate * 100).toFixed(0)}%`);
  logRow('Average Cohen\'s κ',     ag.averageKappa.toFixed(3), ag.averageKappa >= 0.6 ? GREEN : ag.averageKappa >= 0.4 ? YELLOW : RED);
  logRow('Interpretation',           ag.kappaInterpretation);
  logRow('Pairwise κ R1-R2',       ag.kappa_r1_r2.toFixed(3));
  logRow('Pairwise κ R1-R3',       ag.kappa_r1_r3.toFixed(3));
  logRow('Pairwise κ R2-R3',       ag.kappa_r2_r3.toFixed(3));

  if (ag.averageKappa < 0.6) {
    console.log(`  ${YELLOW}⚠ Reviewer agreement κ < 0.6 — consider refining labeling guidelines${RESET}`);
  }

  if (summary.realAgreement) {
    logSection('Reviewer Agreement (Real Samples Only)');
    const ra = summary.realAgreement;
    logRow('Full agreement',      `${(ra.fullAgreementRate * 100).toFixed(0)}%`);
    logRow('Average Cohen\'s κ', ra.averageKappa.toFixed(3), ra.averageKappa >= 0.6 ? GREEN : YELLOW);
    logRow('Interpretation',       ra.kappaInterpretation);
  }

  // ── Warnings
  logSection('Warnings');
  if (summary.warnings.length === 0) {
    console.log(`  ${GREEN}✓ No warnings — dataset meets minimum requirements${RESET}`);
  } else {
    for (const w of summary.warnings) {
      const color = w.severity === 'critical' ? RED : w.severity === 'warning' ? YELLOW : DIM;
      const icon  = w.severity === 'critical' ? '✗' : w.severity === 'warning' ? '⚠' : 'ℹ';
      console.log(`  ${color}${icon} [${w.severity.toUpperCase()}] ${w.message}${RESET}`);
    }
  }

  // ── Minimum thresholds
  logSection('Minimum Data Thresholds');
  const checks = [
    { label: 'Real samples ≥ 50',       met: summary.realWorldCount >= 50,    value: `${summary.realWorldCount}/50` },
    { label: 'Real holdout ≥ 15',       met: summary.realHoldoutCount >= 15,  value: `${summary.realHoldoutCount}/15` },
    { label: 'Class imbalance ≤ 50%',   met: maxClass > 0 && minClass / maxClass >= 0.5, value: `${((minClass / maxClass) * 100).toFixed(0)}%` },
    { label: 'Reviewer κ ≥ 0.6',        met: ag.averageKappa >= 0.6,          value: ag.averageKappa.toFixed(3) },
  ];
  for (const c of checks) {
    const icon  = c.met ? `${GREEN}✓` : `${RED}✗`;
    console.log(`  ${icon} ${c.label.padEnd(28)}${RESET} ${c.value}`);
  }

  const allMet = checks.every(c => c.met);
  logSection('Conclusion');
  if (allMet) {
    console.log(`  ${GREEN}${BOLD}Dataset meets all minimum thresholds for validated evaluation.${RESET}\n`);
  } else {
    const missing = checks.filter(c => !c.met).length;
    console.log(`  ${YELLOW}${BOLD}${missing} threshold(s) not met. See warnings above for guidance.${RESET}\n`);
  }
}

main();
