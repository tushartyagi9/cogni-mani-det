import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { getSupabaseAdmin, isSupabaseConfigured, type DbHistoryRow } from '../lib/supabase.js';
import { ApiError } from '../middleware/errorHandler.js';

export const historyRouter = Router();

// ─── Session-ID middleware (identify anonymous users) ─────────────────────────
function getSessionId(req: Request): string {
  return (req.headers['x-session-id'] as string) || 'anonymous';
}

// ─── HistoryItem shape returned to the client ─────────────────────────────────
interface HistoryItem {
  id:        string;
  title:     string;
  mode:      string;
  score:     number;
  date:      string;
  timestamp: string;
}

function rowToHistoryItem(row: DbHistoryRow): HistoryItem {
  return {
    id:        row.id,
    title:     row.title,
    mode:      row.mode,
    score:     row.manipulation_score,
    date:      new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    timestamp: row.created_at,
  };
}

// ─── Save request schema ──────────────────────────────────────────────────────
const SaveHistorySchema = z.object({
  result: z.object({
    id:                z.string(),
    timestamp:         z.string(),
    mode:              z.string(),
    inputMethod:       z.string(),
    inputText:         z.string(),
    inputUrl:          z.string().optional(),
    manipulationScore: z.number(),
    trustScore:        z.number(),
    confidence:        z.number(),
    biasLevel:         z.number(),
    riskLevel:         z.string(),
  }).passthrough(),
});

// ─── GET /api/history ─────────────────────────────────────────────────────────
historyRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    if (!isSupabaseConfigured()) {
      return res.json([]);
    }

    try {
      const sessionId = getSessionId(req);
      const supabase  = getSupabaseAdmin();

      const { data, error } = await supabase
        .from('analysis_history')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[Supabase GET history]', error);
        return res.json([]);
      }

      res.json((data as DbHistoryRow[]).map(rowToHistoryItem));
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/history ────────────────────────────────────────────────────────
historyRouter.post(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = SaveHistorySchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ApiError(400, parsed.error.errors[0]?.message ?? 'Invalid request.'));
    }

    const { result } = parsed.data;

    if (!isSupabaseConfigured()) {
      // Return a minimal HistoryItem even without DB
      const title = buildTitle(result);
      return res.json({
        id:        result.id,
        title,
        mode:      result.mode,
        score:     result.manipulationScore,
        date:      new Date(result.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        timestamp: result.timestamp,
      });
    }

    try {
      const sessionId = getSessionId(req);
      const supabase  = getSupabaseAdmin();
      const title     = buildTitle(result);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('analysis_history')
        .upsert({
          id:                result.id,
          session_id:        sessionId,
          title,
          mode:              result.mode,
          input_method:      result.inputMethod,
          input_url:         result.inputUrl ?? null,
          manipulation_score:result.manipulationScore,
          trust_score:       result.trustScore,
          confidence:        result.confidence,
          bias_level:        result.biasLevel,
          risk_level:        result.riskLevel,
          full_result:       result,
        }, { onConflict: 'id' })
        .select()
        .single();

      if (error) {
        console.error('[Supabase POST history]', error);
        // Don't fail the request – return a local item
        return res.json({
          id:        result.id,
          title,
          mode:      result.mode,
          score:     result.manipulationScore,
          date:      new Date(result.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          timestamp: result.timestamp,
        });
      }

      res.json(rowToHistoryItem(data as DbHistoryRow));
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /api/history/:id ──────────────────────────────────────────────────
historyRouter.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    if (!id) return next(new ApiError(400, 'Missing history item ID.'));

    if (!isSupabaseConfigured()) {
      return res.json({ success: true });
    }

    try {
      const sessionId = getSessionId(req);
      const supabase  = getSupabaseAdmin();

      const { error } = await supabase
        .from('analysis_history')
        .delete()
        .eq('id', id)
        .eq('session_id', sessionId);

      if (error) {
        console.error('[Supabase DELETE history]', error);
      }

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /api/history (clear all) ─────────────────────────────────────────
historyRouter.delete(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    if (!isSupabaseConfigured()) {
      return res.json({ success: true });
    }

    try {
      const sessionId = getSessionId(req);
      const supabase  = getSupabaseAdmin();

      const { error } = await supabase
        .from('analysis_history')
        .delete()
        .eq('session_id', sessionId);

      if (error) {
        console.error('[Supabase DELETE all history]', error);
      }

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Helper ───────────────────────────────────────────────────────────────────
function buildTitle(result: { inputText?: string; inputUrl?: string; inputMethod?: string; mode?: string }): string {
  if (result.inputMethod === 'url' && result.inputUrl) {
    return `URL: ${result.inputUrl.replace(/^https?:\/\/(www\.)?/, '').substring(0, 40)}`;
  }
  const text = (result.inputText ?? '').trim();
  if (text.length > 50) return text.substring(0, 50) + '…';
  return text || `${result.mode ?? 'content'} analysis`;
}
