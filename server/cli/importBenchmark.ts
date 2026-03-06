#!/usr/bin/env tsx
/**
 * MindGuard Benchmark Import CLI
 *
 * Usage:
 *   npm run import-benchmark ./path/to/samples.json
 *   npm run import-benchmark ./path/to/samples.csv
 *
 * JSON format: { "entries": [ { "sample": {...}, "annotation": {...} } ] }
 * CSV format: one row per sample, columns map to ImportSample + ImportAnnotation fields
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { importSamples, checkProvenance, ImportSampleSchema, ImportAnnotationSchema, type ImportSample, type ImportAnnotation } from '../lib/datasetIngestion.js';

// ─── Colour helpers ──────────────────────────────────────────────────────────

const RED    = '\x1b[31m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const DIM    = '\x1b[2m';
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';

function logHeader(msg: string): void { console.log(`\n${CYAN}${BOLD}── ${msg} ──${RESET}`); }
function logOk(msg: string): void     { console.log(`  ${GREEN}✓${RESET} ${msg}`); }
function logWarn(msg: string): void   { console.log(`  ${YELLOW}⚠${RESET} ${msg}`); }
function logErr(msg: string): void    { console.log(`  ${RED}✗${RESET} ${msg}`); }
function logDim(msg: string): void    { console.log(`  ${DIM}${msg}${RESET}`); }

// ─── CSV parser (minimal, no deps) ──────────────────────────────────────────

function parseCSV(content: string): Array<Record<string, string>> {
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  });
}

function csvRowToEntry(row: Record<string, string>): { sample: unknown; annotation: unknown } {
  const parseArr = (s: string): string[] => {
    if (!s) return [];
    try { return JSON.parse(s) as string[]; }
    catch { return s.split(';').map(x => x.trim()).filter(Boolean); }
  };
  const parseRange = (s: string): [number, number] => {
    try { return JSON.parse(s) as [number, number]; }
    catch { const [a, b] = s.split('-').map(Number); return [a ?? 0, b ?? 100]; }
  };

  return {
    sample: {
      id:                   row['id'],
      text:                 row['text'],
      content_type:         row['content_type'],
      human_label:          row['human_label'],
      expected_score_range: parseRange(row['expected_score_range'] ?? '0-100'),
      tactics:              parseArr(row['tactics'] ?? ''),
      notes:                row['notes'] ?? '',
      source_reference:     row['source_reference'] ?? '',
      source_title:         row['source_title'] ?? '',
      source_domain:        row['source_domain'] ?? '',
      source_date:          row['source_date'] ?? '',
      is_synthetic:         row['is_synthetic'] === 'true',
      language:             row['language'] ?? 'en',
    },
    annotation: {
      id:                    row['id'],
      split:                 row['split'] || undefined, // let auto-assign handle it
      is_synthetic:          row['is_synthetic'] === 'true',
      source_type:           row['source_type'] ?? (row['is_synthetic'] === 'true' ? 'synthetic_corpus' : 'external'),
      source_reference:      row['source_reference'] ?? '',
      source_title:          row['source_title'] ?? '',
      source_domain:         row['source_domain'] ?? '',
      source_date:           row['source_date'] ?? '',
      language:              row['language'] ?? 'en',
      reviewer_1_label:      row['reviewer_1_label'],
      reviewer_2_label:      row['reviewer_2_label'],
      reviewer_3_label:      row['reviewer_3_label'],
      reviewer_1_tactics:    parseArr(row['reviewer_1_tactics'] ?? ''),
      reviewer_2_tactics:    parseArr(row['reviewer_2_tactics'] ?? ''),
      reviewer_3_tactics:    parseArr(row['reviewer_3_tactics'] ?? ''),
      final_consensus_label: row['final_consensus_label'] ?? row['human_label'],
      disagreement_notes:    row['disagreement_notes'] ?? '',
    },
  };
}

// ─── Auto-assign split (70/30) ──────────────────────────────────────────────

function autoAssignSplits(entries: Array<{ sample: unknown; annotation: unknown }>): void {
  let needsAssignment = 0;
  for (const entry of entries) {
    const ann = entry.annotation as Record<string, unknown>;
    if (!ann.split || (ann.split !== 'calibration' && ann.split !== 'holdout')) {
      needsAssignment++;
    }
  }

  if (needsAssignment === 0) return;

  const holdoutTarget = Math.max(1, Math.round(needsAssignment * 0.3));
  let holdoutAssigned = 0;
  let idx = 0;

  for (const entry of entries) {
    const ann = entry.annotation as Record<string, unknown>;
    if (!ann.split || (ann.split !== 'calibration' && ann.split !== 'holdout')) {
      // Every ~3rd sample goes to holdout, rest to calibration
      if (holdoutAssigned < holdoutTarget && idx % 3 === 2) {
        ann.split = 'holdout';
        holdoutAssigned++;
      } else {
        ann.split = 'calibration';
      }
      idx++;
    }
  }

  // If we didn't hit the target, assign remaining holdout slots
  if (holdoutAssigned < holdoutTarget) {
    for (const entry of entries) {
      const ann = entry.annotation as Record<string, unknown>;
      if (ann.split === 'calibration' && holdoutAssigned < holdoutTarget) {
        ann.split = 'holdout';
        holdoutAssigned++;
      }
    }
  }

  console.log(`  ${CYAN}→${RESET} Auto-assigned splits: ${needsAssignment - holdoutAssigned} calibration, ${holdoutAssigned} holdout`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  const filePath = process.argv[2];

  if (!filePath) {
    console.log(`
${BOLD}MindGuard Benchmark Import${RESET}

${CYAN}Usage:${RESET}
  npm run import-benchmark ./path/to/samples.json
  npm run import-benchmark ./path/to/samples.csv

${CYAN}JSON format:${RESET}
  {
    "entries": [
      {
        "sample": { "id": "...", "text": "...", ... },
        "annotation": { "id": "...", "split": "holdout", ... }
      }
    ]
  }

${CYAN}CSV columns:${RESET}
  id, text, content_type, human_label, expected_score_range, tactics,
  notes, source_reference, source_title, source_domain, source_date,
  is_synthetic, language, split, source_type, reviewer_1_label,
  reviewer_2_label, reviewer_3_label, reviewer_1_tactics,
  reviewer_2_tactics, reviewer_3_tactics, final_consensus_label,
  disagreement_notes

${DIM}Split is auto-assigned (70% calibration, 30% holdout) if not specified.${RESET}
`);
    process.exit(1);
  }

  const absPath = resolve(filePath);
  if (!existsSync(absPath)) {
    logErr(`File not found: ${absPath}`);
    process.exit(1);
  }

  logHeader('Reading input file');
  const content = readFileSync(absPath, 'utf-8');
  let entries: Array<{ sample: unknown; annotation: unknown }>;

  if (absPath.endsWith('.csv')) {
    const rows = parseCSV(content);
    logOk(`Parsed ${rows.length} CSV rows`);
    entries = rows.map(csvRowToEntry);
  } else {
    try {
      const parsed = JSON.parse(content) as { entries?: unknown[] };
      if (!parsed.entries || !Array.isArray(parsed.entries)) {
        logErr('JSON file must have a top-level "entries" array.');
        process.exit(1);
      }
      entries = parsed.entries as Array<{ sample: unknown; annotation: unknown }>;
      logOk(`Parsed ${entries.length} JSON entries`);
    } catch (e) {
      logErr(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
  }

  if (entries.length === 0) {
    logWarn('No entries to import.');
    process.exit(0);
  }

  // ── Pre-validation pass (dry run)
  logHeader('Validating entries');
  let validCount = 0;
  let errorCount = 0;
  const preErrors: Array<{ id: string; errors: string[] }> = [];

  for (const entry of entries) {
    const sP = ImportSampleSchema.safeParse(entry.sample);
    const aP = ImportAnnotationSchema.safeParse(entry.annotation);
    const errs: string[] = [];
    if (!sP.success) errs.push(...sP.error.issues.map(i => `sample.${i.path.join('.')}: ${i.message}`));
    if (!aP.success) errs.push(...aP.error.issues.map(i => `annotation.${i.path.join('.')}: ${i.message}`));

    if (errs.length > 0) {
      const id = typeof (entry.sample as Record<string, unknown>)?.id === 'string'
        ? (entry.sample as Record<string, unknown>).id as string : '?';
      preErrors.push({ id, errors: errs });
      errorCount++;
    } else {
      validCount++;

      // Provenance check
      const sample = sP.data!;
      const ann    = aP.data!;
      const issues = checkProvenance(sample, ann);
      if (issues.length > 0) {
        for (const issue of issues) logWarn(`[${sample.id}] ${issue.field}: ${issue.reason}`);
      }
    }
  }

  logOk(`${validCount} valid, ${errorCount} with errors`);
  if (preErrors.length > 0) {
    for (const pe of preErrors.slice(0, 10)) {
      logErr(`[${pe.id}] ${pe.errors[0]}`);
      for (const e of pe.errors.slice(1)) logDim(`    ${e}`);
    }
    if (preErrors.length > 10) logDim(`  ... and ${preErrors.length - 10} more`);
  }

  // ── Auto-assign splits
  logHeader('Assigning splits');
  autoAssignSplits(entries);

  // ── Import
  logHeader('Importing into benchmark dataset');
  const result = importSamples(entries);

  logOk(`Imported: ${result.imported}`);
  if (result.skipped > 0) logWarn(`Skipped: ${result.skipped}`);

  if (result.errors.length > 0) {
    logHeader('Import errors');
    for (const e of result.errors.slice(0, 10)) {
      logErr(`[${e.id}] ${e.errors[0]}`);
    }
  }

  if (result.provenanceWarnings.length > 0) {
    logHeader('Provenance warnings');
    for (const w of result.provenanceWarnings.slice(0, 15)) {
      logWarn(`[${w.id}] ${w.field}: ${w.reason}`);
    }
  }

  // ── Summary
  logHeader('Done');
  console.log(`  ${GREEN}${result.imported}${RESET} samples imported into the benchmark dataset.`);
  if (result.imported > 0) {
    logDim('Run "npm run dataset-health" to see updated dataset statistics.');
    logDim('Run "npm run dev:server" and visit /admin/evaluation to see results.');
  }
  console.log('');
}

main();
