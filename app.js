// HonestShelf frontend. Routes: "#/" (browse) and "#/p/<id>" (product + reviews).
// Three dialogs: "write" (review form), "scan" (identify a product from a photo) and "ask" (AI assistant).
const app = document.getElementById('app');
const writeDialog = document.getElementById('write-dialog');
const scanDialog = document.getElementById('scan-dialog');
const askDialog = document.getElementById('ask-dialog');

const CATEGORY = {
  Biscuits: { icon: '🍪', hue: 38 },
  Noodles: { icon: '🍜', hue: 10 },
  Snacks: { icon: '🥨', hue: 26 },
  Staples: { icon: '🌾', hue: 75 },
  Dairy: { icon: '🥛', hue: 205 },
  Beverages: { icon: '☕', hue: 30 },
  'Home care': { icon: '🧺', hue: 235 },
  'Personal care': { icon: '🧼', hue: 172 },
  Other: { icon: '🛒', hue: 150 },
};
const cat = (name) => CATEGORY[name] || CATEGORY.Other;

const RATING_WORDS = ['', 'Poor', 'Below average', 'Okay', 'Good', 'Excellent'];

// Where a reviewer bought the product. Names must match PURCHASE_SOURCES in lib/store.js.
const PURCHASE_SOURCES = [
  { group: 'In a shop', items: [['Local kirana store', '🏪'], ['Supermarket', '🛒'], ['Medical / chemist', '💊']] },
  { group: 'Quick delivery apps', items: [['Blinkit', '⚡'], ['Zepto', '⚡'], ['Swiggy Instamart', '⚡']] },
  { group: 'Online stores', items: [['BigBasket', '🧺'], ['Amazon', '📦'], ['Flipkart', '📦'], ['JioMart', '📦'], ['Other', '•']] },
];
const SOURCE_ICON = Object.fromEntries(PURCHASE_SOURCES.flatMap((g) => g.items));

const state = {
  products: [], category: 'All', search: '', sort: 'rating',
  verification: null, // { productId, token } after a photo was matched to a product
  reviews: [], filter: { star: null, verified: false, source: null }, reviewSort: 'helpful',
  openWriteOnLoad: false,
  chat: { productId: null, messages: [] }, // "Ask before you buy" conversation for the open product
};

// ---------- icons ----------
const svg = (d, size = 18) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 20),
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>'),
  pen: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  shield: svg('<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>'),
  shieldSm: svg('<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>', 14),
  thumb: svg('<path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z"/><path d="M7 10l4-7a2 2 0 0 1 2.9 2.2L13 9h6a2 2 0 0 1 2 2.3l-1.3 8A2 2 0 0 1 17.7 21H7"/>', 15),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>', 20),
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>', 16),
  sparkle: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>', 14),
  upload: svg('<path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 20h16"/>', 26),
  check: svg('<path d="m5 12 5 5 9-10"/>', 16),
  alert: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/>', 22),
  bot: svg('<rect x="4" y="8" width="16" height="12" rx="4"/><path d="M12 8V4M9 14h.01M15 14h.01"/><circle cx="12" cy="3.5" r="1"/>', 20),
  send: svg('<path d="M4 12 20 4l-6 16-3-7z"/><path d="m11 13 9-9"/>', 18),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>', 14),
  external: svg('<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>', 13),
  bag: svg('<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>', 14),
};

// ---------- helpers ----------
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Stars fill to the exact rating (4.3 shows 4.3 stars), via a gradient clipped to the text.
function stars(rating, cls = '') {
  return `<span class="stars ${cls}" style="--r:${Number(rating) || 0}" role="img" aria-label="Rated ${rating} out of 5">★★★★★</span>`;
}

function verdict(avg) {
  if (avg >= 4.5) return { word: 'Excellent', tone: 'great' };
  if (avg >= 4) return { word: 'Very good', tone: 'great' };
  if (avg >= 3) return { word: 'Good', tone: 'ok' };
  if (avg >= 2) return { word: 'Mixed', tone: 'meh' };
  return { word: 'Poor', tone: 'bad' };
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function timeAgo(iso) {
  const days = Math.floor((Date.now() - new Date(iso)) / 86_400_000);
  if (days < 1) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return formatDate(iso);
}

function avatar(name) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return `<div class="avatar" style="--hue:${hue}" aria-hidden="true">${esc(initials || '?')}</div>`;
}

