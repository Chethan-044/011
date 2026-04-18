const mongoose = require('mongoose');

const featureSentimentSchema = new mongoose.Schema(
  {
    feature: String,
    sentiment: String,
    confidence: Number,
    keywords: [String],
    snippet: String,
  },
  { _id: false }
);

const geoSchema = new mongoose.Schema(
  {
    city: String,
    state: String,
  },
  { _id: false }
);

const reviewItemSchema = new mongoose.Schema(
  {
    reviewId: String,
    originalText: String,
    cleanedText: String,
    detectedLanguage: String,
    wasTranslated: Boolean,
    rating: Number,
    reviewDate: Date,
    reviewerLocation: String,
    isBot: Boolean,
    botReasons: [String],
    botConfidence: Number,
    botSeverity: String,
    overallSentiment: String,
    sentimentConfidence: Number,
    isSarcastic: Boolean,
    needsHumanReview: Boolean,
    featureSentiments: [featureSentimentSchema],
    geoLocation: geoSchema,
  },
  { _id: false }
);

const reviewBatchSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  productName: { type: String, required: true },
  productCategory: {
    type: String,
    enum: ['electronics', 'food', 'clothing', 'beauty', 'home', 'books', 'sports', 'other'],
  },
  batchId: { type: String, required: true, index: true },
  source: { type: String, enum: ['csv', 'json', 'manual', 'api'], default: 'manual' },
  reviews: [reviewItemSchema],
  analysisStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
  },
  lastError: { type: String },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Review', reviewBatchSchema);
