const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Papa = require('papaparse');
const Review = require('../models/Review');
const Analysis = require('../models/Analysis');
const analysisController = require('./analysisController');
const pythonBridge = require('../services/pythonBridge');
const reportGenerator = require('../services/reportGenerator');
const { categoryToEnum } = require('../utils/helpers');

const MAX_REVIEWS = 5000;

/**
 * Normalize raw rows into { text, rating?, reviewDate?, reviewerLocation? }.
 */
const normalizeRows = (rows) => {
  const out = [];
  for (const row of rows) {
    if (typeof row === 'string') {
      const t = row.trim();
      if (t) out.push({ text: t });
      continue;
    }
    const text =
      row.text ||
      row.review ||
      row.review_text ||
      row.Review ||
      row.comment ||
      row.body ||
      Object.values(row).find((v) => typeof v === 'string' && v.length > 2);
    if (text && String(text).trim()) {
      out.push({
        text: String(text).trim(),
        rating: row.rating ?? row.stars,
        reviewDate: row.reviewDate || row.date || row.review_date,
        reviewerLocation: row.reviewerLocation || row.location || row.city || row.reviewer_location,
      });
    }
  }
  return out;
};

/**
 * Parse uploaded file into review objects.
 */
const parseUploadedFile = (filePath, ext) => {
  const raw = fs.readFileSync(filePath, 'utf8');
  console.log('[reviewController] parse file', ext, 'length', raw.length);
  if (ext === '.json') {
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : parsed.reviews || [];
    return normalizeRows(arr);
  }
  if (ext === '.csv') {
    const { data } = Papa.parse(raw, { header: true, skipEmptyLines: true });
    return normalizeRows(data);
  }
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  return normalizeRows(lines);
};

/**
 * Accept file upload or manual JSON body with reviews[].
 */
exports.uploadReviews = async (req, res) => {
  try {
    let reviews = [];
    let source = 'manual';
    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      source = ext === '.json' ? 'json' : ext === '.csv' ? 'csv' : 'csv';
      reviews = parseUploadedFile(req.file.path, ext);
      fs.unlink(req.file.path, () => {});
    } else if (req.body.reviews) {
      const bodyReviews = typeof req.body.reviews === 'string' ? JSON.parse(req.body.reviews) : req.body.reviews;
      reviews = normalizeRows(Array.isArray(bodyReviews) ? bodyReviews : []);
      if (req.body.source === 'api') source = 'api';
    } else if (req.body.text && typeof req.body.text === 'string') {
      reviews = normalizeRows(req.body.text.split(/\r?\n/));
    }

    if (!reviews.length) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'No reviews found — upload a file or paste text',
      });
    }
    if (reviews.length > MAX_REVIEWS) {
      return res.status(400).json({
        success: false,
        data: null,
        message: `Maximum ${MAX_REVIEWS} reviews per batch`,
      });
    }

    const batchId = uuidv4();
    const productName = req.body.productName || req.body.product_name || 'Unnamed product';
    const productCategory = categoryToEnum(req.body.productCategory || req.body.product_category || 'other');

    const reviewDocs = reviews.map((r, i) => ({
      reviewId: r.reviewId || `r-${i + 1}`,
      originalText: r.text,
      cleanedText: '',
      detectedLanguage: '',
      wasTranslated: false,
      rating: r.rating,
      reviewDate: r.reviewDate ? new Date(r.reviewDate) : undefined,
      reviewerLocation: r.reviewerLocation,
      isBot: false,
      botReasons: [],
      botConfidence: 0,
      botSeverity: 'clean',
      overallSentiment: '',
      sentimentConfidence: 0,
      isSarcastic: false,
      needsHumanReview: false,
      featureSentiments: [],
      geoLocation: { city: '', state: '' },
    }));

    await Review.create({
      userId: req.user._id,
      productName,
      productCategory,
      batchId,
      source,
      reviews: reviewDocs,
      analysisStatus: 'pending',
    });

    console.log('[reviewController] uploadReviews saved batch', batchId, reviewDocs.length);
    return res.status(201).json({
      success: true,
      data: { batchId, reviewCount: reviewDocs.length, status: 'pending' },
      message: 'Upload received',
    });
  } catch (err) {
    console.error('[reviewController] uploadReviews', err);
    return res.status(500).json({ success: false, data: null, message: err.message });
  }
};