function media(p, cls = '') {
  const inner = p.image ? `<img src="${esc(p.image)}" alt="${esc(`${p.brand} ${p.name} pack`)}" loading="lazy" />` : `<span class="media-emoji" aria-hidden="true">${cat(p.category).icon}</span>`;
  return `<div class="media ${p.image ? 'has-photo' : ''} ${cls}" style="--hue:${cat(p.category).hue}">${inner}</div>`;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Remembers which reviews this browser already marked helpful.
function votedSet() {
  try { return new Set(JSON.parse(localStorage.getItem('hs-voted') || '[]')); } catch { return new Set(); }
}
function rememberVote(id) {
  try { localStorage.setItem('hs-voted', JSON.stringify([...votedSet(), id])); } catch { /* storage unavailable */ }
}

let toastTimer;
function toast(message, tone = 'ok') {
  const el = document.getElementById('toast');
  el.innerHTML = `<span class="toast-icon">${tone === 'ok' ? I.check : I.alert}</span>${esc(message)}`;
  el.className = `toast show ${tone}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3800);
}

// ---------- home ----------
function renderHome() {
  document.title = 'HonestShelf · Honest reviews for daily essentials';
  const totalReviews = state.products.reduce((n, p) => n + p.stats.count, 0);
  const verified = state.products.reduce((n, p) => n + (p.stats.verified || 0), 0);
  const counts = state.products.reduce((m, p) => m.set(p.category, (m.get(p.category) || 0) + 1), new Map());
  const categories = [['All', state.products.length], ...counts];

  app.innerHTML = `
    <section class="home-hero">
      <div class="hero-copy">
        <span class="eyebrow"><span class="dot"></span> Independent · Shopper-written · Free</span>
        <h1>Know what’s <em>worth</em> buying before it hits your basket.</h1>
        <p class="lede">Honest ratings from real shoppers for the everyday essentials in your kitchen and bathroom.</p>
        <form class="search-xl" role="search" id="search-form">
          ${I.search}
          <input id="search" type="search" placeholder="Search Maggi, Amul, Surf Excel…" value="${esc(state.search)}" aria-label="Search products or brands" autocomplete="off" />
          <button class="btn btn-primary" type="submit">Search</button>
        </form>
        <dl class="trust-stats">
          <div><dt>Products</dt><dd>${state.products.length}</dd></div>
          <div><dt>Shopper reviews</dt><dd>${totalReviews}</dd></div>
          <div><dt>Photo verified</dt><dd>${verified}</dd></div>
        </dl>
      </div>

      <aside class="scan-card" aria-labelledby="scan-card-title">
        <div class="scan-visual" aria-hidden="true">
          <div class="pack"><span>MASALA</span><i></i><i></i></div>
          <div class="scan-line"></div>
          <span class="scan-corner tl"></span><span class="scan-corner tr"></span>
          <span class="scan-corner bl"></span><span class="scan-corner br"></span>
        </div>
        <h2 id="scan-card-title">Review with a photo</h2>
        <ol class="mini-steps">
          <li><b>1</b>Snap the front of the pack</li>
          <li><b>2</b>AI finds the exact product</li>
          <li><b>3</b>Your review gets ${I.shieldSm} <strong>Photo verified</strong></li>
        </ol>
        <button class="btn btn-light btn-lg" type="button" data-open-scan>${I.camera} Scan a pack</button>
      </aside>
    </section>

    <section class="browse" aria-labelledby="browse-title">
      <div class="browse-head">
        <div>
          <h2 id="browse-title" class="section-title">Browse essentials</h2>
          <p class="muted" id="result-count"></p>
        </div>
        <label class="select-wrap">
          <span class="visually-hidden">Sort products</span>
          <select id="sort">
            <option value="rating">Top rated</option>
            <option value="reviews">Most reviewed</option>
            <option value="price">Lowest price</option>
            <option value="name">Name A–Z</option>
          </select>
        </label>
      </div>
      <div class="cat-rail" role="tablist" aria-label="Categories">
        ${categories.map(([c, n]) => `
          <button class="cat ${c === state.category ? 'active' : ''}" role="tab" aria-selected="${c === state.category}" data-cat="${esc(c)}" style="--hue:${c === 'All' ? 150 : cat(c).hue}">
            <span class="cat-icon" aria-hidden="true">${c === 'All' ? '✦' : cat(c).icon}</span>
            <span class="cat-name">${esc(c)}</span>
            <span class="cat-count">${n}</span>
          </button>`).join('')}
      </div>
      <div class="grid" id="grid"></div>
    </section>`;

  document.getElementById('sort').value = state.sort;
  const search = document.getElementById('search');
  search.addEventListener('input', () => { state.search = search.value; renderGrid(); });
  document.getElementById('search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    document.getElementById('browse-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.getElementById('sort').addEventListener('change', (e) => { state.sort = e.target.value; renderGrid(); });
  app.querySelectorAll('.cat').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.category = btn.dataset.cat;
      app.querySelectorAll('.cat').forEach((b) => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', b === btn);
      });
      renderGrid();
    })
  );
  renderGrid();
}

function renderGrid() {
  const q = state.search.trim().toLowerCase();
  const sorters = {
    rating: (a, b) => b.stats.average - a.stats.average || b.stats.count - a.stats.count,
    reviews: (a, b) => b.stats.count - a.stats.count,
    price: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
    name: (a, b) => a.name.localeCompare(b.name),
  };
  const list = state.products
    .filter((p) => state.category === 'All' || p.category === state.category)
    .filter((p) => !q || `${p.name} ${p.brand} ${p.category}`.toLowerCase().includes(q))
    .sort(sorters[state.sort]);

  document.getElementById('result-count').textContent =
    `${plural(list.length, 'product')}${state.category !== 'All' ? ` in ${state.category}` : ''}${q ? ` matching “${state.search.trim()}”` : ''}`;

  const grid = document.getElementById('grid');
  if (!list.length) {
    grid.innerHTML = `
      <div class="empty-state wide">
        <div class="empty-icon">🔍</div>
        <h3>Nothing on this shelf</h3>
        <p class="muted">Try another search, or scan the pack and we’ll add it for you.</p>
        <div class="empty-actions">
          <button class="btn btn-secondary" type="button" id="clear-search">Clear filters</button>
          <button class="btn btn-primary" type="button" data-open-scan>${I.camera} Scan a pack</button>
        </div>
      </div>`;
    document.getElementById('clear-search').addEventListener('click', () => {
      state.search = ''; state.category = 'All'; renderHome();
    });
    return;
  }

  grid.innerHTML = list.map((p) => {
    const v = verdict(p.stats.average);
    return `
      <a class="pcard" href="#/p/${encodeURIComponent(p.id)}">
        <div class="pcard-media">
          ${media(p)}
          ${p.stats.count ? `<span class="score-chip tone-${v.tone}">${p.stats.average.toFixed(1)}<small>★</small></span>` : ''}
          ${p.addedFromPhoto ? '<span class="new-chip">New</span>' : ''}
        </div>
        <div class="pcard-body">
          <span class="pcard-brand">${esc(p.brand)}</span>
          <h3>${esc(p.name)}</h3>
          <span class="pcard-meta">${[p.size, p.price != null && `₹${p.price}`].filter(Boolean).map(esc).join(' · ')}</span>
          <div class="pcard-foot">
            ${p.stats.count
              ? `${stars(p.stats.average)}<span class="muted">${plural(p.stats.count, 'review')}</span>`
              : `<span class="first-review">Be the first to review ${I.arrow}</span>`}
          </div>
        </div>
      </a>`;
  }).join('');
}

// ---------- product page ----------
async function renderProduct(id) {
  const product = state.products.find((p) => p.id === id);
  if (!product) {
    app.innerHTML = `
      <div class="empty-state wide page-empty">
        <div class="empty-icon">🧐</div>
        <h3>We couldn’t find that product</h3>
        <p class="muted">It may have been removed, or the link is wrong.</p>
        <a class="btn btn-primary" href="#/">Browse all products</a>
      </div>`;
    return;
  }
  document.title = `${product.name} reviews · HonestShelf`;
  const { stats } = product;
  const v = verdict(stats.average);
  const recommend = stats.count ? Math.round(((stats.distribution[3] + stats.distribution[4]) / stats.count) * 100) : 0;
  state.filter = { star: null, verified: false, source: null };
  if (state.chat.productId !== id) state.chat = { productId: id, messages: [] };

  app.innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb">
      <a href="#/">Home</a><span aria-hidden="true">/</span>
      <a href="#/" data-goto-cat="${esc(product.category)}">${esc(product.category)}</a><span aria-hidden="true">/</span>
      <span aria-current="page">${esc(product.name)}</span>
    </nav>

    <section class="p-hero" style="--hue:${cat(product.category).hue}">
      <div class="p-media-wrap">
        ${media(product, 'p-media')}
        ${product.imageCredit ? `<a class="img-credit" href="${esc(product.imageCredit.url)}" target="_blank" rel="noopener noreferrer">Photo: ${esc(product.imageCredit.source)} contributors · ${esc(product.imageCredit.license)}</a>` : ''}
      </div>
      <div class="p-info">
        <span class="p-brand">${esc(product.brand)}</span>
        <h1>${esc(product.name)}</h1>
        <div class="p-specs">
          ${product.size ? `<span>${esc(product.size)}</span>` : ''}
          ${product.price != null ? `<span>MRP <strong>₹${esc(product.price)}</strong></span>` : ''}
          <span>${cat(product.category).icon} ${esc(product.category)}</span>
          ${product.addedFromPhoto ? `<span class="spec-new">${I.sparkle} Added from a shopper’s photo</span>` : ''}
        </div>
        ${product.description ? `<p class="p-desc">${esc(product.description)}<span class="ai-chip">${I.sparkle} AI summary</span></p>` : ''}

        <div class="p-score">
          ${stats.count ? `
            <div class="score-num tone-${v.tone}">${stats.average.toFixed(1)}</div>
            <div class="score-text">
              <div class="score-verdict">${v.word}</div>
              ${stars(stats.average, 'stars-lg')}
              <div class="muted">Based on ${plural(stats.count, 'review')}</div>
            </div>
            <div class="score-reco">
              <div class="ring" style="--p:${recommend}"><span>${recommend}%</span></div>
              <span>would<br />recommend</span>
            </div>` : `
            <div class="score-num tone-none">–</div>
            <div class="score-text">
              <div class="score-verdict">No reviews yet</div>
              <div class="muted">Your review will be the first one shoppers see.</div>
            </div>`}
        </div>

        <div class="p-actions">
          <button class="btn btn-primary btn-lg" type="button" data-open-write>${I.pen} Write a review</button>
          <button class="btn btn-secondary btn-lg" type="button" data-open-scan>${I.camera} Verify with a photo</button>
        </div>
      </div>
    </section>

    <section class="ask-card" aria-labelledby="ask-card-title">
      <div class="ask-card-icon">${I.bot}</div>
      <div class="ask-card-text">
        <h2 id="ask-card-title">Ask before you buy</h2>
        <p class="muted">Get a straight answer drawn from ${stats.count ? plural(stats.count, 'shopper review') : 'shopper reviews'} and trusted sources like the brand’s site and FSSAI.</p>
      </div>
      <form class="ask-bar" id="ask-bar">
        <input type="text" name="q" maxlength="500" placeholder="e.g. Is it worth the price?" aria-label="Ask a question about this product" autocomplete="off" />
        <button class="btn btn-primary" type="submit" aria-label="Ask">${I.send}<span>Ask</span></button>
      </form>
      <div class="ask-suggest">
        ${suggestedQuestions(product).map((q) => `<button type="button" class="suggest" data-q="${esc(q)}">${esc(q)}</button>`).join('')}
      </div>
    </section>

    <div class="insights ${product.nutrition ? '' : 'single'}">
      ${product.nutrition ? nutritionPanel(product) : ''}
      <section class="panel web-panel" id="web-panel" aria-labelledby="web-title">
        <header class="info-head">
          <span class="info-icon web">${I.globe}</span>
          <div>
            <h2 id="web-title" class="panel-title">What the web says</h2>
            <span class="info-kicker">Outside HonestShelf · AI summary of trusted sources</span>
          </div>
        </header>
        <div id="web-body"><div class="sk sk-line w70"></div><div class="sk sk-line"></div><div class="sk sk-line w85"></div></div>
      </section>
    </div>

    <section class="p-body">
      <aside class="p-summary">
        <div class="panel">
          <h2 class="panel-title">Ratings overview</h2>
          <div class="bars" role="group" aria-label="Filter by star rating">
            ${[5, 4, 3, 2, 1].map((n) => {
              const count = stats.distribution[n - 1];
              const pct = stats.count ? Math.round((count / stats.count) * 100) : 0;
              return `<button type="button" class="bar-row" data-star="${n}" ${count ? '' : 'disabled'} aria-pressed="false" aria-label="${n} stars: ${plural(count, 'review')}">
                <span class="bar-label">${n}<span class="bar-star">★</span></span>
                <span class="bar"><span style="width:${pct}%"></span></span>
                <span class="bar-pct">${pct}%</span>
              </button>`;
            }).join('')}
          </div>
          <div class="meters" id="sub-scores"></div>
        </div>
        <div class="panel" id="buy-panel" hidden>
          <h2 class="panel-title">Where shoppers bought it</h2>
          <div class="buy-list" id="buy-list" role="group" aria-label="Filter by where it was bought"></div>
        </div>
        <div class="trust-note">
          <span class="trust-icon">${I.shield}</span>
          <div>
            <strong>How we keep reviews honest</strong>
            <ul>
              <li>One review per person per product</li>
              <li>Photo-verified badges are checked by our server</li>
              <li>No paid or brand-written reviews</li>
            </ul>
          </div>
        </div>
      </aside>

      <section class="p-reviews" aria-labelledby="reviews-title">
        <div class="rv-head">
          <h2 id="reviews-title" class="section-title">Shopper reviews <span class="count">${stats.count}</span></h2>
          <label class="select-wrap">
            <span class="visually-hidden">Sort reviews</span>
            <select id="review-sort">
              <option value="helpful">Most helpful</option>
              <option value="newest">Newest</option>
              <option value="highest">Highest rating</option>
              <option value="lowest">Lowest rating</option>
            </select>
          </label>
        </div>
        <div class="filters" id="filters" role="group" aria-label="Filter reviews"></div>
        <div id="review-list" aria-live="polite"></div>
      </section>
    </section>

    <div class="mobile-cta">
      <button class="btn btn-secondary" type="button" data-open-ask>${I.bot} Ask</button>
      <button class="btn btn-primary" type="button" data-open-write>${I.pen} Write a review</button>
    </div>`;

  document.body.classList.add('has-mobile-cta');
  document.getElementById('review-sort').value = state.reviewSort;
  document.getElementById('review-sort').addEventListener('change', (e) => {
    state.reviewSort = e.target.value;
    loadReviews(id);
  });
  app.querySelector('[data-goto-cat]').addEventListener('click', (e) => { state.category = e.currentTarget.dataset.gotoCat; });
  app.querySelectorAll('.bar-row').forEach((row) =>
    row.addEventListener('click', () => {
      const star = Number(row.dataset.star);
      state.filter.star = state.filter.star === star ? null : star;
      renderReviewList();
      document.getElementById('reviews-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
    })
  );
  app.querySelectorAll('[data-open-write]').forEach((b) => b.addEventListener('click', () => openWriteDialog(product)));
  app.querySelectorAll('[data-open-ask]').forEach((b) => b.addEventListener('click', () => openAskDialog(product)));
  document.getElementById('ask-bar').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = e.target.q.value.trim();
    e.target.q.value = '';
    openAskDialog(product, q);
  });
  app.querySelectorAll('.suggest').forEach((b) => b.addEventListener('click', () => openAskDialog(product, b.dataset.q)));

  loadWebSummary(product);
  await loadReviews(id);
  if (state.openWriteOnLoad) {
    state.openWriteOnLoad = false;
    openWriteDialog(product);
  }
}

