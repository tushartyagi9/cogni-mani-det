import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip,
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
} from 'recharts';
import {
  AlertTriangle, Shield, Activity, Sparkles, ArrowLeft,
  CheckCircle, AlertCircle, TrendingUp, Flame, Clock,
  Target, Eye, FileText, Download, Share2, BookmarkPlus,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useAppContext } from '../../context/AppContext';

const TACTIC_COLORS: Record<string, string> = {
  Emotional:  '#FF3B5C',
  Urgency:    '#FFB347',
  Authority:  '#7C3AED',
  Bandwagon:  '#3B82F6',
  Other:      '#00E5CC',
};

export function ResultsPage() {
  const navigate = useNavigate();
  const { currentResult, addToHistory } = useAppContext();

  // -----------------------------------------------------------------------
  // Empty state – no analysis result in context
  // -----------------------------------------------------------------------
  if (!currentResult) {
    return (
      <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-12 max-w-7xl">
        <div className="flex items-center gap-4 mb-8">
          <Link to="/" className="p-2 rounded-lg glass-card hover:bg-secondary/50 transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl sm:text-4xl neon-text">Analysis Report</h1>
            <p className="text-muted-foreground mt-1">Comprehensive manipulation detection results</p>
          </div>
        </div>
        <div className="glass-card rounded-xl p-12 text-center max-w-lg mx-auto">
          <Activity className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-40" />
          <h3 className="text-xl mb-3">No Analysis Yet</h3>
          <p className="text-muted-foreground text-sm mb-6">
            Submit text, a URL, or a file on the Analyzer page to see results here.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all neon-glow"
          >
            Start Analyzing
          </Link>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Destructure result
  // -----------------------------------------------------------------------
  const {
    manipulationScore, trustScore, confidence, biasLevel,
    emotionalIntensity, urgencyScore, riskLevel, tactics,
    radarData, barData, suspiciousPhrases, highlightedWords,
    neutralRewrite, inputText, source, mode, emailLabel, emailRiskLevel,
    emailRecommendedAction, emailManipulationDescription,
    cognitiveBiasExploited, manipulationTactic,
  } = currentResult;

  type DisplayRiskLevel = 'low' | 'medium' | 'high' | 'critical';
  const isEmailMode = mode === 'email';
  const emailDisplayRisk: DisplayRiskLevel = (emailRiskLevel as DisplayRiskLevel | undefined) ?? (
    manipulationScore <= 30 ? 'low'
      : manipulationScore <= 50 ? 'medium'
        : manipulationScore <= 75 ? 'high'
          : 'critical'
  );
  const displayRiskLevel: DisplayRiskLevel = isEmailMode
    ? emailDisplayRisk
    : (riskLevel as DisplayRiskLevel);

  const riskColor =
    displayRiskLevel === 'critical'
      ? 'destructive'
      : displayRiskLevel === 'high'
        ? (isEmailMode ? 'warning' : 'destructive')
        : displayRiskLevel === 'medium'
          ? 'warning'
          : 'primary';

  const donutData = [
    {
      value: manipulationScore,
      color:
        displayRiskLevel === 'critical'
          ? '#FF3B5C'
          : displayRiskLevel === 'high'
            ? (isEmailMode ? '#FFB347' : '#FF3B5C')
            : displayRiskLevel === 'medium'
              ? (isEmailMode ? '#FACC15' : '#FFB347')
              : '#00E5CC',
    },
    { value: 100 - manipulationScore, color: '#1A2640' },
  ];

  const riskLabel =
    displayRiskLevel === 'critical'
      ? 'Critical Risk'
      : displayRiskLevel === 'high'
        ? 'High Risk'
        : displayRiskLevel === 'medium'
          ? 'Medium Risk'
          : 'Low Risk';
  const emailMediumRiskTextStyle = isEmailMode && displayRiskLevel === 'medium'
    ? { color: '#FACC15' }
    : undefined;

  const emailBadge = isEmailMode && emailLabel
    ? ({
        legitimate: {
          label: '✓ Legitimate Email',
          className: 'bg-primary/20 text-primary border-primary/40',
        },
        mild_influence: {
          label: '💡 Mild Influence',
          className: 'bg-blue-500/20 text-blue-300 border-blue-400/40',
        },
        fear_induction: {
          label: '⚠️ Fear Induction',
          className: 'bg-yellow-500/20 text-yellow-300 border-yellow-400/40',
        },
        urgency_manipulation: {
          label: '⏰ Urgency Manipulation',
          className: 'bg-warning/20 text-warning border-warning/40',
        },
        authority_exploitation: {
          label: '🎭 Authority Exploitation',
          className: 'bg-orange-500/20 text-orange-300 border-orange-400/40',
        },
        financial_manipulation: {
          label: '💰 Financial Manipulation',
          className: 'bg-destructive/20 text-destructive border-destructive/40',
        },
        identity_deception: {
          label: '☠️ Identity Deception',
          className: 'bg-purple-500/20 text-purple-300 border-purple-400/40',
        },
      } as const)[emailLabel]
    : null;

  const emailActionClass =
    displayRiskLevel === 'critical'
      ? 'bg-destructive/10 border-destructive/40 text-destructive'
      : displayRiskLevel === 'high'
        ? 'bg-warning/10 border-warning/40 text-warning'
        : displayRiskLevel === 'medium'
          ? 'bg-yellow-500/10 border-yellow-400/40 text-yellow-300'
          : 'bg-primary/10 border-primary/40 text-primary';

  // -----------------------------------------------------------------------
  // Recommended action based on score
  // -----------------------------------------------------------------------
  const recommendation = (() => {
    if (displayRiskLevel === 'critical') return {
      action: 'Critical Alert — Do Not Engage',
      icon: AlertTriangle,
      color: 'destructive',
      details: [
        'Do not click links or download attachments',
        'Do not share passwords, OTPs, or payment details',
        'Report and delete this content immediately',
        'Verify directly with the official organisation using trusted channels',
      ],
    };
    if (displayRiskLevel === 'high') return {
      action: 'Verify with Multiple Independent Sources',
      icon: AlertTriangle,
      color: 'destructive',
      details: [
        'Cross-reference claims with fact-checking organisations',
        'Check original source credibility and reputation',
        'Look for corroboration from unbiased sources',
        'Be aware of emotional language influencing judgment',
      ],
    };
    if (displayRiskLevel === 'medium') return {
      action: 'Review Content with Caution',
      icon: AlertCircle,
      color: 'warning',
      details: [
        'Check for additional sources confirming key claims',
        'Be mindful of persuasive language techniques',
        'Separate facts from opinions and interpretations',
      ],
    };
    return {
      action: 'Content Appears Reasonably Neutral',
      icon: CheckCircle,
      color: 'primary',
      details: [
        'Still verify important claims independently',
        'Consider source reputation and potential biases',
        'Use critical thinking when consuming information',
      ],
    };
  })();
  const ActionIcon = recommendation.icon;

  // -----------------------------------------------------------------------
  // Button handlers
  // -----------------------------------------------------------------------
  const handleExportPDF = () => {
    toast.promise(
      new Promise<void>(resolve => {
        setTimeout(() => { window.print(); resolve(); }, 300);
      }),
      { loading: 'Preparing report…', success: 'Print dialog opened', error: 'Failed to open print dialog' },
    );
  };

  const handleShare = async () => {
    const shareUrl = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'MindGuard Analysis Report', url: shareUrl });
        toast.success('Shared successfully');
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast.success('Link copied to clipboard');
      }
    } catch {
      toast.error('Unable to share. Please copy the URL manually.');
    }
  };

  const handleSaveToHistory = () => {
    addToHistory(currentResult);
    toast.success('Saved to history');
  };

  const handleCopyNeutral = async () => {
    try {
      await navigator.clipboard.writeText(neutralRewrite);
      toast.success('Neutral version copied to clipboard');
    } catch {
      toast.error('Clipboard access denied. Please copy manually.');
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-12 max-w-7xl print:py-4">
      {/* Header with Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <Link to="/" className="p-2 rounded-lg glass-card hover:bg-secondary/50 transition-all print:hidden">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl sm:text-4xl neon-text">Analysis Report</h1>
            <p className="text-muted-foreground mt-1">Comprehensive manipulation detection results</p>
            {emailBadge && (
              <div className="mt-3">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs border font-mono ${emailBadge.className}`}>
                  {emailBadge.label}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 print:hidden">
          <button
            onClick={handleExportPDF}
            className="px-4 py-2 rounded-lg glass-card hover:bg-secondary/50 transition-all flex items-center gap-2 text-sm"
          >
            <Download className="w-4 h-4" />
            Export PDF
          </button>
          <button
            onClick={handleShare}
            className="px-4 py-2 rounded-lg glass-card hover:bg-secondary/50 transition-all flex items-center gap-2 text-sm"
          >
            <Share2 className="w-4 h-4" />
            Share
          </button>
        </div>
      </div>

      {isEmailMode && (
        <div className="glass-card rounded-xl p-6 mb-8 border-primary/30">
          <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-4">Email Cognitive Analysis</h2>
          {emailBadge && (
            <div className="mb-4">
              <span className={`inline-flex items-center px-4 py-2 rounded-full text-sm border font-mono ${emailBadge.className}`}>
                {emailBadge.label}
              </span>
            </div>
          )}
          {emailManipulationDescription && (
            <div className="mb-4 p-4 rounded-lg bg-secondary/30 border border-border">
              <p className="text-sm text-foreground">{emailManipulationDescription}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-3 mb-4">
            {cognitiveBiasExploited && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs border bg-chart-5/20 text-chart-5 border-chart-5/40 font-mono">
                Bias: {cognitiveBiasExploited}
              </span>
            )}
            {manipulationTactic && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs border bg-secondary/50 text-foreground border-border font-mono">
                Tactic: {manipulationTactic}
              </span>
            )}
          </div>
          <div className={`p-4 rounded-lg border ${emailActionClass}`}>
            <p className="text-sm leading-relaxed">
              {emailRecommendedAction ?? recommendation.action}
            </p>
          </div>
        </div>
      )}

      {/* Top Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="glass-card rounded-xl p-5 border-destructive/30">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider mb-3">
            <Activity className="w-3 h-3" />
            Manipulation Score
          </div>
          <div className={`text-4xl font-mono neon-text text-${riskColor} mb-1`} style={emailMediumRiskTextStyle}>{manipulationScore}</div>
          <div className="text-xs text-muted-foreground" style={emailMediumRiskTextStyle}>{riskLabel}</div>
        </div>

        <div className="glass-card rounded-xl p-5 border-primary/30">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider mb-3">
            <Shield className="w-3 h-3" />
            Trust Score
          </div>
          <div className={`text-4xl font-mono mb-1 ${trustScore < 40 ? 'text-destructive' : trustScore < 60 ? 'text-warning' : 'text-primary'}`}>{trustScore}</div>
          <div className="text-xs text-muted-foreground">{trustScore < 40 ? 'Below threshold' : trustScore < 60 ? 'Moderate' : 'Trustworthy'}</div>
        </div>

        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider mb-3">
            <Target className="w-3 h-3" />
            Confidence
          </div>
          <div className="text-4xl font-mono text-primary neon-text mb-1">{confidence}%</div>
          <div className="text-xs text-muted-foreground">Analysis accuracy</div>
        </div>

        <div className="glass-card rounded-xl p-5 border-warning/30">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider mb-3">
            <TrendingUp className="w-3 h-3" />
            Bias Level
          </div>
          <div className={`text-4xl font-mono mb-1 ${biasLevel > 60 ? 'text-destructive' : biasLevel > 35 ? 'text-warning' : 'text-primary'}`}>{biasLevel}%</div>
          <div className="text-xs text-muted-foreground">{biasLevel > 60 ? 'Significant bias' : biasLevel > 35 ? 'Moderate bias' : 'Low bias'}</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recommended Action */}
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
          {suspiciousPhrases.length > 0 && (
            <div className="glass-card rounded-xl p-6 border-destructive/30">
              <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-6 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                Why This Text Was Flagged
              </h3>
              <div className="space-y-4">
                {[
                  { score: emotionalIntensity, color: 'destructive', label: 'High Emotional Manipulation', desc: 'Uses strong emotional triggers and fear-inducing language to bypass rational thinking.', tactics: suspiciousPhrases.filter(p => p.category === 'Emotional').slice(0, 3) },
                  { score: urgencyScore,       color: 'warning',     label: 'Urgency Pressure Tactics',   desc: 'Creates artificial time pressure to force immediate action without verification.', tactics: suspiciousPhrases.filter(p => p.category === 'Urgency').slice(0, 2) },
                  { score: currentResult.authorityScore, color: 'warning', label: 'Authority Exploitation', desc: 'Leverages vague authority figures without specific citations or verifiable credentials.', tactics: suspiciousPhrases.filter(p => p.category === 'Authority').slice(0, 2) },
                ]
                  .filter(row => row.score > 20)
                  .map((row, i) => (
                    <div key={i} className={`p-4 rounded-lg bg-${row.color}/10 border border-${row.color}/30`}>
                      <div className="flex items-start gap-3 mb-3">
                        <div className={`w-8 h-8 rounded-full bg-${row.color}/20 border border-${row.color} flex items-center justify-center flex-shrink-0`}>
                          <span className={`text-xs font-mono text-${row.color}`}>{i + 1}</span>
                        </div>
                        <div className="flex-1">
                          <h4 className={`text-sm mb-1 text-${row.color}`}>{row.label} ({row.score}%)</h4>
                          <p className="text-sm text-muted-foreground mb-2">{row.desc}</p>
                          {row.tactics.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {row.tactics.map((t, j) => (
                                <span key={j} className={`px-2 py-1 rounded text-xs bg-${row.color}/20 text-${row.color} font-mono`}>
                                  "{t.phrase}"
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Source Credibility Assessment */}
          <div className="glass-card rounded-xl p-6">
            <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-6 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Source Credibility Assessment
            </h3>
            <div className="grid sm:grid-cols-2 gap-6 mb-6">
              <div className="p-4 rounded-lg bg-secondary/30 border border-border">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Overall Credibility Score</div>
                <div className="flex items-center gap-4">
                  <div className="relative w-20 h-20">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[{ value: trustScore }, { value: 100 - trustScore }]}
                          cx="50%" cy="50%"
                          innerRadius={25} outerRadius={35}
                          startAngle={90} endAngle={-270}
                          dataKey="value"
                        >
                          <Cell fill={trustScore < 40 ? '#FF3B5C' : trustScore < 60 ? '#FFB347' : '#00E5CC'} stroke="none" />
                          <Cell fill="#1A2640" stroke="none" />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className={`text-lg font-mono ${trustScore < 40 ? 'text-destructive' : trustScore < 60 ? 'text-warning' : 'text-primary'}`}>{trustScore}</div>
                    </div>
                  </div>
                  <div>
                    <div className={`text-lg font-mono mb-1 ${trustScore < 40 ? 'text-destructive' : trustScore < 60 ? 'text-warning' : 'text-primary'}`}>
                      {trustScore < 40 ? 'Questionable' : trustScore < 60 ? 'Moderate' : 'Reliable'}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {trustScore < 40 ? 'Below reliability threshold' : trustScore < 60 ? 'Use with caution' : 'Above reliability threshold'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-secondary/30 border border-border">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Domain Trust Rating</div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Domain age:</span>
                    <span className="font-mono">{source?.domainAge ?? 'N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Trust score:</span>
                    <span className={`font-mono ${trustScore < 40 ? 'text-destructive' : trustScore < 60 ? 'text-warning' : 'text-primary'}`}>{source?.trustLevel ?? (trustScore < 40 ? 'Low' : trustScore < 60 ? 'Medium' : 'High')}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">SSL verified:</span>
                    <span className={`font-mono ${source?.sslVerified ? 'text-primary' : 'text-muted-foreground'}`}>{source?.sslVerified ? 'Yes' : 'N/A'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Credibility Indicators */}
            <div className="space-y-3">
              {[
                { label: 'Cited sources',            color: trustScore < 40 ? 'destructive' : 'warning', note: source ? `${source.citedSources} verifiable` : '0 verifiable',                        value: trustScore < 40 ? 'Low' : 'Partial'   },
                { label: 'Author credentials',        color: 'warning', note: source?.authorCredentials ?? 'No bio available',                                                                          value: source?.authorCredentials ?? 'Unknown' },
                { label: 'Fact-check history',        color: 'warning', note: source?.factCheckHistory ?? (trustScore < 50 ? '3 disputed claims' : 'No disputes'),                                      value: trustScore < 50 ? 'Caution' : 'Clear'  },
                { label: 'Editorial standards',       color: 'warning', note: source?.editorialStandards ?? 'Not disclosed',                                                                             value: source?.editorialStandards === 'Disclosed' ? 'Disclosed' : 'Unknown' },
                { label: 'Independent verification',  color: 'chart-5', note: source?.independentVerification ?? '1 source found',                                                                       value: 'Partial' },
              ].map((row, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-secondary/20">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full bg-${row.color}`} />
                    <span className="text-sm">{row.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{row.note}</span>
                    <span className={`text-${row.color} text-sm font-mono`}>{row.value}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className={`mt-6 p-4 rounded-lg bg-${riskColor}/10 border border-${riskColor}/30`}>
              <div className="flex items-start gap-3">
                <AlertCircle className={`w-5 h-5 text-${riskColor} flex-shrink-0 mt-0.5`} />
                <div>
                  <p className={`text-sm text-${riskColor} mb-1`}>
                    {displayRiskLevel === 'critical'
                      ? 'Critical Credibility Warning'
                      : displayRiskLevel === 'high'
                        ? 'Low Credibility Warning'
                        : displayRiskLevel === 'medium'
                          ? 'Moderate Credibility Notice'
                          : 'Source Appears Credible'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {displayRiskLevel === 'critical'
                      ? 'This content is highly risky. Do not act on it and verify only through official channels.'
                      : displayRiskLevel === 'high'
                        ? 'This content shows patterns of sensationalised reporting. Cross-reference with established fact-checking organisations.'
                        : displayRiskLevel === 'medium'
                          ? 'Some persuasive elements detected. Verify key claims with additional sources.'
                          : 'Content appears relatively neutral. Standard verification practices still apply.'}
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
              {/* Bias */}
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Bias Indicator</div>
                <div className="relative h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={[{ value: biasLevel }, { value: 100 - biasLevel }]} cx="50%" cy="50%" innerRadius={30} outerRadius={45} startAngle={90} endAngle={-270} dataKey="value">
                        <Cell fill={biasLevel > 60 ? '#FF3B5C' : '#FFB347'} stroke="none" />
                        <Cell fill="#1A2640" stroke="none" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className={`text-2xl font-mono ${biasLevel > 60 ? 'text-destructive' : 'text-warning'}`}>{biasLevel}%</div>
                  </div>
                </div>
                <p className="text-xs text-center text-muted-foreground mt-2">
                  {biasLevel > 60 ? 'Strong political/ideological bias' : biasLevel > 35 ? 'Moderate bias detected' : 'Minimal bias'}
                </p>
              </div>

              {/* Emotional */}
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Emotional Intensity</div>
                <div className="relative h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={[{ value: emotionalIntensity }, { value: 100 - emotionalIntensity }]} cx="50%" cy="50%" innerRadius={30} outerRadius={45} startAngle={90} endAngle={-270} dataKey="value">
                        <Cell fill="#FF3B5C" stroke="none" />
                        <Cell fill="#1A2640" stroke="none" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-2xl font-mono text-destructive">{emotionalIntensity}%</div>
                  </div>
                </div>
                <p className="text-xs text-center text-muted-foreground mt-2">
                  {emotionalIntensity > 60 ? 'Heavy emotional language' : emotionalIntensity > 30 ? 'Moderate emotional tone' : 'Largely neutral tone'}
                </p>
              </div>

              {/* Credibility Signals */}
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Credibility Signals</div>
                <div className="space-y-2 mt-4">
                  {[
                    { label: 'Sources cited',    value: trustScore < 40 ? 'Low'     : 'Partial', color: trustScore < 40 ? 'text-destructive' : 'text-warning' },
                    { label: 'Author expertise', value: trustScore < 60 ? 'Unknown' : 'Verified', color: trustScore < 60 ? 'text-warning' : 'text-primary'    },
                    { label: 'Fact-checkable',   value: trustScore < 50 ? 'Partial' : 'Yes',     color: trustScore < 50 ? 'text-warning' : 'text-primary'    },
                    { label: 'Domain trust',     value: source?.trustLevel ?? (trustScore < 40 ? 'Low' : trustScore < 60 ? 'Medium' : 'High'), color: trustScore < 40 ? 'text-destructive' : trustScore < 60 ? 'text-warning' : 'text-primary' },
                  ].map((row, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className={row.color}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                <div className="flex items-center gap-3 mb-3">
                  <Flame className="w-5 h-5 text-destructive" />
                  <div>
                    <div className="text-sm text-muted-foreground">Urgency Pressure</div>
                    <div className="text-2xl font-mono text-destructive">{urgencyScore > 60 ? 'High' : urgencyScore > 30 ? 'Medium' : 'Low'}</div>
                  </div>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-warning to-destructive transition-all" style={{ width: `${urgencyScore}%` }} />
                </div>
              </div>
              <div className="p-4 rounded-lg bg-warning/10 border border-warning/30">
                <div className="flex items-center gap-3 mb-3">
                  <Clock className="w-5 h-5 text-warning" />
                  <div>
                    <div className="text-sm text-muted-foreground">Time Pressure</div>
                    <div className="text-2xl font-mono text-warning">{urgencyScore > 50 ? 'High' : urgencyScore > 25 ? 'Medium' : 'Low'}</div>
                  </div>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-primary to-warning transition-all" style={{ width: `${Math.round(urgencyScore * 0.75)}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Top Suspicious Phrases */}
          {suspiciousPhrases.length > 0 && (
            <div className="glass-card rounded-xl p-6">
              <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
                <Target className="w-4 h-4" />
                Top Suspicious Phrases
              </h3>
              <div className="space-y-3">
                {suspiciousPhrases.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border hover:border-primary/30 transition-all">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${item.risk === 'high' ? 'bg-destructive' : 'bg-warning'}`} />
                      <span className="font-mono text-sm">"{item.phrase}"</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{item.category}</span>
                      <span className={`px-2 py-1 rounded-full text-xs border font-mono ${item.risk === 'high' ? 'bg-destructive/20 text-destructive border-destructive/40' : 'bg-warning/20 text-warning border-warning/40'}`}>
                        {item.risk}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Word-Level Heatmap */}
          {highlightedWords.length > 0 && (
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
              <div className="flex flex-wrap items-center gap-6 mt-4 text-xs">
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
          )}

          {/* Neutral Rewrite */}
          <div className="glass-card rounded-xl p-6">
            <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              AI Neutral Rewrite
            </h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-destructive uppercase tracking-wider">Original (Manipulative)</span>
                  <span className="text-xs font-mono text-destructive">Risk: {manipulationScore}%</span>
                </div>
                <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-sm leading-relaxed min-h-[120px] break-words">
                  {inputText.substring(0, 300)}{inputText.length > 300 ? '…' : ''}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-primary uppercase tracking-wider">Neutral Version</span>
                  <span className="text-xs font-mono text-primary">Risk: ~10%</span>
                </div>
                <div className="p-4 bg-primary/10 border border-primary/30 rounded-lg text-sm leading-relaxed min-h-[120px]">
                  {neutralRewrite}
                </div>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={handleCopyNeutral}
                className="px-4 py-2 rounded-lg bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary transition-all text-sm flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Copy Neutral Version
              </button>
            </div>
          </div>
        </div>

        {/* Right Column – Charts */}
        <div className="space-y-6">
          {/* Risk Gauge */}
          <div className="glass-card rounded-xl p-6">
            <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-4">Overall Risk Gauge</h3>
            <div className="relative">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={donutData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} startAngle={90} endAngle={-270} dataKey="value">
                    {donutData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className={`text-5xl font-mono neon-text text-${riskColor}`} style={emailMediumRiskTextStyle}>{manipulationScore}</div>
                  <div className="text-sm text-muted-foreground">/ 100</div>
                </div>
              </div>
            </div>
            <div className="mt-4 text-center">
              <div className={`text-lg font-mono text-${riskColor} mb-1`} style={emailMediumRiskTextStyle}>{riskLabel}</div>
              <p className="text-xs text-muted-foreground">Based on {tactics.length} manipulation techniques</p>
            </div>
          </div>

          {/* Tactic Distribution */}
          <div className="glass-card rounded-xl p-6">
            <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-4">Tactic Distribution</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={tactics}
                  cx="50%" cy="50%"
                  outerRadius={70}
                  dataKey="value"
                  label={({ percent }: { percent: number }) => `${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {tactics.map((entry, i) => (
                    <Cell key={i} fill={TACTIC_COLORS[entry.name] ?? '#00E5CC'} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-2">
              {tactics.map((t, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: TACTIC_COLORS[t.name] ?? '#00E5CC' }} />
                    <span>{t.name}</span>
                  </div>
                  <span className="font-mono text-muted-foreground">{t.value}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Radar Chart */}
          <div className="glass-card rounded-xl p-6">
            <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-4">Manipulation Profile</h3>
            <ResponsiveContainer width="100%" height={250}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#1A2640" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: '#6B7A99', fontSize: 11 }} />
                <Radar dataKey="value" stroke="#00E5CC" fill="#00E5CC" fillOpacity={0.4} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Severity Bar Chart */}
          <div className="glass-card rounded-xl p-6">
            <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-4">Severity by Tactic</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={barData} layout="horizontal">
                <XAxis type="number" domain={[0, 100]} stroke="#6B7A99" fontSize={10} />
                <YAxis type="category" dataKey="tactic" stroke="#6B7A99" fontSize={10} width={60} />
                <Tooltip contentStyle={{ background: 'rgba(13,21,37,0.95)', border: '1px solid rgba(0,229,204,0.2)', borderRadius: '8px', fontSize: '12px' }} />
                <Bar dataKey="score" fill="#00E5CC" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Quick Actions */}
          <div className="glass-card rounded-xl p-6">
            <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-4">Actions</h3>
            <div className="space-y-2">
              <Link to="/" className="block w-full p-3 rounded-lg bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary transition-all text-sm text-center">
                Analyze New Content
              </Link>
              <Link to="/compare" className="block w-full p-3 rounded-lg bg-secondary/50 hover:bg-secondary border border-border text-foreground transition-all text-sm text-center">
                Compare with Another
              </Link>
              <button
                onClick={handleSaveToHistory}
                className="w-full p-3 rounded-lg bg-secondary/50 hover:bg-secondary border border-border text-foreground transition-all text-sm flex items-center justify-center gap-2"
              >
                <BookmarkPlus className="w-4 h-4" />
                Save to History
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
