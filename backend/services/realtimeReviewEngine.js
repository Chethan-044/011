const crypto = require('crypto');
const pythonBridge = require('./pythonBridge');
const { fetchReviewsBySku } = require('./skuApiService');
const { sendIssueAlert } = require('./emailService');

const POLL_INTERVAL_MS = 15000;
const DEFAULT_WINDOW = 50;
const MIN_COMPARE_WINDOW = 20;

function normalizeText(value) {
  return String(value || '').trim();
}

function sentenceCase(value) {
  const txt = normalizeText(value).replace(/_/g, ' ');
  return txt ? txt.charAt(0).toUpperCase() + txt.slice(1) : 'General';
}

function getReviewId(review) {
  const direct = review.reviewId || review.id || review._id || review.uuid;
  if (direct) return String(direct);
  const seed = `${normalizeText(review.text || review.review || review.content)}::${normalizeText(review.createdAt || review.timestamp || review.date)}`;
  return crypto.createHash('sha1').update(seed).digest('hex');
}

function toSentimentLabel(overall) {
  const s = String(overall || '').toUpperCase();
  if (s.includes('NEG')) return 'Negative';
  if (s.includes('POS')) return 'Positive';
  if (s.includes('NEU')) return 'Neutral';
  if (s.includes('SARC')) return 'Negative';
  return 'Neutral';
}

function featureRecommendation(feature, cluster, deltaPct) {
  const f = String(feature || '').toLowerCase();
  if (f.includes('packag')) {
    return 'Improve packaging materials to reduce damage complaints';
  }
  if (f.includes('delivery')) {
    return 'Audit courier SLA and dispatch handling for delayed deliveries';
  }
  if (f.includes('price')) {
    return 'Reassess pricing and highlight value proposition in listing copy';
  }
  if (f.includes('taste')) {
    return 'Review formulation consistency and perform targeted taste QA checks';
  }
  if (f.includes('battery')) {
    return 'Escalate battery performance checks and publish power-optimization guidance';
  }
  if (cluster) {
    return `Investigate ${cluster.toLowerCase()} and assign an owner to remediate within this sprint`;
  }
  if (deltaPct > 0) {
    return 'Issue frequency is increasing; trigger feature-specific quality investigation';
  }
  return 'Monitor this feature closely and validate trend in upcoming review windows';
}

function buildCluster(feature, sentiment) {
  if (!feature) return 'General Feedback';
  if (sentiment === 'Negative') return `${sentenceCase(feature)} Issue`;
  if (sentiment === 'Positive') return `${sentenceCase(feature)} Praise`;
  return `${sentenceCase(feature)} Mixed Feedback`;
}

class RealtimeReviewEngine {
  constructor(io) {
    this.io = io;
    this.streams = new Map(); // sku => { timer, state }
  }

  getState(sku) {
    return this.streams.get(sku)?.state || null;
  }

  getPublicState(sku) {
    const state = this.getState(sku);
    if (!state) return null;
    return {
      sku: state.sku,
      category: state.category,
      productName: state.productName,
      processedCount: state.processedIds.size,
      rollingWindowSize: state.windowSize,
      lastPolledAt: state.lastPolledAt,
      featureStats: state.featureStats,
      sentimentDistribution: state.sentimentDistribution,
      issueClusters: state.issueClusters,
      rollingReviews: state.rollingReviews.slice(-state.windowSize),
    };
  }

  getStatus() {
    const active = [];
    for (const [sku, stream] of this.streams.entries()) {
      active.push({
        sku,
        running: Boolean(stream.timer),
        processed: stream.state.processedIds.size,
        rolling: stream.state.rollingReviews.length,
      });
    }
    return active;
  }