async function loadReviews(id) {
  const listEl = document.getElementById('review-list');
  listEl.innerHTML = skeletons(2);
  try {
    state.reviews = await api(`/api/reviews?productId=${encodeURIComponent(id)}&sort=${state.reviewSort}`);
    renderSubScores(state.reviews);
    renderBuySources();
    renderReviewList();
  } catch (err) {
    listEl.innerHTML = `<p class="msg error">${esc(err.message)}</p>`;
  }
}

function skeletons(n) {
  return Array.from({ length: n }, () => `
    <div class="review skeleton" aria-hidden="true">
      <div class="sk sk-avatar"></div>
      <div><div class="sk sk-line w40"></div><div class="sk sk-line w70"></div><div class="sk sk-line"></div><div class="sk sk-line w85"></div></div>
    </div>`).join('');
}

// "Where shoppers bought it": share of reviews per shop/app, each row filters the list.
function renderBuySources() {
  const counts = new Map();
  for (const r of state.reviews) if (r.source) counts.set(r.source, (counts.get(r.source) || 0) + 1);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const panel = document.getElementById('buy-panel');
  panel.hidden = !total;
  if (!total) return;
  const list = document.getElementById('buy-list');
  list.innerHTML = [...counts].sort((a, b) => b[1] - a[1]).map(([src, n]) => {
    const avg = state.reviews.filter((r) => r.source === src).reduce((s, r) => s + r.rating, 0) / n;
    return `<button type="button" class="buy-row" data-source="${esc(src)}" aria-pressed="false">
      <span class="buy-icon" aria-hidden="true">${SOURCE_ICON[src] || '•'}</span>
      <span class="buy-name">${esc(src)}<small>${plural(n, 'review')} · avg ${avg.toFixed(1)} ★</small></span>
      <span class="buy-pct">${Math.round((n / total) * 100)}%</span>
    </button>`;
  }).join('');
  list.querySelectorAll('.buy-row').forEach((row) =>
    row.addEventListener('click', () => {
      state.filter.source = state.filter.source === row.dataset.source ? null : row.dataset.source;
      renderReviewList();
      document.getElementById('reviews-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
    })
  );
}

function renderFilters() {
  const { star, verified, source } = state.filter;
  const byStar = [5, 4, 3, 2, 1].map((n) => [n, state.reviews.filter((r) => r.rating === n).length]).filter(([, c]) => c);
  const verifiedCount = state.reviews.filter((r) => r.photoVerified).length;
  const el = document.getElementById('filters');
  if (state.reviews.length < 2 && !source) { el.innerHTML = ''; return; }
  const none = !star && !verified && !source;
  el.innerHTML = `
    <button type="button" class="fchip ${none ? 'active' : ''}" data-f="all" aria-pressed="${none}">All <span>${state.reviews.length}</span></button>
    ${source ? `<button type="button" class="fchip active" data-f="source" aria-pressed="true">${I.bag} Bought from ${esc(source)} <span aria-hidden="true">✕</span></button>` : ''}
    ${verifiedCount ? `<button type="button" class="fchip ${verified ? 'active' : ''}" data-f="verified" aria-pressed="${verified}">${I.shieldSm} Verified <span>${verifiedCount}</span></button>` : ''}
    ${byStar.map(([n, c]) => `<button type="button" class="fchip ${star === n ? 'active' : ''}" data-f="${n}" aria-pressed="${star === n}">${n} ★ <span>${c}</span></button>`).join('')}`;
  el.querySelectorAll('.fchip').forEach((b) =>
    b.addEventListener('click', () => {
      const f = b.dataset.f;
      if (f === 'all') state.filter = { star: null, verified: false, source: null };
      else if (f === 'source') state.filter.source = null;
      else if (f === 'verified') state.filter.verified = !state.filter.verified;
      else state.filter.star = state.filter.star === Number(f) ? null : Number(f);
      renderReviewList();
    })
  );
}

function renderReviewList() {
  const { star, verified, source } = state.filter;
  const reviews = state.reviews.filter((r) =>
    (!star || r.rating === star) && (!verified || r.photoVerified) && (!source || r.source === source));
  renderFilters();
  document.querySelectorAll('.buy-row').forEach((row) => {
    const active = row.dataset.source === source;
    row.classList.toggle('active', active);
    row.setAttribute('aria-pressed', active);
  });
  app.querySelectorAll('.bar-row').forEach((row) => {
    const active = Number(row.dataset.star) === star;
    row.classList.toggle('active', active);
    row.setAttribute('aria-pressed', active);
  });

  const listEl = document.getElementById('review-list');
  const voted = votedSet();
  if (!reviews.length) {
    const filtered = star || verified || source;
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💬</div>
        <h3>${filtered ? 'No reviews match this filter' : 'No reviews yet'}</h3>
        <p class="muted">${filtered ? 'Try a different filter.' : 'Tried it? Your review helps other shoppers decide.'}</p>
        ${filtered ? '' : `<button class="btn btn-primary" type="button" data-open-write-empty>${I.pen} Write the first review</button>`}
      </div>`;
    listEl.querySelector('[data-open-write-empty]')?.addEventListener('click', () => app.querySelector('[data-open-write]').click());
    return;
  }

  listEl.innerHTML = reviews.map((r) => `
    <article class="review" id="review-${esc(r.id)}">
      ${avatar(r.name)}
      <div class="review-main">
        <header class="review-top">
          <span class="review-name">${esc(r.name)}</span>
          ${r.photoVerified ? `<span class="badge verified">${I.shieldSm} Photo verified</span>` : ''}
          ${r.sample ? '<span class="badge">Demo</span>' : ''}
          <time class="review-date" datetime="${esc(r.createdAt)}" title="${formatDate(r.createdAt)}">${timeAgo(r.createdAt)}</time>
        </header>
        <div class="review-rating">${stars(r.rating)}<span class="review-word">${RATING_WORDS[r.rating]}</span>${r.source ? `<span class="bought" title="Where the reviewer bought it">${SOURCE_ICON[r.source] || I.bag} Bought from <b>${esc(r.source)}</b></span>` : ''}</div>
        <h3 class="review-title">${esc(r.title)}</h3>
        <p class="review-body ${r.body.length > 280 ? 'clamp' : ''}">${esc(r.body)}</p>
        ${r.body.length > 280 ? '<button type="button" class="read-more">Read more</button>' : ''}
        <footer class="review-foot">
          ${r.value ? `<span class="sub">💰 Value <b>${r.value}/5</b></span>` : ''}
          ${r.quality ? `<span class="sub">⭐ Quality <b>${r.quality}/5</b></span>` : ''}
          <button class="helpful" data-id="${esc(r.id)}" ${voted.has(r.id) ? 'disabled' : ''} aria-label="Mark as helpful (${r.helpful})">
            ${I.thumb}<span>Helpful</span><b>${r.helpful}</b>
          </button>
        </footer>
      </div>
    </article>`).join('');

  listEl.querySelectorAll('.read-more').forEach((b) =>
    b.addEventListener('click', () => {
      const body = b.previousElementSibling;
      body.classList.toggle('clamp');
      b.textContent = body.classList.contains('clamp') ? 'Read more' : 'Show less';
    })
  );
  listEl.querySelectorAll('.helpful:not([disabled])').forEach((btn) =>
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const { helpful } = await api('/api/helpful', { method: 'POST', body: { id: btn.dataset.id } });
        btn.querySelector('b').textContent = helpful;
        btn.classList.add('pop');
        state.reviews.find((r) => r.id === btn.dataset.id).helpful = helpful;
        rememberVote(btn.dataset.id);
      } catch {
        btn.disabled = false;
      }
    })
  );
}

function renderSubScores(reviews) {
  const avg = (key) => {
    const vals = reviews.map((r) => r[key]).filter(Boolean);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const meter = (label, value) => value == null ? '' : `
    <div class="meter">
      <div class="meter-top"><span>${label}</span><b>${value.toFixed(1)}<small>/5</small></b></div>
      <div class="bar bar-green"><span style="width:${(value / 5) * 100}%"></span></div>
    </div>`;
  const html = meter('💰 Value for money', avg('value')) + meter('⭐ Quality', avg('quality'));
  document.getElementById('sub-scores').innerHTML = html ? `<h3 class="meters-title">Shoppers rate it on</h3>${html}` : '';
}

// ---------- write-a-review dialog ----------
function starInput(name, size, required) {
  // Rendered 5→1 because CSS uses row-reverse to highlight the hovered star and those before it.
  return `<div class="star-input ${size}" role="radiogroup" aria-label="${name === 'rating' ? 'Overall rating' : name}" ${required ? 'aria-required="true"' : ''}>
    ${[5, 4, 3, 2, 1].map((n) => `
      <input type="radio" id="${name}-${n}" name="${name}" value="${n}" />
      <label for="${name}-${n}" title="${RATING_WORDS[n]}"><span class="visually-hidden">${n} star${n > 1 ? 's' : ''}</span>★</label>`).join('')}
  </div>`;
}

function openWriteDialog(product) {
  const verified = state.verification?.productId === product.id;
  writeDialog.innerHTML = `
    <form class="sheet-inner" id="review-form" novalidate>
      <header class="sheet-head">
        ${media(product, 'sheet-thumb')}
        <div class="sheet-head-text">
          <span class="sheet-kicker">Write a review</span>
          <h2 id="write-title">${esc(product.brand)} ${esc(product.name)}</h2>
        </div>
        <button type="button" class="icon-btn" data-close aria-label="Close">${I.x}</button>
      </header>

      <div class="sheet-body">
        ${verified
          ? `<div class="callout verified">${I.shield}<span>Your photo matched this product. This review will carry the <strong>Photo verified</strong> badge.</span></div>`
          : `<div class="callout">${I.camera}<span>Have the pack nearby? <button type="button" class="link-btn" data-switch-scan>Verify with a photo</button> to earn a Photo verified badge.</span></div>`}

        <fieldset class="rate-block">
          <legend>How would you rate it overall? <span class="req">*</span></legend>
          <div class="rate-row">${starInput('rating', '', true)}<span class="rate-word" id="rate-word">Tap a star</span></div>
        </fieldset>

        <div class="sub-ratings">
          <fieldset><legend>💰 Value for money <span class="opt">optional</span></legend>${starInput('value', 'small')}</fieldset>
          <fieldset><legend>⭐ Quality <span class="opt">optional</span></legend>${starInput('quality', 'small')}</fieldset>
        </div>

        <fieldset class="source-pick">
          <legend>Where did you buy it? <span class="req">*</span></legend>
          ${PURCHASE_SOURCES.map((g) => `
            <div class="source-group">
              <span class="source-group-name">${g.group}</span>
              <div class="source-chips">
                ${g.items.map(([name, icon]) => `
                  <label class="source-chip"><input type="radio" name="source" value="${esc(name)}" /><span>${icon} ${esc(name)}</span></label>`).join('')}
              </div>
            </div>`).join('')}
        </fieldset>

        <div class="field">
          <label for="f-title">Headline <span class="req">*</span></label>
          <input id="f-title" type="text" name="title" maxlength="80" placeholder="e.g. Tastes just like childhood" required />
        </div>
        <div class="field">
          <label for="f-body">Your review <span class="req">*</span></label>
          <textarea id="f-body" name="body" maxlength="1000" rows="5" placeholder="What did you like or dislike? Mention taste, quality, packaging, price…" required></textarea>
          <div class="field-foot">
            <div class="aspects">
              ${(product.aspects?.length ? product.aspects : ['Taste', 'Quality', 'Packaging', 'Price'])
                .map((a) => `<button type="button" class="aspect">+ ${esc(a)}</button>`).join('')}
            </div>
            <span class="char-count" id="char-count">0 / 1000</span>
          </div>
        </div>
        <div class="field">
          <label for="f-name">Your name <span class="req">*</span></label>
          <input id="f-name" type="text" name="name" maxlength="40" placeholder="Shown publicly, e.g. Priya S." autocomplete="given-name" required />
        </div>
        <p class="msg" id="form-msg" role="alert"></p>
      </div>

      <footer class="sheet-foot">
        <span class="fine">Be honest and specific. Reviews are public.</span>
        <button class="btn btn-primary btn-lg" type="submit">Post review</button>
      </footer>
    </form>`;

  const form = writeDialog.querySelector('form');
  const textarea = form.querySelector('textarea');
  const count = () => {
    const n = textarea.value.trim().length;
    const el = document.getElementById('char-count');
    el.textContent = n < 20 ? `${20 - n} more characters needed` : `${textarea.value.length} / 1000`;
    el.classList.toggle('ok', n >= 20);
  };
  textarea.addEventListener('input', count);
  form.querySelectorAll('input[name=rating]').forEach((r) =>
    r.addEventListener('change', () => {
      const word = document.getElementById('rate-word');
      word.textContent = RATING_WORDS[r.value];
      word.dataset.tone = r.value >= 4 ? 'great' : r.value == 3 ? 'ok' : 'bad';
    })
  );
  form.querySelectorAll('.aspect').forEach((chip) =>
    chip.addEventListener('click', () => {
      const aspect = chip.textContent.replace(/^\+\s*/, '');
      textarea.value = `${textarea.value.trimEnd()}${textarea.value.trim() ? '\n' : ''}${aspect}: `;
      chip.classList.add('used');
      textarea.focus();
      count();
    })
  );
  form.querySelector('[data-switch-scan]')?.addEventListener('click', () => { writeDialog.close(); openScanDialog(); });
  form.addEventListener('submit', (e) => submitReview(e, product));
  try {
    const saved = localStorage.getItem('hs-name');
    if (saved) form.name.value = saved;
  } catch { /* storage unavailable */ }

  writeDialog.showModal();
  form.querySelector('#rating-5').focus({ preventScroll: true });
}

async function submitReview(e, product) {
  e.preventDefault();
  const form = e.target;
  const msg = document.getElementById('form-msg');
  const data = Object.fromEntries(new FormData(form));
  const fail = (text, focusEl) => {
    msg.textContent = text;
    msg.className = 'msg error';
    focusEl?.focus();
  };
  if (!data.rating) return fail('Please choose an overall star rating.', form.querySelector('#rating-5'));
  if (!data.source) return fail('Please tell us where you bought it.', form.querySelector('input[name=source]'));
  if ((data.title || '').trim().length < 3) return fail('Add a short headline (at least 3 characters).', form.title);
  if ((data.body || '').trim().length < 20) return fail('Your review needs at least 20 characters.', form.body);
  if ((data.name || '').trim().length < 2) return fail('Please add your name (at least 2 characters).', form.name);

  const button = form.querySelector('button[type=submit]');
  button.disabled = true;
  button.textContent = 'Posting…';
  msg.textContent = '';
  try {
    const verifyToken = state.verification?.productId === product.id ? state.verification.token : undefined;
    const review = await api('/api/reviews', { method: 'POST', body: { ...data, productId: product.id, verifyToken } });
    if (verifyToken) state.verification = null; // one verified review per photo
    try { localStorage.setItem('hs-name', data.name.trim()); } catch { /* storage unavailable */ }
    writeDialog.close();
    toast(review.photoVerified ? 'Review posted with a Photo verified badge. Thank you!' : 'Your review is live. Thank you!');
    state.reviewSort = 'newest';
    await refreshProducts();
    await renderProduct(product.id);
    const card = document.getElementById(`review-${review.id}`);
    card?.classList.add('just-posted');
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) {
    fail(err.message);
    button.disabled = false;
    button.textContent = 'Post review';
  }
}

// ---------- scan-a-pack dialog ----------
function openScanDialog() {
  renderScan('pick');
  scanDialog.showModal();
}

function scanShell(body) {
  return `
    <div class="sheet-inner">
      <header class="sheet-head">
        <span class="sheet-head-icon">${I.camera}</span>
        <div class="sheet-head-text">
          <span class="sheet-kicker">Photo verification</span>
          <h2 id="scan-title">Review with a photo</h2>
        </div>
        <button type="button" class="icon-btn" data-close aria-label="Close">${I.x}</button>
      </header>
      <div class="sheet-body">${body}</div>
    </div>`;
}

function renderScan(step, data = {}) {
  if (step === 'pick') {
    scanDialog.innerHTML = scanShell(`
      <label class="dropzone" id="dropzone">
        <input type="file" id="photo-input" accept="image/*" capture="environment" class="visually-hidden" />
        <span class="dz-icon">${I.upload}</span>
        <strong>Take a photo or choose one</strong>
        <span class="muted">or drag an image here</span>
      </label>
      <ul class="tips">
        <li>${I.check} Front of the pack, brand name visible</li>
        <li>${I.check} Good light, no blur</li>
        <li>${I.check} One product per photo</li>
      </ul>`);
    const input = document.getElementById('photo-input');
    input.addEventListener('change', () => input.files[0] && identifyPhoto(input.files[0]));
    const dz = document.getElementById('dropzone');
    ['dragenter', 'dragover'].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((t) => dz.addEventListener(t, () => dz.classList.remove('over')));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file?.type.startsWith('image/')) identifyPhoto(file);
    });
    return;
  }

  if (step === 'working') {
    scanDialog.innerHTML = scanShell(`
      <div class="scan-preview scanning"><img src="${data.image}" alt="Your photo" /><div class="scan-line"></div></div>
      <ol class="progress-steps">
        <li class="done">${I.check} Photo prepared</li>
        <li class="active"><span class="spinner"></span> Reading the pack</li>
        <li>Matching the exact product</li>
      </ol>`);
    return;
  }

  if (step === 'result') {
    const { result, image } = data;
    const p = result.product;
    scanDialog.innerHTML = scanShell(`
      <div class="scan-result">
        <div class="scan-preview"><img src="${image}" alt="Your photo" /><span class="scan-ok">${I.check}</span></div>
        <div class="found">
          <span class="found-label ${result.status === 'created' ? 'new' : ''}">${result.status === 'created'
            ? `${I.sparkle} New product. We’ve created its page`
            : `${I.check} Match found · ${Math.round(result.confidence * 100)}% sure`}</span>
          <span class="p-brand">${esc(p.brand)}</span>
          <h3>${esc(p.name)}</h3>
          <span class="muted">${[p.size, p.category].filter(Boolean).map(esc).join(' · ')}</span>
        </div>
      </div>
      <div class="callout verified">${I.shield}<span>Your next review of this product gets the <strong>Photo verified</strong> badge.</span></div>
      <div class="scan-actions">
        <button class="btn btn-primary btn-lg" type="button" id="scan-write">${I.pen} Write my review</button>
        <button class="btn btn-ghost" type="button" id="scan-retry">Not this product? Try again</button>
      </div>`);
    document.getElementById('scan-write').addEventListener('click', () => {
      scanDialog.close();
      const target = `#/p/${encodeURIComponent(p.id)}`;
      if (location.hash === target) openWriteDialog(state.products.find((x) => x.id === p.id));
      else { state.openWriteOnLoad = true; location.hash = target; }
    });
    document.getElementById('scan-retry').addEventListener('click', () => { state.verification = null; renderScan('pick'); });
    return;
  }

  if (step === 'error') {
    scanDialog.innerHTML = scanShell(`
      <div class="empty-state compact">
        <div class="empty-icon warn">${I.alert}</div>
        <h3>We couldn’t verify that photo</h3>
        <p class="muted">${esc(data.message)}</p>
        <button class="btn btn-primary" type="button" id="scan-retry">Try another photo</button>
      </div>`);
    document.getElementById('scan-retry').addEventListener('click', () => renderScan('pick'));
  }
}

