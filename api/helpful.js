// POST /api/helpful { id } → adds one "helpful" vote to a review.
import { markHelpful, sendError } from '../lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  try {
    res.status(200).json(await markHelpful(req.body?.id));
  } catch (err) {
    sendError(res, err);
  }
}