  async startSkuStream({ sku, category = 'other', productName = '' }) {
    const cleanSku = normalizeText(sku);
    if (!cleanSku) throw new Error('sku is required');

    if (this.streams.has(cleanSku)) {
      console.log('[realtime] stream already active for', cleanSku);
      return this.getState(cleanSku);
    }

    console.log('[realtime] starting stream for', cleanSku);
    const state = {
      sku: cleanSku,
      category,
      productName: productName || cleanSku,
      processedIds: new Set(),
      rollingReviews: [],
      featureStats: {},
      sentimentDistribution: { Positive: 0, Negative: 0, Neutral: 0 },
      issueClusters: {},
      lastPolledAt: null,
      windowSize: DEFAULT_WINDOW,
    };

    const tick = async () => {
      try {
        await this.pollSku(cleanSku);
      } catch (err) {
        console.error('[realtime] poll error for', cleanSku, err.message);
      }
    };

    const timer = setInterval(tick, POLL_INTERVAL_MS);
    this.streams.set(cleanSku, { timer, state });
    await tick();
    return state;
  }

  stopSkuStream(sku) {
    const cleanSku = normalizeText(sku);
    const existing = this.streams.get(cleanSku);
    if (!existing) return false;
    clearInterval(existing.timer);
    this.streams.delete(cleanSku);
    console.log('[realtime] stopped stream for', cleanSku);
    return true;
  }

  async pollSku(sku) {
    const stream = this.streams.get(sku);
    if (!stream) return;

    const { state } = stream;
    const externalReviews = await fetchReviewsBySku(sku);
    state.lastPolledAt = new Date().toISOString();
    if (!Array.isArray(externalReviews) || externalReviews.length === 0) {
      return;
    }

    for (const item of externalReviews) {
      const reviewId = getReviewId(item);
      if (state.processedIds.has(reviewId)) continue;

      state.processedIds.add(reviewId);
      const rawText = normalizeText(item.text || item.review || item.content || item.body);
      if (!rawText) continue;

      await this.processNewReview(state, {
        reviewId,
        text: rawText,
        timestamp: item.createdAt || item.timestamp || item.date || new Date().toISOString(),
      });
    }
  }

  computeIssueMetrics(state, featureKey) {
    const window = Math.max(MIN_COMPARE_WINDOW, Math.min(state.windowSize, state.rollingReviews.length));
    const recentWindow = state.rollingReviews.slice(-window);
    const previousWindow = state.rollingReviews.slice(-window * 2, -window);

    const countFeatureNeg = (arr) =>
      arr.filter((r) => r.feature === featureKey && r.sentiment === 'Negative').length;
    const recentNeg = countFeatureNeg(recentWindow);
    const previousNeg = countFeatureNeg(previousWindow);

    const recentPct = recentWindow.length ? (recentNeg / recentWindow.length) * 100 : 0;
    const prevPct = previousWindow.length ? (previousNeg / previousWindow.length) * 100 : 0;
    const delta = recentPct - prevPct;

    let severity = 'Low';
    if (delta > 40) severity = 'Critical';
    else if (delta > 20) severity = 'High';
    else if (recentNeg >= 3) severity = 'Early Signal';

    const isEmergingIssue = delta > 20 || recentNeg >= 3;
    return {
      recentNeg,
      previousNeg,
      recentPct: Number(recentPct.toFixed(2)),
      prevPct: Number(prevPct.toFixed(2)),
      delta: Number(delta.toFixed(2)),
      severity,
      isEmergingIssue,
    };
  }

  getFallbackSignal(state) {
    let topFeature = 'general';
    let topCount = 0;
    for (const [feature, stat] of Object.entries(state.featureStats)) {
      if ((stat.negative || 0) > topCount) {
        topCount = stat.negative;
        topFeature = feature;
      }
    }
    return { feature: topFeature, count: topCount };
  }

