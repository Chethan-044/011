import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios.js';

/**
 * Realtime SKU hook:
 * - starts backend realtime stream once per SKU
 * - polls realtime state every 5 seconds
 * - exposes chart-friendly data
 */
export default function useRealtimeSkuStream({ sku, category = 'other', enabled = true }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const cleanSku = String(sku || '').trim();
    if (!enabled || !cleanSku) return undefined;

    let cancelled = false;
    let intervalId = null;

    async function ensureStreamStarted() {
      try {
        console.log('[useRealtimeSkuStream] start stream', cleanSku);
        await api.post('/api/realtime/start', {
          sku: cleanSku,
          category,
          productName: cleanSku,
        });
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || err.message || 'Failed to start realtime stream');
        }
      }
    }

    async function fetchState() {
      try {
        setLoading(true);
        const res = await api.get(`/api/realtime/state/${encodeURIComponent(cleanSku)}`);
        if (!cancelled && res.data.success) {
          setState(res.data.data.state || null);
          setError('');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || err.message || 'Realtime state fetch failed');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    ensureStreamStarted().then(fetchState);
    intervalId = setInterval(fetchState, 5000);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [sku, category, enabled]);

  const featureChartData = useMemo(() => {
    if (!state?.featureStats) return [];
    return Object.entries(state.featureStats).map(([feature, counts]) => ({
      feature,
      positiveCount: counts.positive || 0,
      negativeCount: counts.negative || 0,
      neutralCount: counts.neutral || 0,
    }));
  }, [state]);

  const sentimentData = useMemo(() => {
    const dist = state?.sentimentDistribution || {};
    return [
      { name: 'Positive', value: dist.Positive || 0 },
      { name: 'Negative', value: dist.Negative || 0 },
      { name: 'Neutral', value: dist.Neutral || 0 },
    ];
  }, [state]);

  return {
    state,
    loading,
    error,
    featureChartData,
    sentimentData,
  };
}

