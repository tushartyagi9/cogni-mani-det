import { useState, useRef } from 'react';
import { useNavigate } from 'react-router';
import {
  Sparkles, Zap, Link as LinkIcon, Upload, AlertTriangle,
  Newspaper, Mail, MessageSquare, ShoppingBag, Globe,
  Calendar, User, ExternalLink, AlertCircle, X, FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { NewsIntelligenceSidebar } from './NewsIntelligenceSidebar';
import { analyzeContent, fetchArticlePreview } from '../../services/analysisService';
import { useAppContext } from '../../context/AppContext';
import type { AnalysisMode, InputMethod, ArticlePreview } from '../../types';

const EXAMPLE_TEXTS: Record<AnalysisMode, string> = {
  news:   'BREAKING: Experts reveal shocking truth about new policy that EVERYONE must know!',
  email:  'URGENT: Your account will be suspended in 24 hours unless you verify immediately!',
  social: "This is the ONLY way to succeed! Join thousands who've already transformed their lives!",
  ad:     "Limited time offer! Don't miss out on this revolutionary product that doctors don't want you to know about!",
};

const MIN_TEXT_LENGTH = 20;
const MAX_TEXT_LENGTH = 50000;

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function AnalyzerPage() {
  const navigate = useNavigate();
  const { setCurrentResult, addToHistory } = useAppContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<AnalysisMode>('news');
  const [inputMethod, setInputMethod] = useState<InputMethod>('text');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [articlePreview, setArticlePreview] = useState<ArticlePreview | null>(null);
  const [urlError, setUrlError] = useState('');
  const [textError, setTextError] = useState('');
  const [analyzeError, setAnalyzeError] = useState('');

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const validateText = (value: string): string => {
    if (!value.trim()) return 'Please enter some text to analyze.';
    if (value.trim().length < MIN_TEXT_LENGTH) return `Text must be at least ${MIN_TEXT_LENGTH} characters.`;
    if (value.length > MAX_TEXT_LENGTH) return `Text must be under ${MAX_TEXT_LENGTH} characters.`;
    return '';
  };

  const validateUrl = (value: string): string => {
    if (!value.trim()) return 'Please enter a URL.';
    if (!isValidUrl(value.trim())) return 'Please enter a valid URL (must start with http:// or https://).';
    return '';
  };

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleModeChange = (newMode: AnalysisMode) => {
    setMode(newMode);
    if (!text || Object.values(EXAMPLE_TEXTS).includes(text)) {
      setText(EXAMPLE_TEXTS[newMode]);
      setTextError('');
    }
  };

  const handleTextChange = (value: string) => {
    setText(value);
    if (textError && value.trim().length >= MIN_TEXT_LENGTH) setTextError('');
  };

  const handleUrlChange = (value: string) => {
    setUrl(value);
    if (urlError) setUrlError('');
  };

  const handleUrlFetch = async () => {
    const err = validateUrl(url);
    if (err) { setUrlError(err); return; }
    setUrlError('');
    setIsFetchingUrl(true);
    setArticlePreview(null);
    try {
      const preview = await fetchArticlePreview(url.trim());
      setArticlePreview(preview);
      toast.success('Article preview loaded');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to fetch article preview.';
      setUrlError(msg);
      toast.error(msg);
    } finally {
      setIsFetchingUrl(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['text/plain', 'message/rfc822', 'application/octet-stream'];
    const allowedExts = ['.txt', '.eml'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();

    if (!allowedTypes.includes(file.type) && !allowedExts.includes(ext)) {
      toast.error('Unsupported file type. Please upload a .txt or .eml file.');
      return;
    }
    if (file.size > 1024 * 1024) {
      toast.error('File too large. Maximum size is 1 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setText(content);
      setUploadedFileName(file.name);
      setTextError('');
      setInputMethod('text');
      toast.success(`File "${file.name}" loaded (${content.length.toLocaleString()} characters)`);
    };
    reader.onerror = () => toast.error('Failed to read file.');
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && fileInputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInputRef.current.files = dt.files;
      fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  const handleAnalyze = async () => {
    setAnalyzeError('');

    // Validate
    if (inputMethod === 'text' || inputMethod === 'upload') {
      const err = validateText(text);
      if (err) { setTextError(err); return; }
    }
    if (inputMethod === 'url') {
      const err = validateUrl(url);
      if (err) { setUrlError(err); return; }
    }

    // For URL mode: prefer real extracted body text from Firecrawl over just the headline
    const contentToAnalyze = inputMethod === 'url'
      ? (articlePreview?.bodyText || articlePreview?.headline || url)
      : text;

    setIsAnalyzing(true);
    try {
      const result = await analyzeContent(
        contentToAnalyze,
        mode,
        inputMethod,
        inputMethod === 'url' ? url : undefined,
      );
      setCurrentResult(result);
      addToHistory(result);
      navigate('/results');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Analysis failed. Please try again.';
      setAnalyzeError(msg);
      toast.error(msg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleClear = () => {
    setText('');
    setUrl('');
    setArticlePreview(null);
    setTextError('');
    setUrlError('');
    setAnalyzeError('');
    setUploadedFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const analyzeButtonDisabled =
    isAnalyzing ||
    (inputMethod === 'text' && !text.trim()) ||
    (inputMethod === 'upload' && !text.trim()) ||
    (inputMethod === 'url' && !url.trim());

  const modes: Array<{ id: AnalysisMode; label: string; icon: typeof Newspaper }> = [
    { id: 'news',   label: 'News Article',  icon: Newspaper    },
    { id: 'email',  label: 'Email',          icon: Mail         },
    { id: 'social', label: 'Social Post',    icon: MessageSquare },
    { id: 'ad',     label: 'Advertisement',  icon: ShoppingBag  },
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
                    onClick={() => handleModeChange(m.id)}
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
            <div className="flex gap-2 border-b border-border pb-3 flex-wrap">
              {[
                { id: 'text' as InputMethod,   icon: Sparkles,  label: 'Paste Text'   },
                { id: 'url'  as InputMethod,   icon: LinkIcon,  label: 'Paste URL'    },
                { id: 'upload' as InputMethod, icon: Upload,    label: 'Upload File'  },
              ].map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => { setInputMethod(id); setAnalyzeError(''); }}
                  className={`px-4 py-2 rounded-t-lg transition-all text-sm ${
                    inputMethod === id
                      ? 'bg-primary/20 text-primary border-b-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="w-4 h-4 inline mr-2" />
                  {label}
                </button>
              ))}
            </div>

            {/* Text Input */}
            {(inputMethod === 'text' || inputMethod === 'upload') && (
              <div className="space-y-3">
                {uploadedFileName && inputMethod === 'upload' && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/10 border border-primary/30 text-sm">
                    <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="text-primary flex-1 truncate">{uploadedFileName}</span>
                    <button onClick={() => { setUploadedFileName(null); setText(''); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <textarea
                  value={text}
                  onChange={(e) => handleTextChange(e.target.value)}
                  placeholder={`Paste ${mode === 'news' ? 'article' : mode === 'email' ? 'email content' : mode === 'social' ? 'social media post' : 'advertisement'} text here…`}
                  className={`w-full min-h-[280px] bg-input-background border rounded-lg p-4 
                           text-foreground placeholder:text-muted-foreground resize-y
                           focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                           transition-all ${textError ? 'border-destructive' : 'border-input'}`}
                />
                {textError && (
                  <div className="flex items-center gap-2 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{textError}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm text-muted-foreground font-mono">
                  <span>{text.length.toLocaleString()} chars | {wordCount} words</span>
                  {text.length > MAX_TEXT_LENGTH * 0.9 && (
                    <span className="text-warning">{(MAX_TEXT_LENGTH - text.length).toLocaleString()} chars remaining</span>
                  )}
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
                    onChange={(e) => handleUrlChange(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleUrlFetch()}
                    placeholder="https://example.com/article"
                    className={`flex-1 bg-input-background border rounded-lg px-4 py-3
                             text-foreground placeholder:text-muted-foreground
                             focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                             transition-all ${urlError ? 'border-destructive' : 'border-input'}`}
                  />
                  <button
                    onClick={handleUrlFetch}
                    disabled={isFetchingUrl || !url.trim()}
                    className="px-6 py-3 rounded-lg bg-secondary hover:bg-secondary/80 border border-border
                             transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isFetchingUrl ? (
                      <div className="w-4 h-4 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
                    ) : (
                      <Globe className="w-4 h-4" />
                    )}
                    {isFetchingUrl ? 'Fetching…' : 'Fetch'}
                  </button>
                </div>
                {urlError && (
                  <div className="flex items-center gap-2 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{urlError}</span>
                  </div>
                )}

                {/* Article Preview Panel */}
                {articlePreview && (
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
                          className="h-full bg-gradient-to-r from-warning to-destructive neon-glow transition-all"
                          style={{ width: `${articlePreview.headlineRisk}%` }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {articlePreview.tags.map((tag, i) => (
                          <span
                            key={i}
                            className={`px-2 py-1 rounded-full text-xs border font-mono ${
                              articlePreview.headlineRisk > 60
                                ? 'bg-destructive/20 text-destructive border-destructive/40'
                                : 'bg-warning/20 text-warning border-warning/40'
                            }`}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* File Upload */}
            {inputMethod === 'upload' && !uploadedFileName && (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-all"
              >
                <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground mb-2">Drop file here or click to upload</p>
                <p className="text-sm text-muted-foreground mb-4">Supports .txt and .eml files (max 1 MB)</p>
                <input
                  ref={fileInputRef}
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
            )}

            {/* Global error */}
            {analyzeError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{analyzeError}</span>
              </div>
            )}

            {/* Analyze Button */}
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <button
                onClick={handleClear}
                className="px-4 py-2 text-sm rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
              >
                Clear
              </button>
              <button
                onClick={handleAnalyze}
                disabled={analyzeButtonDisabled}
                className="px-6 py-3 rounded-lg bg-primary text-primary-foreground 
                         hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all neon-glow flex items-center gap-2 group"
              >
                {isAnalyzing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    Analyzing…
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
              {Object.entries(EXAMPLE_TEXTS).map(([key, example]) => (
                <button
                  key={key}
                  onClick={() => {
                    setMode(key as AnalysisMode);
                    setText(example);
                    setInputMethod('text');
                    setTextError('');
                    setAnalyzeError('');
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
