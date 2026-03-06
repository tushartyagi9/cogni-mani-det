/**
 * MindGuard Dataset Ingestion
 *
 * Validates, normalises and appends real-world or synthetic samples + annotations
 * to the benchmark dataset files. Enforces provenance completeness before a sample
 * is counted as "real, reviewed".
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { invalidateDatasetCache } from './datasetManager.js';
import { invalidateCache as invalidateEvalCache } from './evaluationEngine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const VALID_LABELS   = ['neutral', 'mild', 'moderate', 'strong'] as const;
const VALID_TYPES    = ['news', 'email', 'social', 'ad', 'blog', 'forum', 'press_release', 'other'] as const;
const VALID_SPLITS   = ['calibration', 'holdout'] as const;

// ─── Import format schemas ────────────────────────────────────────────────────

export const ImportSampleSchema = z.object({
  id:               z.string().min(3).max(120),
  text:             z.string().min(20).max(50000),
  content_type:     z.enum(VALID_TYPES),
  human_label:      z.enum(VALID_LABELS),
  expected_score_range: z.tuple([z.number().min(0).max(100), z.number().min(0).max(100)]),
  tactics:          z.array(z.string()).default([]),
  notes:            z.string().default(''),

  // Real-world provenance fields
  source_reference: z.string().min(1),
  source_title:     z.string().default(''),
  source_domain:    z.string().default(''),
  source_date:      z.string().default(''),
  is_synthetic:     z.boolean(),
  language:         z.string().min(2).max(10).default('en'),
});

export const ImportAnnotationSchema = z.object({
  id:                    z.string().min(3),
  split:                 z.enum(VALID_SPLITS),
  is_synthetic:          z.boolean(),
  source_type:           z.string().min(1),
  source_reference:      z.string().min(1),
  source_title:          z.string().default(''),
  source_domain:         z.string().default(''),
  source_date:           z.string().default(''),
  language:              z.string().min(2).max(10).default('en'),

  reviewer_1_label:      z.enum(VALID_LABELS),
  reviewer_2_label:      z.enum(VALID_LABELS),
  reviewer_3_label:      z.enum(VALID_LABELS),
  reviewer_1_tactics:    z.array(z.string()).default([]),
  reviewer_2_tactics:    z.array(z.string()).default([]),
  reviewer_3_tactics:    z.array(z.string()).default([]),
  final_consensus_label: z.enum(VALID_LABELS),
  disagreement_notes:    z.string().default(''),
});

export type ImportSample     = z.infer<typeof ImportSampleSchema>;
export type ImportAnnotation = z.infer<typeof ImportAnnotationSchema>;

// ─── Provenance completeness check ───────────────────────────────────────────

export interface ProvenanceIssue {
  id:     string;
  field:  string;
  reason: string;
}

/**
 * Checks that a real-world sample has complete provenance:
 * source_reference, source_title, at least 2 distinct reviewer labels,
 * final_consensus_label, and all mandatory fields filled.
 */
export function checkProvenance(sample: ImportSample, annotation: ImportAnnotation): ProvenanceIssue[] {
  const issues: ProvenanceIssue[] = [];
  const id = sample.id;

  if (!sample.is_synthetic) {
    if (!sample.source_reference || sample.source_reference.trim().length < 3) {
      issues.push({ id, field: 'source_reference', reason: 'Real samples must have a non-trivial source_reference (URL or citation)' });
    }
    if (!sample.source_title || sample.source_title.trim().length < 3) {
      issues.push({ id, field: 'source_title', reason: 'Real samples must have a source_title' });
    }
    if (!sample.source_domain || sample.source_domain.trim().length < 3) {
      issues.push({ id, field: 'source_domain', reason: 'Real samples should specify source_domain (e.g. "bbc.com")' });
    }
    if (sample.text.length < 40) {
      issues.push({ id, field: 'text', reason: 'Text is suspiciously short for a real-world sample (< 40 chars)' });
    }
  }

  // All samples must have at least 2 of 3 reviewer labels matching consensus
  const reviewerLabels = [annotation.reviewer_1_label, annotation.reviewer_2_label, annotation.reviewer_3_label];
  const consensusCount = reviewerLabels.filter(l => l === annotation.final_consensus_label).length;
  if (consensusCount < 2) {
    issues.push({ id, field: 'final_consensus_label', reason: 'Consensus label must match at least 2 of 3 reviewer labels (majority rule)' });
  }

  if (sample.id !== annotation.id) {
    issues.push({ id, field: 'id', reason: 'Sample ID and annotation ID do not match' });
  }

  if (sample.human_label !== annotation.final_consensus_label) {
    issues.push({ id, field: 'human_label', reason: 'Sample human_label must equal annotation final_consensus_label' });
  }

  return issues;
}