async function identifyPhoto(file) {
  try {
    const image = await shrinkPhoto(file, 1024);
    renderScan('working', { image });
    const result = await api('/api/identify', { method: 'POST', body: { image } });
    state.verification = { productId: result.product.id, token: result.verifyToken };
    await refreshProducts();
    if (scanDialog.open) renderScan('result', { result, image });
    if (!location.hash.startsWith('#/p/')) renderHome();
  } catch (err) {
    if (scanDialog.open) renderScan('error', { message: err.message });
  }
}

// Phone photos are large (5–10 MB). Shrink to at most `maxSize` pixels on the
// longest side and save as JPEG, so the upload is small and fast.
function shrinkPhoto(file, maxSize) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error('Could not read that photo.'));
    img.src = URL.createObjectURL(file);
  });
}

// ---------- Nutrition & label facts (Open Food Facts data) ----------
// Front-of-pack traffic-light thresholds (UK Food Standards Agency), per 100 g or per 100 ml for drinks.
const TRAFFIC = {
  '100 g': { fat: [3, 17.5], saturatedFat: [1.5, 5], sugars: [5, 22.5], salt: [0.3, 1.5] },
  '100 ml': { fat: [1.5, 8.75], saturatedFat: [0.75, 2.5], sugars: [2.5, 11.25], salt: [0.3, 0.75] },
};
const NOVA = {
  1: 'Unprocessed or minimally processed', 2: 'Processed culinary ingredient', 3: 'Processed food', 4: 'Ultra-processed food',
};

