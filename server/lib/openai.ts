import OpenAI from 'openai';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const ANALYSIS_VERSION    = '2.0.0';
export const RUBRIC_VERSION      = '1.0';
export const MODEL_USED          = 'llama-3.3-70b-versatile';

// ─── Client (lazy-init) ───────────────────────────────────────────────────────
let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is not set.');
    _client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    });
  }
  return _client;
}

// ─── Load rubric categories for prompt injection ──────────────────────────────
interface RubricCategory {
  id: string; category: string; weight: number;
  risk_level: string; example_phrases: string[];
}

let _rubricCategories: RubricCategory[] | null = null;

function getRubricSnippet(): string {
  if (!_rubricCategories) {
    const raw = JSON.parse(readFileSync(join(__dirname, '../data/scoringRubric.json'), 'utf-8')) as { categories: RubricCategory[] };
    _rubricCategories = raw.categories;
  }
  return _rubricCategories
    .map(c => `  • ${c.category} (weight ${c.weight}, ${c.risk_level} risk): ${c.example_phrases.slice(0, 4).join(', ')}…`)
    .join('\n');
}

// ─── Zod schema ───────────────────────────────────────────────────────────────
const TacticEvidenceSchema = z.object({
  tactic:       z.string().min(1),
  phrases:      z.array(z.string()).min(1).max(8),
  score:        z.number().int().min(0).max(100),
  contribution: z.number().int().min(0).max(100),
  description:  z.string().min(1),
});

const TacticSchema = z.object({
  name:  z.string().min(1),
  value: z.number().int().min(0).max(100),
  color: z.string().min(1),
});

const PhraseSchema = z.object({
  phrase:   z.string().min(1),
  risk:     z.enum(['high', 'medium']),
  category: z.string().min(1),
});

const RadarSchema = z.object({
  metric: z.string().min(1),
  value:  z.number().int().min(0).max(100),
});

const BarSchema = z.object({
  tactic: z.string().min(1),
  score:  z.number().int().min(0).max(100),
});

export const OpenAIResponseSchema = z.object({
  manipulationScore:  z.number().int().min(0).max(100),
  trustScore:         z.number().int().min(0).max(100),
  confidence:         z.number().int().min(0).max(100),
  biasLevel:          z.number().int().min(0).max(100),
  emotionalIntensity: z.number().int().min(0).max(100),
  urgencyScore:       z.number().int().min(0).max(100),
  authorityScore:     z.number().int().min(0).max(100),
  riskLevel:          z.enum(['high', 'medium', 'low']),
  tactics:            z.array(TacticSchema).min(1).max(10),
  suspiciousPhrases:  z.array(PhraseSchema).max(10),
  radarData:          z.array(RadarSchema).min(3).max(8),
  barData:            z.array(BarSchema).min(3).max(8),
  neutralRewrite:     z.string().min(1),
  explanation:        z.string().min(1),
  recommendedAction:  z.string().min(1),
  tacticEvidence:     z.array(TacticEvidenceSchema).max(11),
});

export const EmailOpenAIResponseSchema = z.object({
  email_label: z.enum([
    'legitimate',
    'mild_influence',
    'fear_induction',
    'urgency_manipulation',
    'authority_exploitation',
    'financial_manipulation',
    'identity_deception',
  ]),
  manipulation_score: z.number().int().min(0).max(100),
  risk_level: z.enum(['low', 'medium', 'high', 'critical']),
  confidence: z.number().int().min(0).max(100),
  dimension_scores: z.object({
    sender_legitimacy: z.number().int().min(0).max(100),
    urgency_pressure: z.number().int().min(0).max(100),
    threat_fear: z.number().int().min(0).max(100),
    credential_payment_request: z.number().int().min(0).max(100),
    link_url_analysis: z.number().int().min(0).max(100),
    social_engineering_tactics: z.number().int().min(0).max(100),
  }),
  manipulation_tactic: z.string().min(1),
  cognitive_bias_exploited: z.string().min(1),
  red_flags: z.array(z.string()).max(20),
  legitimate_indicators: z.array(z.string()).max(20),
  recommended_action: z.string().min(1),
  explanation: z.string().min(1),
});

export type OpenAIStandardAnalysisResult = z.infer<typeof OpenAIResponseSchema>;
export type OpenAIEmailAnalysisResult = z.infer<typeof EmailOpenAIResponseSchema>;
export type OpenAIAnalysisResult = OpenAIStandardAnalysisResult | OpenAIEmailAnalysisResult;

export function isEmailAnalysisResult(result: OpenAIAnalysisResult): result is OpenAIEmailAnalysisResult {
  return 'manipulation_score' in result;
}

