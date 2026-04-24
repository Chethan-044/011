import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import useSocket from '../hooks/useSocket.js';

/**
 * Shared context for extension review stream data.
 * Lives at the App level so data persists across route changes
 * (Dashboard ↔ Trends ↔ Reports navigation).
 *
 * On mount, fetches historical scraped reviews from MongoDB so the
 * dashboard shows ALL reviews — not just the ones received via live socket.
 */
const ExtensionStreamContext = createContext(null);

const MAX_ROLLING = 500;
const API_BASE = 'http://localhost:5000';

export function ExtensionStreamProvider({ children }) {
  const { socket } = useSocket();
  const hydratedRef = useRef(false);

  const [processedCount, setProcessedCount] = useState(0);
  const [rollingReviews, setRollingReviews] = useState([]);
  const [sentimentDistribution, setSentimentDistribution] = useState({
    Positive: 0,
    Negative: 0,
    Neutral: 0,
  });
  const [featureStats, setFeatureStats] = useState({});
  const [issueClusters, setIssueClusters] = useState({});
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  // Track review IDs we've already counted (avoid double-counting historical + live)
  const seenIdsRef = useRef(new Set());

  // ── Hydrate from MongoDB on first mount ───────────────────
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const token = localStorage.getItem('token');
    if (!token) return;

    fetch(`${API_BASE}/api/extension/reviews?limit=500`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((res) => {
        if (!res.success || !Array.isArray(res.data)) return;

        const reviews = res.data;
        if (reviews.length === 0) return;

        console.log(`[ExtensionStream] Hydrating ${reviews.length} historical reviews`);

        // Build initial state from historical data
        const sentDist = { Positive: 0, Negative: 0, Neutral: 0 };
        const featStats = {};
        const clusters = {};
        const rolling = [];

        for (const r of reviews) {
          const id = r.reviewId || r._id;
          seenIdsRef.current.add(id);

          // Map model sentiment labels to display labels
          const rawSent = (r.overallSentiment || '').toUpperCase();
          const sent = rawSent.includes('POS') ? 'Positive'
            : rawSent.includes('NEG') ? 'Negative'
            : rawSent.includes('SARC') ? 'Sarcastic'
            : 'Neutral';

          sentDist[sent] = (sentDist[sent] || 0) + 1;

          // Feature stats
          const primaryFeature = (r.featureSentiments?.[0]?.feature || 'general')
            .toLowerCase().replace(/\s+/g, '_');
          const fKey = sent === 'Positive' ? 'positive'
            : sent === 'Negative' ? 'negative' : 'neutral';
          if (!featStats[primaryFeature]) {
            featStats[primaryFeature] = { positive: 0, negative: 0, neutral: 0 };
          }
          featStats[primaryFeature][fKey] += 1;

          // Cluster
          const clusterName = sent === 'Negative'
            ? `${primaryFeature.charAt(0).toUpperCase() + primaryFeature.slice(1)} Issue`
            : sent === 'Positive'
              ? `${primaryFeature.charAt(0).toUpperCase() + primaryFeature.slice(1)} Praise`
              : `${primaryFeature.charAt(0).toUpperCase() + primaryFeature.slice(1)} Mixed Feedback`;
          clusters[clusterName] = (clusters[clusterName] || 0) + 1;

          rolling.push({
            reviewId: id,
            text: r.text || '',
            feature: primaryFeature,
            sentiment: sent,
            confidence: r.sentimentConfidence || 0,
            cluster: clusterName,
            timestamp: r.scrapedAt || r.createdAt || 'historical',
          });
        }

        setProcessedCount(reviews.length);
        setRollingReviews(rolling.slice(-MAX_ROLLING));
        setSentimentDistribution(sentDist);
        setFeatureStats(featStats);
        setIssueClusters(clusters);
        setLastUpdatedAt(new Date().toISOString());
      })
      .catch((err) => {
        console.warn('[ExtensionStream] Failed to hydrate historical reviews:', err.message);
      });
  }, []);

  // ── Live socket updates (additive on top of historical) ───
  useEffect(() => {
    if (!socket) return;

    const onReviewUpdate = (payload) => {
      if (!payload || payload.source !== 'google_maps') return;

      // Avoid double-counting if this review was already loaded from DB
      const reviewId = payload.reviewId || `ext-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      if (seenIdsRef.current.has(reviewId)) return;
      seenIdsRef.current.add(reviewId);

      setProcessedCount((prev) => prev + 1);
      setLastUpdatedAt(new Date().toISOString());

      const reviewEntry = {
        reviewId,
        text: payload.review || '',
        feature: payload.feature || 'General',
        sentiment: payload.sentiment || 'Neutral',
        confidence: payload.confidence || 0,
        cluster: payload.cluster || '',
        timestamp: payload.timestamp || 'live',
      };

      setRollingReviews((prev) => {
        const next = [...prev, reviewEntry];
        if (next.length > MAX_ROLLING) return next.slice(-MAX_ROLLING);
        return next;
      });

      const sent = payload.sentiment || 'Neutral';
      setSentimentDistribution((prev) => ({
        ...prev,
        [sent]: (prev[sent] || 0) + 1,
      }));

      const feature = (payload.feature || 'general').toLowerCase().replace(/\s+/g, '_');
      setFeatureStats((prev) => {
        const current = prev[feature] || { positive: 0, negative: 0, neutral: 0 };
        const key =
          sent === 'Positive' ? 'positive' :
          sent === 'Negative' ? 'negative' : 'neutral';
        return {
          ...prev,
          [feature]: {
            ...current,
            [key]: current[key] + 1,
          },
        };
      });

      if (payload.cluster) {
        setIssueClusters((prev) => ({
          ...prev,
          [payload.cluster]: (prev[payload.cluster] || 0) + 1,
        }));
      }
    };

    socket.on('review_update', onReviewUpdate);
    return () => {
      socket.off('review_update', onReviewUpdate);
    };
  }, [socket]);

  const state = useMemo(
    () => ({
      sku: 'extension',
      processedCount,
      rollingReviews,
      sentimentDistribution,
      featureStats,
      issueClusters,
      lastPolledAt: lastUpdatedAt,
    }),
    [processedCount, rollingReviews, sentimentDistribution, featureStats, issueClusters, lastUpdatedAt]
  );

  const value = useMemo(() => ({ state, loading: false, error: '' }), [state]);

  return (
    <ExtensionStreamContext.Provider value={value}>
      {children}
    </ExtensionStreamContext.Provider>
  );
}

export default function useExtensionStream() {
  const ctx = useContext(ExtensionStreamContext);
  if (!ctx) {
    throw new Error('useExtensionStream must be used within <ExtensionStreamProvider>');
  }
  return ctx;
}
