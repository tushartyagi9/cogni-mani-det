/**
 * CogniGuard Evidence Extractor
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
  emailLabel?:        'legitimate' | 'mild_influence' | 'fear_induction' | 'urgency_manipulation' | 'authority_exploitation' | 'financial_manipulation' | 'identity_deception';
  emailEvidence?:     string[];
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
export function extractEvidence(text: string, mode = 'news'): ExtractionResult {
  // Email mode has a dedicated deterministic scorer tuned for phishing/spam.
  return extractEvidenceByMode(text, mode);
}

export function extractEvidenceByMode(text: string, mode: string): ExtractionResult {
  if (mode === 'email') {
    const textLower = text.toLowerCase();
    let score = 0;
    const evidence: string[] = [];

    const identityDeceptionPatterns = [
      'cbi notice', 'ed notice', 'arrest warrant',
      'do not contact family', 'confidential matter',
      'call our officer', 'cyber crime cell',
      'wire transfer', 'keep this confidential',
      'upi pin', 'net banking password', 'enter your otp',
      'aadhaar linked to illegal', 'money laundering',
    ];

    const financialManipulationPatterns = [
      'you have won', 'you won', 'lucky draw', 'claim your prize',
      'processing fee', 'advance fee', 'refundable deposit',
      'guaranteed returns', 'sebi approved', 'shark tank',
      'pm scholarship', 'government lottery',
      'income tax refund', 'claim your refund',
    ];

    const authorityExploitationPatterns = [
      'rbi circular', 'trai notice', 'it department',
      'sbi kyc', 'hdfc kyc', 'icici kyc',
      'verify your account', 'verify your identity', 'mandatory verification',
      'kyc update',
      'regulatory compliance', 'legal action',
    ];

    const urgencyManipulationPatterns = [
      'within 24 hours', 'within 48 hours', 'within 2 hours',
      'expires today', 'act now', 'immediate action required',
      'last chance', 'today only', 'before midnight',
      'offer till', 'sunday only', 'by 31 march',
    ];

    const fearInductionPatterns = [
      'unusual activity', 'account suspended',
      'payment failed', 'account will be closed',
      'security alert', 'unauthorized access',
      'your account has been', 'action required', 'account frozen',
    ];

    const mildInfluencePatterns = [
      'flash sale', 'sale', '50% off', 'off today', 'shop at',
      'limited time offer', 'exclusive deal',
      'special discount', 'members only',
      'you have been selected', 'congratulations',
      'work from home', 'from home', 'no experience needed', 'make rs.',
    ];

    const legitimatePatterns = [
      'unsubscribe', 'do not share otp',
      'pnr', 'tracking number', 'order confirmed',
      'have a safe journey', 'no action needed',
      'official website only',
    ];

    for (const pattern of identityDeceptionPatterns) {
      if (textLower.includes(pattern)) {
        score += 35;
        evidence.push(`Identity deception signal: "${pattern}"`);
      }
    }
    for (const pattern of financialManipulationPatterns) {
      if (textLower.includes(pattern)) {
        score += 28;
        evidence.push(`Financial manipulation signal: "${pattern}"`);
      }
    }
    for (const pattern of authorityExploitationPatterns) {
      if (textLower.includes(pattern)) {
        score += 22;
        evidence.push(`Authority exploitation signal: "${pattern}"`);
      }
    }
    for (const pattern of urgencyManipulationPatterns) {
      if (textLower.includes(pattern)) {
        score += 18;
        evidence.push(`Urgency manipulation signal: "${pattern}"`);
      }
    }
    for (const pattern of fearInductionPatterns) {
      if (textLower.includes(pattern)) {
        score += 12;
        evidence.push(`Fear induction signal: "${pattern}"`);
      }
    }
    for (const pattern of mildInfluencePatterns) {
      if (textLower.includes(pattern)) {
        score += 6;
        evidence.push(`Mild influence signal: "${pattern}"`);
      }
    }
    for (const pattern of legitimatePatterns) {
      if (textLower.includes(pattern)) {
        score -= 12;
      }
    }

    const boundedScore = Math.max(0, Math.min(100, score));
    const label =
      boundedScore <= 15 ? 'legitimate'
      : boundedScore <= 30 ? 'mild_influence'
      : boundedScore <= 50 ? 'fear_induction'
      : boundedScore <= 65 ? 'urgency_manipulation'
      : boundedScore <= 75 ? 'authority_exploitation'
      : boundedScore <= 85 ? 'financial_manipulation'
      : 'identity_deception';
    const risk =
      label === 'legitimate' || label === 'mild_influence' ? 'low'
      : label === 'fear_induction' ? 'medium'
      : label === 'urgency_manipulation' || label === 'authority_exploitation' ? 'high'
      : 'high';

    return {
      manipulationScore: boundedScore,
      tacticsFound: evidence.length,
      tacticEvidence: evidence.length > 0
        ? [{
            tactic: 'Email Manipulation Indicators',
            tacticId: 'email_mode_patterns',
            phrases: evidence
              .map((entry) => {
                const match = entry.match(/"(.+)"$/);
                return match ? match[1] : entry;
              })
              .slice(0, 8),
            score: boundedScore,
            contribution: boundedScore,
            risk,
            description: `Pattern-based email risk score using ${evidence.length} matched indicators.`,
          }]
        : [],
      capsBonus: 0,
      exclamBonus: 0,
      categoryScores: { email_pattern_score: boundedScore },
      dominantTactic: evidence.length > 0 ? 'Email Manipulation Indicators' : null,
      evidenceSummary: evidence.length > 0
        ? evidence.slice(0, 4).join(', ')
        : 'No significant email manipulation patterns detected.',
      emailLabel: label,
      emailEvidence: evidence,
    };
  }

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
export function quickScore(text: string, mode = 'news'): number {
  return extractEvidenceByMode(text, mode).manipulationScore;
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