// ─── Prompts ──────────────────────────────────────────────────────────────────
function buildSystemPrompt(): string {
  return `You are an expert cognitive psychologist and media literacy researcher. You analyse text for psychological manipulation, propaganda, and deceptive language patterns using a structured, evidence-based rubric.

SCORING RUBRIC (use these 11 categories — cite exact phrases as evidence):
${getRubricSnippet()}

CONFIDENCE SCORING:
• High confidence (85-98): ≥3 distinct tactics detected with clear phrase evidence
• Medium confidence (65-84): 1-2 tactics detected or ambiguous signals
• Low confidence (50-64): Very short text, few signals, or highly ambiguous

SCORING GUIDE:
• 0-20:  Neutral — no meaningful manipulation
• 21-40: Mild — minor persuasive language
• 41-60: Moderate — clear manipulation tactics
• 61-80: Strong — multiple high-risk tactics
• 81-100: Extreme — maximum manipulation

IMPORTANT: Every score must be traceable to specific evidence. Do not guess. If you have little evidence, lower your confidence and your score accordingly.

Return ONLY valid JSON — no prose, no markdown.`;
}

function buildUserPrompt(text: string, mode: string): string {
  return `Analyse this ${mode} content for manipulation tactics.

TEXT (${text.length} characters):
"""
${text.substring(0, 8000)}
"""

Return ONLY a JSON object with this EXACT structure:
{
  "manipulationScore": <integer 0-100, computed from tactic evidence>,
  "trustScore": <integer 0-100>,
  "confidence": <integer 50-98, based on evidence density>,
  "biasLevel": <integer 0-100>,
  "emotionalIntensity": <integer 0-100>,
  "urgencyScore": <integer 0-100>,
  "authorityScore": <integer 0-100>,
  "riskLevel": "high" | "medium" | "low",
  "tactics": [
    {"name": "Emotional",  "value": <integer 0-100>, "color": "#FF3B5C"},
    {"name": "Urgency",    "value": <integer 0-100>, "color": "#FFB347"},
    {"name": "Authority",  "value": <integer 0-100>, "color": "#7C3AED"},
    {"name": "Bandwagon",  "value": <integer 0-100>, "color": "#3B82F6"}
  ],
  "suspiciousPhrases": [
    {"phrase": "<exact phrase from text>", "risk": "high"|"medium", "category": "<rubric category>"}
  ],
  "radarData": [
    {"metric": "Emotional",   "value": <0-100>},
    {"metric": "Urgency",     "value": <0-100>},
    {"metric": "Bias",        "value": <0-100>},
    {"metric": "Sensational", "value": <0-100>},
    {"metric": "Authority",   "value": <0-100>}
  ],
  "barData": [
    {"tactic": "Emotional",  "score": <0-100>},
    {"tactic": "Urgency",    "score": <0-100>},
    {"tactic": "Authority",  "score": <0-100>},
    {"tactic": "Bandwagon",  "score": <0-100>},
    {"tactic": "Fear",       "score": <0-100>}
  ],
  "neutralRewrite": "<neutral, objective version of the content>",
  "explanation": "<2-3 sentence factual explanation of key manipulation tactics detected>",
  "recommendedAction": "<specific actionable recommendation for the reader>",
  "tacticEvidence": [
    {
      "tactic": "<rubric category name>",
      "phrases": ["<exact phrase from text>", ...],
      "score": <integer 0-50, contribution to total score>,
      "contribution": <same as score>,
      "description": "<why this is manipulative>"
    }
  ]
}

RULES:
• tacticEvidence must contain only detected tactics with real phrases from the text
• manipulationScore must be consistent with the tacticEvidence scores
• tactics[] values must sum to approximately 100
• riskLevel: "high" if manipulationScore >= 61, "medium" if 41-60, "low" if <= 40
• suspiciousPhrases: list 3-8 exact phrases from the text
• If text is neutral with no manipulation, return manipulationScore ≤ 20 and empty tacticEvidence`;
}