function nutritionPanel(product) {
  const n = product.nutrition;
  const v = n.nutrients;
  const unit = n.per.endsWith('ml') ? 'ml' : 'g';
  const level = (key) => {
    const value = v[key];
    if (value == null) return null;
    const [low, high] = TRAFFIC[n.per][key];
    return value <= low ? 'low' : value > high ? 'high' : 'medium';
  };
  const lights = [['fat', 'Fat'], ['saturatedFat', 'Saturated fat'], ['sugars', 'Sugars'], ['salt', 'Salt']]
    .filter(([k]) => v[k] != null)
    .map(([k, label]) => `
      <div class="light ${level(k)}">
        <span class="light-name">${label}</span>
        <b>${v[k]} g</b>
        <span class="light-level">${level(k)}</span>
      </div>`).join('');
  const stats = [['energyKcal', 'Energy', 'kcal'], ['protein', 'Protein', 'g'], ['carbohydrates', 'Carbs', 'g'], ['fiber', 'Fibre', 'g']]
    .filter(([k]) => v[k] != null)
    .map(([k, label, u]) => `<div><dt>${label}</dt><dd>${v[k]}<small> ${u}</small></dd></div>`).join('');

  return `
    <section class="panel nutri-panel" aria-labelledby="nutri-title">
      <header class="info-head">
        <span class="info-icon nutri">🥗</span>
        <div>
          <h2 id="nutri-title" class="panel-title">Nutrition &amp; label facts</h2>
          <span class="info-kicker">From the pack label · per ${n.per}</span>
        </div>
      </header>

      <div class="grades">
        ${n.nutriScore ? `
          <div class="grade-block" title="Nutri-Score rates overall nutritional quality from A (better) to E (less healthy)">
            <span class="grade-label">Nutri-Score</span>
            <div class="nutriscore">${['A', 'B', 'C', 'D', 'E'].map((g) => `<span class="ns-${g.toLowerCase()} ${g === n.nutriScore ? 'on' : ''}">${g}</span>`).join('')}</div>
          </div>` : ''}
        ${n.nova ? `
          <div class="grade-block" title="NOVA groups foods by how processed they are, from 1 to 4">
            <span class="grade-label">Processing</span>
            <div class="nova nova-${n.nova}"><b>${n.nova}</b><span>${NOVA[n.nova]}</span></div>
          </div>` : ''}
      </div>

      ${lights ? `<div class="lights" role="list">${lights}</div>` : ''}
      ${stats ? `<dl class="nutri-stats">${stats}</dl>` : ''}

      <div class="label-chips">
        ${n.allergens.length ? `<span class="lchip warn">⚠️ Contains: <b>${n.allergens.map(esc).join(', ')}</b></span>` : ''}
        ${n.traces.length ? `<span class="lchip">May contain: ${n.traces.map(esc).join(', ')}</span>` : ''}
        ${n.palmOil === 'yes' ? '<span class="lchip">🌴 Contains palm oil</span>' : n.palmOil === 'no' ? '<span class="lchip good">No palm oil</span>' : n.palmOil === 'maybe' ? '<span class="lchip">May contain palm oil</span>' : ''}
        ${n.additives.length ? '' : (n.ingredients ? '<span class="lchip good">No additives listed</span>' : '')}
      </div>

      ${n.additives.length ? `
        <details class="more">
          <summary>${plural(n.additives.length, 'additive')} on the label</summary>
          <ul class="additives">${n.additives.map((a) => `<li><b>${esc(a.code)}</b> ${esc(a.name)} <span class="muted">· ${esc(a.purpose)}</span></li>`).join('')}</ul>
        </details>` : ''}
      ${n.ingredients ? `
        <details class="more">
          <summary>Ingredients</summary>
          <p class="ingredients">${esc(n.ingredients)}</p>
        </details>` : ''}

      <p class="info-fine">
        Label data from <a href="${esc(n.source.url)}" target="_blank" rel="noopener noreferrer">${esc(n.source.name)}</a> (${esc(n.source.license)}), entered by contributors, so it can differ from your pack.
        Low / medium / high use the UK FSA front-of-pack limits per 100 ${unit}.
        This is information, not a safety certificate. For allergies or health conditions, read the pack and ask a doctor.
      </p>
    </section>`;
}

