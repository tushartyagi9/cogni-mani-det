export type AnalysisMode = 'news' | 'email';
export type InputMethod = 'text' | 'url' | 'upload';
export type RiskLevel = 'high' | 'medium' | 'low' | 'critical';
export type EmailCognitiveLabel =
  | 'legitimate'
  | 'mild_influence'
  | 'fear_induction'
  | 'urgency_manipulation'
  | 'authority_exploitation'
  | 'financial_manipulation'
  | 'identity_deception';

export interface HighlightedWord {
  word: string;
  manipulative: boolean;
  level?: 'high' | 'medium' | 'low';
}

export interface SuspiciousPhrase {
  phrase: string;
  risk: 'high' | 'medium';
  category: string;
}

export interface TacticScore {
  name: string;
  value: number;
  color: string;
}

export interface RadarPoint {
  metric: string;
  value: number;
}

export interface BarPoint {
  tactic: string;
  score: number;
}

export interface SourceInfo {
  domain: string;
  credibilityScore: number;
  domainAge: string;
  sslVerified: boolean;
  trustLevel: 'Low' | 'Medium' | 'High';
  citedSources: number;
  authorCredentials: 'Unknown' | 'Verified' | 'Partial';
  factCheckHistory: string;
  editorialStandards: string;
  independentVerification: string;
}

/** Evidence entry for a single detected manipulation tactic */
export interface TacticEvidence {
  tactic:       string;
  phrases:      string[];
  score:        number;
  contribution: number;
  description:  string;
}

/** Traceability metadata attached to every analysis result */
export interface AnalysisMeta {
  analysisVersion:    string;
  rubricVersion:      string;
  calibrationVersion: string;
  modelUsed:          string;
}

export interface AnalysisResult {
  id: string;
  timestamp: string;
  mode: AnalysisMode;
  inputMethod: InputMethod;
  inputText: string;
  inputUrl?: string;
  // Primary scores (0-100)
  manipulationScore: number;
  trustScore: number;
  confidence: number;
  biasLevel: number;
  emotionalIntensity: number;
  urgencyScore: number;
  authorityScore: number;
  riskLevel: RiskLevel;
  // Chart data
  tactics: TacticScore[];
  radarData: RadarPoint[];
  barData: BarPoint[];
  // Phrase analysis
  suspiciousPhrases: SuspiciousPhrase[];
  highlightedWords: HighlightedWord[];
  // Explanations (populated by OpenAI)
  neutralRewrite: string;
  explanation?:        string;
  recommendedAction?:  string;
  // Evidence-based transparent breakdown
  tacticEvidence?:     TacticEvidence[];
  calibratedLabel?:    string;
  localScore?:         number;
  emailLabel?: EmailCognitiveLabel;
  emailRiskLevel?: string;
  emailRecommendedAction?: string;
  emailManipulationDescription?: string;
  cognitiveBiasExploited?: string;
  manipulationTactic?: string;
  // Source info (for URL mode)
  source?: SourceInfo;
  // Traceability
  _meta?: AnalysisMeta;
}

export interface HistoryItem {
  id: string;
  title: string;
  mode: AnalysisMode;
  score: number;
  date: string;
  timestamp: string;
}

export interface ComparisonTactic {
  name: string;
  a: number;
  b: number;
  desc: string;
}

export interface ComparisonResult {
  scoreA: number;
  scoreB: number;
  difference: number;
  recommended: 'A' | 'B';
  confidence: number;
  tagsA: Array<{ name: string; color: string }>;
  tagsB: Array<{ name: string; color: string }>;
  tactics: ComparisonTactic[];
  radarData: Array<{ tactic: string; textA: number; textB: number }>;
  barData: Array<{ category: string; textA: number; textB: number }>;
  wordCountA: number;
  wordCountB: number;
}

export interface ArticlePreview {
  headline:    string;
  source:      string;
  author:      string;
  publishDate: string;
  headlineRisk:number;
  domain:      string;
  tags:        string[];
  /** Full article body text extracted by Firecrawl – used as analysis input */
  bodyText?:   string;
  description?:string;
}
