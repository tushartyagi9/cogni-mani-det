import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, RadarChart, PolarGrid, PolarAngleAxis, Radar } from 'recharts';
import { AlertTriangle, Shield, Activity, Sparkles, ArrowLeft, CheckCircle, AlertCircle, TrendingUp, Flame, Clock, Target, Eye, FileText, Download, Share2 } from 'lucide-react';
import { Link } from 'react-router';

const manipulationScore = 73;
const confidence = 92;
const trustScore = 32;
const biasLevel = 68;
const emotionalIntensity = 81;

const tacticData = [
  { name: 'Emotional', value: 35, color: '#FF3B5C' },
  { name: 'Urgency', value: 25, color: '#FFB347' },
  { name: 'Authority', value: 20, color: '#7C3AED' },
  { name: 'Bandwagon', value: 12, color: '#3B82F6' },
  { name: 'Other', value: 8, color: '#00E5CC' },
];

const barData = [
  { tactic: 'Emotional\nAppeal', score: 85 },
  { tactic: 'Urgency', score: 72 },
  { tactic: 'Authority', score: 68 },
  { tactic: 'Bandwagon', score: 45 },
  { tactic: 'Fear\nTrigger', score: 38 },
];

const radarData = [
  { metric: 'Emotional', value: 81 },
  { metric: 'Urgency', value: 72 },
  { metric: 'Bias', value: 68 },
  { metric: 'Sensational', value: 78 },
  { metric: 'Authority', value: 55 },
];

const suspiciousPhrases = [
  { phrase: 'BREAKING', risk: 'high', category: 'Urgency' },
  { phrase: 'EVERYONE must know', risk: 'high', category: 'Bandwagon' },
  { phrase: 'shocking truth', risk: 'high', category: 'Emotional' },
  { phrase: 'Experts reveal', risk: 'medium', category: 'Authority' },
  { phrase: 'limited time', risk: 'high', category: 'Urgency' },
  { phrase: 'you need to', risk: 'medium', category: 'Directive' },
];

const sampleText = "BREAKING: Experts reveal shocking truth about new policy that EVERYONE must know! Don't miss this critical information.";
const highlightedWords = [
  { word: 'BREAKING:', manipulative: true, level: 'high' },
  { word: 'Experts', manipulative: true, level: 'medium' },
  { word: 'reveal', manipulative: false },
  { word: 'shocking', manipulative: true, level: 'high' },
  { word: 'truth', manipulative: true, level: 'medium' },
  { word: 'about', manipulative: false },
  { word: 'new', manipulative: false },
  { word: 'policy', manipulative: false },
  { word: 'that', manipulative: false },
  { word: 'EVERYONE', manipulative: true, level: 'high' },
  { word: 'must', manipulative: true, level: 'high' },
  { word: 'know!', manipulative: true, level: 'medium' },
  { word: "Don't", manipulative: true, level: 'high' },
  { word: 'miss', manipulative: true, level: 'high' },
  { word: 'this', manipulative: false },
  { word: 'critical', manipulative: true, level: 'medium' },
  { word: 'information.', manipulative: false },
];

