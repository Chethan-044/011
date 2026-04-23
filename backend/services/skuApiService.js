const axios = require('axios');
const OpenAI = require('openai').default || require('openai');

// ---------- Gemini via OpenAI-compatible endpoint ----------
const geminiKey = process.env.GEMINI_API_KEY;

let openai = null;
if (geminiKey && geminiKey !== 'YOUR_GEMINI_API_KEY_HERE') {
  openai = new OpenAI({
    apiKey: geminiKey,
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  });
  console.log('[skuApiService] Gemini client initialized ✓');
} else {
  console.warn('[skuApiService] ⚠ GEMINI_API_KEY not set — will use static fallback reviews');
}

const REVIEW_PROMPT = `Generate one natural customer review for an e-commerce product.

Rules:
- Keep it short (10–25 words), human-like, and slightly imperfect.
- You may include casual tone, small typos, emojis, or Hinglish occasionally.
- Mention at least one aspect: battery, delivery, packaging, quality, price, durability, or taste.
- The review can be positive, negative, or mixed — vary each time.
- Do NOT add quotes, labels, or explanations. Output ONLY the review text.`;

// ---------- Fallback static reviews ----------
const skuCounters = new Map();
const SAMPLE_REVIEWS = [
  'Packaging arrived damaged and corners were crushed.',
  'Delivery was fast and product quality is good.',
  'Price feels high for the quantity provided.',
  'Taste is great but the seal looked tampered.',
  'Battery drains quickly after recent update.',
  'Support team resolved my issue quickly.',
  'Build quality feels premium for the price 👌',
  'Delivery took 10 days, way too long for express shipping.',
  'Packaging was decent but product had minor scratches.',
  'Battery lasts around 6 hours which is just okay tbh.',
  'Customer support ghosted me after first reply 😡',
  'Quality is top notch, using it daily without issues.',
  'Price is reasonable compared to competitors honestly.',
  'Taste was different from what I expected, kinda bland.',
  'Durability seems questionable, handle broke in a week.',
  'Fast delivery but wrong color sent, had to return.',
  'Great packaging, felt like unboxing a gift 🎁',
  'Battery life is amazing, lasts full 2 days easily.',
  'Build quality is okayish, plastic feels cheap.',
  'Support was helpful, got full refund in 3 days.',
  'Packaging material was eco-friendly which I liked.',
  'Delivery boy was rude but product is good.',
  'Price dropped next day after I purchased, frustrated.',
  'Taste buds loved it, ordering again forsure!',
  'Battery heats up during charging, bit worried.',
  'Quality control needs improvement, found a defect.',
  'Bohot accha product hai, worth every rupee 🔥',
  'Delivery was smooth and on time, no complaints.',
  'Build quality is solid, survives daily drops easily.',
  'Thoda expensive hai but quality makes up for it.',
];

function nextMockReviews(sku, count = 1) {
  const key = String(sku || 'SKU').toUpperCase();
  const start = skuCounters.get(key) || 0;
  const now = Date.now();
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const idx = (start + i) % SAMPLE_REVIEWS.length;
    out.push({
      reviewId: `${key}-${now}-${start + i}`,
      text: SAMPLE_REVIEWS[idx],
      createdAt: new Date(now + i * 1000).toISOString(),
    });
  }
  skuCounters.set(key, start + count);
  return out;
}

// ---------- Rate-limit backoff state ----------
let rateLimitUntil = 0;   // timestamp until which we skip Gemini
let consecutiveFails = 0;

// ---------- Gemini review generator ----------
async function generateGeminiReview(sku) {
  const key = String(sku || 'SKU').toUpperCase();
  const now = Date.now();

  if (!openai) {
    console.log('[skuApiService] No Gemini client; using static fallback');
    return nextMockReviews(sku, 1);
  }

  // If rate-limited, fall back to mock reviews
  if (now < rateLimitUntil) {
    const waitSec = Math.round((rateLimitUntil - now) / 1000);
    console.log(`[skuApiService] Rate-limited (${waitSec}s left) — using mock`);
    return nextMockReviews(sku, 1);
  }

  try {
    console.log('[skuApiService] Calling Gemini to generate review for', key);

    const response = await openai.chat.completions.create({
      model: 'gemini-2.0-flash',
      messages: [
        {
          role: 'user',
          content: REVIEW_PROMPT,
        },
      ],
      max_tokens: 80,
      temperature: 1.2,
    });

    const reviewText = (response.choices[0]?.message?.content || '').trim();

    if (!reviewText) {
      console.log('[skuApiService] Gemini returned empty — using mock');
      return nextMockReviews(sku, 1);
    }

    // Success — reset backoff
    consecutiveFails = 0;
    rateLimitUntil = 0;
    console.log('[skuApiService] ✓ Generated Gemini review:', reviewText);

    return [
      {
        reviewId: `${key}-gemini-${now}`,
        text: reviewText,
        createdAt: new Date(now).toISOString(),
      },
    ];
  } catch (err) {
    const is429 = err.status === 429 || err.message?.includes('429');
    if (is429) {
      consecutiveFails += 1;
      const cooldownMs = Math.min(60000, 15000 * consecutiveFails); // 15s, 30s, 45s, 60s max
      rateLimitUntil = Date.now() + cooldownMs;
      console.warn(`[skuApiService] 429 Rate limited — pausing Gemini for ${cooldownMs / 1000}s (attempt #${consecutiveFails})`);
    } else {
      console.error('[skuApiService] Gemini call failed:', err.message);
    }
    console.log('[skuApiService] Falling back to mock');
    return nextMockReviews(sku, 1);
  }
}

// ---------- Public API ----------
/**
 * Fetch latest reviews for a SKU.
 * Priority: external API → Gemini AI → static fallback.
 */
async function fetchReviewsBySku(sku) {
  const base = process.env.SKU_REVIEW_API_URL;

  // If no external API configured, go straight to Gemini
  if (!base) {
    console.log('[skuApiService] No SKU_REVIEW_API_URL; using Gemini generator');
    return generateGeminiReview(sku);
  }

  try {
    console.log('[skuApiService] Fetching reviews for sku', sku);
    const response = await axios.get(base, {
      params: { sku },
      timeout: 8000,
    });
    const body = response.data;
    const list = Array.isArray(body)
      ? body
      : Array.isArray(body?.reviews)
        ? body.reviews
        : Array.isArray(body?.data?.reviews)
          ? body.data.reviews
          : [];
    if (!list.length) {
      console.log('[skuApiService] External API returned empty; using Gemini generator');
      return generateGeminiReview(sku);
    }
    return list;
  } catch (err) {
    console.error('[skuApiService] Fetch failed:', err.message);
    console.log('[skuApiService] Falling back to Gemini generator');
    return generateGeminiReview(sku);
  }
}

module.exports = { fetchReviewsBySku };
