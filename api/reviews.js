// GET  /api/reviews?productId=maggi&sort=helpful → reviews for one product
// POST /api/reviews  { productId, name, rating, value?, quality?, title, body } → new review
import { getReviews, addReview, sendError } from '../lib/store.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      if (!req.query.productId) return res.status(400).json({ error: 'productId is required.' });
      return res.status(200).json(await getReviews(req.query.productId, req.query.sort));
    }
    if (req.method === 'POST') {
      return res.status(201).json(await addReview(req.body));
    }
    res.status(405).json({ error: 'Use GET or POST.' });
  } catch (err) {
    sendError(res, err);
  }
}
