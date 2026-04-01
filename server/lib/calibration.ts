/**
 * MindGuard Calibration Layer
 *
 * Translates raw manipulation scores into calibrated labels and risk levels.
 * Thresholds are stored in calibrationConfig.json and can be updated
 * automatically from evaluation results via updateThresholdsFromEvaluation().
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '../config/calibrationConfig.json');

// ─── Types ────────────────────────────────────────────────────────────────────

export type ManipulationLabel = 'neutral' | 'mild' | 'moderate' | 'strong' | 'extreme';
export type RiskLevel         = 'low' | 'medium' | 'high';
export type EmailLabel        = 'ham' | 'newsletter' | 'spam' | 'phishing';
export type EmailRiskLevel    = 'low' | 'medium' | 'high' | 'critical';

export interface ThresholdBand {
  min:         number;
  max:         number;
  label:       string;
  description: string;
}

interface CalibrationConfig {
  version:      string;
  updatedAt:    string;
  thresholds:   Record<ManipulationLabel, ThresholdBand>;
  riskLevelMapping: Record<ManipulationLabel, RiskLevel>;
  evidenceWeights: {
    capsBonus:          { perWord: number; max: number };
    exclamationBonus:   { perMark: number; max: number };
    densityNormalization:{ factor: number };
  };
  minimumTextLength:       number;
  minimumEvidenceThreshold:number;
  benchmarkStats: {
    lastEvaluated:   string | null;
    datasetSize:     number;
    accuracy:        number | null;
    f1Score:         number | null;
    note:            string;
  };
}

// ─── Load config ──────────────────────────────────────────────────────────────
let _config: CalibrationConfig | null = null;

export function getCalibrationConfig(): CalibrationConfig {
  if (_config) return _config;
  _config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as CalibrationConfig;
  return _config;
}

function saveConfig(cfg: CalibrationConfig): void {
  _config = cfg;
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}

// ─── Score → label ────────────────────────────────────────────────────────────

/** Convert a 0–100 manipulation score to a calibrated label */
export function scoreToLabel(score: number): ManipulationLabel;
export function scoreToLabel(score: number, mode: 'email'): EmailLabel;
export function scoreToLabel(score: number, mode?: 'email'): ManipulationLabel | EmailLabel {
  if (mode === 'email') {
    if (score >= 76) return 'phishing';
    if (score >= 45) return 'spam';
    if (score >= 26) return 'newsletter';
    return 'ham';
  }

  const cfg = getCalibrationConfig();
  for (const [key, band] of Object.entries(cfg.thresholds) as [ManipulationLabel, ThresholdBand][]) {
    if (score >= band.min && score <= band.max) return key;
  }
  return 'extreme'; // fallback for scores at 100
}

/** Convert a calibrated label to a risk level */
export function labelToRisk(label: ManipulationLabel): RiskLevel {
  return getCalibrationConfig().riskLevelMapping[label];
}

/** Convert a score directly to a risk level */
export function scoreToRisk(score: number): RiskLevel;
export function scoreToRisk(score: number, mode: 'email', label?: string): EmailRiskLevel;
export function scoreToRisk(score: number, mode?: 'email', label?: string): RiskLevel | EmailRiskLevel {
  if (mode === 'email') {
    return getEmailRiskLevel(score, label ?? scoreToLabel(score, 'email'));
  }
  return labelToRisk(scoreToLabel(score));
}

/** Get the human-readable description for a score */
export function scoreToDescription(score: number): string {
  const label = scoreToLabel(score);
  return getCalibrationConfig().thresholds[label].description;
}

/** Minimum text length from config */
export function getMinTextLength(): number {
  return getCalibrationConfig().minimumTextLength;
}

// ─── Recommended action from calibrated label ────────────────────────────────

const RECOMMENDED_ACTIONS: Record<ManipulationLabel, string> = {
  neutral:  'Content appears largely objective. Standard reading is appropriate.',
  mild:     'Minor persuasive elements detected. Consider the author\'s perspective and intent.',
  moderate: 'Noticeable manipulation tactics present. Verify claims with independent sources before accepting.',
  strong:   'Strong manipulation detected. Do not act on this content without thorough fact-checking from multiple credible sources.',
  extreme:  'Extreme manipulation. Treat as unreliable. Seek authoritative, peer-reviewed, or official sources only.',
};

