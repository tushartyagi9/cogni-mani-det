/**
 * MindGuard Evaluation Engine v3
 *
 * - Split-aware evaluation (calibration vs holdout vs all)
 * - Separate synthetic vs real-world metric slices
 * - Local evidence extractor scoring
 * - Production OpenAI model scoring (on-demand, cached)
 * - Comparison metrics between local and OpenAI predictions
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { quickScore, extractEvidence } from './evidenceExtractor.js';
import {
  scoreToLabel,
  suggestThresholds,
  updateBenchmarkStats,
  getCalibrationVersion,
  type ManipulationLabel,
} from './calibration.js';
import { getSamplesBySplit, getFilteredSamples, getDatasetSummary, type EnrichedSample } from './datasetManager.js';
import { computeModelAgreement } from './agreementMetrics.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Report types ─────────────────────────────────────────────────────────────

export interface ScoreDistributionBand {
  avg: number; std: number; count: number; histogram: number[];
}

export interface PerClassMetric {
  precision: number; recall: number; f1: number; support: number;
}

export interface SampleResult {
  id:             string;
  humanLabel:     ManipulationLabel;
  predictedLabel: ManipulationLabel;
  score:          number;
  expectedRange:  [number, number];
  inRange:        boolean;
  correct:        boolean;
  split:          'calibration' | 'holdout';
  is_synthetic:   boolean;
}

export interface EvaluationMetrics {
  accuracy:          number;
  precision:         number;
  recall:            number;
  f1Score:           number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  perClassMetrics:   Record<ManipulationLabel, PerClassMetric>;
  confusionMatrix:   number[][];
  confusionLabels:   ManipulationLabel[];
  scoreDistribution: Record<ManipulationLabel, ScoreDistributionBand>;
}

export interface OpenAISampleResult {
  id: string; humanLabel: ManipulationLabel; openaiLabel: ManipulationLabel;
  openaiScore: number; localLabel: ManipulationLabel; localScore: number;
  correct: boolean; split: 'calibration' | 'holdout';
}

export interface OpenAIEvalReport {
  runAt: string; splitEvaluated: string; samplesEvaluated: number;
  metrics: EvaluationMetrics;
  modelAgreement: { agreeCount: number; disagreeCount: number; agreementRate: number; kappa: number; kappaLabel: string };
  sampleResults: OpenAISampleResult[];
}

export interface SlicedMetrics {
  datasetSize: number;
  metrics:     EvaluationMetrics | null; // null if slice has 0 samples
}

export interface EvaluationReport {
  evaluatedAt:        string;
  rubricVersion:      string;
  calibrationVersion: string;

  // Dataset versioning
  datasetVersion:     string;
  datasetSize:        number;
  realSampleCount:    number;
  holdoutSize:        number;
  evaluationDate:     string;

  overall:       EvaluationMetrics & { datasetSize: number };
  calibration:   EvaluationMetrics & { datasetSize: number };
  holdout:       EvaluationMetrics & { datasetSize: number };

  // Synthetic vs real slices
  synthetic:     SlicedMetrics;
  real:          SlicedMetrics;
  syntheticHoldout: SlicedMetrics;
  realHoldout:      SlicedMetrics;

  sampleResults: SampleResult[];

  thresholdRecommendations: Array<{
    label: ManipulationLabel; currentRange: [number, number];
    suggested: [number, number]; reason: string;
  }>;

  datasetSummary: ReturnType<typeof getDatasetSummary>;
}

// ─── In-memory cache ──────────────────────────────────────────────────────────
let _cachedReport: EvaluationReport | null = null;
let _cacheTime:    number | null           = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

// ─── Stat helpers ─────────────────────────────────────────────────────────────
function mean(v: number[]): number { return v.length === 0 ? 0 : v.reduce((s, x) => s + x, 0) / v.length; }
function stdDev(v: number[]): number { if (v.length < 2) return 0; const m = mean(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)); }
function buildHistogram(v: number[]): number[] { const b = Array(10).fill(0) as number[]; for (const x of v) b[Math.min(Math.floor(x / 10), 9)]++; return b; }
function round2(n: number): number { return Math.round(n * 100) / 100; }

// ─── Core metrics ─────────────────────────────────────────────────────────────

function computeMetrics(results: SampleResult[], labels: ManipulationLabel[]): EvaluationMetrics {
  const accuracy = round2(results.filter(r => r.correct).length / Math.max(results.length, 1));
  const labelIdx = Object.fromEntries(labels.map((l, i) => [l, i]));
  const matrix   = Array.from({ length: labels.length }, () => Array<number>(labels.length).fill(0));

  for (const r of results) {
    const pi = labelIdx[r.predictedLabel]; const ai = labelIdx[r.humanLabel];
    if (pi !== undefined && ai !== undefined) matrix[pi]![ai]++;
  }

  const perClassMetrics = {} as Record<ManipulationLabel, PerClassMetric>;
  let tP = 0, tR = 0, tF = 0, tFP = 0, tFN = 0;

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]!;
    const tp = matrix[i]?.[i] ?? 0;
    const fp = (matrix[i]?.reduce((s, v) => s + v, 0) ?? 0) - tp;
    const fn = labels.reduce((s, _, j) => s + (matrix[j]?.[i] ?? 0), 0) - tp;
    const support = results.filter(r => r.humanLabel === label).length;
    const p = tp + fp > 0 ? tp / (tp + fp) : 0;
    const r2 = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = p + r2 > 0 ? (2 * p * r2) / (p + r2) : 0;
    perClassMetrics[label] = { precision: round2(p), recall: round2(r2), f1: round2(f1), support };
    tP += p; tR += r2; tF += f1; tFP += fp; tFN += fn;
  }

  const scoresByLabel: Record<ManipulationLabel, number[]> = { neutral: [], mild: [], moderate: [], strong: [], extreme: [] };
  for (const r of results) scoresByLabel[r.humanLabel]?.push(r.score);
  const scoreDistribution = {} as Record<ManipulationLabel, ScoreDistributionBand>;
  for (const label of labels) {
    const v = scoresByLabel[label] ?? [];
    scoreDistribution[label] = { avg: round2(mean(v)), std: round2(stdDev(v)), count: v.length, histogram: buildHistogram(v) };
  }

  return {
    accuracy,
    precision:         round2(tP / labels.length),
    recall:            round2(tR / labels.length),
    f1Score:           round2(tF / labels.length),
    falsePositiveRate: round2(tFP / Math.max(results.length, 1)),
    falseNegativeRate: round2(tFN / Math.max(results.length, 1)),
    perClassMetrics, confusionMatrix: matrix, confusionLabels: labels, scoreDistribution,
  };
}

function sliceMetrics(results: SampleResult[], labels: ManipulationLabel[]): SlicedMetrics {
  return {
    datasetSize: results.length,
    metrics:     results.length > 0 ? computeMetrics(results, labels) : null,
  };
}

// ─── Score samples with local extractor ──────────────────────────────────────

function scoreLocalSamples(samples: EnrichedSample[]): SampleResult[] {
  return samples.map(sample => {
    const score          = quickScore(sample.text, sample.content_type);
    const predictedLabel = scoreToLabel(score);
    const inRange        = score >= sample.expected_score_range[0] && score <= sample.expected_score_range[1];
    const correct        = predictedLabel === sample.final_consensus_label;
    return {
      id: sample.id,
      humanLabel:     sample.final_consensus_label as ManipulationLabel,
      predictedLabel: predictedLabel as ManipulationLabel,
      score, expectedRange: sample.expected_score_range, inRange, correct,
      split: sample.split, is_synthetic: sample.is_synthetic,
    };
  });
}

// ─── Main evaluation ─────────────────────────────────────────────────────────

export async function runEvaluation(recalculate = false): Promise<EvaluationReport> {
  if (!recalculate && _cachedReport && _cacheTime && Date.now() - _cacheTime < CACHE_TTL_MS) {
    return _cachedReport;
  }

  const allSamples = getSamplesBySplit('all');
  const allResults = scoreLocalSamples(allSamples);
  const labels: ManipulationLabel[] = ['neutral', 'mild', 'moderate', 'strong'];

  const calResults       = allResults.filter(r => r.split === 'calibration');
  const holdResults      = allResults.filter(r => r.split === 'holdout');
  const synResults       = allResults.filter(r => r.is_synthetic);
  const realResults      = allResults.filter(r => !r.is_synthetic);
  const synHoldResults   = allResults.filter(r => r.is_synthetic  && r.split === 'holdout');
  const realHoldResults  = allResults.filter(r => !r.is_synthetic && r.split === 'holdout');

  const overall     = { ...computeMetrics(allResults,  labels), datasetSize: allSamples.length };
  const calibration = { ...computeMetrics(calResults,  labels), datasetSize: calResults.length };
  const holdout     = { ...computeMetrics(holdResults, labels), datasetSize: holdResults.length };

  const synthetic       = sliceMetrics(synResults,      labels);
  const real            = sliceMetrics(realResults,     labels);
  const syntheticHoldout = sliceMetrics(synHoldResults,  labels);
  const realHoldout     = sliceMetrics(realHoldResults, labels);

  // Threshold recommendations from calibration set only
  const statsMap = Object.fromEntries(
    labels.map(l => [l, { avg: calibration.scoreDistribution[l].avg, std: calibration.scoreDistribution[l].std }]),
  ) as Record<ManipulationLabel, { avg: number; std: number }>;

  const suggestions = suggestThresholds(statsMap);
  const thresholdRecommendations = suggestions.map(s => ({
    label: s.label, currentRange: [s.currentMin, s.currentMax] as [number, number],
    suggested: [s.suggestedMin, s.suggestedMax] as [number, number], reason: s.reason,
  }));

  updateBenchmarkStats(allSamples.length, overall.accuracy, overall.f1Score);

  const dsSummary = getDatasetSummary();

  // Build dataset version from annotation file header
  let datasetVersion = '1.0';
  try {
    const annRaw = JSON.parse(readFileSync(join(__dirname, '../data/benchmarkAnnotations.json'), 'utf-8')) as { version?: string };
    datasetVersion = annRaw.version ?? '1.0';
  } catch { /* default */ }

  const now = new Date().toISOString();

  const report: EvaluationReport = {
    evaluatedAt:         now,
    rubricVersion:       '1.0',
    calibrationVersion:  getCalibrationVersion(),
    datasetVersion,
    datasetSize:         allSamples.length,
    realSampleCount:     allResults.filter(r => !r.is_synthetic).length,
    holdoutSize:         holdResults.length,
    evaluationDate:      now,
    overall, calibration, holdout,
    synthetic, real, syntheticHoldout, realHoldout,
    sampleResults:       allResults,
    thresholdRecommendations,
    datasetSummary:      dsSummary,
  };

  _cachedReport = report;
  _cacheTime    = Date.now();
  return report;
}