/**
 * Run AI pipeline for a batch.
 */
exports.processReviews = async (req, res) => {
  const { batchId } = req.params;
  try {
    console.log('[reviewController] processReviews', batchId);
    const batch = await Review.findOne({ batchId, userId: req.user._id });
    if (!batch) {
      return res.status(404).json({ success: false, data: null, message: 'Batch not found' });
    }

    batch.analysisStatus = 'processing';
    batch.lastError = undefined;
    await batch.save();

    const pyInput = batch.reviews.map((r) => ({
      reviewId: r.reviewId,
      text: r.originalText,
      originalText: r.originalText,
      rating: r.rating,
      reviewDate: r.reviewDate,
      reviewerLocation: r.reviewerLocation,
    }));

    let aiData;
    try {
      aiData = await pythonBridge.analyzeReviews(pyInput, batch.productName, batch.productCategory);
    } catch (err) {
      batch.analysisStatus = 'failed';
      batch.lastError = err.message;
      await batch.save();
      throw err;
    }

    const incoming = aiData.reviews || [];
    batch.reviews = incoming.map((r) => ({
      reviewId: r.reviewId,
      originalText: r.originalText,
      cleanedText: r.cleanedText,
      detectedLanguage: r.detectedLanguage,
      wasTranslated: r.wasTranslated,
      rating: r.rating,
      reviewDate: r.reviewDate,
      reviewerLocation: r.reviewerLocation,
      isBot: r.isBot,
      botReasons: r.botReasons || [],
      botConfidence: r.botConfidence,
      botSeverity: r.botSeverity,
      overallSentiment: r.overallSentiment,
      sentimentConfidence: r.sentimentConfidence,
      isSarcastic: r.isSarcastic,
      needsHumanReview: r.needsHumanReview,
      featureSentiments: r.featureSentiments || [],
      geoLocation: r.geoLocation || {},
    }));

    const s = aiData.summary || {};
    const tr = aiData.trend_report || {};

    const recs = (aiData.recommendations || []).map((r) => ({
      issue: r.issue,
      action: r.action,
      priority: r.priority,
      department: r.department,
      supportingData: r.supporting_data || r.supportingData,
    }));

    await analysisController.saveAnalysis({
      batchId,
      userId: req.user._id,
      productName: batch.productName,
      productCategory: batch.productCategory,
      totalReviews: s.total_reviews,
      cleanReviews: s.clean_reviews,
      botFlagged: s.bot_flagged,
      overallSentimentBreakdown: s.overall_sentiment_breakdown || {},
      featureAnalysis: aiData.feature_analysis || [],
      trendReport: {
        emergingIssues: tr.emergingIssues || [],
        improvingTrends: tr.improvingTrends || [],
        anomalies: tr.anomalies || [],
        systemicIssues: tr.systemicIssues || [],
        overallHealthScore: tr.overallHealthScore,
        trendSummary: tr.trendSummary,
      },
      recommendations: recs,
      geoInsights: aiData.geo_insights || {},
      processingTimeSeconds: s.processing_time_seconds,
    });

    batch.analysisStatus = 'completed';
    await batch.save();

    const analysis = await analysisController.findByBatchId(batchId, req.user._id);

    console.log('[reviewController] processReviews completed', batchId);
    return res.json({
      success: true,
      data: { batch, analysis, ai: aiData },
      message: 'Processing complete',
    });
  } catch (err) {
    console.error('[reviewController] processReviews', err);
    return res.status(500).json({
      success: false,
      data: null,
      message: err.message || 'Processing failed',
    });
  }
};