function buildEmailSystemPrompt(): string {
  return `You are CogniGuard's email security analyst. Analyze the provided email for manipulation, phishing, and deception tactics.

CLASSIFICATION LABELS - COGNITIVE MANIPULATION TAXONOMY (choose exactly one):

- "legitimate": No manipulation. Straightforward informational email.
  Examples: transaction confirmations, OTPs, appointments, bookings.
  Score: 0-15.

- "mild_influence": Uses standard persuasion - social proof, mild urgency,
  promotional language. Legitimate businesses use this.
  Examples: sale emails, newsletters, subscription reminders.
  Score: 16-30.

- "fear_induction": Deliberately creates fear or anxiety to pressure action.
  Threat may be exaggerated or false.
  Examples: "account will be suspended", "unusual activity detected",
  fake security alerts.
  Score: 31-50.

- "urgency_manipulation": Exploits artificial time pressure to bypass
  rational thinking. Deadlines are fake or exaggerated.
  Examples: "respond in 24 hours or account closed",
  "offer expires tonight", fake delivery reschedule fee.
  Score: 46-65.

- "authority_exploitation": Impersonates bank, government, company, or
  senior official to gain unquestioned compliance.
  Examples: fake RBI/TRAI/CBI notices, fake IT department emails,
  fake CEO wire transfer requests, SBI/HDFC KYC fraud.
  Score: 61-75.

- "financial_manipulation": Exploits greed or financial anxiety through
  false promises or threats. Always involves money.
  Examples: lottery prizes, investment fraud, advance fee scams,
  fake IT refunds, job offer with deposit, Shark Tank fraud.
  Score: 71-85.

- "identity_deception": Highest threat. Combines impersonation + fear +
  urgency + isolation to completely override rational thinking.
  Goal: steal credentials, OTP, full bank details, or large sums.
  Examples: CBI arrest threat, UPI PIN phishing, CEO BEC fraud,
  full credential harvesting (Aadhaar + PAN + password + OTP).
  Score: 83-100.

LABEL DISAMBIGUATION RULES:
- "financial_manipulation" requires explicit money extraction or transfer demand
  (processing fee, advance fee, investment payment, bank transfer details).
- "urgency_manipulation" is preferred for pressure-heavy offers (job/work-from-home,
  promo deadlines, "today only") when no upfront payment request is present.
- "authority_exploitation" requires impersonation of a recognized authority
  (bank/government/CEO) as the primary compliance driver.

SCORING RUBRIC - score each dimension 0-100, then compute weighted average:
1. sender_legitimacy (20%): Is sender domain real? Lookalike domains score 70+. Free email for bank = 60+.
2. urgency_pressure (18%): Artificial deadlines? "24 hours" = 70+. "1 hour" = 85+.
3. threat_fear (20%): Threats of arrest/account closure/legal action? Arrest threat = 90+.
4. credential_payment_request (22%): Asking OTP/password/card/bank details/advance fee? Full credentials = 85+.
5. link_url_analysis (12%): Lookalike or suspicious URLs? Fake domain = 75+.
6. social_engineering_tactics (8%): CEO fraud, govt impersonation, secrecy demand? Stacked tactics = 80+.

INDIA-SPECIFIC PATTERN MAPPING:
- identity_deception (90+): CBI/ED arrest + Aadhaar, UPI PIN request,
  CEO wire transfer with secrecy demand, full KYC credential harvest
- financial_manipulation (80+): Lottery prize + processing fee,
  Shark Tank guaranteed returns, PM scholarship fee, IT refund + bank details
- authority_exploitation (65+): RBI KYC circular, TRAI SIM block,
  fake IT department, SBI/HDFC/ICICI account suspension
- urgency_manipulation (50+): "24 hours ya account band",
  delivery reschedule fee, subscription expires today
- fear_induction (35+): Unusual activity alert, account verification,
  failed payment notice, security upgrade required
- mild_influence (20+): Flash sale, newsletter, subscription reminder
- legitimate (5): OTP email, booking confirmation, appointment reminder

LEGITIMATE INDICATORS (reduce score):
- Official domain matching claimed brand (sbi.co.in, irctc.co.in, zomato.com)
- Specific transaction details (PNR, order number, invoice number)
- Unsubscribe link present
- "Do NOT share OTP with anyone" warning
- No link clicks required

Return ONLY valid JSON:
{
  "email_label": "legitimate|mild_influence|fear_induction|urgency_manipulation|authority_exploitation|financial_manipulation|identity_deception",
  "manipulation_score": <0-100>,
  "risk_level": "low|medium|high|critical",
  "confidence": <0-100>,
  "dimension_scores": {
    "sender_legitimacy": <0-100>,
    "urgency_pressure": <0-100>,
    "threat_fear": <0-100>,
    "credential_payment_request": <0-100>,
    "link_url_analysis": <0-100>,
    "social_engineering_tactics": <0-100>
  },
  "manipulation_tactic": "primary manipulation tactic used in 1 sentence",
  "cognitive_bias_exploited": "which cognitive bias is being exploited e.g. loss aversion, authority bias, scarcity bias",
  "red_flags": ["specific", "suspicious", "phrases", "found"],
  "legitimate_indicators": ["trust", "signals", "found"],
  "recommended_action": "string explaining what user should do",
  "explanation": "2-3 sentence plain language explanation for the user"
}`;
}

