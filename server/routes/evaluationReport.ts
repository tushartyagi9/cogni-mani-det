import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  runEvaluation,
  inspectSample,
  runOpenAIEvaluation,
  loadOpenAICache,
  isOpenAIEvalRunning,
  invalidateCache,
  runFilteredEvaluation,
} from '../lib/evaluationEngine.js';
import {
  applyThresholds,
  suggestThresholds,
  getCalibrationVersion,
  type ManipulationLabel,
} from '../lib/calibration.js';
import { getDatasetSummary, getFilteredSamples } from '../lib/datasetManager.js';
import { importSamples } from '../lib/datasetIngestion.js';

export const evaluationRouter = Router();

// ─── GET /api/evaluation ──────────────────────────────────────────────────────
evaluationRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const recalculate = String(req.query['recalculate']) === 'true';
      const report      = await runEvaluation(recalculate);
      const { sampleResults: _, ...publicReport } = report;
      res.json(publicReport);
    } catch (err) { next(err); }
  },
);

// ─── GET /api/evaluation/full ─────────────────────────────────────────────────
evaluationRouter.get(
  '/full',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const recalculate = String(req.query['recalculate']) === 'true';
      res.json(await runEvaluation(recalculate));
    } catch (err) { next(err); }
  },
);

// ─── GET /api/evaluation/sample/:id ──────────────────────────────────────────
evaluationRouter.get(
  '/sample/:id',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params['id'] ?? '');
      const result = inspectSample(id);
      if (!result) { res.status(404).json({ error: `Sample '${id}' not found.` }); return; }
      res.json(result);
    } catch (err) { next(err); }
  },
);

// ─── GET /api/evaluation/dataset-summary ────────────────────────────────────
evaluationRouter.get(
  '/dataset-summary',
  (_req: Request, res: Response, next: NextFunction) => {
    try { res.json(getDatasetSummary()); } catch (err) { next(err); }
  },
);

// ─── GET /api/evaluation/status ──────────────────────────────────────────────
// Lightweight health summary — no heavy computation, just dataset stats
evaluationRouter.get(
  '/status',
  (_req: Request, res: Response, next: NextFunction) => {
    try {
      const ds = getDatasetSummary();
      const classCounts = Object.values(ds.byLabel).map(b => b.total);
      const maxClass    = Math.max(...classCounts);
      const minClass    = Math.min(...classCounts);
      const imbalanceRatio = maxClass > 0 ? minClass / maxClass : 1;

      const minThresholdsMet = {
        realSamples50:       ds.realWorldCount >= 50,
        realHoldout15:       ds.realHoldoutCount >= 15,
        classImbalanceOk:    imbalanceRatio >= 0.5,
        reviewerKappaOk:     ds.agreementReport.averageKappa >= 0.6,
      };
      const allMet = Object.values(minThresholdsMet).every(Boolean);

      res.json({
        totalSamples:       ds.totalSamples,
        realSampleCount:    ds.realWorldCount,
        syntheticCount:     ds.syntheticCount,
        holdoutCount:       ds.holdoutCount,
        realHoldoutCount:   ds.realHoldoutCount,
        humanReviewedCount: ds.humanReviewedCount,
        reviewerAgreement:  Math.round(ds.agreementReport.fullAgreementRate * 100),
        averageKappa:       ds.agreementReport.averageKappa,
        classImbalanceRatio: Math.round(imbalanceRatio * 100),
        minimumDataMet:     allMet,
        thresholds:         minThresholdsMet,
        warningCount:       ds.warnings.length,
        warnings:           ds.warnings,
      });
    } catch (err) { next(err); }
  },
);

// ─── GET /api/evaluation/filtered ────────────────────────────────────────────
// Filter evaluation by any combination: ?split=holdout&is_synthetic=false&content_type=news&label=moderate
evaluationRouter.get(
  '/filtered',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const opts: Record<string, unknown> = {};
      if (req.query['split'])        opts.split        = String(req.query['split']);
      if (req.query['is_synthetic']) opts.is_synthetic  = String(req.query['is_synthetic']) === 'true';
      if (req.query['content_type']) opts.content_type  = String(req.query['content_type']);
      if (req.query['label'])        opts.label         = String(req.query['label']);

      const result = runFilteredEvaluation(opts as {
        split?: 'calibration' | 'holdout' | 'all';
        is_synthetic?: boolean;
        content_type?: string;
        label?: ManipulationLabel;
      });

      const { sampleResults: _, ...summary } = result;
      res.json({ ...summary, filters: opts });
    } catch (err) { next(err); }
  },
);

