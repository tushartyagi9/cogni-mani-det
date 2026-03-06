import { z } from 'zod';

// ─── Response schema from Firecrawl v1 /scrape ────────────────────────────────
const FirecrawlMetadataSchema = z.object({
  title:         z.string().optional(),
  description:   z.string().optional(),
  author:        z.string().optional(),
  publishedTime: z.string().optional(),
  ogImage:       z.string().optional(),
  sourceURL:     z.string().optional(),
  statusCode:    z.number().optional(),
}).passthrough();

const FirecrawlDataSchema = z.object({
  markdown: z.string().optional(),
  metadata: FirecrawlMetadataSchema.optional(),
});

const FirecrawlResponseSchema = z.object({
  success: z.boolean(),
  data:    FirecrawlDataSchema.optional(),
  error:   z.string().optional(),
});

export interface ScrapedArticle {
  title:       string;
  author:      string;
  publishDate: string;
  domain:      string;
  source:      string;
  bodyText:    string;
  description: string;
}

// ─── URL validation ────────────────────────────────────────────────────────────
function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// ─── Domain → source name ────────────────────────────────────────────────────
function domainToSource(domain: string): string {
  const parts = domain.replace('www.', '').split('.');
  const name  = parts[0] ?? domain;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// ─── Firecrawl scrape function ────────────────────────────────────────────────
export async function scrapeUrl(url: string): Promise<ScrapedArticle> {
  if (!process.env.FIRECRAWL_API_KEY) {
    throw new Error('FIRECRAWL_API_KEY is not set.');
  }
  if (!isValidUrl(url)) {
    throw new Error('Invalid URL format. URL must start with http:// or https://');
  }

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 20_000);

  let res: Response;
  try {
    res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        url,
        formats:         ['markdown'],
        onlyMainContent: true,
        waitFor:         1000,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error('Article fetch timed out. The page may be too slow or blocking scrapers.');
    }
    throw new Error('Network error while fetching article. Please check the URL and try again.');
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    if (res.status === 401) throw new Error('Firecrawl API key is invalid or expired.');
    if (res.status === 402) throw new Error('Firecrawl usage limit reached. Please check your plan.');
    if (res.status === 429) throw new Error('Too many requests to Firecrawl. Please wait a moment and retry.');
    if (res.status === 404) throw new Error('The URL returned a 404 — page not found.');
    if (res.status >= 500)  throw new Error('Firecrawl service is temporarily unavailable. Please try again shortly.');
    throw new Error(`Failed to fetch article (HTTP ${res.status}).`);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error('Firecrawl returned an invalid response.');
  }

  const parsed = FirecrawlResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error('Unexpected response format from Firecrawl.');
  }

  if (!parsed.data.success || !parsed.data.data) {
    throw new Error(parsed.data.error ?? 'Firecrawl could not scrape this URL.');
  }

  const { markdown = '', metadata = {} } = parsed.data.data;

  const domain = (() => {
    try { return new URL(url).hostname.replace('www.', ''); }
    catch { return 'unknown'; }
  })();

  // Extract a clean body text from markdown (first 10 000 chars max)
  const bodyText = markdown
    .replace(/!\[.*?\]\(.*?\)/g, '')   // remove images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // flatten links
    .replace(/#{1,6}\s*/g, '')         // remove headings markers
    .trim()
    .substring(0, 10_000);

  if (bodyText.length < 50) {
    throw new Error('The page does not appear to have enough readable text content to analyse.');
  }

  // Parse date to a readable string
  const publishDate = (() => {
    if (!metadata.publishedTime) return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const d = new Date(metadata.publishedTime);
    return isNaN(d.getTime())
      ? metadata.publishedTime
      : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  })();

  return {
    title:       metadata.title       ?? `Article from ${domain}`,
    author:      metadata.author      ?? 'Unknown Author',
    publishDate,
    domain,
    source:      domainToSource(domain),
    bodyText,
    description: metadata.description ?? '',
  };
}
