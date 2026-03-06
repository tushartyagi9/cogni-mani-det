import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { scrapeUrl } from '../lib/firecrawl.js';
import { analyzeWithAI } from '../lib/openai.js';
import { ApiError } from '../middleware/errorHandler.js';

export const articlePreviewRouter = Router();

// ─── Request schema ───────────────────────────────────────────────────────────
const ArticlePreviewRequestSchema = z.object({
  url: z.string().url('Invalid URL. Must start with http:// or https://'),
});

// ─── POST /api/article-preview ────────────────────────────────────────────────
articlePreviewRouter.post(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = ArticlePreviewRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ApiError(400, parsed.error.errors[0]?.message ?? 'Invalid request.'));
    }

    const { url } = parsed.data;

    try {
      const article = await scrapeUrl(url);

      // Run a quick AI analysis on headline + first 500 chars to get headlineRisk
      const headlineSample = `${article.title}. ${article.bodyText.substring(0, 500)}`;
      const headlineAnalysis = await analyzeWithAI(headlineSample, 'news');

      const tags: string[] = [];
      if (headlineAnalysis.manipulationScore >= 66) {
        tags.push('Emotionally Framed', 'High Risk Content');
      } else if (headlineAnalysis.manipulationScore >= 35) {
        tags.push('Potentially Biased');
      } else {
        tags.push('Factual Tone');
      }
      if (headlineAnalysis.urgencyScore > 50)    tags.push('Urgency Tactics');
      if (headlineAnalysis.emotionalIntensity > 50) tags.push('Emotional Language');

      res.json({
        headline:     article.title,
        source:       article.source,
        author:       article.author,
        publishDate:  article.publishDate,
        headlineRisk: headlineAnalysis.manipulationScore,
        domain:       article.domain,
        tags:         [...new Set(tags)].slice(0, 4),
        bodyText:     article.bodyText,
        description:  article.description,
      });
    } catch (err) {
      next(err);
    }
  },
);