// ---------- What the web says (AI summary of trusted outside sources) ----------
// Who makes each brand, so the brand's own website can be labelled "Official".
const MAKER_DOMAINS = {
  Parle: ['parle'], Britannia: ['britannia'], Nestle: ['nestle', 'maggi'], Sunfeast: ['itcportal', 'sunfeast', 'itc'],
  "Lay's": ['pepsico', 'lays'], Kurkure: ['pepsico', 'kurkure'], "Haldiram's": ['haldiram'], Tata: ['tata'],
  Aashirvaad: ['aashirvaad', 'itcportal'], Amul: ['amul'], 'Surf Excel': ['hul.co.in', 'unilever', 'surfexcel'],
  Vim: ['hul.co.in', 'unilever'], Lifebuoy: ['hul.co.in', 'unilever', 'lifebuoy'], Dettol: ['dettol', 'reckitt'], Colgate: ['colgate'],
};
const NEWS_DOMAINS = ['thehindu', 'indianexpress', 'hindustantimes', 'livemint', 'economictimes', 'timesofindia', 'ndtv', 'business-standard',
  'moneycontrol', 'reuters', 'bbc', 'thehindubusinessline', 'financialexpress', 'scroll.in', 'theprint', 'news18', 'indiatoday', 'deccanherald'];

