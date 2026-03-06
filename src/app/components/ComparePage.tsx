import { useState } from 'react';
import { ArrowLeft, Zap, TrendingUp, AlertTriangle, Copy, FileText, AlertCircle, RotateCcw } from 'lucide-react';
import { Link } from 'react-router';
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis, Tooltip,
} from 'recharts';
import { toast } from 'sonner';
import { compareTexts } from '../../services/analysisService';
import type { ComparisonResult } from '../../types';

const MIN_COMPARE_LENGTH = 10;

const DEFAULT_A = "BREAKING: Experts reveal shocking truth about new policy that EVERYONE must know! Don't miss this critical information that could change everything!";
const DEFAULT_B = 'Researchers have published findings about a new policy. The study is available for review and provides detailed analysis of the proposed changes.';

export function ComparePage() {
  const [textA, setTextA] = useState(DEFAULT_A);
  const [textB, setTextB] = useState(DEFAULT_B);
  const [result, setResult]     = useState<ComparisonResult | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [errorA, setErrorA]     = useState('');
  const [errorB, setErrorB]     = useState('');
  const [compareError, setCompareError] = useState('');

  // -----------------------------------------------------------------------
  const validate = (): boolean => {
    let ok = true;
    if (!textA.trim() || textA.trim().length < MIN_COMPARE_LENGTH) {
      setErrorA(`Please enter at least ${MIN_COMPARE_LENGTH} characters.`);
      ok = false;
    } else setErrorA('');
    if (!textB.trim() || textB.trim().length < MIN_COMPARE_LENGTH) {
      setErrorB(`Please enter at least ${MIN_COMPARE_LENGTH} characters.`);
      ok = false;
    } else setErrorB('');
    return ok;
  };

  const handleCompare = async () => {
    if (!validate()) return;
    setCompareError('');
    setIsComparing(true);
    try {
      const r = await compareTexts(textA, textB);
      setResult(r);
      toast.success('Comparison complete');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Comparison failed. Please try again.';
      setCompareError(msg);
      toast.error(msg);
    } finally {
      setIsComparing(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setTextA(DEFAULT_A);
    setTextB(DEFAULT_B);
    setErrorA('');
    setErrorB('');
    setCompareError('');
  };

  const handleCopyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
    } catch {
      toast.error('Clipboard access denied. Please copy manually.');
    }
  };

  const handleExport = async () => {
    if (!result) return;
    const content = [
      'MindGuard Comparison Report',
      '===========================',
      `Date: ${new Date().toLocaleString()}`,
      '',
      `Text A Risk Score: ${result.scoreA}%`,
      `Text B Risk Score: ${result.scoreB}%`,
      `Difference:        ${result.difference}%`,
      `Recommended:       Text ${result.recommended}`,
      `Confidence:        ${result.confidence}%`,
      '',
      'Text A:', textA,
      '',
      'Text B:', textB,
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `mindguard-comparison-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Comparison exported');
  };

  const scoreColor = (score: number) =>
    score > 65 ? 'text-destructive' : score > 35 ? 'text-warning' : 'text-primary';

  // -----------------------------------------------------------------------
  return (
    <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-12 max-w-7xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link to="/" className="p-2 rounded-lg glass-card hover:bg-secondary/50 transition-all">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl sm:text-4xl neon-text">Compare Analysis</h1>
          <p className="text-muted-foreground mt-1">Side-by-side manipulation comparison</p>
        </div>
      </div>

      {/* Split Input Layout */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        {/* Text A */}
        <div className="glass-card rounded-xl p-6 border-l-4 border-destructive/50">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm uppercase tracking-wider text-destructive flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Text A
              </h3>
              {result && <p className="text-xs text-muted-foreground mt-1">{result.scoreA > 65 ? 'High risk content' : result.scoreA > 35 ? 'Medium risk content' : 'Low risk content'}</p>}
            </div>
            {result && (
              <div className="text-right">
                <div className="text-xs text-muted-foreground mb-1">Risk Score</div>
                <div className={`text-3xl font-mono neon-text ${scoreColor(result.scoreA)}`}>{result.scoreA}</div>
              </div>
            )}
          </div>
          <textarea
            value={textA}
            onChange={(e) => { setTextA(e.target.value); if (errorA) setErrorA(''); }}
            placeholder="Enter first text to analyse…"
            className={`w-full min-h-[180px] bg-input-background border rounded-lg p-4 
                     text-foreground placeholder:text-muted-foreground resize-y
                     focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                     transition-all mb-2 ${errorA ? 'border-destructive' : 'border-input'}`}
          />
          {errorA && (
            <div className="flex items-center gap-2 text-destructive text-sm mb-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorA}</span>
            </div>
          )}
          <div className="text-xs text-muted-foreground font-mono mb-3">
            {textA.split(/\s+/).filter(Boolean).length} words
          </div>
          {result && (
            <div className="flex flex-wrap gap-2">
              {result.tagsA.map((tag, i) => (
                <span key={i} className={`px-2 py-1 rounded-full text-xs border ${tag.color} font-mono`}>{tag.name}</span>
              ))}
            </div>
          )}
        </div>

        {/* Text B */}
        <div className="glass-card rounded-xl p-6 border-l-4 border-primary/50">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm uppercase tracking-wider text-primary flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Text B
              </h3>
              {result && <p className="text-xs text-muted-foreground mt-1">{result.scoreB > 65 ? 'High risk content' : result.scoreB > 35 ? 'Medium risk content' : 'Low risk content'}</p>}
            </div>
            {result && (
              <div className="text-right">
                <div className="text-xs text-muted-foreground mb-1">Risk Score</div>
                <div className={`text-3xl font-mono neon-text ${scoreColor(result.scoreB)}`}>{result.scoreB}</div>
              </div>
            )}
          </div>
          <textarea
            value={textB}
            onChange={(e) => { setTextB(e.target.value); if (errorB) setErrorB(''); }}
            placeholder="Enter second text to compare…"
            className={`w-full min-h-[180px] bg-input-background border rounded-lg p-4 
                     text-foreground placeholder:text-muted-foreground resize-y
                     focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                     transition-all mb-2 ${errorB ? 'border-destructive' : 'border-input'}`}
          />
          {errorB && (
            <div className="flex items-center gap-2 text-destructive text-sm mb-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorB}</span>
            </div>
          )}
          <div className="text-xs text-muted-foreground font-mono mb-3">
            {textB.split(/\s+/).filter(Boolean).length} words
          </div>
          {result && (
            <div className="flex flex-wrap gap-2">
              {result.tagsB.map((tag, i) => (
                <span key={i} className={`px-2 py-1 rounded-full text-xs border ${tag.color} font-mono`}>{tag.name}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Compare / Reset Button */}
      <div className="flex justify-center mb-8 gap-3">
        {!result ? (
          <button
            onClick={handleCompare}
            disabled={isComparing}
            className="px-8 py-3 rounded-lg bg-primary text-primary-foreground 
                     hover:bg-primary/90 transition-all neon-glow flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isComparing ? (
              <>
                <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Comparing…
              </>
            ) : (
              <>
                <Zap className="w-5 h-5" />
                Compare Both Texts
              </>
            )}
          </button>
        ) : (
          <button
            onClick={handleReset}
            className="px-6 py-3 rounded-lg glass-card hover:bg-secondary/50 transition-all flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            New Comparison
          </button>
        )}
      </div>

      {compareError && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm mb-6 max-w-xl mx-auto">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{compareError}</span>
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Comparison Summary */}
          <div className="glass-card rounded-xl p-6 mb-6">
            <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-6 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Comparison Summary
            </h3>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center p-4 rounded-lg bg-secondary/30 border border-border">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Risk Difference</div>
                <div className={`text-4xl font-mono neon-text mb-2 ${scoreColor(result.difference + 30)}`}>{result.difference}%</div>
                <p className="text-xs text-muted-foreground">Text {result.scoreA > result.scoreB ? 'A' : 'B'} is more manipulative</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-secondary/30 border border-border">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Recommended Choice</div>
                <div className={`text-4xl font-mono neon-text mb-2 ${result.recommended === 'B' ? 'text-primary' : 'text-destructive'}`}>{result.recommended}</div>
                <p className="text-xs text-muted-foreground">Significantly more neutral</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-secondary/30 border border-border">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Confidence</div>
                <div className="text-4xl font-mono text-primary neon-text mb-2">{result.confidence}%</div>
                <p className="text-xs text-muted-foreground">Analysis accuracy</p>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Left Column */}
            <div className="lg:col-span-2 space-y-6">
              {/* Score Comparison */}
              <div className="glass-card rounded-xl p-6">
                <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-6">Overall Manipulation Score</h3>
                <div className="space-y-6">
                  {[
                    { label: 'Text A', score: result.scoreA, gradient: 'from-warning to-destructive', color: scoreColor(result.scoreA), desc: result.scoreA > 65 ? 'High risk — multiple manipulation techniques detected' : result.scoreA > 35 ? 'Medium risk — some manipulative content present' : 'Low risk — minimal manipulative content' },
                    { label: 'Text B', score: result.scoreB, gradient: 'from-primary to-chart-2',     color: scoreColor(result.scoreB), desc: result.scoreB > 65 ? 'High risk — multiple manipulation techniques detected' : result.scoreB > 35 ? 'Medium risk — some manipulative content present' : 'Low risk — minimal manipulative content' },
                  ].map((row, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-3">
                        <span className={`text-sm font-mono ${row.color}`}>{row.label}</span>
                        <span className={`text-2xl font-mono ${row.color}`}>{row.score}%</span>
                      </div>
                      <div className="h-4 bg-secondary rounded-full overflow-hidden">
                        <div className={`h-full bg-gradient-to-r ${row.gradient} neon-glow transition-all`} style={{ width: `${row.score}%` }} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">{row.desc}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 p-4 rounded-lg bg-warning/10 border border-warning/30">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm mb-1">
                        Text {result.scoreA > result.scoreB ? 'A' : 'B'} shows{' '}
                        <span className="text-destructive font-mono">{result.difference}% higher</span> manipulation than Text {result.scoreA > result.scoreB ? 'B' : 'A'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Consider using Text {result.recommended} for more neutral communication
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Category Breakdown */}
              <div className="glass-card rounded-xl p-6">
                <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-6">Category Breakdown</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={result.barData} layout="vertical">
                    <XAxis type="number" domain={[0, 100]} stroke="#6B7A99" fontSize={12} />
                    <YAxis type="category" dataKey="category" stroke="#6B7A99" fontSize={12} width={80} />
                    <Tooltip contentStyle={{ background: 'rgba(13,21,37,0.95)', border: '1px solid rgba(0,229,204,0.2)', borderRadius: '8px', fontSize: '12px' }} />
                    <Bar dataKey="textA" fill="#FF3B5C" radius={[0, 4, 4, 0]} name="Text A" />
                    <Bar dataKey="textB" fill="#00E5CC" radius={[0, 4, 4, 0]} name="Text B" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Detailed Tactic Analysis */}
              <div className="glass-card rounded-xl p-6">
                <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-6">Detailed Tactic Analysis</h3>
                <div className="space-y-4">
                  {result.tactics.map((tactic, i) => (
                    <div key={i} className="p-4 rounded-lg bg-secondary/30 border border-border">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium">{tactic.name}</span>
                        <div className="flex items-center gap-4 text-xs font-mono">
                          <span className="text-destructive">A: {tactic.a}%</span>
                          <span className="text-primary">B: {tactic.b}%</span>
                        </div>
                      </div>
                      <div className="flex gap-2 mb-2">
                        <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-destructive transition-all" style={{ width: `${tactic.a}%` }} />
                        </div>
                        <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-primary transition-all" style={{ width: `${tactic.b}%` }} />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{tactic.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Side-by-side Details */}
              <div className="grid sm:grid-cols-2 gap-6">
                {[
                  { label: 'Text A Details', labelColor: 'text-destructive', score: result.scoreA, wordCount: result.wordCountA, trustScore: Math.max(100 - Math.round(result.scoreA * 0.9), 5), biasLevel: Math.round(result.scoreA * 0.92) },
                  { label: 'Text B Details', labelColor: 'text-primary',     score: result.scoreB, wordCount: result.wordCountB, trustScore: Math.max(100 - Math.round(result.scoreB * 0.9), 5), biasLevel: Math.round(result.scoreB * 0.92) },
                ].map((row, i) => (
                  <div key={i} className={`glass-card rounded-xl p-6 ${i === 0 ? 'border-destructive/30' : 'border-primary/30'}`}>
                    <h4 className={`text-sm uppercase tracking-wider mb-4 ${row.labelColor}`}>{row.label}</h4>
                    <div className="space-y-3">
                      {[
                        { label: 'Risk Level',     value: row.score > 65 ? 'High' : row.score > 35 ? 'Medium' : 'Low', color: scoreColor(row.score) },
                        { label: 'Word Count',     value: `${row.wordCount} words`,    color: 'text-foreground'  },
                        { label: 'Trust Score',    value: `${row.trustScore}%`,         color: scoreColor(100 - row.trustScore) },
                        { label: 'Bias Level',     value: `${row.biasLevel}%`,          color: scoreColor(row.biasLevel)        },
                      ].map((field, j) => (
                        <div key={j} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{field.label}:</span>
                          <span className={`font-mono ${field.color}`}>{field.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Radar Comparison */}
              <div className="glass-card rounded-xl p-6">
                <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-4">Manipulation Profile</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={result.radarData}>
                    <PolarGrid stroke="#1A2640" />
                    <PolarAngleAxis dataKey="tactic" tick={{ fill: '#6B7A99', fontSize: 10 }} />
                    <Radar name="Text A" dataKey="textA" stroke="#FF3B5C" fill="#FF3B5C" fillOpacity={0.3} />
                    <Radar name="Text B" dataKey="textB" stroke="#00E5CC" fill="#00E5CC" fillOpacity={0.3} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} iconType="circle" />
                  </RadarChart>
                </ResponsiveContainer>
                <p className="text-xs text-center text-muted-foreground mt-3">Visual comparison across key manipulation dimensions</p>
              </div>

              {/* Winner Recommendation */}
              <div className={`glass-card rounded-xl p-6 ${result.recommended === 'B' ? 'border-primary/40' : 'border-destructive/40'}`}>
                <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-4">Professional Recommendation</h3>
                <div className="text-center py-4">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 neon-glow border-2 ${result.recommended === 'B' ? 'bg-primary/20 border-primary' : 'bg-destructive/20 border-destructive'}`}>
                    <span className={`text-3xl font-mono ${result.recommended === 'B' ? 'text-primary' : 'text-destructive'}`}>{result.recommended}</span>
                  </div>
                  <p className={`text-lg mb-2 ${result.recommended === 'B' ? 'text-primary' : 'text-destructive'}`}>Use Text {result.recommended}</p>
                  <p className="text-sm text-muted-foreground mb-4">Significantly more neutral and trustworthy</p>
                  <div className="space-y-2 text-left">
                    {[
                      `${result.difference}% less manipulative content`,
                      'Higher trust and credibility score',
                      'More appropriate for professional use',
                    ].map((point, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                        <span>{point}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="glass-card rounded-xl p-6">
                <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-4">Actions</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => handleCopyText(result.recommended === 'B' ? textB : textA, `Text ${result.recommended}`)}
                    className="w-full p-3 rounded-lg bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary transition-all text-sm flex items-center justify-center gap-2"
                  >
                    <Copy className="w-4 h-4" />
                    Copy Text {result.recommended}
                  </button>
                  <button
                    onClick={handleExport}
                    className="w-full p-3 rounded-lg bg-secondary/50 hover:bg-secondary border border-border text-foreground transition-all text-sm"
                  >
                    Export Comparison
                  </button>
                  <button
                    onClick={handleReset}
                    className="w-full p-3 rounded-lg bg-secondary/50 hover:bg-secondary border border-border text-foreground transition-all text-sm flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    New Comparison
                  </button>
                  <Link to="/" className="block w-full p-3 rounded-lg bg-secondary/50 hover:bg-secondary border border-border text-foreground transition-all text-sm text-center">
                    Back to Analyzer
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