export function invalidateCache(): void { _cachedReport = null; _cacheTime = null; }

export function inspectSample(id: string) {
  const all = getSamplesBySplit('all');
  const sample = all.find(s => s.id === id);
  if (!sample) return null;
  return { sample, extraction: extractEvidence(sample.text, sample.content_type) };
}

// ─── Filtered evaluation (arbitrary filter combos) ───────────────────────────

export function runFilteredEvaluation(opts: {
  split?: 'calibration' | 'holdout' | 'all';
  is_synthetic?: boolean;
  content_type?: string;
  label?: ManipulationLabel;
}): { datasetSize: number; metrics: EvaluationMetrics | null; sampleResults: SampleResult[] } {
  const samples = getFilteredSamples(opts);
  const results = scoreLocalSamples(samples);
  const labels: ManipulationLabel[] = ['neutral', 'mild', 'moderate', 'strong'];
  return {
    datasetSize:   results.length,
    metrics:       results.length > 0 ? computeMetrics(results, labels) : null,
    sampleResults: results,
  };
}

// ─── OpenAI evaluation (cached) ──────────────────────────────────────────────

let _openaiEvalRunning = false;
export function isOpenAIEvalRunning(): boolean { return _openaiEvalRunning; }

function loadOpenAICache(): OpenAIEvalReport | null {
  try {
    const path = join(__dirname, '../data/openaiEvalCache.json');
    const raw  = JSON.parse(readFileSync(path, 'utf-8')) as {
      lastRunAt: string | null; metrics: OpenAIEvalReport['metrics'] | null;
      results: OpenAISampleResult[]; samplesEvaluated: number; splitEvaluated: string | null;
    };
    if (!raw.lastRunAt || !raw.metrics) return null;
    return {
      runAt: raw.lastRunAt, splitEvaluated: raw.splitEvaluated ?? 'unknown',
      samplesEvaluated: raw.samplesEvaluated, metrics: raw.metrics,
      modelAgreement: computeModelAgreement(
        raw.results.map(r => r.localLabel as string), raw.results.map(r => r.openaiLabel as string),
      ),
      sampleResults: raw.results,
    };
  } catch { return null; }
}

