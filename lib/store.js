// Shared data layer used by the API functions.
// Stores everything in data/*.json, which is fine for a prototype on one machine.
// For a deployed site, swap these read/write helpers for a real database (e.g. Supabase).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const REVIEWS_FILE = path.join(DATA_DIR, 'reviews.json');
export const IMAGES_DIR = path.join(DATA_DIR, 'images');

// Writes run one after another so two quick submissions can't overwrite each other.
let writeQueue = Promise.resolve();

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function updateJson(file, change) {
  const run = writeQueue.then(async () => {
    const items = await readJson(file);
    const result = await change(items);
    await writeFile(file, JSON.stringify(items, null, 2));
    return result;
  });
  writeQueue = run.catch(() => {});
  return run;
}

const updateReviews = (change) => updateJson(REVIEWS_FILE, change);
const updateProducts = (change) => updateJson(PRODUCTS_FILE, change);

export class InputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function statsFor(reviews) {
  const dist = [0, 0, 0, 0, 0];
  let sum = 0;
  for (const r of reviews) {
    dist[r.rating - 1]++;
    sum += r.rating;
  }
  const count = reviews.length;
  const verified = reviews.filter((r) => r.photoVerified).length;
  const sources = {};
  for (const r of reviews) if (r.source) sources[r.source] = (sources[r.source] || 0) + 1;
  return { count, verified, sources, average: count ? Math.round((sum / count) * 10) / 10 : 0, distribution: dist };
}

export async function getProducts() {
  const [products, reviews] = await Promise.all([readJson(PRODUCTS_FILE), readJson(REVIEWS_FILE)]);
  return products.map((p) => ({ ...p, stats: statsFor(reviews.filter((r) => r.productId === p.id)) }));
}

export function readProducts() {
  return readJson(PRODUCTS_FILE);
}

function slugify(text) {
  return text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'product';
}

// Adds the AI's description and review tips to a catalogue product that doesn't have them yet.
export function fillProductDetails(id, { description, aspects }) {
  return updateProducts((products) => {
    const product = products.find((p) => p.id === id);
    if (product && !product.description && description) {
      product.description = description;
      product.aspects = aspects;
    }
    return product;
  });
}

// Creates a catalogue entry for a product identified from a photo, and saves the photo as its picture.
export async function createProductFromPhoto(details, imageDataUrl) {
  const base64 = imageDataUrl.replace(/^data:image\/jpeg;base64,/, '');
  return updateProducts((products) => {
    // The same product may have been added from another photo already.
    const existing = products.find(
      (p) => p.name.toLowerCase() === details.name.toLowerCase() && p.brand.toLowerCase() === details.brand.toLowerCase() &&
        (p.size || '').toLowerCase() === (details.size || '').toLowerCase()
    );
    if (existing) return { product: existing, created: false };

    let id = slugify(`${details.brand} ${details.name} ${details.size}`);
    while (products.some((p) => p.id === id)) id += '-' + randomBytes(2).toString('hex');

    const product = { id, ...details, price: null, image: `/images/${id}.jpg`, addedFromPhoto: true, createdAt: new Date().toISOString() };
    products.push(product);
    return mkdir(IMAGES_DIR, { recursive: true })
      .then(() => writeFile(path.join(IMAGES_DIR, `${id}.jpg`), Buffer.from(base64, 'base64')))
      .then(() => ({ product, created: true }));
  });
}

// ---------- photo verification ----------
// After the AI matches a photo to a product, the server hands out a signed token for that product.
// A review sent with a valid token gets the "Photo verified" badge. The page can't forge one.
const SECRET = process.env.VERIFY_SECRET || process.env.GROQ_API_KEY || randomBytes(32).toString('hex');
const TOKEN_LIFETIME_MS = 60 * 60 * 1000;

function sign(productId, expires) {
  return createHmac('sha256', SECRET).update(`${productId}.${expires}`).digest('hex');
}

export function createVerifyToken(productId) {
  const expires = Date.now() + TOKEN_LIFETIME_MS;
  return `${expires}.${sign(productId, expires)}`;
}