export function ResultsPage() {
  const riskLevel = manipulationScore > 70 ? 'High Risk' : manipulationScore > 40 ? 'Medium Risk' : 'Low Risk';
  const riskColor = manipulationScore > 70 ? 'destructive' : manipulationScore > 40 ? 'warning' : 'primary';

  const donutData = [
    { value: manipulationScore, color: manipulationScore > 70 ? '#FF3B5C' : '#FFB347' },
    { value: 100 - manipulationScore, color: '#1A2640' },
  ];

  // Determine recommended action
  const getRecommendedAction = () => {
    if (manipulationScore > 70) {
      return {
        title: 'High Manipulation Detected',
        action: 'Verify with Multiple Independent Sources',
        icon: AlertTriangle,
        color: 'destructive',
        details: [
          'Cross-reference claims with fact-checking organizations',
          'Check original source credibility and reputation',
          'Look for corroboration from unbiased sources',
          'Be aware of emotional language influencing judgment',
        ],
      };
    } else if (manipulationScore > 40) {
      return {
        title: 'Moderate Manipulation Detected',
        action: 'Review Content with Caution',
        icon: AlertCircle,
        color: 'warning',
        details: [
          'Check for additional sources confirming key claims',
          'Be mindful of persuasive language techniques',
          'Separate facts from opinions and interpretations',
        ],
      };
    } else {
      return {
        title: 'Low Manipulation Risk',
        action: 'Content Appears Reasonably Neutral',
        icon: CheckCircle,
        color: 'primary',
        details: [
          'Still verify important claims independently',
          'Consider source reputation and potential biases',
          'Use critical thinking when consuming information',
        ],
      };
    }
  };

  const recommendation = getRecommendedAction();
  const ActionIcon = recommendation.icon;

  return (
    <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-12 max-w-7xl">
      {/* Header with Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="p-2 rounded-lg glass-card hover:bg-secondary/50 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl sm:text-4xl neon-text">Analysis Report</h1>
            <p className="text-muted-foreground mt-1">Comprehensive manipulation detection results</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 rounded-lg glass-card hover:bg-secondary/50 transition-all flex items-center gap-2 text-sm">
            <Download className="w-4 h-4" />
            Export PDF
          </button>
          <button className="px-4 py-2 rounded-lg glass-card hover:bg-secondary/50 transition-all flex items-center gap-2 text-sm">
            <Share2 className="w-4 h-4" />
            Share
          </button>
        </div>
      </div>

      {/* Top Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Manipulation Score */}
        <div className="glass-card rounded-xl p-5 border-destructive/30">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider mb-3">
            <Activity className="w-3 h-3" />
            Manipulation Score
          </div>
          <div className={`text-4xl font-mono neon-text text-${riskColor} mb-1`}>
            {manipulationScore}
          </div>
          <div className="text-xs text-muted-foreground">High risk detected</div>
        </div>

        {/* Trust Score */}
        <div className="glass-card rounded-xl p-5 border-primary/30">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider mb-3">
            <Shield className="w-3 h-3" />
            Trust Score
          </div>
          <div className="text-4xl font-mono text-primary mb-1">{trustScore}</div>
          <div className="text-xs text-muted-foreground">Below threshold</div>
        </div>

        {/* Model Confidence */}
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider mb-3">
            <Target className="w-3 h-3" />
            Confidence
          </div>
          <div className="text-4xl font-mono text-primary neon-text mb-1">{confidence}%</div>
          <div className="text-xs text-muted-foreground">High accuracy</div>
        </div>

        {/* Bias Level */}
        <div className="glass-card rounded-xl p-5 border-warning/30">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider mb-3">
            <TrendingUp className="w-3 h-3" />
            Bias Level
          </div>
          <div className="text-4xl font-mono text-warning mb-1">{biasLevel}%</div>
          <div className="text-xs text-muted-foreground">Significant bias</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - Main Analysis */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recommended Action Card */}
          <div className={`glass-card rounded-xl p-6 border-${recommendation.color}/40`}>
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-full bg-${recommendation.color}/20 border-2 border-${recommendation.color} flex items-center justify-center flex-shrink-0`}>
                <ActionIcon className={`w-6 h-6 text-${recommendation.color}`} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg mb-2 flex items-center gap-2">
                  <Eye className="w-5 h-5 text-primary" />
                  Recommended Action
                </h3>
                <p className={`text-xl mb-4 text-${recommendation.color}`}>{recommendation.action}</p>
                <ul className="space-y-2">
                  {recommendation.details.map((detail, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <div className={`w-1.5 h-1.5 rounded-full bg-${recommendation.color} mt-1.5 flex-shrink-0`} />
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Why This Text Was Flagged */}
          <div className="glass-card rounded-xl p-6 border-destructive/30">
            <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-6 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              Why This Text Was Flagged
            </h3>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-destructive/20 border border-destructive flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-mono text-destructive">1</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm mb-1 text-destructive">High Emotional Manipulation (85%)</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Uses strong emotional triggers like "shocking," "must know," and fear-inducing language to bypass rational thinking
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <span className="px-2 py-1 rounded text-xs bg-destructive/20 text-destructive font-mono">
                        "shocking truth"
                      </span>
                      <span className="px-2 py-1 rounded text-xs bg-destructive/20 text-destructive font-mono">
                        "EVERYONE must know"
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-warning/10 border border-warning/30">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-warning/20 border border-warning flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-mono text-warning">2</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm mb-1 text-warning">Urgency Pressure Tactics (72%)</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Creates artificial time pressure with "BREAKING" and "Don't miss" to force immediate action without verification
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <span className="px-2 py-1 rounded text-xs bg-warning/20 text-warning font-mono">
                        "BREAKING"
                      </span>
                      <span className="px-2 py-1 rounded text-xs bg-warning/20 text-warning font-mono">
                        "Don't miss"
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-warning/10 border border-warning/30">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-warning/20 border border-warning flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-mono text-warning">3</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm mb-1 text-warning">Authority Exploitation (68%)</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Leverages vague "Experts" without specific citations or verifiable credentials to appear authoritative
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <span className="px-2 py-1 rounded text-xs bg-warning/20 text-warning font-mono">
                        "Experts reveal"
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-chart-5/10 border border-chart-5/30">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-chart-5/20 border border-chart-5 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-mono text-chart-5">4</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm mb-1 text-chart-5">Bandwagon Effect (45%)</h4>
                    <p className="text-sm text-muted-foreground">
                      Implies universal acceptance with "EVERYONE" to create peer pressure and conformity
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Source Credibility Assessment */}
          <div className="glass-card rounded-xl p-6">
            <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-6 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Source Credibility Assessment
            </h3>
            
            <div className="grid sm:grid-cols-2 gap-6 mb-6">
              {/* Overall Source Score */}
              <div className="p-4 rounded-lg bg-secondary/30 border border-border">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
                  Overall Credibility Score
                </div>
                <div className="flex items-center gap-4">
                  <div className="relative w-20 h-20">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { value: trustScore, color: '#FFB347' },
                            { value: 100 - trustScore, color: '#1A2640' },
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={25}
                          outerRadius={35}
                          startAngle={90}
                          endAngle={-270}
                          dataKey="value"
                        >
                          {[trustScore, 100 - trustScore].map((_, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={index === 0 ? '#FFB347' : '#1A2640'}
                              stroke="none"
                            />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-lg font-mono text-warning">{trustScore}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-warning text-lg font-mono mb-1">Questionable</div>
                    <p className="text-xs text-muted-foreground">Below reliability threshold</p>
                  </div>
                </div>
              </div>

              {/* Domain Trust Rating */}
              <div className="p-4 rounded-lg bg-secondary/30 border border-border">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
                  Domain Trust Rating
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Domain age:</span>
                    <span className="font-mono">2.3 years</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Trust score:</span>
                    <span className="text-warning font-mono">Medium</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">SSL verified:</span>
                    <span className="text-primary font-mono">Yes</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Credibility Indicators */}
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/20">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-destructive" />
                  <span className="text-sm">Cited sources</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">0 verifiable</span>
                  <span className="text-destructive text-sm font-mono">Low</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/20">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-warning" />
                  <span className="text-sm">Author credentials</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">No bio available</span>
                  <span className="text-warning text-sm font-mono">Unknown</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/20">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-warning" />
                  <span className="text-sm">Fact-check history</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">3 disputed claims</span>
                  <span className="text-warning text-sm font-mono">Caution</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/20">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-warning" />
                  <span className="text-sm">Editorial standards</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Not disclosed</span>
                  <span className="text-warning text-sm font-mono">Unknown</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/20">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-chart-5" />
                  <span className="text-sm">Independent verification</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">1 source found</span>
                  <span className="text-chart-5 text-sm font-mono">Partial</span>
                </div>
              </div>
            </div>

            {/* Warning Banner */}
            <div className="mt-6 p-4 rounded-lg bg-destructive/10 border border-destructive/30">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-destructive mb-1">Low Credibility Warning</p>
                  <p className="text-xs text-muted-foreground">
                    This source has limited verifiable credentials and shows patterns of sensationalized reporting. Cross-reference with established fact-checking organizations.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Trust & Credibility Panel */}
          <div className="glass-card rounded-xl p-6">
            <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-6 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Trust & Credibility Assessment
            </h3>
            
            <div className="grid sm:grid-cols-3 gap-6 mb-6">
              {/* Bias Indicator */}
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  Bias Indicator
                </div>
                <div className="relative h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { value: biasLevel, color: '#FFB347' },
                          { value: 100 - biasLevel, color: '#1A2640' },
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={30}
                        outerRadius={45}
                        startAngle={90}
                        endAngle={-270}
                        dataKey="value"
                      >
                        {[biasLevel, 100 - biasLevel].map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={index === 0 ? '#FFB347' : '#1A2640'}
                            stroke="none"
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-2xl font-mono text-warning">{biasLevel}%</div>
                  </div>
                </div>
                <p className="text-xs text-center text-muted-foreground mt-2">
                  Strong political/ideological bias
                </p>
              </div>

              {/* Emotional Intensity */}
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  Emotional Intensity
                </div>
                <div className="relative h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { value: emotionalIntensity, color: '#FF3B5C' },
                          { value: 100 - emotionalIntensity, color: '#1A2640' },
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={30}
                        outerRadius={45}
                        startAngle={90}
                        endAngle={-270}
                        dataKey="value"
                      >
                        {[emotionalIntensity, 100 - emotionalIntensity].map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={index === 0 ? '#FF3B5C' : '#1A2640'}
                            stroke="none"
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-2xl font-mono text-destructive">{emotionalIntensity}%</div>
                  </div>
                </div>
                <p className="text-xs text-center text-muted-foreground mt-2">
                  Heavy emotional language
                </p>
              </div>

              {/* Credibility Signals */}
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  Credibility Signals
                </div>
                <div className="space-y-2 mt-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Sources cited</span>
                    <span className="text-destructive">Low</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Author expertise</span>
                    <span className="text-warning">Unknown</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Fact-checkable</span>
                    <span className="text-warning">Partial</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Domain trust</span>
                    <span className="text-warning">Medium</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Urgency & Pressure Indicators */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                <div className="flex items-center gap-3 mb-3">
                  <Flame className="w-5 h-5 text-destructive" />
                  <div>
                    <div className="text-sm text-muted-foreground">Urgency Pressure</div>
                    <div className="text-2xl font-mono text-destructive">High</div>
                  </div>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full w-[85%] bg-gradient-to-r from-warning to-destructive" />
                </div>
              </div>

              <div className="p-4 rounded-lg bg-warning/10 border border-warning/30">
                <div className="flex items-center gap-3 mb-3">
                  <Clock className="w-5 h-5 text-warning" />
                  <div>
                    <div className="text-sm text-muted-foreground">Time Pressure</div>
                    <div className="text-2xl font-mono text-warning">Medium</div>
                  </div>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full w-[62%] bg-gradient-to-r from-primary to-warning" />
                </div>
              </div>
            </div>
          </div>

          {/* Top Suspicious Phrases */}
          <div className="glass-card rounded-xl p-6">
            <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
              <Target className="w-4 h-4" />
              Top Suspicious Phrases
            </h3>
            <div className="space-y-3">
              {suspiciousPhrases.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border hover:border-primary/30 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        item.risk === 'high' ? 'bg-destructive' : 'bg-warning'
                      }`}
                    />
                    <span className="font-mono text-sm">"{item.phrase}"</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{item.category}</span>
                    <span
                      className={`px-2 py-1 rounded-full text-xs border font-mono ${
                        item.risk === 'high'
                          ? 'bg-destructive/20 text-destructive border-destructive/40'
                          : 'bg-warning/20 text-warning border-warning/40'
                      }`}
                    >
                      {item.risk}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Word-Level Heatmap */}
          <div className="glass-card rounded-xl p-6">
            <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Word-Level Manipulation Heatmap
            </h3>
            <div className="p-5 bg-secondary/30 rounded-lg border border-border">
              <div className="flex flex-wrap gap-2 leading-relaxed text-base">
                {highlightedWords.map((item, i) => (
                  <span
                    key={i}
                    className={`px-1.5 py-0.5 rounded transition-all ${
                      item.manipulative
                        ? item.level === 'high'
                          ? 'bg-destructive/30 text-destructive border border-destructive/50 neon-glow'
                          : item.level === 'medium'
                          ? 'bg-warning/30 text-warning border border-warning/50'
                          : 'bg-chart-5/30 text-chart-5 border border-chart-5/50'
                        : 'text-foreground'
                    }`}
                  >
                    {item.word}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-6 mt-4 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-destructive/30 border border-destructive/50 rounded" />
                <span className="text-muted-foreground">High Manipulation</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-warning/30 border border-warning/50 rounded" />
                <span className="text-muted-foreground">Medium</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-chart-5/30 border border-chart-5/50 rounded" />
                <span className="text-muted-foreground">Low</span>
              </div>
            </div>
          </div>

          {/* Neutral Rewrite Panel */}
          <div className="glass-card rounded-xl p-6">
            <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              AI Neutral Rewrite
            </h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-destructive uppercase tracking-wider">
                    Original (Manipulative)
                  </span>
                  <span className="text-xs font-mono text-destructive">Risk: 73%</span>
                </div>
                <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-sm leading-relaxed min-h-[120px]">
                  {sampleText}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-primary uppercase tracking-wider">
                    Neutral Version
                  </span>
                  <span className="text-xs font-mono text-primary">Risk: 12%</span>
                </div>
                <div className="p-4 bg-primary/10 border border-primary/30 rounded-lg text-sm leading-relaxed min-h-[120px]">
                  Experts have published findings about a new policy. Additional information is
                  available for those interested in learning more about this topic.
                </div>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button className="px-4 py-2 rounded-lg bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary transition-all text-sm flex items-center gap-2">
                <Download className="w-4 h-4" />
                Copy Neutral Version
              </button>
            </div>
          </div>
        </div>

        {/* Right Column - Charts & Visualizations */}
        <div className="space-y-6">
          {/* Manipulation Gauge */}
          <div className="glass-card rounded-xl p-6">
            <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-4">
              Overall Risk Gauge
            </h3>
            <div className="relative">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    startAngle={90}
                    endAngle={-270}
                    dataKey="value"
                  >
                    {donutData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className={`text-5xl font-mono neon-text text-${riskColor}`}>
                    {manipulationScore}
                  </div>
                  <div className="text-sm text-muted-foreground">/ 100</div>
                </div>
              </div>
            </div>
            <div className="mt-4 text-center">
              <div className={`text-lg font-mono text-${riskColor} mb-1`}>{riskLevel}</div>
              <p className="text-xs text-muted-foreground">
                Based on {tacticData.length} manipulation techniques
              </p>
            </div>
          </div>

          {/* Tactic Distribution */}
          <div className="glass-card rounded-xl p-6">
            <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-4">
              Tactic Distribution
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={tacticData}
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  dataKey="value"
                  label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {tacticData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-2">
              {tacticData.map((tactic, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: tactic.color }}
                    />
                    <span>{tactic.name}</span>
                  </div>
                  <span className="font-mono text-muted-foreground">{tactic.value}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Radar Chart */}
          <div className="glass-card rounded-xl p-6">
            <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-4">
              Manipulation Profile
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#1A2640" />
                <PolarAngleAxis
                  dataKey="metric"
                  tick={{ fill: '#6B7A99', fontSize: 11 }}
                />
                <Radar
                  dataKey="value"
                  stroke="#00E5CC"
                  fill="#00E5CC"
                  fillOpacity={0.4}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Severity Bar Chart */}
          <div className="glass-card rounded-xl p-6">
            <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-4">
              Severity by Tactic
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={barData} layout="horizontal">
                <XAxis type="number" domain={[0, 100]} stroke="#6B7A99" fontSize={10} />
                <YAxis type="category" dataKey="tactic" stroke="#6B7A99" fontSize={10} width={60} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(13, 21, 37, 0.95)',
                    border: '1px solid rgba(0, 229, 204, 0.2)',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="score" fill="#00E5CC" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Quick Actions */}
          <div className="glass-card rounded-xl p-6">
            <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-4">
              Actions
            </h3>
            <div className="space-y-2">
              <Link
                to="/"
                className="block w-full p-3 rounded-lg bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary transition-all text-sm text-center"
              >
                Analyze New Content
              </Link>
              <Link
                to="/compare"
                className="block w-full p-3 rounded-lg bg-secondary/50 hover:bg-secondary border border-border text-foreground transition-all text-sm text-center"
              >
                Compare with Another
              </Link>
              <button className="w-full p-3 rounded-lg bg-secondary/50 hover:bg-secondary border border-border text-foreground transition-all text-sm">
                Save to History
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}