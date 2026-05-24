/**
 * CogniGuard Storage Service
 *
 * Strategy:
 * - All mutations update localStorage FIRST (optimistic) for instant UI.
 * - Background API call syncs the change to Supabase.
 * - Reads try the API first; fall back to localStorage on any failure.
 * - This means the app works fully offline and degrades gracefully when the
 *   API server or Supabase is unavailable.
 */

import { apiClient } from '../lib/apiClient';
import type { HistoryItem, AnalysisResult } from '../types';

const LOCAL_KEY  = 'cogniguard_history';
const MAX_LOCAL  = 50;

// ─── Local cache helpers ──────────────────────────────────────────────────────
export function getLocalHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

function saveLocalHistory(items: HistoryItem[]): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(items.slice(0, MAX_LOCAL)));
  } catch {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(items.slice(0, 20)));
    } catch { /* storage full – silently ignore */ }
  }
}

// ─── Build a HistoryItem from an AnalysisResult (local-only fallback) ─────────
function buildLocalHistoryItem(result: AnalysisResult): HistoryItem {
  const trimmed = result.inputText.trim();
  const title =
    result.inputMethod === 'url' && result.inputUrl
      ? `URL: ${result.inputUrl.replace(/^https?:\/\/(www\.)?/, '').substring(0, 40)}`
      : trimmed.length > 50
        ? trimmed.substring(0, 50) + '…'
        : trimmed || `${result.mode} analysis`;

  return {
    id:        result.id,
    title,
    mode:      result.mode,
    score:     result.manipulationScore,
    date:      new Date(result.timestamp).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    }),
    timestamp: result.timestamp,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns localStorage history immediately (sync).
 * Call `syncHistoryWithApi()` in a useEffect to get the up-to-date API copy.
 */
export function getHistory(): HistoryItem[] {
  return getLocalHistory();
}

/**
 * Fetch history from the API and merge into localStorage.
 * Returns the merged list; never throws.
 */
export async function syncHistoryWithApi(): Promise<HistoryItem[]> {
  try {
    const items = await apiClient.get<HistoryItem[]>('/api/history');
    saveLocalHistory(items);
    return items;
  } catch {
    return getLocalHistory();
  }
}

/**
 * Save an analysis result.
 * - Adds to localStorage immediately and returns the HistoryItem.
 * - Fires API call in background to persist to Supabase.
 */
export function saveToHistory(result: AnalysisResult): HistoryItem {
  const item    = buildLocalHistoryItem(result);
  const current = getLocalHistory();
  saveLocalHistory([item, ...current.filter(h => h.id !== item.id)]);

  // Background persist
  apiClient
    .post<HistoryItem>('/api/history', { result })
    .catch(err => console.warn('[storageService] API save failed (local copy retained):', err));

  return item;
}

/**
 * Delete a history item.
 * - Removes from localStorage immediately.
 * - Fires API DELETE in background.
 */
export function deleteHistoryItem(id: string): void {
  saveLocalHistory(getLocalHistory().filter(h => h.id !== id));

  apiClient
    .delete(`/api/history/${id}`)
    .catch(err => console.warn('[storageService] API delete failed (local removed):', err));
}

/**
 * Clear all history.
 * - Clears localStorage immediately.
 * - Fires API DELETE /api/history in background.
 */
export function clearHistory(): void {
  localStorage.removeItem(LOCAL_KEY);

  apiClient
    .delete('/api/history')
    .catch(err => console.warn('[storageService] API clear failed (local cleared):', err));
}
