// GET  /api/web-summary?productId=maggi → the saved "What the web says" summary, or { summary: null }
// POST /api/web-summary { productId }   → researches the web now (AI + web search) and saves the result
// Summaries are reused for REFRESH_AFTER so page views don't each cost an AI call.
import { summarizeWeb, AiError } from '../lib/ai.js';
import { readProducts, getWebSummary, saveWebSummary, sendError, InputError } from '../lib/store.js';

const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // one week
const inProgress = new Map(); // productId → promise, so two visitors don't trigger two AI calls

const isFresh = (summary) => summary && Date.now() - new Date(summary.generatedAt) < REFRESH_AFTER_MS;

export default async function handler(req, res) {
  try {
    const productId = req.method === 'GET' ? req.query.productId : req.body?.productId;
    const product = (await readProducts()).find((p) => p.id === productId);
    if (!product) throw new InputError('Unknown product.', 404);

    const saved = await getWebSummary(productId);
    if (req.method === 'GET') {
      return res.status(200).json({ summary: saved, canRefresh: !isFresh(saved) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use GET or POST.' });
    if (isFresh(saved)) return res.status(200).json({ summary: saved, canRefresh: false });

    if (!inProgress.has(productId)) {
      inProgress.set(productId, summarizeWeb(product).then((s) => saveWebSummary(productId, s)).finally(() => inProgress.delete(productId)));
    }
    const summary = await inProgress.get(productId);
    res.status(200).json({ summary, canRefresh: false });
  } catch (err) {
    if (err instanceof AiError) return res.status(err.status).json({ error: err.message });
    sendError(res, err);
  }
}