export function getRecommendedAction(score: number): string {
  return RECOMMENDED_ACTIONS[scoreToLabel(score)];
}

export function getEmailRiskLevel(score: number, label: string): EmailRiskLevel {
  if (label === 'phishing' || score >= 76) return 'critical';
  if (label === 'spam' || score >= 45) return 'high';
  if (label === 'newsletter' || score >= 26) return 'medium';
  return 'low'; // ham
}

export function getEmailRecommendedAction(label: string, score: number): string {
  if (label === 'phishing' || score >= 76) {
    return 'DO NOT click any links or provide any information. This is a phishing attempt. Delete immediately and report to your email provider.';
  }
  if (label === 'spam' || score >= 45) {
    return 'This appears to be unsolicited commercial email. Do not purchase anything or click unknown links. Mark as spam.';
  }
  if (label === 'newsletter') {
    return 'This appears to be a legitimate newsletter or promotional email. You can safely read it, but use the unsubscribe link if unwanted.';
  }
  return 'This appears to be a legitimate email. No action required.';
}

// ─── Calibrate thresholds from evaluation results ────────────────────────────

export interface ThresholdSuggestion {
  label:           ManipulationLabel;
  currentMin:      number;
  currentMax:      number;
  suggestedMin:    number;
  suggestedMax:    number;
  reason:          string;
}

/**
 * Given per-label score statistics from the evaluation engine,
 * suggest adjusted thresholds that better fit the actual score distribution.
 */
export function suggestThresholds(
  stats: Record<ManipulationLabel, { avg: number; std: number }>,
): ThresholdSuggestion[] {
  const cfg         = getCalibrationConfig();
  const suggestions: ThresholdSuggestion[] = [];

  const labels: ManipulationLabel[] = ['neutral', 'mild', 'moderate', 'strong'];

  for (const label of labels) {
    const stat = stats[label];
    if (!stat) continue;

    const current     = cfg.thresholds[label];
    const sugMin      = Math.max(0,   Math.round(stat.avg - stat.std * 1.5));
    const sugMax      = Math.min(100, Math.round(stat.avg + stat.std * 1.5));

    suggestions.push({
      label,
      currentMin:   current.min,
      currentMax:   current.max,
      suggestedMin: sugMin,
      suggestedMax: sugMax,
      reason:       `Observed avg=${stat.avg.toFixed(1)}, std=${stat.std.toFixed(1)} for ${label} class`,
    });
  }

  return suggestions;
}

/**
 * Apply threshold suggestions to the calibration config and persist.
 * Only called when explicitly triggered (e.g. by admin action).
 */
export function applyThresholds(suggestions: ThresholdSuggestion[]): void {
  const cfg = getCalibrationConfig();

  for (const s of suggestions) {
    cfg.thresholds[s.label].min = s.suggestedMin;
    cfg.thresholds[s.label].max = s.suggestedMax;
  }

  cfg.version   = incrementVersion(cfg.version);
  cfg.updatedAt = new Date().toISOString().split('T')[0];
  saveConfig(cfg);
}

/** Update the benchmarkStats block after an evaluation run */
export function updateBenchmarkStats(
  datasetSize: number,
  accuracy:    number,
  f1Score:     number,
): void {
  const cfg            = getCalibrationConfig();
  cfg.benchmarkStats   = {
    lastEvaluated: new Date().toISOString(),
    datasetSize,
    accuracy:      Math.round(accuracy * 1000) / 1000,
    f1Score:       Math.round(f1Score * 1000) / 1000,
    note:          'Auto-updated by evaluation engine.',
  };
  saveConfig(cfg);
}

// ─── Version helpers ──────────────────────────────────────────────────────────

function incrementVersion(v: string): string {
  const parts  = v.split('.').map(Number);
  parts[parts.length - 1] += 1;
  return parts.join('.');
}

export function getCalibrationVersion(): string {
  return getCalibrationConfig().version;
}
