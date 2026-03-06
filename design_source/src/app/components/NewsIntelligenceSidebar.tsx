import { TrendingUp, Target, Clock, AlertCircle } from 'lucide-react';

export function NewsIntelligenceSidebar() {
  const trendingTactics = [
    { name: 'Emotional Appeal', trend: '+12%', count: 423, severity: 'high' },
    { name: 'Urgency Triggers', trend: '+8%', count: 389, severity: 'high' },
    { name: 'Authority Claims', trend: '+5%', count: 312, severity: 'medium' },
    { name: 'Bandwagon', trend: '-3%', count: 289, severity: 'medium' },
  ];

  const recentAnalysis = [
    { title: 'Election Coverage Analysis', source: 'Political News', score: 82, time: '2h ago' },
    { title: 'Product Launch Email', source: 'Marketing', score: 67, time: '4h ago' },
    { title: 'Social Media Campaign', source: 'Platform X', score: 45, time: '6h ago' },
  ];

  const commonPatterns = [
    { pattern: 'BREAKING + urgency word', frequency: 847 },
    { pattern: 'Absolute claims (ONLY, NEVER)', frequency: 623 },
    { pattern: 'Question headlines', frequency: 512 },
    { pattern: 'Expert authority appeal', frequency: 489 },
  ];

  return (
    <div className="space-y-6">
      {/* Live Statistics */}
      <div className="glass-card rounded-xl p-6 sticky top-24">
        <h3 className="flex items-center gap-2 mb-6 text-lg">
          <TrendingUp className="w-5 h-5 text-primary" />
          News Intelligence
        </h3>

        {/* Trending Tactics */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground uppercase tracking-wider">
              Trending Tactics
            </span>
            <span className="text-xs text-muted-foreground">Last 24h</span>
          </div>
          <div className="space-y-2">
            {trendingTactics.map((tactic, i) => (
              <div
                key={i}
                className="p-3 rounded-lg bg-secondary/30 border border-border hover:border-primary/30 transition-all"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm">{tactic.name}</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-mono ${
                        tactic.trend.startsWith('+') ? 'text-destructive' : 'text-primary'
                      }`}
                    >
                      {tactic.trend}
                    </span>
                    <span
                      className={`w-2 h-2 rounded-full ${
                        tactic.severity === 'high'
                          ? 'bg-destructive neon-glow'
                          : 'bg-warning'
                      }`}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Detected</span>
                  <span className="text-xs font-mono text-muted-foreground">
                    {tactic.count} times
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Analysis */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground uppercase tracking-wider">
              Recent Analysis
            </span>
          </div>
          <div className="space-y-2">
            {recentAnalysis.map((item, i) => (
              <div
                key={i}
                className="p-3 rounded-lg bg-secondary/20 hover:bg-secondary/30 border border-border/50 hover:border-primary/30 transition-all cursor-pointer"
              >
                <p className="text-sm mb-1 leading-tight">{item.title}</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{item.source}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{item.time}</span>
                    <span
                      className={`font-mono ${
                        item.score > 70
                          ? 'text-destructive'
                          : item.score > 40
                          ? 'text-warning'
                          : 'text-primary'
                      }`}
                    >
                      {item.score}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Common Patterns */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground uppercase tracking-wider">
              Common Patterns
            </span>
          </div>
          <div className="space-y-2">
            {commonPatterns.map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-2 rounded bg-secondary/20"
              >
                <span className="text-sm">{item.pattern}</span>
                <span className="text-xs font-mono text-primary">{item.frequency}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Alert */}
        <div className="mt-6 p-4 rounded-lg bg-warning/10 border border-warning/30">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-warning mb-1">Increased Activity</p>
              <p className="text-xs text-muted-foreground">
                Emotional manipulation detected in 34% more articles this week
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
