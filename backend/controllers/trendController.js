const Analysis = require('../models/Analysis');
const Review = require('../models/Review');

/**
 * Timeline of analyses for one product (by name).
 */
exports.getTrends = async (req, res) => {
  try {
    const { productName } = req.params;
    const decodedName = decodeURIComponent(productName || '');
    console.log('[trendController] getTrends', decodedName);

    const batches = await Review.find({
      userId: req.user._id,
      productName: decodedName,
      analysisStatus: 'completed',
    }).sort({ createdAt: 1 });

    const batchIds = batches.map((b) => b.batchId);
    const analyses = await Analysis.find({
      userId: req.user._id,
      batchId: { $in: batchIds },
    }).sort({ createdAt: 1 });

    const timeline = analyses.map((a, idx) => ({
      batchIndex: idx + 1,
      batchId: a.batchId,
      createdAt: a.createdAt,
      healthScore: a.trendReport?.overallHealthScore,
      sentiment: a.overallSentimentBreakdown,
      featureAnalysis: a.featureAnalysis,
      emergingIssues: a.trendReport?.emergingIssues || [],
    }));

    return res.json({
      success: true,
      data: { productName: decodedName, timeline },
      message: 'OK',
    });
  } catch (err) {
    console.error('[trendController] getTrends', err);
    return res.status(500).json({ success: false, data: null, message: err.message });
  }
};

/**
 * Time-series for a single feature across batches.
 */
exports.getFeatureTrend = async (req, res) => {
  try {
    const { productName, feature } = req.params;
    const decodedName = decodeURIComponent(productName || '');
    const feat = decodeURIComponent(feature || '');
    console.log('[trendController] getFeatureTrend', decodedName, feat);

    const analyses = await Analysis.find({
      userId: req.user._id,
      productName: decodedName,
    }).sort({ createdAt: 1 });

    const points = analyses.map((a, idx) => {
      const row = (a.featureAnalysis || []).find((f) => f.feature === feat);
      const total = row
        ? (row.positiveCount || 0) + (row.negativeCount || 0) + (row.neutralCount || 0)
        : 0;
      const posPct = total && row ? Math.round((100 * (row.positiveCount || 0)) / total) : 0;
      return {
        batchIndex: idx + 1,
        batchId: a.batchId,
        date: a.createdAt,
        positivePct: posPct,
        negativeCount: row?.negativeCount || 0,
        positiveCount: row?.positiveCount || 0,
      };
    });

    return res.json({
      success: true,
      data: { productName: decodedName, feature: feat, points },
      message: 'OK',
    });
  } catch (err) {
    console.error('[trendController] getFeatureTrend', err);
    return res.status(500).json({ success: false, data: null, message: err.message });
  }
};

/**
 * Critical emerging issues across all completed analyses.
 */
exports.getAlerts = async (req, res) => {
  try {
    console.log('[trendController] getAlerts');
    const analyses = await Analysis.find({ userId: req.user._id }).sort({ createdAt: -1 });
    const alerts = [];
    analyses.forEach((a) => {
      (a.trendReport?.emergingIssues || []).forEach((issue) => {
        if ((issue.severity || '').toUpperCase() === 'CRITICAL') {
          alerts.push({
            batchId: a.batchId,
            productName: a.productName,
            feature: issue.feature,
            severity: issue.severity,
            message: `${issue.feature}: ${issue.old_percentage}% → ${issue.new_percentage}%`,
            recommendation: issue.recommendation,
          });
        }
      });
    });
    return res.json({ success: true, data: { alerts }, message: 'OK' });
  } catch (err) {
    console.error('[trendController] getAlerts', err);
    return res.status(500).json({ success: false, data: null, message: err.message });
  }
};