// ─── Import function ──────────────────────────────────────────────────────────

export interface ImportResult {
  imported: number;
  skipped:  number;
  errors:   Array<{ id: string; errors: string[] }>;
  provenanceWarnings: ProvenanceIssue[];
}

/**
 * Import new samples + annotations into the benchmark dataset.
 *
 * Validates each entry with Zod, checks provenance, appends to the JSON files,
 * and invalidates caches. Duplicate IDs are rejected.
 */
export function importSamples(
  entries: Array<{ sample: unknown; annotation: unknown }>,
): ImportResult {
  const datasetPath    = join(__dirname, '../data/benchmarkDataset.json');
  const annotationsPath = join(__dirname, '../data/benchmarkAnnotations.json');

  // Load current data
  const dataset    = JSON.parse(readFileSync(datasetPath, 'utf-8')) as { samples: Array<Record<string, unknown>>; [k: string]: unknown };
  const annFile    = JSON.parse(readFileSync(annotationsPath, 'utf-8')) as { annotations: Record<string, Record<string, unknown>>; [k: string]: unknown };
  const existingIds = new Set(dataset.samples.map((s: Record<string, unknown>) => s.id as string));

  const result: ImportResult = { imported: 0, skipped: 0, errors: [], provenanceWarnings: [] };

  for (const entry of entries) {
    const sampleParse = ImportSampleSchema.safeParse(entry.sample);
    const annParse    = ImportAnnotationSchema.safeParse(entry.annotation);

    const entryErrors: string[] = [];

    if (!sampleParse.success) {
      entryErrors.push(...sampleParse.error.issues.map(i => `sample.${i.path.join('.')}: ${i.message}`));
    }
    if (!annParse.success) {
      entryErrors.push(...annParse.error.issues.map(i => `annotation.${i.path.join('.')}: ${i.message}`));
    }

    if (entryErrors.length > 0) {
      const id = typeof (entry.sample as Record<string, unknown>)?.id === 'string'
        ? (entry.sample as Record<string, unknown>).id as string
        : '(unknown)';
      result.errors.push({ id, errors: entryErrors });
      result.skipped++;
      continue;
    }

    const sample     = sampleParse.data!;
    const annotation = annParse.data!;

    if (existingIds.has(sample.id)) {
      result.errors.push({ id: sample.id, errors: ['Duplicate ID — sample already exists in benchmark dataset'] });
      result.skipped++;
      continue;
    }

    // Provenance check — warn but still import (warnings let caller know)
    const provIssues = checkProvenance(sample, annotation);
    result.provenanceWarnings.push(...provIssues);

    // Append to dataset
    dataset.samples.push({
      id:                   sample.id,
      text:                 sample.text,
      content_type:         sample.content_type,
      human_label:          sample.human_label,
      expected_score_range: sample.expected_score_range,
      tactics:              sample.tactics,
      notes:                sample.notes,
    });

    // Append annotation
    annFile.annotations[sample.id] = {
      split:                 annotation.split,
      is_synthetic:          annotation.is_synthetic,
      source_type:           annotation.source_type,
      source_reference:      annotation.source_reference,
      source_title:          annotation.source_title,
      source_domain:         annotation.source_domain,
      source_date:           annotation.source_date,
      language:              annotation.language,
      reviewer_1_label:      annotation.reviewer_1_label,
      reviewer_2_label:      annotation.reviewer_2_label,
      reviewer_3_label:      annotation.reviewer_3_label,
      reviewer_1_tactics:    annotation.reviewer_1_tactics,
      reviewer_2_tactics:    annotation.reviewer_2_tactics,
      reviewer_3_tactics:    annotation.reviewer_3_tactics,
      final_consensus_label: annotation.final_consensus_label,
      disagreement_notes:    annotation.disagreement_notes,
    };

    existingIds.add(sample.id);
    result.imported++;
  }

  // Persist
  if (result.imported > 0) {
    writeFileSync(datasetPath,     JSON.stringify(dataset,  null, 2));
    writeFileSync(annotationsPath, JSON.stringify(annFile,  null, 2));

    // Update provenance counts in annotations file header
    const synCount  = Object.values(annFile.annotations).filter(a => (a as Record<string, unknown>).is_synthetic === true).length;
    const realCount = Object.values(annFile.annotations).filter(a => (a as Record<string, unknown>).is_synthetic === false).length;
    const header    = annFile as Record<string, unknown>;
    const prov      = header['provenanceStatement'] as Record<string, unknown> | undefined;
    if (prov) {
      prov['synthetic_count']  = synCount;
      prov['real_world_count'] = realCount;
      prov['status']           = realCount > 0 ? 'mixed' : 'synthetic_only';
    }
    writeFileSync(annotationsPath, JSON.stringify(annFile, null, 2));

    invalidateDatasetCache();
    invalidateEvalCache();
  }

  return result;
}