  async processNewReview(state, review) {
    try {
      // Step A: preprocess (emoji/slang/Hinglish cleaning + translation in AI service)
      const preprocessed = await pythonBridge.preprocessReviews([{ text: review.text }]);
      const cleanedText =
        preprocessed?.reviews?.[0]?.cleaned_text ||
        preprocessed?.reviews?.[0]?.cleanedText ||
        review.text;

      // Step B/C: feature extraction + feature sentiment through AI single-review pipeline
      const analysis = await pythonBridge.analyzeSingleReview(cleanedText, state.productName);
      const features = analysis?.analysis?.features || [];
      const overall = analysis?.analysis?.overall_sentiment || {};

      const primaryFeature = features[0]?.feature || 'general';
      const primarySentiment = toSentimentLabel(features[0]?.sentiment || overall.sentiment);
      const confidence = Number(features[0]?.confidence || overall.confidence || 0).toFixed(2);
      const confidenceNum = Number(confidence);
      const cluster = buildCluster(primaryFeature, primarySentiment);

      state.sentimentDistribution[primarySentiment] =
        (state.sentimentDistribution[primarySentiment] || 0) + 1;
      if (!state.featureStats[primaryFeature]) {
        state.featureStats[primaryFeature] = { positive: 0, negative: 0, neutral: 0 };
      }
      if (primarySentiment === 'Positive') state.featureStats[primaryFeature].positive += 1;
      else if (primarySentiment === 'Negative') state.featureStats[primaryFeature].negative += 1;
      else state.featureStats[primaryFeature].neutral += 1;

      const prevClusterCount = state.issueClusters[cluster] || 0;
      state.issueClusters[cluster] = prevClusterCount + 1;

      // Fire email alert when an issue cluster first becomes "emerging" (hits 2 occurrences)
      if (prevClusterCount < 2 && state.issueClusters[cluster] >= 2) {
        sendIssueAlert({
          issue: cluster,
          severity: state.issueClusters[cluster] >= 5 ? 'Critical' : state.issueClusters[cluster] >= 3 ? 'High' : 'Early Signal',
          occurrences: state.issueClusters[cluster],
          feature: sentenceCase(primaryFeature),
          sentiment: primarySentiment,
          recommendation: featureRecommendation(primaryFeature, cluster, 0),
          latestReview: review.text,
          sku: state.sku,
        }).catch(err => console.error('[realtime] email alert error:', err.message));
      }

      state.rollingReviews.push({
        reviewId: review.reviewId,
        text: review.text,
        feature: primaryFeature,
        sentiment: primarySentiment,
        confidence: confidenceNum,
        cluster,
        timestamp: review.timestamp,
      });
      if (state.rollingReviews.length > state.windowSize * 2) {
        state.rollingReviews = state.rollingReviews.slice(-(state.windowSize * 2));
      }

      let metrics = this.computeIssueMetrics(state, primaryFeature);
      if (!metrics.isEmergingIssue && metrics.recentNeg < 3) {
        const fallback = this.getFallbackSignal(state);
        metrics = {
          ...metrics,
          isEmergingIssue: true,
          severity: fallback.count >= 3 ? 'Early Signal' : 'Low',
        };
      }

      const recommendation = metrics.isEmergingIssue
        ? featureRecommendation(primaryFeature, cluster, metrics.delta)
        : '';

      const payload = {
        sku: state.sku,
        review: review.text,
        feature: sentenceCase(primaryFeature),
        sentiment: primarySentiment,
        confidence: confidenceNum,
        cluster,
        is_emerging_issue: metrics.isEmergingIssue,
        issue_severity: metrics.severity,
        recommendation,
        timestamp: 'live',
      };

      this.io.to(`sku:${state.sku}`).emit('review_update', payload);
      console.log('[realtime] emitted review_update for', state.sku, 'feature', payload.feature);
    } catch (err) {
      console.error('[realtime] review processing failed:', err.message);
    }
  }
}

function initializeRealtimeEngine(io) {
  return new RealtimeReviewEngine(io);
}

module.exports = { initializeRealtimeEngine, RealtimeReviewEngine };

