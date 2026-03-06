/**
 * MindGuard Dataset Manager v2
 *
 * Merges core benchmark samples with annotation metadata, handles train/test
 * splits, filtering (synthetic vs real, split, content type, label), and
 * exposes provenance summary statistics with per-source breakdowns.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { computeAgreementReport, type ReviewerLabels } from './agreementMetrics.js';
import { getDatasetWarnings, type DatasetWarning } from './datasetIngestion.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Types ────────────────────────────────────────────────────────────────────

type ManipulationLabel = 'neutral' | 'mild' | 'moderate' | 'strong' | 'extreme';
type SplitType         = 'calibration' | 'holdout' | 'all';

export interface RawSample {
  id:                   string;
  text:                 string;
  content_type:         string;
  human_label:          ManipulationLabel;
  expected_score_range: [number, number];
  tactics:              string[];
  notes:                string;
}

export interface SampleAnnotation {
  split:                  'calibration' | 'holdout';
  is_synthetic:           boolean;
  source_type:            string;
  source_reference:       string;
  source_title?:          string;
  source_domain?:         string;
  source_date?:           string;
  language?:              string;
  reviewer_1_label:       ManipulationLabel;
  reviewer_2_label:       ManipulationLabel;
  reviewer_3_label:       ManipulationLabel;
  reviewer_1_tactics?:    string[];
  reviewer_2_tactics?:    string[];
  reviewer_3_tactics?:    string[];
  final_consensus_label:  ManipulationLabel;
  disagreement_notes:     string;
}

export interface EnrichedSample extends RawSample, SampleAnnotation {}

export interface FilterOptions {
  split?:         SplitType;
  is_synthetic?:  boolean;
  content_type?:  string;
  label?:         ManipulationLabel;
  language?:      string;
}

export interface DatasetSummary {
  totalSamples:       number;
  calibrationCount:   number;
  holdoutCount:       number;
  syntheticCount:     number;
  realWorldCount:     number;
  humanReviewedCount: number;
  samplesWithDisagreement: number;
  byLabel:            Record<ManipulationLabel, { total: number; calibration: number; holdout: number; synthetic: number; real: number }>;
  byContentType:      Record<string, { total: number; calibration: number; holdout: number; synthetic: number; real: number }>;
  classBalance:       Record<ManipulationLabel, number>;
  contentTypeBalance: Record<string, number>;
  realByLabel:        Record<ManipulationLabel, number>;
  realByContentType:  Record<string, number>;
  realHoldoutCount:   number;
  agreementReport:    ReturnType<typeof computeAgreementReport>;
  syntheticAgreement: ReturnType<typeof computeAgreementReport>;
  realAgreement:      ReturnType<typeof computeAgreementReport> | null;
  provenanceStatement:{
    status: string;
    syntheticNote: string;
    realWorldNote: string;
    what_is_validated: string[];
    what_needs_real_data: string[];
  };
  warnings: DatasetWarning[];
}

// ─── Loaders ──────────────────────────────────────────────────────────────────

let _samples:     RawSample[]     | null = null;
let _annotations: Record<string, SampleAnnotation> | null = null;
let _enriched:    EnrichedSample[] | null = null;

function loadRawSamples(): RawSample[] {
  if (_samples) return _samples;
  const path = join(__dirname, '../data/benchmarkDataset.json');
  const raw  = JSON.parse(readFileSync(path, 'utf-8')) as { samples: RawSample[] };
  _samples   = raw.samples;
  return _samples;
}

function loadAnnotations(): Record<string, SampleAnnotation> {
  if (_annotations) return _annotations;
  const path  = join(__dirname, '../data/benchmarkAnnotations.json');
  const raw   = JSON.parse(readFileSync(path, 'utf-8')) as {
    annotations: Record<string, SampleAnnotation>;
    provenanceStatement: Record<string, unknown>;
  };
  _annotations = raw.annotations;
  return _annotations;
}

// ─── Merge samples + annotations ─────────────────────────────────────────────

export function getEnrichedSamples(invalidate = false): EnrichedSample[] {
  if (_enriched && !invalidate) return _enriched;

  const samples     = loadRawSamples();
  const annotations = loadAnnotations();

  _enriched = samples.map(sample => {
    const ann = annotations[sample.id];
    if (!ann) {
      return {
        ...sample,
        split:                 'calibration' as const,
        is_synthetic:          true,
        source_type:           'synthetic_corpus',
        source_reference:      'MindGuard Benchmark v1.0',
        reviewer_1_label:      sample.human_label,
        reviewer_2_label:      sample.human_label,
        reviewer_3_label:      sample.human_label,
        final_consensus_label: sample.human_label,
        disagreement_notes:    '',
      };
    }
    return { ...sample, ...ann };
  });

  return _enriched;
}

// ─── Filtering ───────────────────────────────────────────────────────────────

export function getSamplesBySplit(split: SplitType): EnrichedSample[] {
  const all = getEnrichedSamples();
  if (split === 'all') return all;
  return all.filter(s => s.split === split);
}

export function getFilteredSamples(opts: FilterOptions): EnrichedSample[] {
  let result = getEnrichedSamples();

  if (opts.split && opts.split !== 'all') {
    result = result.filter(s => s.split === opts.split);
  }
  if (opts.is_synthetic !== undefined) {
    result = result.filter(s => s.is_synthetic === opts.is_synthetic);
  }
  if (opts.content_type) {
    result = result.filter(s => s.content_type === opts.content_type);
  }
  if (opts.label) {
    result = result.filter(s => s.final_consensus_label === opts.label);
  }
  if (opts.language) {
    result = result.filter(s => (s.language ?? 'en') === opts.language);
  }

  return result;
}

/** Invalidate all caches */
export function invalidateDatasetCache(): void {
  _samples     = null;
  _annotations = null;
  _enriched    = null;
}