// ─── Low-sample-count warnings ───────────────────────────────────────────────

export interface DatasetWarning {
  severity: 'critical' | 'warning' | 'info';
  category: string;
  message:  string;
}

const MIN_REAL_FOR_CLAIMS     = 50;
const MIN_REAL_PER_CLASS      = 10;
const MIN_REAL_PER_TYPE       = 8;
const MIN_HOLDOUT_REAL        = 15;
const MIN_REVIEWER_KAPPA      = 0.6;
const MAX_CLASS_IMBALANCE     = 0.5; // smallest class must be ≥50% of largest

export function getDatasetWarnings(summary: {
  realWorldCount: number;
  syntheticCount: number;
  holdoutCount:   number;
  byLabel:        Record<string, { total: number }>;
  byContentType:  Record<string, { total: number }>;
  realByLabel?:        Record<string, number>;
  realByContentType?:  Record<string, number>;
  realHoldoutCount?:   number;
  averageKappa?:       number;
}): DatasetWarning[] {
  const w: DatasetWarning[] = [];

  if (summary.realWorldCount === 0) {
    w.push({ severity: 'critical', category: 'provenance',
      message: 'Dataset is 100% synthetic. No external validity claims can be made. Add real human-labeled samples.' });
  } else if (summary.realWorldCount < MIN_REAL_FOR_CLAIMS) {
    w.push({ severity: 'warning', category: 'sample_size',
      message: `Only ${summary.realWorldCount} real samples (need ≥${MIN_REAL_FOR_CLAIMS} for moderate confidence in real-world claims).` });
  }

  if (summary.realByLabel) {
    for (const [label, count] of Object.entries(summary.realByLabel)) {
      if (count < MIN_REAL_PER_CLASS) {
        w.push({ severity: 'warning', category: 'class_balance',
          message: `Class "${label}" has only ${count} real samples (need ≥${MIN_REAL_PER_CLASS}).` });
      }
    }
  }

  if (summary.realByContentType) {
    for (const [ct, count] of Object.entries(summary.realByContentType)) {
      if (count < MIN_REAL_PER_TYPE) {
        w.push({ severity: 'warning', category: 'type_balance',
          message: `Content type "${ct}" has only ${count} real samples (need ≥${MIN_REAL_PER_TYPE}).` });
      }
    }
  }

  if (summary.realHoldoutCount !== undefined && summary.realHoldoutCount < MIN_HOLDOUT_REAL && summary.realWorldCount > 0) {
    w.push({ severity: 'warning', category: 'holdout',
      message: `Only ${summary.realHoldoutCount} real samples in holdout set (need ≥${MIN_HOLDOUT_REAL} for meaningful holdout claims).` });
  }

  if (summary.syntheticCount > 0 && summary.realWorldCount > 0 && summary.realWorldCount < summary.syntheticCount * 0.2) {
    w.push({ severity: 'info', category: 'ratio',
      message: `Real samples are <20% of synthetic count. Evaluation metrics are still dominated by synthetic data.` });
  }

  // Class imbalance across ALL samples
  const totalCounts = Object.values(summary.byLabel).map(b => b.total);
  const maxClass    = Math.max(...totalCounts);
  const minClass    = Math.min(...totalCounts);
  if (maxClass > 0 && minClass / maxClass < MAX_CLASS_IMBALANCE) {
    w.push({ severity: 'warning', category: 'class_imbalance',
      message: `Class imbalance > 50%: smallest class (${minClass}) is ${Math.round((minClass / maxClass) * 100)}% of largest (${maxClass}). Rebalance or stratify evaluation.` });
  }

  // Reviewer agreement threshold
  if (summary.averageKappa !== undefined && summary.averageKappa < MIN_REVIEWER_KAPPA) {
    w.push({ severity: 'warning', category: 'agreement',
      message: `Reviewer agreement κ = ${summary.averageKappa.toFixed(3)} is below the ${MIN_REVIEWER_KAPPA} threshold. Consider refining labeling guidelines or re-annotating ambiguous samples.` });
  }

  return w;
}
