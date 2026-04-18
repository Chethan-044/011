const mongoose = require('mongoose');

const trendReportSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  productName: { type: String, required: true },
  batchIds: [String],
  comparisonPeriod: String,
  trends: Array,
  anomalies: Array,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('TrendReport', trendReportSchema);
