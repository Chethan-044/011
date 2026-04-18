const mongoose = require('mongoose');

const featureAnalysisSchema = new mongoose.Schema(
  {
    feature: String,
    positiveCount: Number,
    negativeCount: Number,
    neutralCount: Number,
    avgConfidence: Number,
    trend: String,
  },
  { _id: false }
);

const recommendationSchema = new mongoose.Schema(
  {
    issue: String,
    action: String,
    priority: String,
    department: String,
    supportingData: String,
  },
  { _id: false }
);

const analysisSchema = new mongoose.Schema({
  batchId: { type: String, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  productName: String,
  productCategory: String,
  totalReviews: Number,
  cleanReviews: Number,
  botFlagged: Number,
  overallSentimentBreakdown: {
    positive: Number,
    negative: Number,
    neutral: Number,
    sarcastic: Number,
  },
  featureAnalysis: [featureAnalysisSchema],
  trendReport: {
    emergingIssues: Array,
    improvingTrends: Array,
    anomalies: Array,
    systemicIssues: Array,
    overallHealthScore: Number,
    trendSummary: String,
  },
  recommendations: [recommendationSchema],
  geoInsights: mongoose.Schema.Types.Mixed,
  processingTimeSeconds: Number,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Analysis', analysisSchema);
