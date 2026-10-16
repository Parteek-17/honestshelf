// GET /api/products → every product with its average rating and review count.
import { getProducts, sendError } from '../lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET.' });
  try {
    res.status(200).json(await getProducts());
  } catch (err) {
    sendError(res, err);
  }
}
