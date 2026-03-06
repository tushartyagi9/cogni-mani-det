import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { AnalysisResult, HistoryItem } from '../types';
import { getHistory, saveToHistory, deleteHistoryItem, clearHistory, syncHistoryWithApi } from '../services/storageService';

interface AppContextValue {
  // Current analysis result (shared between AnalyzerPage → ResultsPage)
  currentResult: AnalysisResult | null;
  setCurrentResult: (result: AnalysisResult) => void;
  clearCurrentResult: () => void;

  // Persistent history
  history: HistoryItem[];
  addToHistory: (result: AnalysisResult) => void;
  removeFromHistory: (id: string) => void;
  clearAllHistory: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentResult, setCurrentResultState] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(getHistory);

  // Sync history from the API once on mount (updates localStorage + state)
  useEffect(() => {
    let cancelled = false;
    syncHistoryWithApi().then(items => {
      if (!cancelled) setHistory(items);
    }).catch(() => { /* silently use local cache */ });
    return () => { cancelled = true; };
  }, []);

  const setCurrentResult = useCallback((result: AnalysisResult) => {
    setCurrentResultState(result);
  }, []);

  const clearCurrentResult = useCallback(() => {
    setCurrentResultState(null);
  }, []);

  const addToHistory = useCallback((result: AnalysisResult) => {
    const item = saveToHistory(result);
    setHistory(prev => [item, ...prev.filter(h => h.id !== item.id)].slice(0, 50));
  }, []);

  const removeFromHistory = useCallback((id: string) => {
    deleteHistoryItem(id);
    setHistory(prev => prev.filter(h => h.id !== id));
  }, []);

  const clearAllHistory = useCallback(() => {
    clearHistory();
    setHistory([]);
  }, []);

  return (
    <AppContext.Provider value={{
      currentResult,
      setCurrentResult,
      clearCurrentResult,
      history,
      addToHistory,
      removeFromHistory,
      clearAllHistory,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used inside <AppProvider>');
  return ctx;
}