// ─── Agreement helper ────────────────────────────────────────────────────────

function agreementForSubset(samples: EnrichedSample[]) {
  if (samples.length === 0) return null;
  const reviewerSamples: ReviewerLabels[] = samples.map(s => ({
    reviewer_1_label: s.reviewer_1_label,
    reviewer_2_label: s.reviewer_2_label,
    reviewer_3_label: s.reviewer_3_label,
  }));
  return computeAgreementReport(reviewerSamples);
}

// ─── Dataset summary ──────────────────────────────────────────────────────────

export function getDatasetSummary(): DatasetSummary {
  const all  = getEnrichedSamples();
  const cal  = all.filter(s => s.split === 'calibration');
  const hold = all.filter(s => s.split === 'holdout');
  const syn  = all.filter(s => s.is_synthetic);
  const real = all.filter(s => !s.is_synthetic);

  const labels:       ManipulationLabel[] = ['neutral', 'mild', 'moderate', 'strong'];
  const contentTypes: string[]            = [...new Set(all.map(s => s.content_type))];

  const byLabel = Object.fromEntries(
    labels.map(l => [l, {
      total:       all .filter(s => s.final_consensus_label === l).length,
      calibration: cal .filter(s => s.final_consensus_label === l).length,
      holdout:     hold.filter(s => s.final_consensus_label === l).length,
      synthetic:   syn .filter(s => s.final_consensus_label === l).length,
      real:        real.filter(s => s.final_consensus_label === l).length,
    }]),
  ) as Record<ManipulationLabel, { total: number; calibration: number; holdout: number; synthetic: number; real: number }>;

  const byContentType = Object.fromEntries(
    contentTypes.map(ct => [ct, {
      total:       all .filter(s => s.content_type === ct).length,
      calibration: cal .filter(s => s.content_type === ct).length,
      holdout:     hold.filter(s => s.content_type === ct).length,
      synthetic:   syn .filter(s => s.content_type === ct).length,
      real:        real.filter(s => s.content_type === ct).length,
    }]),
  ) as Record<string, { total: number; calibration: number; holdout: number; synthetic: number; real: number }>;

  const classBalance       = Object.fromEntries(labels.map(l => [l, all.length > 0 ? byLabel[l].total / all.length : 0])) as Record<ManipulationLabel, number>;
  const contentTypeBalance = Object.fromEntries(contentTypes.map(ct => [ct, all.length > 0 ? byContentType[ct].total / all.length : 0])) as Record<string, number>;
  const realByLabel        = Object.fromEntries(labels.map(l => [l, byLabel[l].real])) as Record<ManipulationLabel, number>;
  const realByContentType  = Object.fromEntries(contentTypes.map(ct => [ct, byContentType[ct].real])) as Record<string, number>;

  const realHoldoutCount = real.filter(s => s.split === 'holdout').length;

  // Provenance completeness: count real samples with full source info
  const humanReviewedCount = real.filter(s =>
    s.source_reference && s.source_reference.length >= 3 &&
    (s.source_title ?? '').length >= 3
  ).length;

  // Agreement — full, synthetic, real
  const agreementReport    = agreementForSubset(all)!;
  const syntheticAgreement = agreementForSubset(syn)!;
  const realAgreement      = agreementForSubset(real);

  // Provenance from annotations file header
  const annRaw = JSON.parse(readFileSync(join(__dirname, '../data/benchmarkAnnotations.json'), 'utf-8')) as {
    provenanceStatement: {
      status: string; synthetic_count: number; real_world_count: number;
      review_process: string; what_is_validated: string[]; what_needs_real_data: string[];
    };
  };
  const prov = annRaw.provenanceStatement;

  // Dataset warnings (low sample count, imbalance, agreement, etc.)
  const warnings = getDatasetWarnings({
    realWorldCount:    real.length,
    syntheticCount:    syn.length,
    holdoutCount:      hold.length,
    byLabel:           byLabel as Record<string, { total: number }>,
    byContentType:     byContentType as Record<string, { total: number }>,
    realByLabel:       realByLabel as Record<string, number>,
    realByContentType: realByContentType as Record<string, number>,
    realHoldoutCount,
    averageKappa:      agreementReport.averageKappa,
  });

  return {
    totalSamples:            all.length,
    calibrationCount:        cal.length,
    holdoutCount:            hold.length,
    syntheticCount:          syn.length,
    realWorldCount:          real.length,
    humanReviewedCount,
    samplesWithDisagreement: all.filter(s => s.disagreement_notes.length > 0).length,
    byLabel,
    byContentType,
    classBalance,
    contentTypeBalance,
    realByLabel,
    realByContentType,
    realHoldoutCount,
    agreementReport,
    syntheticAgreement,
    realAgreement,
    provenanceStatement: {
      status:               real.length > 0 ? 'mixed' : 'synthetic_only',
      syntheticNote:        prov.review_process,
      realWorldNote:        real.length > 0
        ? `${real.length} real-world samples have been added (${humanReviewedCount} with complete provenance).`
        : 'No real-world samples in this version. See what_needs_real_data.',
      what_is_validated:    prov.what_is_validated,
      what_needs_real_data: prov.what_needs_real_data,
    },
    warnings,
  };
}
