/**
 * MindGuard Evidence Extractor
 *
 * Deterministic, rubric-based local scorer.
 * Used for:
 * 1. Benchmark evaluation (fast, no API cost)
 * 2. Cross-validation of OpenAI scores
 * 3. Phrase-level evidence extraction for transparency
 *
 * All scoring is fully explainable: every point can be traced back
 * to a specific phrase in the rubric and its documented weight.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RubricCategory {
  id:              string;
  category:        string;
  description:     string;
  weight:          number;
  risk_level:      'low' | 'medium' | 'high';
  example_phrases: string[];
}

export interface TacticEvidence {
  tactic:       string;
  tacticId:     string;
  phrases:      string[];
  score:        number;
  contribution: number;
  risk:         'low' | 'medium' | 'high';
  description:  string;
}

export interface ExtractionResult {
  manipulationScore:  number;
  tacticsFound:       number;
  tacticEvidence:     TacticEvidence[];
  capsBonus:          number;
  exclamBonus:        number;
  categoryScores:     Record<string, number>;
  dominantTactic:     string | null;
  evidenceSummary:    string;
}

// ─── Load rubric once ─────────────────────────────────────────────────────────
let _rubric: RubricCategory[] | null = null;

function getRubric(): RubricCategory[] {
  if (_rubric) return _rubric;
  const rubricPath = join(__dirname, '../data/scoringRubric.json');
  const raw = JSON.parse(readFileSync(rubricPath, 'utf-8')) as { categories: RubricCategory[] };
  _rubric = raw.categories;
  return _rubric;
}

// ─── Core extraction function ────────────────────────────────────────────────

/**
 * Extracts manipulation evidence from text using the scoring rubric.
 * Returns a fully transparent, phrase-level breakdown.
 */
export function extractEvidence(text: string): ExtractionResult {
  const rubric    = getRubric();
  const lower     = text.toLowerCase();
  const wordCount = Math.max(text.split(/\s+/).filter(Boolean).length, 1);

  // ── ALL-CAPS bonus (each caps word = shouting effect)
  const capsWords  = text.split(/\s+/).filter(w => w.length > 2 && w === w.toUpperCase() && /[A-Z]/.test(w));
  const capsBonus  = Math.min(capsWords.length * 6, 25);

  // ── Exclamation mark bonus
  const exclamCount = (text.match(/!/g) ?? []).length;
  const exclamBonus = Math.min(exclamCount * 4, 15);

  const tacticEvidence: TacticEvidence[] = [];
  const categoryScores: Record<string, number> = {};

  for (const category of rubric) {
    const matchedPhrases: string[] = [];

    for (const phrase of category.example_phrases) {
      if (lower.includes(phrase.toLowerCase())) {
        // Find original casing in text
        const re    = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const match = text.match(re);
        matchedPhrases.push(match ? match[0] : phrase);
      }
    }

    if (matchedPhrases.length > 0) {
      // Score = weight × (1 + 0.3 per additional match, capped at 1.9)
      const multiplier  = Math.min(1 + (matchedPhrases.length - 1) * 0.3, 1.9);
      const rawScore    = category.weight * multiplier;
      // Normalise by word count: longer texts shouldn't automatically score higher
      const normFactor  = Math.min(50 / wordCount + 0.5, 1.5);
      const finalScore  = Math.round(rawScore * normFactor);

      categoryScores[category.id] = finalScore;
      tacticEvidence.push({
        tactic:       category.category,
        tacticId:     category.id,
        phrases:      [...new Set(matchedPhrases)].slice(0, 5),
        score:        finalScore,
        contribution: finalScore,
        risk:         category.risk_level,
        description:  category.description,
      });
    } else {
      categoryScores[category.id] = 0;
    }
  }

  // ── Sort evidence by contribution descending
  tacticEvidence.sort((a, b) => b.contribution - a.contribution);

  // ── Raw manipulation score = sum of tactic scores + bonuses
  const tacticSum     = tacticEvidence.reduce((s, t) => s + t.contribution, 0);
  const rawScore      = tacticSum + capsBonus * 0.6 + exclamBonus * 0.5;

  // ── Normalise to 0–100
  const MAX_POSSIBLE  = 120; // theoretical maximum if all 11 categories fire at max weight
  const normalised    = Math.min(Math.round((rawScore / MAX_POSSIBLE) * 100), 97);
  const manipulationScore = Math.max(normalised, 0);

  const dominantTactic = tacticEvidence.length > 0 ? tacticEvidence[0].tactic : null;

  // ── Build human-readable evidence summary
  const evidenceSummary = tacticEvidence.length === 0
    ? 'No significant manipulation patterns detected.'
    : tacticEvidence
        .slice(0, 3)
        .map(t => `${t.tactic} (+${t.contribution})`)
        .join(', ') + (tacticEvidence.length > 3 ? `, and ${tacticEvidence.length - 3} more` : '');

  return {
    manipulationScore,
    tacticsFound: tacticEvidence.length,
    tacticEvidence,
    capsBonus,
    exclamBonus,
    categoryScores,
    dominantTactic,
    evidenceSummary,
  };
}

/**
 * Lightweight version that only returns the score and dominant tactic.
 * Used for benchmark evaluation to avoid allocating full evidence objects.
 */
export function quickScore(text: string): number {
  return extractEvidence(text).manipulationScore;
}

/**
 * Build highlighted word annotations from evidence.
 * Marks each token in the text as manipulative if it appears in detected phrases.
 */
export function buildHighlightedWordsFromEvidence(
  text:     string,
  evidence: TacticEvidence[],
): Array<{ word: string; manipulative: boolean; level?: 'high' | 'medium' | 'low' }> {
  // Build a map of suspicious word → risk level
  const riskyMap = new Map<string, 'high' | 'medium' | 'low'>();

  for (const tactic of evidence) {
    for (const phrase of tactic.phrases) {
      for (const w of phrase.toLowerCase().split(/\s+/)) {
        const clean = w.replace(/[^a-z0-9]/g, '');
        if (clean.length > 2) {
          const existing = riskyMap.get(clean);
          const incoming = tactic.risk;
          if (!existing || incoming === 'high') {
            riskyMap.set(clean, incoming);
          }
        }
      }
    }
  }

  return text.split(/\s+/).filter(Boolean).map(token => {
    const clean = token.toLowerCase().replace(/[^a-z0-9]/g, '');

    // ALL-CAPS = high risk
    if (token.length > 2 && token === token.toUpperCase() && /[A-Z]/.test(token)) {
      return { word: token, manipulative: true, level: 'high' as const };
    }

    const lvl = riskyMap.get(clean);
    if (lvl) return { word: token, manipulative: true, level: lvl };

    return { word: token, manipulative: false };
  });
}
