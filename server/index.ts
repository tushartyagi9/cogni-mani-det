import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { analyzeRouter } from './routes/analyze.js';
import { articlePreviewRouter } from './routes/articlePreview.js';
import { historyRouter } from './routes/history.js';
import { evaluationRouter } from './routes/evaluationReport.js';
import { errorHandler } from './middleware/errorHandler.js';

// ─── Startup env-key guard ───────────────────────────────────────────────────
const REQUIRED_KEYS = ['OPENAI_API_KEY', 'FIRECRAWL_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = REQUIRED_KEYS.filter(k => !process.env[k]);
if (missing.length) {
  console.warn(`⚠  Missing environment variables: ${missing.join(', ')}`);
  console.warn('   Some features will fall back to degraded mode.');
}

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'http://localhost:5173',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id'],
}));

app.use(express.json({ limit: '2mb' }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/analyze', analyzeRouter);
app.use('/api/article-preview', articlePreviewRouter);
app.use('/api/history', historyRouter);
app.use('/api/evaluation', evaluationRouter);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      openai:    !!process.env.OPENAI_API_KEY,
      firecrawl: !!process.env.FIRECRAWL_API_KEY,
      supabase:  !!process.env.SUPABASE_URL,
    },
  });
});

// ─── Error handler (must be last) ────────────────────────────────────────────
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n🛡  MindGuard API  →  http://localhost:${PORT}`);
  console.log(`   Health check   →  http://localhost:${PORT}/api/health\n`);
});
