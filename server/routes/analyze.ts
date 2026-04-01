import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { analyzeWithAI, compareWithAI, ANALYSIS_VERSION, RUBRIC_VERSION, MODEL_USED, isEmailAnalysisResult } from '../lib/openai.js';
import { analyzeWithTransformer } from '../lib/transformerFallback.js';
import { extractEvidence, buildHighlightedWordsFromEvidence } from '../lib/evidenceExtractor.js';
import {
  scoreToLabel, scoreToRisk, getRecommendedAction,
  getCalibrationVersion, getMinTextLength,
  getEmailLabel, getEmailRiskLevel, getEmailRecommendedAction, getEmailManipulationDescription,
} from '../lib/calibration.js';
import { ApiError } from '../middleware/errorHandler.js';

export const analyzeRouter = Router();

// ─── Request schemas ──────────────────────────────────────────────────────────
const AnalyzeRequestSchema = z.object({
  text:        z.string().trim().min(1, 'Please enter some text to analyse.').max(50_000),
  mode:        z.enum(['news', 'email', 'social', 'ad']),
  inputMethod: z.enum(['text', 'url', 'upload']),
  inputUrl:    z.string().url().optional().or(z.literal('')),
});

const CompareRequestSchema = z.object({
  textA: z.string().trim().min(1).max(50_000),
  textB: z.string().trim().min(1).max(50_000),
});

// ─── Safeguard helpers ────────────────────────────────────────────────────────
interface SafeguardResult { ok: boolean; reason?: string }

function runSafeguards(text: string): SafeguardResult {
  const MIN_LEN    = getMinTextLength();
  const trimmed    = text.trim();
  const wordCount  = trimmed.split(/\s+/).filter(Boolean).length;
  const charCount  = trimmed.length;

  if (charCount < MIN_LEN) {
    return { ok: false, reason: `Text must be at least ${MIN_LEN} characters. Please provide more content for a reliable analysis.` };
  }
  if (wordCount < 4) {
    return { ok: false, reason: 'Text is too short for reliable analysis. Please provide at least 4 words.' };
  }
  if (charCount > 50_000) {
    return { ok: false, reason: 'Text exceeds the 50,000 character limit. Please shorten it.' };
  }
  return { ok: true };
}

/** Build source info for URL-mode analyses */
function buildSourceInfo(url: string, trustScore: number) {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return {
      domain,
      credibilityScore:        trustScore,
      domainAge:               'Unknown',
      sslVerified:             url.startsWith('https'),
      trustLevel:              (trustScore > 60 ? 'High' : trustScore > 35 ? 'Medium' : 'Low') as 'High' | 'Medium' | 'Low',
      citedSources:            0,
      authorCredentials:       'Unknown' as const,
      factCheckHistory:        'Not checked',
      editorialStandards:      'Unknown',
      independentVerification: 'Not verified',
    };
  } catch {
    return undefined;
  }
}