function saveOpenAICache(report: OpenAIEvalReport, splitEvaluated: string): void {
  const path = join(__dirname, '../data/openaiEvalCache.json');
  writeFileSync(path, JSON.stringify({
    version: '1.0', description: 'Cached OpenAI production-model evaluation results.',
    lastRunAt: report.runAt, splitEvaluated, samplesEvaluated: report.samplesEvaluated,
    metrics: report.metrics, results: report.sampleResults,
  }, null, 2));
}

export async function runOpenAIEvaluation(
  maxSamples = 15,
  split: 'calibration' | 'holdout' | 'all' = 'holdout',
): Promise<OpenAIEvalReport> {
  if (_openaiEvalRunning) throw new Error('An OpenAI evaluation is already in progress.');

  const cap  = Math.min(Math.max(maxSamples, 1), 40);
  const pool = getSamplesBySplit(split);
  const labels: ManipulationLabel[] = ['neutral', 'mild', 'moderate', 'strong'];
  const perClass = Math.max(1, Math.floor(cap / labels.length));
  const selected: EnrichedSample[] = [];
  for (const label of labels) selected.push(...pool.filter(s => s.final_consensus_label === label).slice(0, perClass));
  const finalSamples = selected.slice(0, cap);

  const { analyzeWithAI } = await import('./openai.js');
  _openaiEvalRunning = true;
  const sampleResults: OpenAISampleResult[] = [];

  try {
    for (const sample of finalSamples) {
      try {
        const aiResult    = await analyzeWithAI(sample.text, sample.content_type);
        const localScore  = quickScore(sample.text, sample.content_type);
        const openaiScore = 'manipulationScore' in aiResult ? aiResult.manipulationScore : aiResult.manipulation_score;
        const openaiLabel = scoreToLabel(openaiScore) as ManipulationLabel;
        const localLabel  = scoreToLabel(localScore) as ManipulationLabel;
        sampleResults.push({
          id: sample.id, humanLabel: sample.final_consensus_label as ManipulationLabel,
          openaiLabel, openaiScore, localLabel, localScore,
          correct: openaiLabel === sample.final_consensus_label, split: sample.split,
        });
      } catch { /* skip failed */ }
    }

    const openaiVsHuman: SampleResult[] = sampleResults.map(r => ({
      id: r.id, humanLabel: r.humanLabel, predictedLabel: r.openaiLabel,
      score: r.openaiScore, expectedRange: [0, 100], inRange: true,
      correct: r.correct, split: r.split, is_synthetic: true,
    }));

    const metrics        = computeMetrics(openaiVsHuman, labels);
    const modelAgreement = computeModelAgreement(
      sampleResults.map(r => r.localLabel as string), sampleResults.map(r => r.openaiLabel as string),
    );

    const report: OpenAIEvalReport = {
      runAt: new Date().toISOString(), splitEvaluated: split,
      samplesEvaluated: sampleResults.length, metrics, modelAgreement, sampleResults,
    };

    saveOpenAICache(report, split);
    return report;
  } finally {
    _openaiEvalRunning = false;
  }
}

export { loadOpenAICache };