function sourceType(site, product) {
  if (/(\.gov\.in|\.nic\.in|fssai|bis\.gov)/.test(site)) return ['gov', 'Government'];
  if (/(trustified|consumer-?voice)/.test(site)) return ['lab', 'Lab test'];
  const makers = MAKER_DOMAINS[product.brand] || [product.brand.toLowerCase().replace(/[^a-z]/g, '')];
  if (makers.some((m) => m && site.includes(m))) return ['official', 'Official brand'];
  if (NEWS_DOMAINS.some((d) => site.includes(d))) return ['news', 'News'];
  return ['web', 'Web'];
}

const WEB_SECTIONS_UI = [
  ['praised', '👍', 'What’s praised'],
  ['criticised', '👎', 'Common criticism'],
  ['safety', '🛡️', 'Safety & recalls'],
  ['facts', '📋', 'Key facts'],
];

async function loadWebSummary(product, generate = false) {
  const body = document.getElementById('web-body');
  if (!body) return;
  if (generate) {
    body.innerHTML = `
      <div class="web-working">
        <span class="spinner"></span>
        <div><b>Researching trusted sources…</b><span class="muted">Checking FSSAI, the brand’s website, lab tests and established news. This can take up to a minute.</span></div>
      </div>`;
  }
  try {
    const data = generate
      ? await api('/api/web-summary', { method: 'POST', body: { productId: product.id } })
      : await api(`/api/web-summary?productId=${encodeURIComponent(product.id)}`);
    if (document.getElementById('web-body') !== body) return; // user moved to another page
    renderWebSummary(product, data);
  } catch (err) {
    if (document.getElementById('web-body') !== body) return;
    body.innerHTML = `
      <div class="web-empty">
        <p class="msg error">${esc(err.message)}</p>
        <button type="button" class="btn btn-secondary btn-sm" id="web-retry">Try again</button>
      </div>`;
    document.getElementById('web-retry').addEventListener('click', () => loadWebSummary(product, generate));
  }
}

function renderWebSummary(product, { summary, canRefresh }) {
  const body = document.getElementById('web-body');
  if (!summary) {
    body.innerHTML = `
      <div class="web-empty">
        <p class="muted">See what regulators, the brand, independent lab tests and established news say about this product, with a link to every source. Kept separate from HonestShelf shopper reviews.</p>
        <button type="button" class="btn btn-primary" id="web-generate">${I.globe} Research trusted sources</button>
      </div>`;
    document.getElementById('web-generate').addEventListener('click', () => loadWebSummary(product, true));
    return;
  }

  const cite = (n) => `<a class="cite" href="#web-src-${n}" aria-label="Source ${n}">${n}</a>`;
  const sections = WEB_SECTIONS_UI.filter(([key]) => summary.sections[key]?.length).map(([key, icon, title]) => `
    <div class="web-section ${key}">
      <h3><span aria-hidden="true">${icon}</span> ${title}</h3>
      <ul>${summary.sections[key].map((p) => `<li>${esc(p.text)} <span class="cites">${p.cites.map(cite).join('')}</span></li>`).join('')}</ul>
    </div>`).join('');

  body.innerHTML = `
    ${summary.overview ? `<p class="web-overview">${esc(summary.overview)}</p>` : ''}
    <div class="web-sections">${sections}</div>
    <h3 class="sources-title">Sources</h3>
    <ol class="web-sources">
      ${summary.sources.map((s, i) => {
        const [type, label] = sourceType(s.site, product);
        return `<li id="web-src-${i + 1}">
          <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer nofollow">
            <span class="src-num">${i + 1}</span>
            <span class="src-main"><span class="src-title">${esc(s.title)}</span><span class="src-site">${esc(s.site)}</span></span>
            <span class="src-type ${type}">${label}</span>
            ${I.external}
          </a>
        </li>`;
      }).join('')}
    </ol>
    <footer class="web-foot">
      <span>Researched ${/ago|day/i.test(timeAgo(summary.generatedAt)) ? timeAgo(summary.generatedAt).toLowerCase() : `on ${timeAgo(summary.generatedAt)}`} by AI. It can make mistakes, so open the sources to check.</span>
      ${canRefresh ? '<button type="button" class="link-btn" id="web-refresh">Refresh</button>' : ''}
    </footer>`;
  document.getElementById('web-refresh')?.addEventListener('click', () => loadWebSummary(product, true));
  body.querySelectorAll('.cite').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault(); // keep the #/p/ route
      const li = document.getElementById(a.getAttribute('href').slice(1));
      li.scrollIntoView({ behavior: 'smooth', block: 'center' });
      li.classList.remove('flash'); void li.offsetWidth; li.classList.add('flash');
    })
  );
}

