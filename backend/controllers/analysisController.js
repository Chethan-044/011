const Analysis = require('../models/Analysis');

/**
 * Load analysis row by batch id (used internally and for exports).
 */
exports.findByBatchId = async (batchId, userId) => {
  return Analysis.findOne({ batchId, userId });
};

/**
 * Persist analysis summary after Python completes.
 */
exports.saveAnalysis = async (payload) => {
  console.log('[analysisController] saveAnalysis', payload.batchId);
  return Analysis.findOneAndUpdate(
    { batchId: payload.batchId, userId: payload.userId },
    payload,
    { upsert: true, new: true }
  );
};
