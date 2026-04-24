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

const scrapedReviewSchema = new mongoose.Schema(
  {
    reviewId: { type: String, unique: true, required: true },
    hotelName: { type: String, required: true },
    text: { type: String, required: true },
    cleanedText: { type: String },
    rating: { type: Number, min: 1, max: 5 },
    reviewer: { type: String, default: 'Anonymous' },
    timestamp: { type: String },
    language: { type: String, default: 'en' },
    detectedLanguage: { type: String },
    wasTranslated: { type: Boolean, default: false },
    source: { type: String, default: 'google_maps' },
    url: { type: String },
    scrapedAt: { type: Date },

    // NLP analysis results
    overallSentiment: { type: String },
    sentimentConfidence: { type: Number },
    isSarcastic: { type: Boolean, default: false },
    needsHumanReview: { type: Boolean, default: false },
    isBot: { type: Boolean, default: false },
    botReasons: [String],
    featureSentiments: [featureSentimentSchema],

    analyzedAt: { type: Date },
  },
  { timestamps: true }
);

scrapedReviewSchema.index({ hotelName: 1 });
scrapedReviewSchema.index({ source: 1 });
scrapedReviewSchema.index({ scrapedAt: -1 });

module.exports = mongoose.model('ScrapedReview', scrapedReviewSchema);
