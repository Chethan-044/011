const axios = require('axios');

/**
 * Fetch latest reviews for a SKU from an external API.
 * Gemini generation has been removed — review ingestion now comes
 * from the ReviewSense Scout Chrome Extension via /api/extension/ingest.
 */
async function fetchReviewsBySku(sku) {
  const base = process.env.SKU_REVIEW_API_URL;

  if (!base) {
    console.log('[skuApiService] No SKU_REVIEW_API_URL configured; returning empty');
    return [];
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
    return list;
  } catch (err) {
    console.error('[skuApiService] Fetch failed:', err.message);
    return [];
  }
}

module.exports = { fetchReviewsBySku };
