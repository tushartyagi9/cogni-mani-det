import { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { apiClient } from '../../../lib/apiClient';

// ─── Types ────────────────────────────────────────────────────────────────────

type ManipulationLabel = 'neutral' | 'mild' | 'moderate' | 'strong';
const LABELS: ManipulationLabel[] = ['neutral', 'mild', 'moderate', 'strong'];
const LABEL_COLORS: Record<ManipulationLabel, string> = {
  neutral: '#22d3ee', mild: '#a3e635', moderate: '#fb923c', strong: '#f43f5e',
};

interface PerClassMetric { precision: number; recall: number; f1: number; support: number }
interface ScoreBand      { avg: number; std: number; count: number; histogram: number[] }

interface EvalMetrics {
  accuracy: number; precision: number; recall: number; f1Score: number;
  falsePositiveRate: number; falseNegativeRate: number; datasetSize: number;
  perClassMetrics:   Record<ManipulationLabel, PerClassMetric>;
  confusionMatrix:   number[][];
  confusionLabels:   ManipulationLabel[];
  scoreDistribution: Record<ManipulationLabel, ScoreBand>;
}

interface SlicedMetrics { datasetSize: number; metrics: EvalMetrics | null }

interface AgreementReport {
  fullAgreementRate: number; majorityAgreementRate: number;
  kappa_r1_r2: number; kappa_r1_r3: number; kappa_r2_r3: number;
  averageKappa: number; kappaInterpretation: string;
  disagreementCount: number; disagreementRate: number;
  perClassAgreement: Record<string, { count: number; fullAgree: number; rate: number }>;
}

interface DatasetWarning { severity: 'critical' | 'warning' | 'info'; category: string; message: string }

interface DatasetSummary {
  totalSamples: number; calibrationCount: number; holdoutCount: number;
  syntheticCount: number; realWorldCount: number; humanReviewedCount: number;
  samplesWithDisagreement: number;
  byLabel:        Record<ManipulationLabel, { total: number; calibration: number; holdout: number; synthetic: number; real: number }>;
  byContentType:  Record<string, { total: number; calibration: number; holdout: number; synthetic: number; real: number }>;
  classBalance:       Record<ManipulationLabel, number>;
  contentTypeBalance: Record<string, number>;
  realByLabel:        Record<ManipulationLabel, number>;
  realByContentType:  Record<string, number>;
  realHoldoutCount:   number;
  agreementReport:    AgreementReport;
  syntheticAgreement: AgreementReport;
  realAgreement:      AgreementReport | null;
  provenanceStatement: { status: string; syntheticNote: string; realWorldNote: string; what_is_validated: string[]; what_needs_real_data: string[] };
  warnings: DatasetWarning[];
}

interface ThresholdRec { label: ManipulationLabel; currentRange: [number, number]; suggested: [number, number]; reason: string }

interface FullReport {
  evaluatedAt: string; rubricVersion: string; calibrationVersion: string;
  overall: EvalMetrics; calibration: EvalMetrics; holdout: EvalMetrics;
  synthetic: SlicedMetrics; real: SlicedMetrics;
  syntheticHoldout: SlicedMetrics; realHoldout: SlicedMetrics;
  thresholdRecommendations: ThresholdRec[];
  datasetSummary: DatasetSummary;
}

interface OpenAIStatus { running: boolean; hasCachedResult: boolean; lastRunAt: string | null; samplesEvaluated: number; splitEvaluated: string | null }
interface ModelAgreement { agreeCount: number; disagreeCount: number; agreementRate: number; kappa: number; kappaLabel: string }
interface OpenAIResults { runAt: string; splitEvaluated: string; samplesEvaluated: number; metrics: EvalMetrics; modelAgreement: ModelAgreement }

interface FilteredResult { datasetSize: number; metrics: EvalMetrics | null; filters: Record<string, string> }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(n: number): string { return `${Math.round(n * 100)}%`; }
function num(n: number): string { return n.toFixed(2); }

// ─── Shared components ────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, color = '#22d3ee' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4 flex flex-col gap-1">
      <span className="text-xs text-gray-400 uppercase tracking-wider">{label}</span>
      <span className="text-2xl font-bold font-mono" style={{ color }}>{value}</span>
      {sub && <span className="text-xs text-gray-500">{sub}</span>}
    </div>
  );
}

