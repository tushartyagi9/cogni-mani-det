import { useState } from 'react';
import { ArrowLeft, Zap, TrendingUp, AlertTriangle, Copy, FileText } from 'lucide-react';
import { Link } from 'react-router';
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

const radarData = [
  { tactic: 'Emotional\nAppeal', textA: 85, textB: 42 },
  { tactic: 'Urgency', textA: 72, textB: 28 },
  { tactic: 'Authority', textA: 68, textB: 55 },
  { tactic: 'Bandwagon', textA: 45, textB: 30 },
  { tactic: 'False\nDichotomy', textA: 38, textB: 15 },
];

const comparisonData = [
  { category: 'Emotional', textA: 85, textB: 42 },
  { category: 'Urgency', textA: 72, textB: 28 },
  { category: 'Authority', textA: 68, textB: 55 },
  { category: 'Bandwagon', textA: 45, textB: 30 },
  { category: 'Bias', textA: 78, textB: 35 },
];

export function ComparePage() {
  const [textA, setTextA] = useState(
    "BREAKING: Experts reveal shocking truth about new policy that EVERYONE must know! Don't miss this critical information that could change everything!"
  );
  const [textB, setTextB] = useState(
    'Researchers have published findings about a new policy. The study is available for review and provides detailed analysis of the proposed changes.'
  );
  const [analyzed, setAnalyzed] = useState(true);

  const scoreA = 78;
  const scoreB = 24;
  const difference = scoreA - scoreB;

  const handleAnalyze = () => {
    setAnalyzed(true);
  };

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
              {analyzed && (
                <p className="text-xs text-muted-foreground mt-1">High risk content</p>
              )}
            </div>
            {analyzed && (
              <div className="text-right">
                <div className="text-xs text-muted-foreground mb-1">Risk Score</div>
                <div className="text-3xl font-mono text-destructive neon-text">{scoreA}</div>
              </div>
            )}
          </div>
          <textarea
            value={textA}
            onChange={(e) => setTextA(e.target.value)}
            placeholder="Enter first text to analyze..."
            className="w-full min-h-[180px] bg-input-background border border-input rounded-lg p-4 
                     text-foreground placeholder:text-muted-foreground resize-y
                     focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                     transition-all mb-4"
          />
          {analyzed && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Words:</span>
                <span className="font-mono">{textA.split(/\s+/).filter(w => w).length}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { name: 'Emotional', color: 'bg-destructive/20 text-destructive border-destructive/40' },
                  { name: 'Urgency', color: 'bg-destructive/20 text-destructive border-destructive/40' },
                  { name: 'Absolute', color: 'bg-warning/20 text-warning border-warning/40' },
                  { name: 'Sensational', color: 'bg-destructive/20 text-destructive border-destructive/40' },
                ].map((tag, i) => (
                  <span
                    key={i}
                    className={`px-2 py-1 rounded-full text-xs border ${tag.color} font-mono`}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
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
              {analyzed && (
                <p className="text-xs text-muted-foreground mt-1">Low risk content</p>
              )}
            </div>
            {analyzed && (
              <div className="text-right">
                <div className="text-xs text-muted-foreground mb-1">Risk Score</div>
                <div className="text-3xl font-mono text-primary neon-text">{scoreB}</div>
              </div>
            )}
          </div>
          <textarea
            value={textB}
            onChange={(e) => setTextB(e.target.value)}
            placeholder="Enter second text to compare..."
            className="w-full min-h-[180px] bg-input-background border border-input rounded-lg p-4 
                     text-foreground placeholder:text-muted-foreground resize-y
                     focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                     transition-all mb-4"
          />
          {analyzed && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Words:</span>
                <span className="font-mono">{textB.split(/\s+/).filter(w => w).length}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { name: 'Authority', color: 'bg-warning/20 text-warning border-warning/40' },
                  { name: 'Factual', color: 'bg-primary/20 text-primary border-primary/40' },
                ].map((tag, i) => (
                  <span
                    key={i}
                    className={`px-2 py-1 rounded-full text-xs border ${tag.color} font-mono`}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Analyze Button */}
      {!analyzed && (
        <div className="flex justify-center mb-8">
          <button
            onClick={handleAnalyze}
            className="px-8 py-3 rounded-lg bg-primary text-primary-foreground 
                     hover:bg-primary/90 transition-all neon-glow flex items-center gap-2"
          >
            <Zap className="w-5 h-5" />
            Compare Both Texts
          </button>
        </div>
      )}

      {/* Results Section */}
      {analyzed && (
        <>
          {/* Comparison Summary */}
          <div className="glass-card rounded-xl p-6 mb-6">
            <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-6 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Comparison Summary
            </h3>
            
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center p-4 rounded-lg bg-secondary/30 border border-border">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  Risk Difference
                </div>
                <div className="text-4xl font-mono text-destructive neon-text mb-2">
                  {difference}%
                </div>
                <p className="text-xs text-muted-foreground">
                  Text A is more manipulative
                </p>
              </div>

              <div className="text-center p-4 rounded-lg bg-secondary/30 border border-border">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  Recommended Choice
                </div>
                <div className="text-4xl font-mono text-primary neon-text mb-2">
                  B
                </div>
                <p className="text-xs text-muted-foreground">
                  Significantly more neutral
                </p>
              </div>

              <div className="text-center p-4 rounded-lg bg-secondary/30 border border-border">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  Confidence
                </div>
                <div className="text-4xl font-mono text-primary neon-text mb-2">
                  94%
                </div>
                <p className="text-xs text-muted-foreground">
                  High analysis accuracy
                </p>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Left Column - Detailed Comparison */}
            <div className="lg:col-span-2 space-y-6">
              {/* Score Comparison */}
              <div className="glass-card rounded-xl p-6">
                <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-6">
                  Overall Manipulation Score
                </h3>
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-destructive font-mono">Text A</span>
                      <span className="text-2xl font-mono text-destructive">{scoreA}%</span>
                    </div>
                    <div className="h-4 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-warning to-destructive neon-glow transition-all"
                        style={{ width: `${scoreA}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      High risk - Multiple manipulation techniques detected
                    </p>
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-primary font-mono">Text B</span>
                      <span className="text-2xl font-mono text-primary">{scoreB}%</span>
                    </div>
                    <div className="h-4 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary to-chart-2 neon-glow transition-all"
                        style={{ width: `${scoreB}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Low risk - Minimal manipulative content
                    </p>
                  </div>
                </div>

                <div className="mt-6 p-4 rounded-lg bg-warning/10 border border-warning/30">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm mb-1">
                        Text A shows <span className="text-destructive font-mono">{difference}% higher</span> manipulation than Text B
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Consider using Text B for more neutral communication
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Category-by-Category Comparison */}
              <div className="glass-card rounded-xl p-6">
                <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-6">
                  Category Breakdown
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={comparisonData} layout="vertical">
                    <XAxis type="number" domain={[0, 100]} stroke="#6B7A99" fontSize={12} />
                    <YAxis type="category" dataKey="category" stroke="#6B7A99" fontSize={12} width={80} />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(13, 21, 37, 0.95)',
                        border: '1px solid rgba(0, 229, 204, 0.2)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="textA" fill="#FF3B5C" radius={[0, 4, 4, 0]} name="Text A" />
                    <Bar dataKey="textB" fill="#00E5CC" radius={[0, 4, 4, 0]} name="Text B" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Tactic-by-Tactic Comparison */}
              <div className="glass-card rounded-xl p-6">
                <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-6">
                  Detailed Tactic Analysis
                </h3>
                <div className="space-y-4">
                  {[
                    { name: 'Emotional Appeal', a: 85, b: 42, desc: 'Heavy emotional language in Text A' },
                    { name: 'Urgency Trigger', a: 72, b: 28, desc: 'Strong urgency pressure in Text A' },
                    { name: 'Authority Claim', a: 68, b: 55, desc: 'Both texts use authority references' },
                    { name: 'Bandwagon Effect', a: 45, b: 30, desc: 'Moderate in both texts' },
                    { name: 'Sensationalism', a: 78, b: 15, desc: 'Highly sensationalized in Text A' },
                  ].map((tactic, i) => (
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
                          <div
                            className="h-full bg-destructive"
                            style={{ width: `${tactic.a}%` }}
                          />
                        </div>
                        <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${tactic.b}%` }}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{tactic.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Side-by-side Details */}
              <div className="grid sm:grid-cols-2 gap-6">
                <div className="glass-card rounded-xl p-6 border-destructive/30">
                  <h4 className="text-sm uppercase tracking-wider text-destructive mb-4">
                    Text A Details
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Risk Level:</span>
                      <span className="text-destructive font-mono">High</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Techniques:</span>
                      <span className="font-mono">8 detected</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Trust Score:</span>
                      <span className="text-destructive font-mono">28%</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Primary Tactic:</span>
                      <span className="text-destructive text-xs">Emotional Appeal</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Bias Level:</span>
                      <span className="text-warning font-mono">72%</span>
                    </div>
                  </div>
                </div>

                <div className="glass-card rounded-xl p-6 border-primary/30">
                  <h4 className="text-sm uppercase tracking-wider text-primary mb-4">
                    Text B Details
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Risk Level:</span>
                      <span className="text-primary font-mono">Low</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Techniques:</span>
                      <span className="font-mono">2 detected</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Trust Score:</span>
                      <span className="text-primary font-mono">76%</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Primary Tactic:</span>
                      <span className="text-warning text-xs">Authority Claim</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Bias Level:</span>
                      <span className="text-primary font-mono">22%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Visual Comparisons */}
            <div className="space-y-6">
              {/* Radar Comparison */}
              <div className="glass-card rounded-xl p-6">
                <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-4">
                  Manipulation Profile
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#1A2640" />
                    <PolarAngleAxis
                      dataKey="tactic"
                      tick={{ fill: '#6B7A99', fontSize: 10 }}
                    />
                    <Radar
                      name="Text A"
                      dataKey="textA"
                      stroke="#FF3B5C"
                      fill="#FF3B5C"
                      fillOpacity={0.3}
                    />
                    <Radar
                      name="Text B"
                      dataKey="textB"
                      stroke="#00E5CC"
                      fill="#00E5CC"
                      fillOpacity={0.3}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: '11px' }}
                      iconType="circle"
                    />
                  </RadarChart>
                </ResponsiveContainer>
                <p className="text-xs text-center text-muted-foreground mt-3">
                  Visual comparison across key manipulation dimensions
                </p>
              </div>

              {/* Winner Recommendation */}
              <div className="glass-card rounded-xl p-6 border-primary/40">
                <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-4">
                  Professional Recommendation
                </h3>
                <div className="text-center py-4">
                  <div className="w-16 h-16 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center mx-auto mb-4 neon-glow">
                    <span className="text-3xl font-mono text-primary">B</span>
                  </div>
                  <p className="text-lg mb-2 text-primary">Use Text B</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Significantly more neutral and trustworthy
                  </p>
                  <div className="space-y-2 text-left">
                    <div className="flex items-start gap-2 text-xs text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                      <span>{difference}% less manipulative content</span>
                    </div>
                    <div className="flex items-start gap-2 text-xs text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                      <span>Higher trust and credibility score</span>
                    </div>
                    <div className="flex items-start gap-2 text-xs text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                      <span>More appropriate for professional use</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="glass-card rounded-xl p-6">
                <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-4">
                  Actions
                </h3>
                <div className="space-y-2">
                  <button className="w-full p-3 rounded-lg bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary transition-all text-sm flex items-center justify-center gap-2">
                    <Copy className="w-4 h-4" />
                    Copy Text B
                  </button>
                  <button className="w-full p-3 rounded-lg bg-secondary/50 hover:bg-secondary border border-border text-foreground transition-all text-sm">
                    Export Comparison
                  </button>
                  <button
                    onClick={() => setAnalyzed(false)}
                    className="w-full p-3 rounded-lg bg-secondary/50 hover:bg-secondary border border-border text-foreground transition-all text-sm"
                  >
                    New Comparison
                  </button>
                  <Link
                    to="/"
                    className="block w-full p-3 rounded-lg bg-secondary/50 hover:bg-secondary border border-border text-foreground transition-all text-sm text-center"
                  >
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