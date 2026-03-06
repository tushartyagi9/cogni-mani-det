import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Sparkles, TrendingUp, Target, Zap, Link as LinkIcon, Upload, AlertTriangle, Newspaper, Mail, MessageSquare, ShoppingBag, Globe, Calendar, User, ExternalLink } from 'lucide-react';
import { NewsIntelligenceSidebar } from './NewsIntelligenceSidebar';

const exampleTexts = {
  news: "BREAKING: Experts reveal shocking truth about new policy that EVERYONE must know!",
  email: "URGENT: Your account will be suspended in 24 hours unless you verify immediately!",
  social: "This is the ONLY way to succeed! Join thousands who've already transformed their lives!",
  ad: "Limited time offer! Don't miss out on this revolutionary product that doctors don't want you to know about!",
};

type AnalysisMode = 'news' | 'email' | 'social' | 'ad';
type InputMethod = 'text' | 'url' | 'upload';

export function AnalyzerPage() {
  const [mode, setMode] = useState<AnalysisMode>('news');
  const [inputMethod, setInputMethod] = useState<InputMethod>('text');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const navigate = useNavigate();

  // Mock article preview data
  const articlePreview = {
    headline: "Scientists Discover Revolutionary Breakthrough That Could Change Everything",
    source: "TechNews Daily",
    author: "Sarah Mitchell",
    publishDate: "March 6, 2026",
    headlineRisk: 78,
    domain: "technewsdaily.com"
  };

  const handleAnalyze = () => {
    if (inputMethod === 'text' && !text.trim()) return;
    if (inputMethod === 'url' && !url.trim()) return;
    
    setIsAnalyzing(true);
    setTimeout(() => {
      setIsAnalyzing(false);
      navigate('/results', { state: { mode, inputMethod } });
    }, 2000);
  };

  const handleUrlFetch = () => {
    if (url.trim()) {
      setShowPreview(true);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setText(event.target?.result as string);
      };
      reader.readAsText(file);
    }
  };

  const modes = [
    { id: 'news' as AnalysisMode, label: 'News Article', icon: Newspaper },
    { id: 'email' as AnalysisMode, label: 'Email', icon: Mail },
    { id: 'social' as AnalysisMode, label: 'Social Post', icon: MessageSquare },
    { id: 'ad' as AnalysisMode, label: 'Advertisement', icon: ShoppingBag },
  ];

  return (
    <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Main Analyzer Section */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header */}
          <div className="text-center lg:text-left mb-8">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl mb-4 neon-text">
              Cognitive Manipulation Analysis
            </h1>
            <p className="text-muted-foreground text-base sm:text-lg max-w-2xl">
              Professional-grade detection of manipulative language patterns, emotional triggers, 
              and psychological tactics in news, emails, and social content.
            </p>
          </div>

          {/* Mode Selector */}
          <div className="glass-card rounded-xl p-6">
            <label className="text-sm text-muted-foreground uppercase tracking-wider mb-3 block">
              Analysis Mode
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {modes.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      setMode(m.id);
                      setText(exampleTexts[m.id]);
                    }}
                    className={`p-3 rounded-lg transition-all flex flex-col items-center gap-2 ${
                      mode === m.id
                        ? 'bg-primary/20 text-primary neon-glow border border-primary/40'
                        : 'bg-secondary/30 text-muted-foreground hover:text-foreground hover:bg-secondary/50 border border-border'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-xs">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Input Method Tabs */}
          <div className="glass-card rounded-xl p-6 space-y-4">
            <div className="flex gap-2 border-b border-border pb-3">
              <button
                onClick={() => setInputMethod('text')}
                className={`px-4 py-2 rounded-t-lg transition-all text-sm ${
                  inputMethod === 'text'
                    ? 'bg-primary/20 text-primary border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Sparkles className="w-4 h-4 inline mr-2" />
                Paste Text
              </button>
              <button
                onClick={() => setInputMethod('url')}
                className={`px-4 py-2 rounded-t-lg transition-all text-sm ${
                  inputMethod === 'url'
                    ? 'bg-primary/20 text-primary border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <LinkIcon className="w-4 h-4 inline mr-2" />
                Paste URL
              </button>
              <button
                onClick={() => setInputMethod('upload')}
                className={`px-4 py-2 rounded-t-lg transition-all text-sm ${
                  inputMethod === 'upload'
                    ? 'bg-primary/20 text-primary border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Upload className="w-4 h-4 inline mr-2" />
                Upload File
              </button>
            </div>

            {/* Text Input */}
            {inputMethod === 'text' && (
              <div className="space-y-4">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={`Paste ${mode === 'news' ? 'article' : mode === 'email' ? 'email content' : mode === 'social' ? 'social media post' : 'advertisement'} text here...`}
                  className="w-full min-h-[300px] bg-input-background border border-input rounded-lg p-4 
                           text-foreground placeholder:text-muted-foreground resize-y
                           focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                           transition-all"
                />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground font-mono">
                    {text.length} characters | {text.split(/\s+/).filter(w => w).length} words
                  </span>
                </div>
              </div>
            )}

            {/* URL Input */}
            {inputMethod === 'url' && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com/article"
                    className="flex-1 bg-input-background border border-input rounded-lg px-4 py-3
                             text-foreground placeholder:text-muted-foreground
                             focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                             transition-all"
                  />
                  <button
                    onClick={handleUrlFetch}
                    className="px-6 py-3 rounded-lg bg-secondary hover:bg-secondary/80 border border-border
                             transition-all flex items-center gap-2"
                  >
                    <Globe className="w-4 h-4" />
                    Fetch
                  </button>
                </div>

                {/* Article Preview Panel */}
                {showPreview && (
                  <div className="glass-card rounded-lg p-5 border-l-4 border-primary">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h4 className="text-lg mb-2 leading-tight">{articlePreview.headline}</h4>
                        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Newspaper className="w-3 h-3" />
                            {articlePreview.source}
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {articlePreview.author}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {articlePreview.publishDate}
                          </span>
                          <span className="flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            {articlePreview.domain}
                          </span>
                        </div>
                      </div>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary/80 transition-all"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>

                    {/* Headline Risk Indicator */}
                    <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-destructive" />
                          Headline Risk Assessment
                        </span>
                        <span className="text-2xl font-mono text-destructive neon-text">
                          {articlePreview.headlineRisk}%
                        </span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden mb-3">
                        <div
                          className="h-full bg-gradient-to-r from-warning to-destructive neon-glow"
                          style={{ width: `${articlePreview.headlineRisk}%` }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="px-2 py-1 rounded-full text-xs border bg-destructive/20 text-destructive border-destructive/40 font-mono">
                          Emotionally Framed
                        </span>
                        <span className="px-2 py-1 rounded-full text-xs border bg-warning/20 text-warning border-warning/40 font-mono">
                          Sensationalized
                        </span>
                        <span className="px-2 py-1 rounded-full text-xs border bg-destructive/20 text-destructive border-destructive/40 font-mono">
                          Absolute Language
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* File Upload */}
            {inputMethod === 'upload' && (
              <div className="space-y-4">
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-all">
                  <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground mb-2">
                    Drop file here or click to upload
                  </p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Supports: .txt, .eml files
                  </p>
                  <input
                    type="file"
                    accept=".txt,.eml"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="file-upload"
                  />
                  <label
                    htmlFor="file-upload"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 border border-border cursor-pointer transition-all"
                  >
                    <Upload className="w-4 h-4" />
                    Select File
                  </label>
                </div>
                {text && (
                  <div className="p-4 rounded-lg bg-secondary/30 border border-border">
                    <p className="text-sm text-muted-foreground mb-2">File loaded:</p>
                    <p className="text-sm font-mono">{text.substring(0, 100)}...</p>
                  </div>
                )}
              </div>
            )}

            {/* Analyze Button */}
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <div className="flex gap-2">
                <button
                  onClick={() => setText('')}
                  className="px-4 py-2 text-sm rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
                >
                  Clear
                </button>
              </div>
              <button
                onClick={handleAnalyze}
                disabled={
                  (inputMethod === 'text' && !text.trim()) ||
                  (inputMethod === 'url' && !url.trim()) ||
                  isAnalyzing
                }
                className="px-6 py-3 rounded-lg bg-primary text-primary-foreground 
                         hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all neon-glow flex items-center gap-2 group"
              >
                {isAnalyzing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                    Analyze {mode === 'news' ? 'Article' : mode === 'email' ? 'Email' : mode === 'social' ? 'Post' : 'Ad'}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Quick Examples */}
          <div className="glass-card rounded-xl p-5">
            <label className="text-sm text-muted-foreground uppercase tracking-wider mb-3 block">
              Quick Test Examples
            </label>
            <div className="space-y-2">
              {Object.entries(exampleTexts).map(([key, example]) => (
                <button
                  key={key}
                  onClick={() => {
                    setMode(key as AnalysisMode);
                    setText(example);
                    setInputMethod('text');
                  }}
                  className="w-full text-left p-3 rounded-lg border border-border hover:border-primary/50 
                           bg-secondary/30 hover:bg-secondary/50 text-sm transition-all group"
                >
                  <span className="text-xs text-primary uppercase tracking-wider block mb-1">
                    {key === 'news' ? 'News' : key === 'email' ? 'Email' : key === 'social' ? 'Social' : 'Ad'}
                  </span>
                  <span className="text-foreground group-hover:text-primary transition-colors">
                    {example}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* News Intelligence Sidebar */}
        <NewsIntelligenceSidebar />
      </div>
    </div>
  );
}