function MetricsGrid({ m }: { m: EvalMetrics }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <MetricCard label="Accuracy"  value={pct(m.accuracy)}  color="#22d3ee" />
      <MetricCard label="F1 Score"  value={num(m.f1Score)}   color="#a78bfa" />
      <MetricCard label="Precision" value={num(m.precision)} color="#34d399" />
      <MetricCard label="Recall"    value={num(m.recall)}    color="#fb923c" />
      <MetricCard label="FP Rate"   value={pct(m.falsePositiveRate)} color="#f43f5e" />
      <MetricCard label="FN Rate"   value={pct(m.falseNegativeRate)} color="#f43f5e" />
      <MetricCard label="Dataset"   value={String(m.datasetSize)}    color="#94a3b8" />
    </div>
  );
}

function PerClassTable({ metrics }: { metrics: Record<ManipulationLabel, PerClassMetric> }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full text-sm font-mono">
        <thead>
          <tr className="border-b border-white/10 bg-white/5">
            {['Class', 'Precision', 'Recall', 'F1', 'Support'].map(h => (
              <th key={h} className="px-4 py-2 text-left text-xs text-gray-400 uppercase">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LABELS.map(l => { const m = metrics[l]; if (!m) return null; return (
            <tr key={l} className="border-b border-white/5 hover:bg-white/5">
              <td className="px-4 py-2 font-semibold capitalize" style={{ color: LABEL_COLORS[l] }}>{l}</td>
              <td className="px-4 py-2 text-gray-300">{num(m.precision)}</td>
              <td className="px-4 py-2 text-gray-300">{num(m.recall)}</td>
              <td className="px-4 py-2 text-gray-300">{num(m.f1)}</td>
              <td className="px-4 py-2 text-gray-400">{m.support}</td>
            </tr>
          ); })}
        </tbody>
      </table>
    </div>
  );
}

function ConfusionMatrix({ matrix, labels }: { matrix: number[][]; labels: ManipulationLabel[] }) {
  if (!matrix.length) return null;
  const maxVal = Math.max(...matrix.flat());
  return (
    <div>
      <p className="text-xs text-gray-500 mb-2">Rows = Predicted · Columns = Actual</p>
      <div className="overflow-x-auto">
        <table className="font-mono text-xs border-collapse">
          <thead><tr><th className="p-2 text-gray-500">P↓ / A→</th>{labels.map(l => <th key={l} className="p-2 capitalize" style={{ color: LABEL_COLORS[l] }}>{l}</th>)}</tr></thead>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={i}>
                <td className="p-2 capitalize font-semibold" style={{ color: LABEL_COLORS[labels[i]!] }}>{labels[i]}</td>
                {row.map((cell, j) => { const d = i === j; const op = maxVal > 0 ? cell / maxVal : 0;
                  const bg = d ? `rgba(34,211,238,${0.15 + op * 0.5})` : cell > 0 ? `rgba(244,63,94,${op * 0.5})` : 'transparent';
                  return <td key={j} className="p-2 text-center rounded" style={{ background: bg, minWidth: '48px' }}><span className={d ? 'text-cyan-300 font-bold' : 'text-gray-400'}>{cell}</span></td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScoreAvgChart({ dist }: { dist: Record<ManipulationLabel, ScoreBand> }) {
  const data = LABELS.map(l => ({ label: l, avg: dist[l]?.avg ?? 0 }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ left: -20 }}>
        <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} />
        <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} />
        <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} labelStyle={{ color: '#e2e8f0' }} formatter={(v: number) => [v.toFixed(1), 'Avg Score']} />
        <Bar dataKey="avg" radius={[4, 4, 0, 0]}>{data.map(d => <Cell key={d.label} fill={LABEL_COLORS[d.label as ManipulationLabel]} fillOpacity={0.8} />)}</Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function SectionHeader({ title, subtitle, badge, badgeColor }: { title: string; subtitle: string; badge?: string; badgeColor?: string }) {
  return (
    <div className="flex items-start gap-3 flex-wrap">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold font-mono text-white">{title}</h2>
          {badge && <span className="px-2 py-0.5 rounded text-xs font-mono font-bold" style={{ background: `${badgeColor}22`, color: badgeColor, border: `1px solid ${badgeColor}44` }}>{badge}</span>}
        </div>
        <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

function InfoBox({ children, color }: { children: React.ReactNode; color: 'blue' | 'yellow' | 'red' | 'green' }) {
  const s: Record<string, string> = { blue: 'border-blue-500/30 bg-blue-500/10 text-blue-300/80', yellow: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300/80', red: 'border-red-500/30 bg-red-500/10 text-red-300/80', green: 'border-green-500/30 bg-green-500/10 text-green-300/80' };
  return <div className={`rounded-lg border p-3 text-sm ${s[color]}`}>{children}</div>;
}

function StatusRow({ label, status, note }: { label: string; status: 'internal' | 'partial' | 'missing' | 'complete'; note: string }) {
  const cfg: Record<string, { icon: string; color: string; label: string }> = {
    internal: { icon: '~', color: '#fb923c', label: 'Internal' },
    partial:  { icon: '~', color: '#fbbf24', label: 'Partial'  },
    missing:  { icon: '✗', color: '#f43f5e', label: 'Missing'  },
    complete: { icon: '✓', color: '#22d3ee', label: 'Complete' },
  };
  const c = cfg[status]!;
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-white/5 last:border-0">
      <span className="font-mono font-bold text-sm mt-0.5" style={{ color: c.color, minWidth: '14px' }}>{c.icon}</span>
      <div className="flex-1 min-w-0"><span className="text-sm text-gray-200">{label}</span><span className="text-xs text-gray-500 block">{note}</span></div>
      <span className="text-xs px-2 py-0.5 rounded font-mono shrink-0" style={{ background: `${c.color}22`, color: c.color }}>{c.label}</span>
    </div>
  );
}

function WarningBanner({ warnings }: { warnings: DatasetWarning[] }) {
  if (!warnings.length) return null;
  const severity = (w: DatasetWarning) => ({ critical: 0, warning: 1, info: 2 }[w.severity]);
  const sorted   = [...warnings].sort((a, b) => severity(a) - severity(b));
  const borderC  = sorted[0]!.severity === 'critical' ? 'border-red-500/40' : sorted[0]!.severity === 'warning' ? 'border-yellow-500/40' : 'border-blue-500/40';
  const bgC      = sorted[0]!.severity === 'critical' ? 'bg-red-500/10'     : sorted[0]!.severity === 'warning' ? 'bg-yellow-500/10'     : 'bg-blue-500/10';
  const iconC    = sorted[0]!.severity === 'critical' ? 'text-red-400'      : sorted[0]!.severity === 'warning' ? 'text-yellow-400'      : 'text-blue-400';

  return (
    <div className={`rounded-lg border ${borderC} ${bgC} p-4 space-y-1`}>
      <p className={`text-sm font-semibold ${iconC}`}>Dataset Warnings ({warnings.length})</p>
      {sorted.map((w, i) => {
        const c = w.severity === 'critical' ? 'text-red-300/80' : w.severity === 'warning' ? 'text-yellow-300/70' : 'text-blue-300/60';
        return <p key={i} className={`text-xs ${c}`}>• [{w.severity.toUpperCase()}] {w.message}</p>;
      })}
    </div>
  );
}

// ─── Metrics block for a slice ────────────────────────────────────────────────

function SliceSection({ title, badge, badgeColor, slice, note }: {
  title: string; badge: string; badgeColor: string;
  slice: SlicedMetrics; note: string;
}) {
  if (slice.datasetSize === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-center">
        <p className="text-gray-500 text-sm">{title}: <strong>0 samples</strong></p>
        <p className="text-xs text-gray-600 mt-1">{note}</p>
      </div>
    );
  }
  const m = slice.metrics!;
  return (
    <div className="space-y-4">
      <SectionHeader title={title} subtitle={`${slice.datasetSize} samples`} badge={badge} badgeColor={badgeColor} />
      <MetricsGrid m={{ ...m, datasetSize: slice.datasetSize }} />
      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Per-Class</p>
          <PerClassTable metrics={m.perClassMetrics} />
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Confusion Matrix</p>
          <ConfusionMatrix matrix={m.confusionMatrix} labels={m.confusionLabels} />
        </div>
      </div>
      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
        <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Score Distribution</p>
        <ScoreAvgChart dist={m.scoreDistribution} />
      </div>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'synthetic' | 'real' | 'openai' | 'holdout' | 'calibration' | 'filter';
const TABS: { id: TabId; label: string }[] = [
  { id: 'overview',    label: 'Overview' },
  { id: 'synthetic',   label: 'Synthetic Benchmark' },
  { id: 'real',        label: 'Real-World Benchmark' },
  { id: 'openai',      label: 'Production Model' },
  { id: 'holdout',     label: 'Holdout Test' },
  { id: 'calibration', label: 'Calibration' },
  { id: 'filter',      label: 'Filter & Explore' },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminEvaluationPage() {
  const [activeTab, setActiveTab]   = useState<TabId>('overview');
  const [report, setReport]         = useState<FullReport | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  const [openaiStatus,  setOpenaiStatus]  = useState<OpenAIStatus | null>(null);
  const [openaiResults, setOpenaiResults] = useState<OpenAIResults | null>(null);
  const [openaiRunning, setOpenaiRunning] = useState(false);
  const [openaiError,   setOpenaiError]   = useState<string | null>(null);
  const [applyingThresholds, setApplyingThresholds] = useState(false);
  const [thresholdMsg,       setThresholdMsg]        = useState<string | null>(null);

  // Filter state
  const [fSplit, setFSplit]             = useState<string>('all');
  const [fSynthetic, setFSynthetic]    = useState<string>('any');
  const [fContentType, setFContentType] = useState<string>('any');
  const [fLabel, setFLabel]             = useState<string>('any');
  const [filteredResult, setFilteredResult] = useState<FilteredResult | null>(null);
  const [filterLoading, setFilterLoading]   = useState(false);

  const fetchReport = useCallback(async (recalculate = false) => {
    setLoading(true); setError(null);
    try { setReport(await apiClient.get<FullReport>(`/api/evaluation${recalculate ? '?recalculate=true' : ''}`)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, []);

  const fetchOpenAIStatus = useCallback(async () => {
    try {
      const status = await apiClient.get<OpenAIStatus>('/api/evaluation/openai-status');
      setOpenaiStatus(status);
      if (status.hasCachedResult) setOpenaiResults(await apiClient.get<OpenAIResults>('/api/evaluation/openai-results'));
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchReport(); fetchOpenAIStatus(); }, [fetchReport, fetchOpenAIStatus]);

  // Poll OpenAI status
  useEffect(() => {
    if (!openaiRunning) return;
    const id = setInterval(async () => {
      try {
        const s = await apiClient.get<OpenAIStatus>('/api/evaluation/openai-status');
        setOpenaiStatus(s);
        if (!s.running) { setOpenaiRunning(false); if (s.hasCachedResult) setOpenaiResults(await apiClient.get<OpenAIResults>('/api/evaluation/openai-results')); clearInterval(id); }
      } catch { clearInterval(id); }
    }, 3000);
    return () => clearInterval(id);
  }, [openaiRunning]);

  const handleRunOpenAI = async () => {
    setOpenaiError(null); setOpenaiRunning(true);
    try { await apiClient.post('/api/evaluation/run-openai?samples=16&split=holdout', {}); }
    catch (e) { setOpenaiError(e instanceof Error ? e.message : 'Failed'); setOpenaiRunning(false); }
  };

  const handleApplyThresholds = async () => {
    setApplyingThresholds(true); setThresholdMsg(null);
    try { const r = await apiClient.post<{ message: string; version: string }>('/api/evaluation/apply-thresholds', {}); setThresholdMsg(`Thresholds updated — v${r.version}`); await fetchReport(true); }
    catch (e) { setThresholdMsg(e instanceof Error ? e.message : 'Failed'); }
    finally { setApplyingThresholds(false); }
  };

  const handleFilter = async () => {
    setFilterLoading(true);
    const params = new URLSearchParams();
    if (fSplit !== 'all')      params.set('split', fSplit);
    if (fSynthetic !== 'any')  params.set('is_synthetic', fSynthetic);
    if (fContentType !== 'any') params.set('content_type', fContentType);
    if (fLabel !== 'any')       params.set('label', fLabel);
    try { setFilteredResult(await apiClient.get<FilteredResult>(`/api/evaluation/filtered?${params.toString()}`)); }
    catch { /* silent */ }
    finally { setFilterLoading(false); }
  };

  if (loading) return <div className="min-h-screen bg-[#080c14] flex items-center justify-center"><div className="text-cyan-400 font-mono animate-pulse">Loading evaluation data…</div></div>;
  if (error) return <div className="min-h-screen bg-[#080c14] flex items-center justify-center"><div className="text-center"><p className="text-red-400 mb-4">{error}</p><button onClick={() => fetchReport()} className="px-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 text-sm">Retry</button></div></div>;

  const ds = report?.datasetSummary;
  const ag = ds?.agreementReport;

  return (
    <div className="min-h-screen bg-[#080c14] text-gray-100 p-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold font-mono text-cyan-400">Validation Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Internal evaluation framework — not visible in the public UI</p>
            {report && <p className="text-xs text-gray-600 mt-1 font-mono">Evaluated: {new Date(report.evaluatedAt).toLocaleString()} · Rubric v{report.rubricVersion} · Cal v{report.calibrationVersion}</p>}
          </div>
          <button onClick={() => fetchReport(true)} className="px-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 text-sm font-mono shrink-0">Recalculate</button>
        </div>

        {/* Warnings */}
        {ds && <WarningBanner warnings={ds.warnings} />}
        {ds && ds.warnings.length > 0 && <div className="h-4" />}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={`px-4 py-2 rounded-lg text-sm font-mono whitespace-nowrap transition-colors ${activeTab === t.id ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40' : 'text-gray-500 hover:text-gray-300 border border-transparent hover:border-white/10'}`}>{t.label}</button>
          ))}
        </div>

        {report && ds && ag && (<>

          {/* ═══ OVERVIEW ═══ */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <SectionHeader title="Dataset Overview" subtitle="Provenance, split breakdown, and inter-rater agreement" />

              {/* Provenance banner */}
              {ds.realWorldCount === 0 ? (
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
                  <p className="text-yellow-400 text-sm font-semibold mb-1">Synthetic-Only Corpus</p>
                  <p className="text-yellow-300/70 text-xs">{ds.provenanceStatement.syntheticNote}</p>
                </div>
              ) : (
                <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
                  <p className="text-green-400 text-sm font-semibold mb-1">Mixed Corpus: {ds.syntheticCount} synthetic + {ds.realWorldCount} real</p>
                  <p className="text-green-300/70 text-xs">{ds.provenanceStatement.realWorldNote}</p>
                </div>
              )}

              {/* Counts */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard label="Total Samples"    value={String(ds.totalSamples)} />
                <MetricCard label="Calibration Set"  value={String(ds.calibrationCount)} sub="for threshold tuning" color="#a78bfa" />
                <MetricCard label="Holdout Set"      value={String(ds.holdoutCount)} sub="for final eval" color="#fb923c" />
                <MetricCard label="Disagreements"    value={String(ds.samplesWithDisagreement)} color="#f43f5e" />
                <MetricCard label="Synthetic"        value={String(ds.syntheticCount)} color="#94a3b8" />
                <MetricCard label="Real-World"       value={String(ds.realWorldCount)} color="#22d3ee" />
                <MetricCard label="Human-Reviewed"   value={String(ds.humanReviewedCount)} sub="with full provenance" color="#34d399" />
                <MetricCard label="Real Holdout"     value={String(ds.realHoldoutCount)} sub="real in holdout set" color="#f43f5e" />
              </div>

              {/* Class balance — shows synthetic + real counts */}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Class Balance (All / Synthetic / Real)</p>
                  <div className="space-y-2">
                    {LABELS.map(l => { const b = ds.byLabel[l]; return (
                      <div key={l} className="flex items-center gap-3">
                        <span className="w-20 text-sm capitalize font-mono" style={{ color: LABEL_COLORS[l] }}>{l}</span>
                        <div className="flex-1 bg-white/5 rounded-full h-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: pct(ds.classBalance[l] ?? 0), background: LABEL_COLORS[l] }} /></div>
                        <span className="text-xs text-gray-400 w-28 text-right font-mono">{b.total} ({b.synthetic}s / {b.real}r)</span>
                      </div>
                    ); })}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Content-Type Balance</p>
                  <div className="space-y-2">
                    {Object.entries(ds.contentTypeBalance).map(([ct, bal]) => { const b = ds.byContentType[ct]; return (
                      <div key={ct} className="flex items-center gap-3">
                        <span className="w-20 text-sm capitalize font-mono text-gray-300">{ct}</span>
                        <div className="flex-1 bg-white/5 rounded-full h-2 overflow-hidden"><div className="h-full rounded-full bg-cyan-500/60" style={{ width: pct(bal) }} /></div>
                        <span className="text-xs text-gray-400 w-28 text-right font-mono">{b?.total ?? 0} ({b?.synthetic ?? 0}s / {b?.real ?? 0}r)</span>
                      </div>
                    ); })}
                  </div>
                </div>
              </div>

              {/* Agreement */}
              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Inter-Rater Agreement (Full Dataset)</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <MetricCard label="Full Agreement" value={pct(ag.fullAgreementRate)} color="#22d3ee" />
                  <MetricCard label="Majority Agreement" value={pct(ag.majorityAgreementRate)} color="#34d399" />
                  <MetricCard label="Avg κ" value={num(ag.averageKappa)} sub={ag.kappaInterpretation} color="#a78bfa" />
                  <MetricCard label="Disagree Rate" value={pct(ag.disagreementRate)} color="#fb923c" />
                </div>
                {ds.realAgreement && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Real-World Samples Only</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <MetricCard label="Full Agreement" value={pct(ds.realAgreement.fullAgreementRate)} color="#22d3ee" />
                      <MetricCard label="Avg κ" value={num(ds.realAgreement.averageKappa)} sub={ds.realAgreement.kappaInterpretation} color="#a78bfa" />
                    </div>
                  </div>
                )}
                <p className="text-xs text-gray-600 mt-3 italic">{ds.realWorldCount === 0 ? 'Note: all current samples are synthetic. High kappa reflects consistent labeling by the dataset author, not independent annotation.' : `${ds.syntheticCount} synthetic + ${ds.realWorldCount} real-world samples. Real-world agreement is the stronger validity signal.`}</p>
              </div>

              {/* Validated / not validated */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
                  <p className="text-green-400 text-sm font-semibold mb-2">Internally Validated</p>
                  <ul className="space-y-1">{ds.provenanceStatement.what_is_validated.map((s, i) => <li key={i} className="text-xs text-green-300/70">• {s}</li>)}</ul>
                </div>
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                  <p className="text-red-400 text-sm font-semibold mb-2">Needs Real Data</p>
                  <ul className="space-y-1">{ds.provenanceStatement.what_needs_real_data.map((s, i) => <li key={i} className="text-xs text-red-300/70">• {s}</li>)}</ul>
                </div>
              </div>
            </div>
          )}

          {/* ═══ SYNTHETIC BENCHMARK ═══ */}
          {activeTab === 'synthetic' && (
            <div className="space-y-6">
              <SliceSection title="Synthetic Benchmark (All)" badge="SYNTHETIC" badgeColor="#94a3b8" slice={report.synthetic} note="No synthetic samples in dataset" />
              {report.syntheticHoldout.datasetSize > 0 && (
                <>
                  <div className="border-t border-white/10 my-6" />
                  <SliceSection title="Synthetic Holdout Only" badge="SYN HOLDOUT" badgeColor="#a78bfa" slice={report.syntheticHoldout} note="" />
                </>
              )}
              <InfoBox color="blue">Synthetic metrics show how the rubric performs on machine-generated text. These validate internal logic but do not prove real-world efficacy.</InfoBox>
            </div>
          )}

          {/* ═══ REAL-WORLD BENCHMARK ═══ */}
          {activeTab === 'real' && (
            <div className="space-y-6">
              <SliceSection title="Real-World Benchmark (All)" badge="REAL" badgeColor="#22d3ee" slice={report.real} note="No real-world samples yet. Import real labeled data to populate this section." />
              {report.realHoldout.datasetSize > 0 && (
                <>
                  <div className="border-t border-white/10 my-6" />
                  <SliceSection title="Real-World Holdout Only" badge="REAL HOLDOUT" badgeColor="#f43f5e" slice={report.realHoldout} note="" />
                </>
              )}

              {report.real.datasetSize > 0 && report.real.datasetSize < 50 && (
                <InfoBox color="yellow"><strong>Low sample count.</strong> {report.real.datasetSize} real samples are insufficient for strong claims. Aim for 50+ real samples with balanced class and content-type distribution.</InfoBox>
              )}

              {report.real.datasetSize === 0 && (
                <InfoBox color="red">
                  <strong>No real-world samples.</strong> Import labeled real-world text to enable external validation. Use <code className="font-mono">POST /api/evaluation/import</code> with the documented JSON format.
                </InfoBox>
              )}

              <InfoBox color="green">
                <strong>How to add real data:</strong> POST to <code className="font-mono">/api/evaluation/import</code> with entries containing <code className="font-mono">is_synthetic: false</code>, complete source provenance, and 3 independent reviewer labels. See the import format documented at the bottom of this page.
              </InfoBox>
            </div>
          )}

          {/* ═══ OPENAI MODEL ═══ */}
          {activeTab === 'openai' && (
            <div className="space-y-6">
              <SectionHeader title="Production Model Validation (OpenAI)" subtitle="On-demand evaluation of the live OpenAI analyzer" badge="ON-DEMAND" badgeColor="#fb923c" />
              <div className="rounded-lg border border-white/10 bg-white/5 p-4 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  {openaiStatus?.running || openaiRunning ? <p className="text-yellow-400 font-mono text-sm animate-pulse">Running…</p>
                  : openaiResults ? <div><p className="text-green-400 text-sm font-semibold">Last: {new Date(openaiResults.runAt).toLocaleString()}</p><p className="text-xs text-gray-500">{openaiResults.samplesEvaluated} samples · {openaiResults.splitEvaluated} set</p></div>
                  : <p className="text-gray-500 text-sm">No cached results.</p>}
                  {openaiError && <p className="text-red-400 text-xs mt-1">{openaiError}</p>}
                </div>
                <button onClick={handleRunOpenAI} disabled={openaiRunning || openaiStatus?.running} className="px-4 py-2 rounded-lg bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-mono shrink-0">{openaiRunning ? 'Running…' : 'Run OpenAI Eval'}</button>
              </div>
              {openaiResults && (<>
                <MetricsGrid m={openaiResults.metrics} />
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Local vs OpenAI Agreement</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <MetricCard label="Agreement" value={pct(openaiResults.modelAgreement.agreementRate)} color="#22d3ee" />
                    <MetricCard label="Agreed" value={String(openaiResults.modelAgreement.agreeCount)} color="#34d399" />
                    <MetricCard label="Disagreed" value={String(openaiResults.modelAgreement.disagreeCount)} color="#f43f5e" />
                    <MetricCard label="κ" value={num(openaiResults.modelAgreement.kappa)} sub={openaiResults.modelAgreement.kappaLabel} color="#a78bfa" />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="rounded-lg border border-white/10 bg-white/5 p-4"><p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Per-Class (OpenAI)</p><PerClassTable metrics={openaiResults.metrics.perClassMetrics} /></div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-4"><p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Score Distribution (OpenAI)</p><ScoreAvgChart dist={openaiResults.metrics.scoreDistribution} /></div>
                </div>
              </>)}
            </div>
          )}

          {/* ═══ HOLDOUT ═══ */}
          {activeTab === 'holdout' && (
            <div className="space-y-6">
              <SectionHeader title="Holdout Test Results" subtitle={`${report.holdout.datasetSize} samples never used for calibration`} badge="HOLDOUT" badgeColor="#f43f5e" />
              <InfoBox color="red"><strong>Primary honest metrics.</strong> Never used for threshold tuning. Compare against calibration to detect overfitting.</InfoBox>
              <MetricsGrid m={report.holdout} />
              <div className="grid md:grid-cols-2 gap-4">
                <MetricCard label="Calibration Accuracy" value={pct(report.calibration.accuracy)} sub={`${report.calibration.datasetSize} samples`} color="#94a3b8" />
                <MetricCard label="Holdout Accuracy" value={pct(report.holdout.accuracy)} sub={`${report.holdout.datasetSize} samples — unbiased`} color="#f43f5e" />
              </div>
              {Math.abs(report.calibration.accuracy - report.holdout.accuracy) > 0.1 && <InfoBox color="yellow">Gap of {pct(Math.abs(report.calibration.accuracy - report.holdout.accuracy))} between calibration/holdout — possible overfitting.</InfoBox>}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="rounded-lg border border-white/10 bg-white/5 p-4"><p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Per-Class (Holdout)</p><PerClassTable metrics={report.holdout.perClassMetrics} /></div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-4"><p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Confusion Matrix (Holdout)</p><ConfusionMatrix matrix={report.holdout.confusionMatrix} labels={report.holdout.confusionLabels} /></div>
              </div>
            </div>
          )}

          {/* ═══ CALIBRATION ═══ */}
          {activeTab === 'calibration' && (
            <div className="space-y-6">
              <SectionHeader title="Calibration & Thresholds" subtitle="Derived from calibration-set distributions only" badge="CALIBRATION" badgeColor="#a78bfa" />
              <div className="rounded-lg border border-white/10 bg-white/5 overflow-hidden">
                <div className="p-4 border-b border-white/10 flex items-center justify-between flex-wrap gap-3">
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Threshold Recommendations</p>
                  <button onClick={handleApplyThresholds} disabled={applyingThresholds} className="px-3 py-1.5 rounded text-xs font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 disabled:opacity-40">{applyingThresholds ? 'Applying…' : 'Apply Suggestions'}</button>
                </div>
                {thresholdMsg && <div className="px-4 py-2 text-xs text-cyan-400 border-b border-white/5 bg-cyan-500/5">{thresholdMsg}</div>}
                <table className="w-full text-sm font-mono">
                  <thead><tr className="border-b border-white/10 bg-white/5">{['Class', 'Current', 'Suggested', 'Reason'].map(h => <th key={h} className="px-4 py-2 text-left text-xs text-gray-400 uppercase">{h}</th>)}</tr></thead>
                  <tbody>{report.thresholdRecommendations.map(r => (
                    <tr key={r.label} className="border-b border-white/5 hover:bg-white/5">
                      <td className="px-4 py-2 capitalize font-semibold" style={{ color: LABEL_COLORS[r.label] }}>{r.label}</td>
                      <td className="px-4 py-2 text-gray-400">{r.currentRange[0]}–{r.currentRange[1]}</td>
                      <td className="px-4 py-2 text-cyan-300">{r.suggested[0]}–{r.suggested[1]}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{r.reason}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Validation Status</p>
                <div className="space-y-2">
                  <StatusRow label="Rubric phrase-matching" status="internal" note={`Validated on ${report.calibration.datasetSize} synthetic calibration samples`} />
                  <StatusRow label="Calibration thresholds" status="internal" note="Derived from calibration-set score distributions only" />
                  <StatusRow label="Holdout estimate" status={ds.realHoldoutCount > 0 ? 'partial' : 'internal'} note={`${report.holdout.datasetSize} holdout samples (${ds.realHoldoutCount} real)`} />
                  <StatusRow label="OpenAI model validation" status={openaiResults ? 'partial' : 'missing'} note={openaiResults ? `${openaiResults.samplesEvaluated} samples evaluated` : 'Not yet run'} />
                  <StatusRow label="Real-world external validity" status={ds.realWorldCount >= 50 ? 'complete' : ds.realWorldCount > 0 ? 'partial' : 'missing'} note={`${ds.realWorldCount} real samples (need ≥50 for moderate confidence)`} />
                  <StatusRow label="Independent human reviewers" status={ds.humanReviewedCount > 0 ? 'partial' : 'missing'} note={`${ds.humanReviewedCount} samples with verified provenance`} />
                </div>
              </div>
            </div>
          )}

          {/* ═══ FILTER & EXPLORE ═══ */}
          {activeTab === 'filter' && (
            <div className="space-y-6">
              <SectionHeader title="Filter & Explore" subtitle="Run evaluation on arbitrary dataset slices" />
              <div className="rounded-lg border border-white/10 bg-white/5 p-4 grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Split</label>
                  <select value={fSplit} onChange={e => setFSplit(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-gray-200 font-mono">
                    <option value="all">All</option><option value="calibration">Calibration</option><option value="holdout">Holdout</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Source</label>
                  <select value={fSynthetic} onChange={e => setFSynthetic(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-gray-200 font-mono">
                    <option value="any">Any</option><option value="true">Synthetic</option><option value="false">Real</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Content Type</label>
                  <select value={fContentType} onChange={e => setFContentType(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-gray-200 font-mono">
                    <option value="any">Any</option>{Object.keys(ds.byContentType).map(ct => <option key={ct} value={ct}>{ct}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Label</label>
                  <select value={fLabel} onChange={e => setFLabel(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-gray-200 font-mono">
                    <option value="any">Any</option>{LABELS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <button onClick={handleFilter} disabled={filterLoading} className="px-4 py-1.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 text-sm font-mono disabled:opacity-40">{filterLoading ? 'Loading…' : 'Run Filter'}</button>
              </div>

              {filteredResult && (
                filteredResult.metrics ? (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-400 font-mono">Showing {filteredResult.datasetSize} matching samples</p>
                    <MetricsGrid m={{ ...filteredResult.metrics, datasetSize: filteredResult.datasetSize }} />
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="rounded-lg border border-white/10 bg-white/5 p-4"><PerClassTable metrics={filteredResult.metrics.perClassMetrics} /></div>
                      <div className="rounded-lg border border-white/10 bg-white/5 p-4"><ConfusionMatrix matrix={filteredResult.metrics.confusionMatrix} labels={filteredResult.metrics.confusionLabels} /></div>
                    </div>
                  </div>
                ) : <p className="text-gray-500 text-sm">No samples match the selected filters.</p>
              )}
            </div>
          )}

        </>)}
      </div>
    </div>
  );
}