// ─── GET /api/evaluation/filtered-samples ────────────────────────────────────
// Returns matching sample IDs + labels (not full text) for admin browsing
evaluationRouter.get(
  '/filtered-samples',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const opts: Record<string, unknown> = {};
      if (req.query['split'])        opts.split        = String(req.query['split']);
      if (req.query['is_synthetic']) opts.is_synthetic  = String(req.query['is_synthetic']) === 'true';
      if (req.query['content_type']) opts.content_type  = String(req.query['content_type']);
      if (req.query['label'])        opts.label         = String(req.query['label']);

      const samples = getFilteredSamples(opts as {
        split?: 'calibration' | 'holdout' | 'all';
        is_synthetic?: boolean;
        content_type?: string;
        label?: ManipulationLabel;
      });

      res.json({
        count: samples.length,
        filters: opts,
        samples: samples.map(s => ({
          id:                   s.id,
          content_type:         s.content_type,
          final_consensus_label:s.final_consensus_label,
          split:                s.split,
          is_synthetic:         s.is_synthetic,
          source_reference:     s.source_reference,
          source_title:         (s as unknown as Record<string, unknown>).source_title ?? '',
          language:             (s as unknown as Record<string, unknown>).language ?? 'en',
          textPreview:          s.text.substring(0, 120) + (s.text.length > 120 ? '…' : ''),
        })),
      });
    } catch (err) { next(err); }
  },
);

// ─── POST /api/evaluation/import ─────────────────────────────────────────────
// Batch import new samples. Body: { entries: [ { sample: {...}, annotation: {...} } ] }
evaluationRouter.post(
  '/import',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as { entries?: unknown[] };
      if (!body.entries || !Array.isArray(body.entries) || body.entries.length === 0) {
        res.status(400).json({ error: 'Request body must contain a non-empty "entries" array.' });
        return;
      }

      const result = importSamples(body.entries as Array<{ sample: unknown; annotation: unknown }>);

      invalidateCache();

      const status = result.errors.length > 0 && result.imported === 0 ? 400 : 200;
      res.status(status).json(result);
    } catch (err) { next(err); }
  },
);

// ─── POST /api/evaluation/apply-thresholds ────────────────────────────────────
evaluationRouter.post(
  '/apply-thresholds',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const report = await runEvaluation(false);
      const statsMap = Object.fromEntries(
        (['neutral', 'mild', 'moderate', 'strong'] as ManipulationLabel[]).map(label => [
          label, { avg: report.calibration.scoreDistribution[label].avg, std: report.calibration.scoreDistribution[label].std },
        ]),
      ) as Record<ManipulationLabel, { avg: number; std: number }>;

      const suggestions = suggestThresholds(statsMap);
      applyThresholds(suggestions);
      invalidateCache();

      res.json({ message: 'Calibration thresholds updated from calibration-set distributions.', version: getCalibrationVersion(), applied: suggestions });
    } catch (err) { next(err); }
  },
);

// ─── OpenAI evaluation endpoints ──────────────────────────────────────────────

evaluationRouter.get(
  '/openai-status',
  (_req: Request, res: Response, next: NextFunction) => {
    try {
      const cached = loadOpenAICache();
      res.json({
        running: isOpenAIEvalRunning(), hasCachedResult: !!cached,
        lastRunAt: cached?.runAt ?? null, samplesEvaluated: cached?.samplesEvaluated ?? 0,
        splitEvaluated: cached?.splitEvaluated ?? null,
      });
    } catch (err) { next(err); }
  },
);

evaluationRouter.get(
  '/openai-results',
  (_req: Request, res: Response, next: NextFunction) => {
    try {
      const cached = loadOpenAICache();
      if (!cached) { res.status(404).json({ error: 'No cached OpenAI evaluation results. Run POST /api/evaluation/run-openai first.' }); return; }
      const { sampleResults: _, ...summary } = cached;
      res.json(summary);
    } catch (err) { next(err); }
  },
);

evaluationRouter.post(
  '/run-openai',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (isOpenAIEvalRunning()) { res.status(409).json({ error: 'Already running.' }); return; }
      if (!process.env.OPENAI_API_KEY) { res.status(503).json({ error: 'OPENAI_API_KEY not configured.' }); return; }

      const rawSamples = parseInt(String(req.query['samples'] ?? '15'), 10);
      const maxSamples = isNaN(rawSamples) ? 15 : Math.min(Math.max(rawSamples, 1), 40);
      const rawSplit   = String(req.query['split'] ?? 'holdout');
      const split      = (['calibration', 'holdout', 'all'] as const).includes(rawSplit as 'calibration' | 'holdout' | 'all')
        ? (rawSplit as 'calibration' | 'holdout' | 'all') : 'holdout';

      res.status(202).json({ message: `OpenAI evaluation started on up to ${maxSamples} ${split} samples.`, maxSamples, split, estimatedSeconds: maxSamples * 3 });

      runOpenAIEvaluation(maxSamples, split).catch(err => {
        console.error('[EvalEngine] OpenAI eval failed:', err instanceof Error ? err.message : err);
      });
    } catch (err) { next(err); }
  },
);