// ─── POST /api/analyze ────────────────────────────────────────────────────────
analyzeRouter.post(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    // 1. Validate request body
    const parsed = AnalyzeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ApiError(400, parsed.error.errors[0]?.message ?? 'Invalid request.'));
    }

    const { text, mode, inputMethod, inputUrl } = parsed.data;

    // 2. Run input safeguards
    const safeguard = runSafeguards(text);
    if (!safeguard.ok) {
      return next(new ApiError(422, safeguard.reason!));
    }

    try {
      const localEvidence = extractEvidence(text, mode);
      let ai: Awaited<ReturnType<typeof analyzeWithAI>> | null = null;
      let tierUsed: 'transformer' | 'llm' | 'rule_based' = 'rule_based';

      if (mode === 'email' || mode === 'news') {
        try {
          ai = await analyzeWithTransformer(text, mode);
          tierUsed = 'transformer';
          console.log(`[MindGuard] tier_used=${tierUsed}`);
        } catch {
          console.warn('[MindGuard] Tier 1 failed, trying Tier 2 (Groq LLM)...');
          try {
            ai = await analyzeWithAI(text, mode);
            tierUsed = 'llm';
            console.log(`[MindGuard] tier_used=${tierUsed}`);
          } catch {
            console.warn('[MindGuard] Tier 2 failed, using Tier 3 (Rule-based)...');
            tierUsed = 'rule_based';
            console.log(`[MindGuard] tier_used=${tierUsed}`);
          }
        }
      } else {
        try {
          ai = await analyzeWithAI(text, mode);
          tierUsed = 'llm';
          console.log(`[MindGuard] tier_used=${tierUsed}`);
        } catch {
          console.warn('[MindGuard] LLM analysis failed, using rule-based fallback...');
          tierUsed = 'rule_based';
          console.log(`[MindGuard] tier_used=${tierUsed}`);
        }
      }

      if (!ai) {
        if (mode === 'email') {
          const emailScore = localEvidence.manipulationScore;
          const emailLabel = getEmailLabel(emailScore, localEvidence.emailLabel);
          const riskLevel = getEmailRiskLevel(emailLabel);
          const recommendedAction = getEmailRecommendedAction(emailLabel);
          const manipulationDescription = getEmailManipulationDescription(emailLabel);
          const highlightedWords = buildHighlightedWordsFromEvidence(text, localEvidence.tacticEvidence);
          const redFlags = localEvidence.emailEvidence ?? [];
          const tacticEvidence = localEvidence.tacticEvidence.map(t => ({
            tactic: t.tactic,
            phrases: t.phrases,
            score: t.score,
            contribution: t.contribution,
            description: t.description,
          }));
          const dimensionScores = {
            sender_legitimacy: Math.min(100, Math.max(0, Math.round(emailScore * 0.75))),
            urgency_pressure: Math.min(100, Math.max(0, Math.round(emailScore * 0.85))),
            threat_fear: Math.min(100, Math.max(0, Math.round(emailScore * 0.8))),
            credential_payment_request: Math.min(100, Math.max(0, Math.round(emailScore * 0.9))),
            link_url_analysis: Math.min(100, Math.max(0, Math.round(emailScore * 0.7))),
            social_engineering_tactics: Math.min(100, Math.max(0, Math.round(emailScore * 0.78))),
          };

          const result = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            mode,
            inputMethod,
            inputText: text,
            inputUrl: inputUrl || undefined,

            manipulationScore: emailScore,
            trustScore: Math.max(0, 100 - emailScore),
            confidence: 75,
            biasLevel: Math.round((dimensionScores.social_engineering_tactics + dimensionScores.sender_legitimacy) / 2),
            emotionalIntensity: dimensionScores.threat_fear,
            urgencyScore: dimensionScores.urgency_pressure,
            authorityScore: dimensionScores.sender_legitimacy,
            riskLevel,

            tactics: [
              { name: 'Sender', value: dimensionScores.sender_legitimacy, color: '#FF3B5C' },
              { name: 'Urgency', value: dimensionScores.urgency_pressure, color: '#FFB347' },
              { name: 'Threat', value: dimensionScores.threat_fear, color: '#7C3AED' },
              { name: 'Creds', value: dimensionScores.credential_payment_request, color: '#3B82F6' },
            ],
            radarData: [
              { metric: 'Sender', value: dimensionScores.sender_legitimacy },
              { metric: 'Urgency', value: dimensionScores.urgency_pressure },
              { metric: 'Threat', value: dimensionScores.threat_fear },
              { metric: 'Creds', value: dimensionScores.credential_payment_request },
              { metric: 'Links', value: dimensionScores.link_url_analysis },
              { metric: 'SocEng', value: dimensionScores.social_engineering_tactics },
            ],
            barData: [
              { tactic: 'Sender', score: dimensionScores.sender_legitimacy },
              { tactic: 'Urgency', score: dimensionScores.urgency_pressure },
              { tactic: 'Threat', score: dimensionScores.threat_fear },
              { tactic: 'Creds', score: dimensionScores.credential_payment_request },
              { tactic: 'Links', score: dimensionScores.link_url_analysis },
            ],

            suspiciousPhrases: redFlags.slice(0, 10).map(phrase => ({
              phrase,
              risk: riskLevel === 'critical' || riskLevel === 'high' ? 'high' : 'medium',
              category: 'Email',
            })),
            highlightedWords,
            neutralRewrite: text,
            explanation: localEvidence.evidenceSummary,
            recommendedAction,
            tacticEvidence,
            calibratedLabel: emailLabel,
            localScore: localEvidence.manipulationScore,
            source: (inputMethod === 'url' && inputUrl)
              ? buildSourceInfo(inputUrl, Math.max(0, 100 - emailScore))
              : undefined,
            emailLabel,
            emailRiskLevel: riskLevel,
            emailRecommendedAction: recommendedAction,
            emailManipulationDescription: manipulationDescription,
            cognitiveBiasExploited:
              emailLabel === 'urgency_manipulation' ? 'scarcity_bias'
                : emailLabel === 'authority_exploitation' ? 'authority_bias'
                  : emailLabel === 'fear_induction' || emailLabel === 'identity_deception' ? 'fear_bias'
                    : emailLabel === 'financial_manipulation' ? 'greed_bias'
                      : emailLabel === 'mild_influence' ? 'loss_aversion'
                        : 'none',
            manipulationTactic: localEvidence.dominantTactic ?? 'No strong manipulation tactic detected',
            dimensionScores,
            redFlags,
            legitimateIndicators: [],
            tier_used: tierUsed,
            _meta: {
              analysisVersion: ANALYSIS_VERSION,
              rubricVersion: RUBRIC_VERSION,
              calibrationVersion: getCalibrationVersion(),
              modelUsed: MODEL_USED,
            },
          };

          res.json(result);
          return;
        }

        const score = localEvidence.manipulationScore;
        const highlightedWords = buildHighlightedWordsFromEvidence(text, localEvidence.tacticEvidence);
        const tacticEvidence = localEvidence.tacticEvidence.map(t => ({
          tactic: t.tactic,
          phrases: t.phrases,
          score: t.score,
          contribution: t.contribution,
          description: t.description,
        }));
        const suspiciousPhrases = tacticEvidence
          .flatMap(t => t.phrases.map(phrase => ({
            phrase,
            risk: t.score >= 30 ? 'high' as const : 'medium' as const,
            category: t.tactic,
          })))
          .slice(0, 10);

        const fallbackTactics = tacticEvidence.slice(0, 4).map((t, idx) => ({
          name: t.tactic.split(' ')[0] || `Tactic${idx + 1}`,
          value: Math.min(100, Math.max(0, t.contribution)),
          color: ['#FF3B5C', '#FFB347', '#7C3AED', '#3B82F6'][idx] ?? '#00E5CC',
        }));

        const result = {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          mode,
          inputMethod,
          inputText: text,
          inputUrl: inputUrl || undefined,
          manipulationScore: score,
          trustScore: Math.max(0, 100 - score),
          confidence: 75,
          biasLevel: Math.min(100, Math.max(0, Math.round(score * 0.8))),
          emotionalIntensity: Math.min(100, Math.max(0, Math.round(score * 0.85))),
          urgencyScore: Math.min(100, Math.max(0, Math.round(score * 0.75))),
          authorityScore: Math.min(100, Math.max(0, Math.round(score * 0.7))),
          riskLevel: scoreToRisk(score),
          tactics: fallbackTactics.length > 0 ? fallbackTactics : [
            { name: 'Emotional', value: 0, color: '#FF3B5C' },
            { name: 'Urgency', value: 0, color: '#FFB347' },
            { name: 'Authority', value: 0, color: '#7C3AED' },
            { name: 'Bandwagon', value: 0, color: '#3B82F6' },
          ],
          radarData: [
            { metric: 'Emotional', value: Math.min(100, Math.max(0, Math.round(score * 0.85))) },
            { metric: 'Urgency', value: Math.min(100, Math.max(0, Math.round(score * 0.75))) },
            { metric: 'Bias', value: Math.min(100, Math.max(0, Math.round(score * 0.8))) },
            { metric: 'Sensational', value: Math.min(100, Math.max(0, Math.round(score * 0.7))) },
            { metric: 'Authority', value: Math.min(100, Math.max(0, Math.round(score * 0.7))) },
          ],
          barData: [
            { tactic: 'Emotional', score: Math.min(100, Math.max(0, Math.round(score * 0.85))) },
            { tactic: 'Urgency', score: Math.min(100, Math.max(0, Math.round(score * 0.75))) },
            { tactic: 'Authority', score: Math.min(100, Math.max(0, Math.round(score * 0.7))) },
            { tactic: 'Bandwagon', score: Math.min(100, Math.max(0, Math.round(score * 0.55))) },
            { tactic: 'Fear', score: Math.min(100, Math.max(0, Math.round(score * 0.8))) },
          ],
          suspiciousPhrases,
          highlightedWords,
          neutralRewrite: text,
          explanation: localEvidence.evidenceSummary,
          recommendedAction: getRecommendedAction(score),
          tacticEvidence,
          calibratedLabel: scoreToLabel(score),
          localScore: localEvidence.manipulationScore,
          source: (inputMethod === 'url' && inputUrl)
            ? buildSourceInfo(inputUrl, Math.max(0, 100 - score))
            : undefined,
          tier_used: tierUsed,
          _meta: {
            analysisVersion: ANALYSIS_VERSION,
            rubricVersion: RUBRIC_VERSION,
            calibrationVersion: getCalibrationVersion(),
            modelUsed: MODEL_USED,
          },
        };

        res.json(result);
        return;
      }

      if (mode === 'email' && isEmailAnalysisResult(ai)) {
        const emailScore = ai.manipulation_score;
        const emailLabel = getEmailLabel(emailScore, ai.email_label);
        const riskLevel = getEmailRiskLevel(emailLabel);
        const recommendedAction = ai.recommended_action || getEmailRecommendedAction(emailLabel);
        const manipulationDescription = getEmailManipulationDescription(emailLabel);

        const highlightedWords = buildHighlightedWordsFromEvidence(text, localEvidence.tacticEvidence);
        const tacticEvidence = localEvidence.tacticEvidence.map(t => ({
          tactic:       t.tactic,
          phrases:      t.phrases,
          score:        t.score,
          contribution: t.contribution,
          description:  t.description,
        }));

        const result = {
          id:                crypto.randomUUID(),
          timestamp:         new Date().toISOString(),
          mode,
          inputMethod,
          inputText:         text,
          inputUrl:          inputUrl || undefined,

          manipulationScore: emailScore,
          trustScore:        Math.max(0, 100 - emailScore),
          confidence:        ai.confidence,
          biasLevel:         Math.round((ai.dimension_scores.social_engineering_tactics + ai.dimension_scores.sender_legitimacy) / 2),
          emotionalIntensity:ai.dimension_scores.threat_fear,
          urgencyScore:      ai.dimension_scores.urgency_pressure,
          authorityScore:    ai.dimension_scores.sender_legitimacy,
          riskLevel,

          tactics: [
            { name: 'Sender',    value: ai.dimension_scores.sender_legitimacy,         color: '#FF3B5C' },
            { name: 'Urgency',   value: ai.dimension_scores.urgency_pressure,          color: '#FFB347' },
            { name: 'Threat',    value: ai.dimension_scores.threat_fear,               color: '#7C3AED' },
            { name: 'Creds',     value: ai.dimension_scores.credential_payment_request, color: '#3B82F6' },
          ],
          radarData: [
            { metric: 'Sender',   value: ai.dimension_scores.sender_legitimacy },
            { metric: 'Urgency',  value: ai.dimension_scores.urgency_pressure },
            { metric: 'Threat',   value: ai.dimension_scores.threat_fear },
            { metric: 'Creds',    value: ai.dimension_scores.credential_payment_request },
            { metric: 'Links',    value: ai.dimension_scores.link_url_analysis },
            { metric: 'SocEng',   value: ai.dimension_scores.social_engineering_tactics },
          ],
          barData: [
            { tactic: 'Sender',    score: ai.dimension_scores.sender_legitimacy },
            { tactic: 'Urgency',   score: ai.dimension_scores.urgency_pressure },
            { tactic: 'Threat',    score: ai.dimension_scores.threat_fear },
            { tactic: 'Creds',     score: ai.dimension_scores.credential_payment_request },
            { tactic: 'Links',     score: ai.dimension_scores.link_url_analysis },
          ],

          suspiciousPhrases: ai.red_flags.slice(0, 10).map(phrase => ({
            phrase,
            risk: riskLevel === 'critical' || riskLevel === 'high' ? 'high' : 'medium',
            category: 'Email',
          })),
          highlightedWords,

          neutralRewrite:    text,
          explanation:       ai.explanation,
          recommendedAction,

          tacticEvidence,
          calibratedLabel:   emailLabel,
          localScore:        localEvidence.manipulationScore,

          source: (inputMethod === 'url' && inputUrl)
            ? buildSourceInfo(inputUrl, Math.max(0, 100 - emailScore))
            : undefined,

          emailLabel,
          emailRiskLevel: riskLevel,
          emailRecommendedAction: recommendedAction,
          emailManipulationDescription: manipulationDescription,
          cognitiveBiasExploited: ai.cognitive_bias_exploited,
          manipulationTactic: ai.manipulation_tactic,
          dimensionScores:     ai.dimension_scores,
          redFlags:            ai.red_flags,
          legitimateIndicators:ai.legitimate_indicators,
          tier_used:           tierUsed,

          _meta: {
            analysisVersion:    ANALYSIS_VERSION,
            rubricVersion:      RUBRIC_VERSION,
            calibrationVersion: getCalibrationVersion(),
            modelUsed:          MODEL_USED,
          },
        };

        res.json(result);
        return;
      }

      // 5. Build highlighted words from AI phrases + local evidence
      const highlightedWords = buildHighlightedWordsFromEvidence(
        text,
        ai.tacticEvidence?.length
          ? ai.tacticEvidence.map(t => ({
              tactic:   t.tactic,
              tacticId: t.tactic.toLowerCase().replace(/\s+/g, '_'),
              phrases:  t.phrases,
              score:    t.score,
              contribution: t.contribution,
              risk:     ai.riskLevel as 'low' | 'medium' | 'high',
              description: t.description,
            }))
          : localEvidence.tacticEvidence,
      );

      // 6. Build the result — AI is authoritative for scores,
      //    local extractor fills in if AI evidence is missing
      const tacticEvidence = ai.tacticEvidence?.length
        ? ai.tacticEvidence
        : localEvidence.tacticEvidence.map(t => ({
            tactic:       t.tactic,
            phrases:      t.phrases,
            score:        t.score,
            contribution: t.contribution,
            description:  t.description,
          }));

      // 7. Calibrated label + recommended action
      const calibratedLabel  = scoreToLabel(ai.manipulationScore);
      const recommendedAction = ai.recommendedAction || getRecommendedAction(ai.manipulationScore);

      const result = {
        id:                crypto.randomUUID(),
        timestamp:         new Date().toISOString(),
        mode,
        inputMethod,
        inputText:         text,
        inputUrl:          inputUrl || undefined,

        // Scores from OpenAI (calibrated & rubric-guided)
        manipulationScore: ai.manipulationScore,
        trustScore:        ai.trustScore,
        confidence:        ai.confidence,
        biasLevel:         ai.biasLevel,
        emotionalIntensity:ai.emotionalIntensity,
        urgencyScore:      ai.urgencyScore,
        authorityScore:    ai.authorityScore,
        riskLevel:         scoreToRisk(ai.manipulationScore),

        // Chart data
        tactics:           ai.tactics,
        radarData:         ai.radarData,
        barData:           ai.barData,

        // Phrase-level output
        suspiciousPhrases: ai.suspiciousPhrases,
        highlightedWords,

        // Explanations
        neutralRewrite:    ai.neutralRewrite,
        explanation:       ai.explanation,
        recommendedAction,

        // Evidence-based breakdown (transparent scoring)
        tacticEvidence,
        calibratedLabel,
        localScore:        localEvidence.manipulationScore,

        // Source info for URL mode
        source: (inputMethod === 'url' && inputUrl)
          ? buildSourceInfo(inputUrl, ai.trustScore)
          : undefined,
        tier_used:         tierUsed,

        // Traceability metadata
        _meta: {
          analysisVersion:    ANALYSIS_VERSION,
          rubricVersion:      RUBRIC_VERSION,
          calibrationVersion: getCalibrationVersion(),
          modelUsed:          MODEL_USED,
        },
      };

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/analyze/compare ────────────────────────────────────────────────
analyzeRouter.post(
  '/compare',
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = CompareRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ApiError(400, parsed.error.errors[0]?.message ?? 'Invalid request.'));
    }

    const { textA, textB } = parsed.data;

    // Safeguard both texts
    const sgA = runSafeguards(textA);
    if (!sgA.ok) return next(new ApiError(422, `Text A: ${sgA.reason}`));
    const sgB = runSafeguards(textB);
    if (!sgB.ok) return next(new ApiError(422, `Text B: ${sgB.reason}`));

    try {
      const ai          = await compareWithAI(textA, textB);
      const wordCountA  = textA.split(/\s+/).filter(Boolean).length;
      const wordCountB  = textB.split(/\s+/).filter(Boolean).length;

      const buildTags = (
        tactics: typeof ai.tacticsA,
        score:   number,
      ): Array<{ name: string; color: string }> => {
        const tags: Array<{ name: string; color: string }> = [];
        const hi  = 'bg-destructive/20 text-destructive border-destructive/40';
        const md  = 'bg-warning/20 text-warning border-warning/40';
        if (tactics.emotional  > 30) tags.push({ name: 'Emotional',  color: score > 60 ? hi : md });
        if (tactics.urgency    > 30) tags.push({ name: 'Urgency',    color: score > 60 ? hi : md });
        if (tactics.authority  > 25) tags.push({ name: 'Authority',  color: md });
        if (tactics.bandwagon  > 20) tags.push({ name: 'Bandwagon',  color: md });
        if (score              < 35) tags.push({ name: 'Factual',    color: 'bg-primary/20 text-primary border-primary/40' });
        return tags.slice(0, 4);
      };

      res.json({
        scoreA:      ai.scoreA,
        scoreB:      ai.scoreB,
        difference:  Math.abs(ai.scoreA - ai.scoreB),
        recommended: ai.recommended,
        confidence:  ai.confidence,
        explanation: ai.explanation,
        tagsA:       buildTags(ai.tacticsA, ai.scoreA),
        tagsB:       buildTags(ai.tacticsB, ai.scoreB),
        tactics: [
          { name: 'Emotional Appeal', a: ai.tacticsA.emotional,  b: ai.tacticsB.emotional,  desc: ai.tacticsA.emotional  > ai.tacticsB.emotional  ? 'Stronger emotional language in Text A' : 'Similar emotional language' },
          { name: 'Urgency Trigger',  a: ai.tacticsA.urgency,    b: ai.tacticsB.urgency,    desc: ai.tacticsA.urgency    > ai.tacticsB.urgency    ? 'Higher urgency pressure in Text A'      : 'Similar urgency levels'    },
          { name: 'Authority Claim',  a: ai.tacticsA.authority,  b: ai.tacticsB.authority,  desc: 'Authority references compared'                                                                                           },
          { name: 'Bandwagon Effect', a: ai.tacticsA.bandwagon,  b: ai.tacticsB.bandwagon,  desc: 'Conformity appeal compared'                                                                                             },
          { name: 'Fear Appeal',      a: ai.tacticsA.fear,       b: ai.tacticsB.fear,       desc: ai.tacticsA.fear       > ai.tacticsB.fear       ? 'Higher fear appeal in Text A'           : 'Similar fear levels'      },
        ],
        radarData: [
          { tactic: 'Emotional',  textA: ai.tacticsA.emotional,  textB: ai.tacticsB.emotional  },
          { tactic: 'Urgency',    textA: ai.tacticsA.urgency,    textB: ai.tacticsB.urgency    },
          { tactic: 'Authority',  textA: ai.tacticsA.authority,  textB: ai.tacticsB.authority  },
          { tactic: 'Bandwagon',  textA: ai.tacticsA.bandwagon,  textB: ai.tacticsB.bandwagon  },
          { tactic: 'Fear',       textA: ai.tacticsA.fear,       textB: ai.tacticsB.fear       },
        ],
        barData: [
          { category: 'Emotional', textA: ai.tacticsA.emotional,  textB: ai.tacticsB.emotional  },
          { category: 'Urgency',   textA: ai.tacticsA.urgency,    textB: ai.tacticsB.urgency    },
          { category: 'Authority', textA: ai.tacticsA.authority,  textB: ai.tacticsB.authority  },
          { category: 'Bandwagon', textA: ai.tacticsA.bandwagon,  textB: ai.tacticsB.bandwagon  },
          { category: 'Fear',      textA: ai.tacticsA.fear,       textB: ai.tacticsB.fear       },
        ],
        wordCountA,
        wordCountB,
        _meta: {
          analysisVersion:    ANALYSIS_VERSION,
          rubricVersion:      RUBRIC_VERSION,
          calibrationVersion: getCalibrationVersion(),
          modelUsed:          MODEL_USED,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);