/**
 * Return stored analysis + review batch.
 */
exports.getAnalysis = async (req, res) => {
  try {
    const { batchId } = req.params;
    console.log('[reviewController] getAnalysis', batchId);
    const batch = await Review.findOne({ batchId, userId: req.user._id });
    const analysis = await analysisController.findByBatchId(batchId, req.user._id);
    if (!batch) {
      return res.status(404).json({ success: false, data: null, message: 'Batch not found' });
    }
    return res.json({
      success: true,
      data: { batch, analysis },
      message: 'OK',
    });
  } catch (err) {
    console.error('[reviewController] getAnalysis', err);
    return res.status(500).json({ success: false, data: null, message: err.message });
  }
};

/**
 * List batches for dashboard.
 */
exports.getUserBatches = async (req, res) => {
  try {
    console.log('[reviewController] getUserBatches user', req.user._id);
    const batches = await Review.find({ userId: req.user._id }).sort({ createdAt: -1 });
    const analyses = await Analysis.find({ userId: req.user._id });
    const healthByBatch = {};
    analyses.forEach((a) => {
      healthByBatch[a.batchId] = a.trendReport?.overallHealthScore ?? null;
    });

    const list = batches.map((b) => ({
      batchId: b.batchId,
      productName: b.productName,
      productCategory: b.productCategory,
      status: b.analysisStatus,
      totalReviews: b.reviews?.length || 0,
      createdAt: b.createdAt,
      overallHealthScore: healthByBatch[b.batchId],
    }));

    return res.json({ success: true, data: { batches: list }, message: 'OK' });
  } catch (err) {
    console.error('[reviewController] getUserBatches', err);
    return res.status(500).json({ success: false, data: null, message: err.message });
  }
};

/**
 * Quick single-review demo without persistence.
 */
exports.addSingleReview = async (req, res) => {
  try {
    const { text, productName } = req.body;
    console.log('[reviewController] addSingleReview');
    if (!text) {
      return res.status(400).json({ success: false, data: null, message: 'text required' });
    }
    const data = await pythonBridge.analyzeSingleReview(text, productName || 'Demo product');
    return res.json({ success: true, data, message: 'OK' });
  } catch (err) {
    console.error('[reviewController] addSingleReview', err);
    return res.status(500).json({ success: false, data: null, message: err.message });
  }
};

/**
 * Proxy PDF/CSV download via Python report service.
 */
exports.downloadReport = async (req, res) => {
  try {
    const { batchId } = req.params;
    const format = (req.query.format || 'pdf').toLowerCase();
    console.log('[reviewController] downloadReport', batchId, format);
    const analysis = await analysisController.findByBatchId(batchId, req.user._id);
    const batch = await Review.findOne({ batchId, userId: req.user._id });
    if (!analysis || !batch) {
      return res.status(404).json({ success: false, data: null, message: 'Analysis not found' });
    }

    const analysisResult = {
      product_name: batch.productName,
      category: batch.productCategory,
      summary: {
        total_reviews: analysis.totalReviews,
        clean_reviews: analysis.cleanReviews,
        bot_flagged: analysis.botFlagged,
        overall_health_score: analysis.trendReport?.overallHealthScore,
        overall_sentiment_breakdown: analysis.overallSentimentBreakdown,
        processing_time_seconds: analysis.processingTimeSeconds,
      },
      feature_analysis: analysis.featureAnalysis,
      recommendations: analysis.recommendations,
      trend_report: analysis.trendReport,
    };

    const buffer = await reportGenerator.buildReport(analysisResult, format);
    const ext = format === 'csv' ? 'csv' : 'pdf';
    res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="reviewsense-${batchId}.${ext}"`);
    return res.send(buffer);
  } catch (err) {
    console.error('[reviewController] downloadReport', err);
    return res.status(500).json({ success: false, data: null, message: err.message });
  }
};
