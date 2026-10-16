# HonestShelf — user reviews for daily essentials

A review platform prototype (in the spirit of Trustified, but with **user reviews**) for everyday products: biscuits, noodles, snacks, staples, dairy, tea, home care and personal care.

## Features

- Product list with search, category filters, and sorting (top rated, most reviewed, price, name)
- Product page with average rating, 5→1 star breakdown, and Value / Quality sub-scores
- Write a review: overall stars, optional value-for-money and quality stars, **where you bought it**, name, title, text
- **Where shoppers bought it:** each review shows the shop or app (kirana store, supermarket, Blinkit, Zepto, Amazon…). The product page shows the split with the average rating per source, and you can filter reviews by source.
- Sort reviews (newest, most helpful, highest, lowest) and vote "Helpful" (once per browser)
- Server-side validation: rating 1–5, length limits, one review per name per product
- Sample reviews are tagged **Demo** so they're never mistaken for real ones
- **Review with a photo** (AI):
  1. The reviewer snaps the front of the pack.
  2. Groq's vision model reads the brand, variant and size, then matches the exact product in the catalogue.
  3. If the product isn't in the catalogue yet, it creates a new product page, using the photo as the product picture.
  4. The AI adds a short factual description and "things to mention" tips (e.g. Taste, Cooking time) to the page.
  5. The review gets a **📷 Photo verified** badge. The server signs a token for the matched product, so the badge can't be faked from the browser.
  6. Photos that aren't a product, or that are too blurry to read, are rejected.
  7. The AI never writes the review text. Reviews stay in the reviewer's own words.

- **Ask before you buy** (AI assistant) on every product page:
  - Answers questions like "Is it worth the price?" or "What are the ingredients?" from the product's reviews first, saying how many reviews back each point.
  - For facts reviews can't answer, it searches the web using Groq's `openai/gpt-oss-20b` model with its built-in `browser_search` tool. For nutrition, allergens and ingredients it uses the product's Open Food Facts label data instead of searching. It's told to trust only official brand sites, FSSAI and other government sites, and established news, and to ignore listicles, affiliate pages and forums.
  - Every answer shows how many reviews it used and links to the web pages it relied on.
  - It treats review text as opinions only and never follows instructions inside it. It won't give medical advice, and stays on the product.

- **Nutrition & label facts** (11 food products): nutrients per 100 g, low/medium/high traffic lights (UK FSA limits), Nutri-Score, NOVA processing level, allergens, palm oil, additives with plain names, and ingredients. The data comes from Open Food Facts (ODbL) and is credited with a link. It's shown as information, never as a "safe" verdict. Tata Salt's figures were wrong in the database, so they're left out.
- **What the web says** (AI summary, separate from HonestShelf reviews): praise, criticism, **safety & recalls**, and key facts from trusted sources only (FSSAI and government sites, the brand, independent lab tests, established news). Every point has numbered citations, sources are labelled Government / Official brand / Lab test / News, and points without a valid source are dropped. Summaries are saved in `data/web-summaries.json` and reused for a week, so page views don't cost AI calls.

## Run it

You need a free Groq key for the photo feature and the assistant: copy `.env.local.example` to `.env.local` and paste your key from https://console.groq.com/keys. Everything else works without it.

No installs needed, just Node 20.12+:

```
node server.js
```

Then open http://localhost:3000

It also runs with `vercel dev`, the same way as the Restock Helper class app.

## Files

| File | What it does |
|---|---|
| `index.html`, `styles.css`, `app.js` | The website (home page + product pages) |
| `api/products.js` | `GET /api/products`: products with average rating and review count |
| `api/reviews.js` | `GET /api/reviews?productId=…&sort=…` and `POST /api/reviews` |
| `api/helpful.js` | `POST /api/helpful`: +1 helpful vote |
| `api/identify.js` | `POST /api/identify`: photo → matched or newly created product + verify token |
| `api/web-summary.js` | `GET`/`POST /api/web-summary`: the cached "What the web says" summary |
| `api/ask.js` | `POST /api/ask`: the "Ask before you buy" assistant |
| `lib/ai.js` | The Groq calls and prompts: photo matching (`MODEL`) and the assistant (`CHAT_MODEL`, its rules in `ASSISTANT_RULES`) |
| `lib/store.js` | Reads/writes the JSON data files, validates reviews, signs/checks photo tokens |
| `data/images/` | Product photos: 14 real pack photos from Open Food Facts / Open Products Facts (CC BY-SA 3.0, credited on each product page and in the footer), plus photos of products created from a shopper's photo |
| `data/products.json` | Product catalogue. Edit this to add products |
| `data/reviews.json` | All reviews (new ones get appended here) |
| `server.js` | Tiny local server that runs the `api/` functions without Vercel |

## Before going live

- **Database:** JSON files only work on your own computer. Vercel's servers can't save files, so replace the read/write helpers in `lib/store.js` with a database such as Supabase or MongoDB Atlas.
- **Accounts & trust:** add login (e.g. phone OTP) so one person can't post many reviews under different names, and consider "verified purchase" badges from bill photo uploads.
- **Moderation:** add a report button and an admin page to hide abusive or fake reviews.
- **Images:** add real product photos instead of category emoji. Photos from new products need cloud storage (e.g. Supabase Storage) once deployed.
- **AI costs (measured on Groq's free plan, Oct 2026):** the free plan allows about 200,000 tokens a day per model (and 8,000 a minute).
  - Assistant question answered from reviews or label data: about 1,000–1,500 tokens.
  - Assistant question that needs a web search: about 9,000 tokens.
  - One "What the web says" summary: about 27,000–75,000 tokens, because the model reads whole web pages. That's only a few a day on the free plan, which is why summaries are saved and reused for a week. For a real launch, use Groq's paid Dev Tier or let only an admin generate summaries.
- **Assistant:** web-search answers can still be wrong or out of date. Keep the on-screen warning, and consider caching answers to common questions to save Groq usage.
- **AI limits:** Groq's free plan allows about 2 photos per minute. The prompt also lists the whole catalogue, so with hundreds of products, first search by the brand the AI reads, then send only the closest matches.
- **Review new products:** products created from photos have no price and are marked "New". An admin should check them before they go public.
