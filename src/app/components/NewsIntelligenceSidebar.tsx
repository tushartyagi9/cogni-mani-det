import { TrendingUp, Target, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { useState, useCallback } from 'react';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Mock data source – replace fetchIntelligenceData() with a real API call
// ---------------------------------------------------------------------------

interface TrendingTactic { name: string; trend: string; count: number; severity: 'high' | 'medium' }
interface RecentItem     { title: string; source: string; score: number; time: string }
interface PatternItem    { pattern: string; frequency: number }

interface IntelligenceData {
  tactics:  TrendingTactic[];
  recent:   RecentItem[];
  patterns: PatternItem[];
  alert:    string;
}

function generateIntelligenceData(): IntelligenceData {
  // Slightly randomise counts on each refresh to simulate live updates
  const jitter = (base: number, spread = 20) =>
    base + Math.floor((Math.random() - 0.5) * spread);

  return {
    tactics: [
      { name: 'Emotional Appeal',  trend: `+${jitter(12, 4)}%`, count: jitter(423, 30), severity: 'high'   },
      { name: 'Urgency Triggers',  trend: `+${jitter(8,  3)}%`, count: jitter(389, 25), severity: 'high'   },
      { name: 'Authority Claims',  trend: `+${jitter(5,  2)}%`, count: jitter(312, 20), severity: 'medium' },
      { name: 'Bandwagon Effect',  trend: `-${jitter(3,  1)}%`, count: jitter(289, 15), severity: 'medium' },
    ],
    recent: [
      { title: 'Election Coverage Analysis', source: 'Political News', score: jitter(82, 5), time: '2h ago' },
      { title: 'Product Launch Email',        source: 'Marketing',      score: jitter(67, 6), time: '4h ago' },
      { title: 'Social Media Campaign',       source: 'Platform X',     score: jitter(45, 8), time: '6h ago' },
    ],
    patterns: [
      { pattern: 'BREAKING + urgency word',    frequency: jitter(847, 40) },
      { pattern: 'Absolute claims (ONLY, NEVER)', frequency: jitter(623, 30) },
      { pattern: 'Question headlines',         frequency: jitter(512, 25) },
      { pattern: 'Expert authority appeal',    frequency: jitter(489, 20) },
    ],
    alert: `Emotional manipulation detected in ${jitter(34, 4)}% more articles this week`,
  };
}

// ---------------------------------------------------------------------------

export function NewsIntelligenceSidebar() {
  const [data, setData]         = useState<IntelligenceData>(generateIntelligenceData);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    // Simulates an API call – replace with: const fresh = await fetchIntelligenceData()
    await new Promise(r => setTimeout(r, 800));
    setData(generateIntelligenceData());
    setRefreshing(false);
    toast.success('Intelligence data refreshed');
  }, []);

  const scoreColor = (score: number) =>
    score > 70 ? 'text-destructive' : score > 40 ? 'text-warning' : 'text-primary';

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-xl p-6 sticky top-24">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="flex items-center gap-2 text-lg">
            <TrendingUp className="w-5 h-5 text-primary" />
            News Intelligence
          </h3>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all disabled:opacity-50"
            title="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Trending Tactics */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground uppercase tracking-wider">Trending Tactics</span>
            <span className="text-xs text-muted-foreground">Last 24h</span>
          </div>
          <div className="space-y-2">
            {data.tactics.map((tactic, i) => (
              <div key={i} className="p-3 rounded-lg bg-secondary/30 border border-border hover:border-primary/30 transition-all">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm">{tactic.name}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono ${tactic.trend.startsWith('+') ? 'text-destructive' : 'text-primary'}`}>
                      {tactic.trend}
                    </span>
                    <span className={`w-2 h-2 rounded-full ${tactic.severity === 'high' ? 'bg-destructive neon-glow' : 'bg-warning'}`} />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Detected</span>
                  <span className="text-xs font-mono text-muted-foreground">{tactic.count.toLocaleString()} times</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Analysis */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground uppercase tracking-wider">Recent Analysis</span>
          </div>
          <div className="space-y-2">
            {data.recent.map((item, i) => (
              <div key={i} className="p-3 rounded-lg bg-secondary/20 hover:bg-secondary/30 border border-border/50 hover:border-primary/30 transition-all cursor-pointer">
                <p className="text-sm mb-1 leading-tight">{item.title}</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{item.source}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{item.time}</span>
                    <span className={`font-mono ${scoreColor(item.score)}`}>{item.score}%</span>
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
            <span className="text-sm text-muted-foreground uppercase tracking-wider">Common Patterns</span>
          </div>
          <div className="space-y-2">
            {data.patterns.map((item, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded bg-secondary/20">
                <span className="text-sm">{item.pattern}</span>
                <span className="text-xs font-mono text-primary">{item.frequency.toLocaleString()}</span>
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
              <p className="text-xs text-muted-foreground">{data.alert}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
