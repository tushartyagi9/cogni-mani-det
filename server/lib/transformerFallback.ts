import type { OpenAIAnalysisResult, OpenAIEmailAnalysisResult, OpenAIStandardAnalysisResult } from './openai.js';

const HF_API_URL = 'https://api-inference.huggingface.co/models/facebook/bart-large-mnli';
const TIMEOUT_MS = 15_000;
const MODEL_LOADING_RETRY_DELAY_MS = 10_000;

const EMAIL_LABELS = [
  'legitimate',
  'mild influence',
  'fear induction',
  'urgency manipulation',
  'authority exploitation',
  'financial manipulation',
  'identity deception',
] as const;

const NEWS_LABELS = [
  'loaded language',
  'exaggeration',
  'fear mongering',
  'false dilemma',
  'cherry picking',
  'appeal to authority',
  'emotional bias',
  'context manipulation',
  'misleading headline',
  'neutral reporting',
] as const;

interface HFZeroShotResponse {
  labels: string[];
  scores: number[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toPercent(score: number): number {
  return clamp(Math.round(score * 100), 0, 100);
}

function mapEmailLabel(label: string): OpenAIEmailAnalysisResult['email_label'] {
  const normalized = label.toLowerCase().trim();
  if (normalized.includes('identity')) return 'identity_deception';
  if (normalized.includes('financial')) return 'financial_manipulation';
  if (normalized.includes('authority')) return 'authority_exploitation';
  if (normalized.includes('urgency')) return 'urgency_manipulation';
  if (normalized.includes('fear')) return 'fear_induction';
  if (normalized.includes('mild')) return 'mild_influence';
  return 'legitimate';
}

function deriveEmailRisk(score: number): OpenAIEmailAnalysisResult['risk_level'] {
  if (score >= 76) return 'critical';
  if (score >= 61) return 'high';
  if (score >= 31) return 'medium';
  return 'low';
}

function buildEmailFallback(text: string, hf: HFZeroShotResponse): OpenAIEmailAnalysisResult {
  const topLabel = hf.labels[0] ?? 'legitimate';
  const topScore = hf.scores[0] ?? 0;
  const emailLabel = mapEmailLabel(topLabel);

  const weighted = hf.scores.slice(0, 3).reduce((acc, s, idx) => acc + s * (idx === 0 ? 1 : 0.5), 0);
  const riskScore = clamp(Math.round(weighted * 60 + (emailLabel === 'identity_deception' ? 35 : 0)), 0, 100);

  const lower = text.toLowerCase();
  const hasLink = /(https?:\/\/|www\.)/.test(lower);
  const hasUrgency = /\b(urgent|within 24 hours|act now|immediately|last chance)\b/.test(lower);
  const hasThreat = /\b(arrest|suspended|blocked|legal action|warrant)\b/.test(lower);
  const hasCreds = /\b(otp|password|pin|card|bank details|net banking)\b/.test(lower);

  const redFlags: string[] = [];
  if (hasUrgency) redFlags.push('Urgency pressure language detected');
  if (hasThreat) redFlags.push('Threat-based language detected');
  if (hasCreds) redFlags.push('Credential/payment request indicators detected');
  if (hasLink) redFlags.push('Link present; verify destination domain');

  const legit: string[] = [];
  if (/\bunsubscribe\b/.test(lower)) legit.push('Unsubscribe option present');
  if (/\bdo not share otp\b/.test(lower)) legit.push('Contains OTP safety warning');

  return {
    email_label: emailLabel,
    manipulation_score: riskScore,
    risk_level: deriveEmailRisk(riskScore),
    confidence: toPercent(topScore),
    dimension_scores: {
      sender_legitimacy: clamp(riskScore - (emailLabel === 'legitimate' ? 10 : 0), 0, 100),
      urgency_pressure: hasUrgency ? clamp(riskScore, 30, 100) : clamp(Math.round(riskScore * 0.4), 0, 100),
      threat_fear: hasThreat ? clamp(riskScore, 30, 100) : clamp(Math.round(riskScore * 0.35), 0, 100),
      credential_payment_request: hasCreds ? clamp(riskScore, 35, 100) : clamp(Math.round(riskScore * 0.3), 0, 100),
      link_url_analysis: hasLink ? clamp(Math.round(riskScore * 0.7), 20, 100) : clamp(Math.round(riskScore * 0.2), 0, 100),
      social_engineering_tactics: clamp(Math.round(riskScore * 0.6), 0, 100),
    },
    manipulation_tactic: `Primary signal classified as ${emailLabel.replace(/_/g, ' ')}.`,
    cognitive_bias_exploited:
      emailLabel === 'urgency_manipulation' ? 'scarcity_bias'
      : emailLabel === 'authority_exploitation' ? 'authority_bias'
      : emailLabel === 'fear_induction' || emailLabel === 'identity_deception' ? 'fear_bias'
      : emailLabel === 'financial_manipulation' ? 'greed_bias'
      : emailLabel === 'mild_influence' ? 'loss_aversion'
      : 'none',
    red_flags: redFlags.slice(0, 10),
    legitimate_indicators: legit.slice(0, 10),
    recommended_action:
      riskScore >= 76
        ? 'Do not click links or share information. Treat this as a high-risk email.'
        : riskScore >= 45
          ? 'Verify sender and claims through official channels before taking any action.'
          : 'This appears lower risk. Continue with normal caution.',
    explanation: 'Transformer fallback analysis was used because primary model was unavailable. Signals were mapped to the email manipulation rubric.',
  };
}

function buildNewsFallback(text: string, hf: HFZeroShotResponse): OpenAIStandardAnalysisResult {
  const topScore = hf.scores[0] ?? 0;
  const nonNeutral = hf.labels
    .map((label, idx) => ({ label: label.toLowerCase(), score: hf.scores[idx] ?? 0 }))
    .filter(item => !item.label.includes('neutral'))
    .sort((a, b) => b.score - a.score);

  const manipulationScore = clamp(Math.round(nonNeutral.slice(0, 3).reduce((acc, it) => acc + it.score, 0) * 45), 0, 100);
  const riskLevel: OpenAIStandardAnalysisResult['riskLevel'] =
    manipulationScore >= 61 ? 'high' : manipulationScore >= 41 ? 'medium' : 'low';

  const lower = text.toLowerCase();
  const urgency = /\b(urgent|now|immediately|breaking)\b/.test(lower) ? 70 : 20;
  const emotional = /\b(shocking|outrage|terrifying|disaster)\b/.test(lower) ? 75 : 25;
  const authority = /\b(experts say|officials|scientists)\b/.test(lower) ? 60 : 20;

  const phrases = [
    ...new Set(
      ['shocking', 'urgent', 'must', 'experts say', 'disaster', 'outrage']
        .filter(p => lower.includes(p))
        .slice(0, 6),
    ),
  ];

  return {
    manipulationScore,
    trustScore: 100 - manipulationScore,
    confidence: toPercent(topScore),
    biasLevel: clamp(Math.round((manipulationScore + emotional) / 2), 0, 100),
    emotionalIntensity: clamp(emotional, 0, 100),
    urgencyScore: clamp(urgency, 0, 100),
    authorityScore: clamp(authority, 0, 100),
    riskLevel,
    tactics: [
      { name: 'Emotional', value: clamp(emotional, 0, 100), color: '#FF3B5C' },
      { name: 'Urgency', value: clamp(urgency, 0, 100), color: '#FFB347' },
      { name: 'Authority', value: clamp(authority, 0, 100), color: '#7C3AED' },
      { name: 'Bandwagon', value: clamp(Math.round(manipulationScore * 0.4), 0, 100), color: '#3B82F6' },
    ],
    suspiciousPhrases: phrases.map(phrase => ({
      phrase,
      risk: manipulationScore >= 61 ? 'high' : 'medium',
      category: 'Transformer',
    })),
    radarData: [
      { metric: 'Emotional', value: clamp(emotional, 0, 100) },
      { metric: 'Urgency', value: clamp(urgency, 0, 100) },
      { metric: 'Bias', value: clamp(Math.round(manipulationScore * 0.9), 0, 100) },
      { metric: 'Sensational', value: clamp(Math.round(emotional * 0.9), 0, 100) },
      { metric: 'Authority', value: clamp(authority, 0, 100) },
    ],
    barData: [
      { tactic: 'Emotional', score: clamp(emotional, 0, 100) },
      { tactic: 'Urgency', score: clamp(urgency, 0, 100) },
      { tactic: 'Authority', score: clamp(authority, 0, 100) },
      { tactic: 'Bandwagon', score: clamp(Math.round(manipulationScore * 0.4), 0, 100) },
      { tactic: 'Fear', score: clamp(Math.round(emotional * 0.8), 0, 100) },
    ],
    neutralRewrite: text,
    explanation: 'Transformer fallback analysis was used because primary model was unavailable. Signals were mapped to the existing manipulation schema.',
    recommendedAction:
      manipulationScore >= 61
        ? 'Verify claims with multiple independent sources before trusting this content.'
        : manipulationScore >= 41
          ? 'Read with caution and cross-check key claims.'
          : 'Low manipulation signals detected. Continue with standard verification.',
    tacticEvidence: nonNeutral.slice(0, 4).map(item => ({
      tactic: item.label,
      phrases: phrases.slice(0, 3).length ? phrases.slice(0, 3) : [item.label],
      score: clamp(Math.round(item.score * 30), 0, 100),
      contribution: clamp(Math.round(item.score * 30), 0, 100),
      description: `Transformer inferred ${item.label} pattern.`,
    })),
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function callHF(text: string, mode: 'email' | 'news', retryOn503: boolean): Promise<HFZeroShotResponse> {
  if (!process.env.HUGGINGFACE_API_KEY) {
    throw new Error('HUGGINGFACE_API_KEY is not set.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(HF_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: text.slice(0, 1000),
        parameters: {
          candidate_labels: mode === 'email' ? EMAIL_LABELS : NEWS_LABELS,
          multi_label: true,
        },
      }),
      signal: controller.signal,
    });

    if (response.status === 503 && retryOn503) {
      await sleep(MODEL_LOADING_RETRY_DELAY_MS);
      return callHF(text, mode, false);
    }

    if (!response.ok) {
      throw new Error(`HuggingFace API error: ${response.status}`);
    }

    const parsed = await response.json() as HFZeroShotResponse;
    if (!Array.isArray(parsed.labels) || !Array.isArray(parsed.scores)) {
      throw new Error('Invalid HuggingFace response shape.');
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('HuggingFace API timeout (15s).');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function analyzeWithTransformer(text: string, mode: 'email' | 'news'): Promise<OpenAIAnalysisResult> {
  const hf = await callHF(text, mode, true);
  return mode === 'email' ? buildEmailFallback(text, hf) : buildNewsFallback(text, hf);
}

