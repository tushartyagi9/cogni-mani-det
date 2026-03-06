import { Outlet, Link, useLocation } from 'react-router';
import { Brain, Activity, GitCompare, History, Menu } from 'lucide-react';
import { useState } from 'react';

export function Layout() {
  const location = useLocation();
  const [historyOpen, setHistoryOpen] = useState(false);

  const navItems = [
    { path: '/', label: 'Analyzer', icon: Brain },
    { path: '/results', label: 'Results', icon: Activity },
    { path: '/compare', label: 'Compare', icon: GitCompare },
  ];

  return (
    <div className="min-h-screen relative">
      {/* Navbar */}
      <nav className="glass-card border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="relative">
                <Brain className="w-8 h-8 text-primary neon-glow" />
                <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl neon-text">MindGuard</h1>
                <p className="text-xs text-muted-foreground">Cognitive Manipulation Detector</p>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                      isActive
                        ? 'bg-primary/20 text-primary neon-glow border border-primary/40'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              <button
                onClick={() => setHistoryOpen(!historyOpen)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all ml-2"
              >
                <History className="w-4 h-4" />
                <span>History</span>
              </button>
            </div>

            {/* Mobile Menu Button */}
            <button className="md:hidden p-2 rounded-lg hover:bg-secondary/50 transition-all">
              <Menu className="w-6 h-6 text-foreground" />
            </button>
          </div>

          {/* Mobile Navigation */}
          <div className="md:hidden flex gap-1 mt-4 overflow-x-auto pb-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all whitespace-nowrap text-sm ${
                    isActive
                      ? 'bg-primary/20 text-primary neon-glow border border-primary/40'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10">
        <Outlet />
      </main>

      {/* Floating History Drawer */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end p-4 pointer-events-none">
          <div className="glass-card neon-glow rounded-xl p-6 max-w-sm w-full pointer-events-auto max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="flex items-center gap-2">
                <History className="w-5 h-5 text-primary" />
                Analysis History
              </h3>
              <button
                onClick={() => setHistoryOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3">
              {[
                { title: 'Political Speech Analysis', score: 78, date: 'Mar 5, 2026' },
                { title: 'News Article Check', score: 42, date: 'Mar 4, 2026' },
                { title: 'Advertisement Review', score: 85, date: 'Mar 3, 2026' },
              ].map((item, i) => (
                <div
                  key={i}
                  className="p-3 rounded-lg bg-secondary/30 border border-border hover:border-primary/50 transition-all cursor-pointer"
                >
                  <p className="text-sm mb-1">{item.title}</p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{item.date}</span>
                    <span
                      className={`font-mono ${
                        item.score > 70 ? 'text-destructive' : item.score > 40 ? 'text-warning' : 'text-primary'
                      }`}
                    >
                      {item.score}% risk
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
