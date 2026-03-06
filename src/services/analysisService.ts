/**
 * MindGuard Analysis Service
 * All analysis is performed by the Express backend (OpenAI + Firecrawl).
 * This module is a thin typed wrapper around the API endpoints.
 */

import { apiClient } from '../lib/apiClient';
import type {
  AnalysisResult,
  AnalysisMode,
  InputMethod,
  ComparisonResult,
  ArticlePreview,
} from '../types';

// ─── Analyse a piece of content ──────────────────────────────────────────────
export function analyzeContent(
  text:        string,
  mode:        AnalysisMode,
  inputMethod: InputMethod,
  inputUrl?:   string,
): Promise<AnalysisResult> {
  return apiClient.post<AnalysisResult>('/api/analyze', {
    text,
    mode,
    inputMethod,
    inputUrl: inputUrl ?? '',
  });
}

// ─── Compare two texts ────────────────────────────────────────────────────────
export function compareTexts(
  textA: string,
  textB: string,
): Promise<ComparisonResult> {
  return apiClient.post<ComparisonResult>('/api/analyze/compare', { textA, textB });
}

// ─── Fetch article preview from a URL ────────────────────────────────────────
export function fetchArticlePreview(url: string): Promise<ArticlePreview> {
  return apiClient.post<ArticlePreview>('/api/article-preview', { url });
}