function buildEmailUserPrompt(text: string): string {
  return `Analyze this email content.

EMAIL (${text.length} characters):
"""
${text.substring(0, 8000)}
"""

Return ONLY valid JSON with the exact schema in the system instructions.`;
}

// ─── Compare prompt ───────────────────────────────────────────────────────────
const CompareResponseSchema = z.object({
  scoreA:       z.number().int().min(0).max(100),
  scoreB:       z.number().int().min(0).max(100),
  confidence:   z.number().int().min(60).max(98),
  recommended:  z.enum(['A', 'B']),
  explanation:  z.string().min(1),
  tacticsA: z.object({
    emotional:  z.number().int().min(0).max(100),
    urgency:    z.number().int().min(0).max(100),
    authority:  z.number().int().min(0).max(100),
    bandwagon:  z.number().int().min(0).max(100),
    fear:       z.number().int().min(0).max(100),
  }),
  tacticsB: z.object({
    emotional:  z.number().int().min(0).max(100),
    urgency:    z.number().int().min(0).max(100),
    authority:  z.number().int().min(0).max(100),
    bandwagon:  z.number().int().min(0).max(100),
    fear:       z.number().int().min(0).max(100),
  }),
});

export type CompareResult = z.infer<typeof CompareResponseSchema>;

function buildComparePrompt(textA: string, textB: string): string {
  return `Compare these two texts for manipulation tactics using the scoring rubric. Return ONLY a JSON object.

TEXT A:
"""
${textA.substring(0, 4000)}
"""

TEXT B:
"""
${textB.substring(0, 4000)}
"""

Return ONLY:
{
  "scoreA": <integer 0-100>,
  "scoreB": <integer 0-100>,
  "confidence": <integer 60-98>,
  "recommended": "A"|"B" (whichever is LESS manipulative / more trustworthy),
  "explanation": "<2-3 sentence comparison summary with evidence>",
  "tacticsA": {
    "emotional": <0-100>, "urgency": <0-100>, "authority": <0-100>,
    "bandwagon": <0-100>, "fear": <0-100>
  },
  "tacticsB": {
    "emotional": <0-100>, "urgency": <0-100>, "authority": <0-100>,
    "bandwagon": <0-100>, "fear": <0-100>
  }
}`;
}

// ─── Retry helper ─────────────────────────────────────────────────────────────
async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < retries) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr;
}

// ─── Main analysis function ───────────────────────────────────────────────────
export async function analyzeWithAI(
  text: string,
  mode: string,
): Promise<OpenAIAnalysisResult> {
  return withRetry(async () => {
    const isEmailMode = mode === 'email';
    const completion = await getClient().chat.completions.create({
      model:           MODEL_USED,
      messages: [
        { role: 'system', content: isEmailMode ? buildEmailSystemPrompt() : buildSystemPrompt() },
        { role: 'user',   content: isEmailMode ? buildEmailUserPrompt(text) : buildUserPrompt(text, mode) },
      ],
      response_format: { type: 'json_object' },
      temperature:     0.1,
      max_tokens:      3000,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error('OpenAI returned an empty response.');

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('OpenAI returned invalid JSON.');
    }

    const validated = isEmailMode
      ? EmailOpenAIResponseSchema.safeParse(parsed)
      : OpenAIResponseSchema.safeParse(parsed);
    if (!validated.success) {
      console.error('[OpenAI] Schema validation failed:', validated.error.flatten());
      throw new Error('OpenAI response did not match the expected schema. Please try again.');
    }

    return validated.data;
  });
}

// ─── Comparison analysis ──────────────────────────────────────────────────────
export async function compareWithAI(
  textA: string,
  textB: string,
): Promise<CompareResult> {
  return withRetry(async () => {
    const completion = await getClient().chat.completions.create({
      model:           MODEL_USED,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user',   content: buildComparePrompt(textA, textB) },
      ],
      response_format: { type: 'json_object' },
      temperature:     0.1,
      max_tokens:      800,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error('OpenAI returned an empty response.');

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('OpenAI returned invalid JSON.');
    }

    const validated = CompareResponseSchema.safeParse(parsed);
    if (!validated.success) {
      console.error('[OpenAI compare] Schema validation failed:', validated.error.flatten());
      throw new Error('OpenAI comparison response did not match expected schema.');
    }

    return validated.data;
  });
}