function isValidToken(token, productId) {
  const [expires, sig] = String(token || '').split('.');
  if (!sig || Number(expires) < Date.now()) return false;
  const expected = Buffer.from(sign(productId, expires));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const SORTS = {
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
  helpful: (a, b) => b.helpful - a.helpful || b.createdAt.localeCompare(a.createdAt),
  highest: (a, b) => b.rating - a.rating || b.createdAt.localeCompare(a.createdAt),
  lowest: (a, b) => a.rating - b.rating || b.createdAt.localeCompare(a.createdAt),
};

export async function getReviews(productId, sort = 'newest') {
  const reviews = await readJson(REVIEWS_FILE);
  return reviews.filter((r) => r.productId === productId).sort(SORTS[sort] || SORTS.newest);
}

function cleanText(value, field, min, max) {
  const text = String(value ?? '').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim();
  if (text.length < min) throw new InputError(`${field} must be at least ${min} characters.`);
  if (text.length > max) throw new InputError(`${field} must be at most ${max} characters.`);
  return text;
}

function cleanRating(value, field, required) {
  if (!required && (value === undefined || value === null || value === '')) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new InputError(`${field} must be 1 to 5 stars.`);
  return n;
}

// Where the reviewer bought the product. Keep in sync with PURCHASE_SOURCES in app.js.
export const PURCHASE_SOURCES = [
  'Local kirana store', 'Supermarket', 'Medical / chemist',
  'Blinkit', 'Zepto', 'Swiggy Instamart', 'BigBasket', 'Amazon', 'Flipkart', 'JioMart', 'Other',
];

export async function addReview(input = {}) {
  if (!PURCHASE_SOURCES.includes(input.source)) throw new InputError('Please tell us where you bought it.');

  const products = await readJson(PRODUCTS_FILE);
  if (!products.some((p) => p.id === input.productId)) throw new InputError('Unknown product.', 404);

  const review = {
    id: randomUUID(),
    productId: input.productId,
    name: cleanText(input.name, 'Name', 2, 40),
    rating: cleanRating(input.rating, 'Overall rating', true),
    value: cleanRating(input.value, 'Value for money', false),
    quality: cleanRating(input.quality, 'Quality', false),
    title: cleanText(input.title, 'Title', 3, 80),
    body: cleanText(input.body, 'Review', 20, 1000),
    source: input.source,
    photoVerified: isValidToken(input.verifyToken, input.productId),
    helpful: 0,
    createdAt: new Date().toISOString(),
  };

  return updateReviews((reviews) => {
    const duplicate = reviews.some(
      (r) => r.productId === review.productId && !r.sample && r.name.toLowerCase() === review.name.toLowerCase()
    );
    if (duplicate) throw new InputError('You have already reviewed this product.', 409);
    reviews.push(review);
    return review;
  });
}

export async function markHelpful(id) {
  return updateReviews((reviews) => {
    const review = reviews.find((r) => r.id === id);
    if (!review) throw new InputError('Review not found.', 404);
    review.helpful++;
    return { id, helpful: review.helpful };
  });
}

// ---------- "What the web says" cache ----------
// One AI web summary per product, reused for a while so each page view doesn't cost an AI call.
const WEB_SUMMARIES_FILE = path.join(DATA_DIR, 'web-summaries.json');

async function readWebSummaries() {
  try {
    return await readJson(WEB_SUMMARIES_FILE);
  } catch {
    return {}; // file not created yet
  }
}

export async function getWebSummary(productId) {
  return (await readWebSummaries())[productId] || null;
}

export async function saveWebSummary(productId, summary) {
  const run = writeQueue.then(async () => {
    const all = await readWebSummaries();
    all[productId] = { ...summary, generatedAt: new Date().toISOString() };
    await writeFile(WEB_SUMMARIES_FILE, JSON.stringify(all, null, 2));
    return all[productId];
  });
  writeQueue = run.catch(() => {});
  return run;
}

// Turns thrown errors into JSON responses for the API functions.
export function sendError(res, err) {
  if (err instanceof InputError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  return res.status(500).json({ error: 'Something went wrong. Try again.' });
}
