// POST /api/identify { image: "data:image/jpeg;base64,..." }
// The AI reads the product photo. If it's in the catalogue we return that product;
// if not, we create a new product page for it. Either way the reviewer gets a
// verifyToken so their review can show the "Photo verified" badge.
import { identifyProduct, AiError, CATEGORIES } from '../lib/ai.js';
import { readProducts, fillProductDetails, createProductFromPhoto, createVerifyToken, sendError } from '../lib/store.js';

const MATCH_CONFIDENCE = 0.6; // below this we don't trust a catalogue match
const NEW_PRODUCT_CONFIDENCE = 0.5; // below this we don't create a new product page

const text = (value, max) => String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);

function tidyDetails(ai) {
  const aspects = Array.isArray(ai.aspects) ? ai.aspects.map((a) => text(a, 30)).filter(Boolean).slice(0, 4) : [];
  return {
    name: text(ai.name, 80),
    brand: text(ai.brand, 40),
    size: text(ai.size, 20),
    category: CATEGORIES.includes(ai.category) ? ai.category : 'Other',
    description: text(ai.description, 300),
    aspects,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST to send a photo.' });

  const { image } = req.body || {};
  if (typeof image !== 'string' || !image.startsWith('data:image/jpeg;base64,')) {
    return res.status(400).json({ error: 'No photo received.' });
  }

  try {
    const products = await readProducts();
    const ai = await identifyProduct(image, products);
    const confidence = Math.max(0, Math.min(1, Number(ai.confidence) || 0));
    const details = tidyDetails(ai);

    if (ai.is_product === false) {
      return res.status(422).json({ error: "That doesn't look like a product pack. Take a photo of the front of the packet." });
    }

    const match = products.find((p) => p.id === ai.matched_id);
    if (match && confidence >= MATCH_CONFIDENCE) {
      const product = await fillProductDetails(match.id, details);
      return res.status(200).json({ status: 'matched', confidence, product, verifyToken: createVerifyToken(match.id) });
    }

    if (!details.name || !details.brand || confidence < NEW_PRODUCT_CONFIDENCE) {
      return res.status(422).json({
        error: "Couldn't read the product clearly. Try a sharper photo with the brand name facing the camera.",
        seen: text(ai.visible_text, 120),
      });
    }

    const { product, created } = await createProductFromPhoto(details, image);
    return res.status(created ? 201 : 200).json({
      status: created ? 'created' : 'matched',
      confidence,
      product,
      verifyToken: createVerifyToken(product.id),
    });
  } catch (err) {
    if (err instanceof AiError) return res.status(err.status).json({ error: err.message });
    sendError(res, err);
  }
}
