// POST /api/ask { productId, question, history?: [{ role, content }] }
// "Ask before you buy": answers a shopper's question using this product's reviews,
// plus web search limited to genuine sources (see lib/ai.js for the rules).
import { askAboutProduct, AiError } from '../lib/ai.js';
import { readProducts, getReviews, sendError, InputError } from '../lib/store.js';

const MAX_REVIEWS = 40; // most helpful first; keeps the prompt small enough for Groq's free plan
const MAX_HISTORY = 6;

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => ['user', 'assistant'].includes(m?.role) && typeof m.content === 'string')
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  try {
    const { productId, question, history } = req.body || {};
    const product = (await readProducts()).find((p) => p.id === productId);
    if (!product) throw new InputError('Unknown product.', 404);

    const q = String(question ?? '').trim();
    if (q.length < 3) throw new InputError('Type a question first.');
    if (q.length > 500) throw new InputError('Keep your question under 500 characters.');

    const reviews = (await getReviews(productId, 'helpful')).slice(0, MAX_REVIEWS);
    const { answer, sources } = await askAboutProduct(product, reviews, q, cleanHistory(history));
    res.status(200).json({ answer, sources, reviewCount: reviews.length });
  } catch (err) {
    if (err instanceof AiError) return res.status(err.status).json({ error: err.message });
    sendError(res, err);
  }
}
