const axios = require('axios');

const PYTHON_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';

/**
 * Ping Python AI service health endpoint.
 */
async function checkPythonHealth() {
  try {
    const res = await axios.get(`${PYTHON_URL}/api/health`, { timeout: 3000 });
    const d = res.data?.data || res.data;
    return {
      available: true,
      models_loaded: !!(d && d.models_loaded),
      raw: res.data,
    };
  } catch (err) {
    console.log('[pythonBridge] Health check failed:', err.message);
    return { available: false, models_loaded: false };
  }
}

/**
 * Run full batch analysis in Python.
 */
async function analyzeReviews(reviews, productName, category) {
  try {
    console.log('[pythonBridge] analyzeReviews batch size', reviews.length);
    const res = await axios.post(
      `${PYTHON_URL}/api/analyze/batch`,
      { reviews, product_name: productName, category },
      { timeout: 300000 }
    );
    return res.data?.data ?? res.data;
  } catch (err) {
    console.error('[pythonBridge] analyzeReviews error:', err.message);
    throw new Error('AI service unavailable');
  }
}

/**
 * Analyze a single review string.
 */
async function analyzeSingleReview(text, productName) {
  try {
    const res = await axios.post(
      `${PYTHON_URL}/api/analyze/single`,
      { text, product_name: productName },
      { timeout: 30000 }
    );
    return res.data?.data ?? res.data;
  } catch (err) {
    console.error('[pythonBridge] analyzeSingleReview error:', err.message);
    throw new Error('AI service unavailable');
  }
}

/**
 * Preprocess only (clean / translate).
 */
async function preprocessReviews(reviews) {
  try {
    const res = await axios.post(`${PYTHON_URL}/api/preprocess`, { reviews }, { timeout: 120000 });
    return res.data?.data ?? res.data;
  } catch (err) {
    console.error('[pythonBridge] preprocessReviews error:', err.message);
    throw new Error('AI service unavailable');
  }
}

/**
 * Generate PDF or CSV bytes from Python.
 */
async function generateReport(analysisResult, format) {
  try {
    const res = await axios.post(
      `${PYTHON_URL}/api/report/generate`,
      { analysis_result: analysisResult, format },
      { responseType: 'arraybuffer', timeout: 120000 }
    );
    return Buffer.from(res.data);
  } catch (err) {
    console.error('[pythonBridge] generateReport error:', err.message);
    throw new Error('AI service unavailable');
  }
}

module.exports = {
  checkPythonHealth,
  analyzeReviews,
  analyzeSingleReview,
  preprocessReviews,
  generateReport,
};