// ---------- "Ask before you buy" chat ----------
function suggestedQuestions(product) {
  const byCategory = {
    'Personal care': 'Is it gentle on sensitive skin?',
    'Home care': 'Does it work well in hard water?',
    Dairy: 'How long does it stay fresh?',
  };
  return [
    'Is it worth the price?',
    'What do people complain about?',
    'Where is the best place to buy it?',
    byCategory[product.category] || 'What are the main ingredients?',
  ];
}

// The assistant replies in plain text with "- " bullets and **bold**. Escape first, then format.
function formatAnswer(text) {
  const lines = esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').split('\n');
  let html = '';
  let inList = false;
  for (const line of lines) {
    const item = line.match(/^\s*[-•*]\s+(.*)/);
    if (item) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${item[1]}</li>`;
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }
    if (line.trim()) html += `<p>${line}</p>`;
  }
  return html + (inList ? '</ul>' : '');
}

function openAskDialog(product, question) {
  askDialog.innerHTML = `
    <div class="sheet-inner chat">
      <header class="sheet-head">
        <span class="sheet-head-icon bot-icon">${I.bot}</span>
        <div class="sheet-head-text">
          <span class="sheet-kicker">Ask before you buy</span>
          <h2 id="ask-title">${esc(product.brand)} ${esc(product.name)}</h2>
        </div>
        <button type="button" class="icon-btn" data-close aria-label="Close">${I.x}</button>
      </header>
      <div class="chat-log" id="chat-log" aria-live="polite"></div>
      <form class="chat-input" id="chat-form">
        <input type="text" name="q" maxlength="500" placeholder="Ask about taste, price, ingredients…" aria-label="Your question" autocomplete="off" />
        <button class="btn btn-primary chat-send" type="submit" aria-label="Send">${I.send}</button>
      </form>
      <p class="chat-fine">AI answers can be wrong. For allergies or health questions, read the pack label and ask a doctor.</p>
    </div>`;

  const form = document.getElementById('chat-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = form.q.value.trim();
    if (!q) return;
    form.q.value = '';
    sendQuestion(product, q);
  });
  renderChat(product);
  if (!askDialog.open) askDialog.showModal();
  if (question) sendQuestion(product, question);
  else form.q.focus();
}

function renderChat(product) {
  const log = document.getElementById('chat-log');
  if (!log) return;
  const { messages } = state.chat;
  const intro = `
    <div class="msg-row bot">
      <span class="chat-avatar">${I.bot}</span>
      <div class="bubble">
        <p>Hi! I’ve read <strong>${plural(product.stats.count, 'shopper review')}</strong> of this product and can check trusted sources like the brand’s website and FSSAI. What would you like to know before buying?</p>
        ${messages.length ? '' : `<div class="chat-suggest">${suggestedQuestions(product).map((q) => `<button type="button" class="suggest" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>`}
      </div>
    </div>`;

  log.innerHTML = intro + messages.map((m, i) => {
    if (m.role === 'user') return `<div class="msg-row user"><div class="bubble">${esc(m.content)}</div></div>`;
    if (m.pending) {
      return `<div class="msg-row bot"><span class="chat-avatar">${I.bot}</span>
        <div class="bubble typing" aria-label="Thinking"><span></span><span></span><span></span><em>Reading reviews and checking trusted sources…</em></div></div>`;
    }
    if (m.error) {
      return `<div class="msg-row bot"><span class="chat-avatar">${I.bot}</span>
        <div class="bubble error">${esc(m.error)} <button type="button" class="link-btn" data-retry="${i}">Try again</button></div></div>`;
    }
    return `<div class="msg-row bot"><span class="chat-avatar">${I.bot}</span>
      <div class="bubble">
        <div class="answer">${formatAnswer(m.content)}</div>
        <div class="answer-meta">
          <span class="basis">${I.shieldSm} Based on ${plural(m.reviewCount, 'review')}${m.sources.length ? ` + ${plural(m.sources.length, 'web source')}` : ''}</span>
        </div>
        ${m.sources.length ? `<ul class="sources">${m.sources.map((s) => `
          <li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer nofollow">
            <span class="src-site">${I.globe} ${esc(s.site)}</span>
            <span class="src-title">${esc(s.title)}</span>
            ${I.external}
          </a></li>`).join('')}</ul>` : ''}
      </div></div>`;
  }).join('');

  log.querySelectorAll('.suggest').forEach((b) => b.addEventListener('click', () => sendQuestion(product, b.dataset.q)));
  log.querySelectorAll('[data-retry]').forEach((b) =>
    b.addEventListener('click', () => {
      const i = Number(b.dataset.retry);
      const q = state.chat.messages[i - 1]?.content;
      state.chat.messages.splice(i - 1, 2); // drop the failed question + error, then ask again
      if (q) sendQuestion(product, q);
    })
  );
  log.scrollTop = log.scrollHeight;
}

async function sendQuestion(product, question) {
  const { messages } = state.chat;
  if (messages.some((m) => m.pending)) return; // one question at a time
  // Earlier turns give the assistant context for follow-ups like "and for kids?"
  const history = messages.filter((m) => !m.error && !m.pending).map((m) => ({ role: m.role, content: m.content }));
  messages.push({ role: 'user', content: question });
  const reply = { role: 'assistant', pending: true };
  messages.push(reply);
  renderChat(product);
  const input = document.querySelector('#chat-form input');
  try {
    const data = await api('/api/ask', { method: 'POST', body: { productId: product.id, question, history } });
    Object.assign(reply, { pending: false, content: data.answer, sources: data.sources || [], reviewCount: data.reviewCount });
  } catch (err) {
    Object.assign(reply, { pending: false, error: err.message });
  }
  renderChat(product);
  input?.focus();
}

// ---------- dialogs: shared behaviour ----------
for (const dialog of [writeDialog, scanDialog, askDialog]) {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('[data-close]')) dialog.close(); // backdrop or ✕
  });
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-open-scan]')) openScanDialog();
});

// ---------- router ----------
async function refreshProducts() {
  state.products = await api('/api/products');
}

function route() {
  document.body.classList.remove('has-mobile-cta');
  for (const d of [writeDialog, scanDialog, askDialog]) if (d.open) d.close();
  const match = location.hash.match(/^#\/p\/(.+)$/);
  if (match) renderProduct(decodeURIComponent(match[1]));
  else renderHome();
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
refreshProducts()
  .then(route)
  .catch(() => {
    app.innerHTML = `<div class="empty-state wide page-empty"><div class="empty-icon warn">${I.alert}</div><h3>Can’t reach the server</h3><p class="muted">Start it with <code>node server.js</code> and open http://localhost:3000</p></div>`;
  });
