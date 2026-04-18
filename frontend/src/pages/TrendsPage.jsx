import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts';
import api from '../api/axios.js';
import TrendLineChart from '../components/TrendLineChart.jsx';
import RecommendationCard from '../components/RecommendationCard.jsx';

export default function TrendsPage() {
  const [batches, setBatches] = useState([]);
  const [product, setProduct] = useState('');
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        const res = await api.get('/api/reviews/list');
        if (res.data.success) {
          const list = res.data.data.batches || [];
          setBatches(list);
          const names = [...new Set(list.map((b) => b.productName))];
          if (names[0]) setProduct(names[0]);
        }
      } catch (err) {
        toast.error('Failed to load products');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!product) return undefined;
    const load = async () => {
      try {
        const enc = encodeURIComponent(product);
        const res = await api.get(`/api/trends/${enc}`);
        if (res.data.success) setTimeline(res.data.data.timeline || []);
      } catch (err) {
        toast.error(err.response?.data?.message || 'Trend load failed');
      }
    };
    load();
  }, [product]);

  const lineData = useMemo(() => {
    if (!timeline.length) return [];
    const featureSet = new Set();
    timeline.forEach((t) => (t.featureAnalysis || []).forEach((f) => featureSet.add(f.feature)));
    const feats = [...featureSet].slice(0, 6);
    return timeline.map((t) => {
      const row = { batchIndex: t.batchIndex };
      feats.forEach((f) => {
        const fa = (t.featureAnalysis || []).find((x) => x.feature === f);
        const tot = fa
          ? (fa.positiveCount || 0) + (fa.negativeCount || 0) + (fa.neutralCount || 0)
          : 0;
        row[f] = tot && fa ? Math.round((100 * (fa.positiveCount || 0)) / tot) : 0;
      });
      return row;
    });
  }, [timeline]);

  const featuresForChart = useMemo(() => {
    if (!lineData.length) return [];
    return Object.keys(lineData[0]).filter((k) => k !== 'batchIndex');
  }, [lineData]);

  const products = [...new Set(batches.map((b) => b.productName))];
  const radarData = products.slice(0, 5).map((p) => {
    const b = batches.filter((x) => x.productName === p && x.overallHealthScore != null);
    const last = b[0];
    return { product: p.slice(0, 12), health: last?.overallHealthScore ?? 0 };
  });

  const emerging = timeline.flatMap((t) =>
    (t.emergingIssues || []).map((i) => ({ ...i, batchId: t.batchId }))
  );

  if (loading) return <div className="py-20 text-center text-slate-500">Loading trends…</div>;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Trend intelligence</h1>

      <div className="card flex flex-wrap gap-3 items-center">
        <label className="text-sm font-medium text-slate-700">Product</label>
        <select
          className="border border-gray-200 rounded-lg px-3 py-2 min-w-[200px]"
          value={product}
          onChange={(e) => setProduct(e.target.value)}
        >
          {products.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-4">Sentiment mix by batch</h2>
        <TrendLineChart trendData={lineData} features={featuresForChart} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card space-y-3">
          <h2 className="font-semibold">Emerging issues</h2>
          {emerging.length === 0 && <p className="text-slate-500 text-sm">No emerging issues recorded.</p>}
          {emerging.map((issue, i) => (
            <div key={i} className="border border-gray-100 rounded-xl p-3">
              <div className="flex justify-between">
                <span className="font-medium">{issue.feature}</span>
                <span className="badge-critical">{issue.severity}</span>
              </div>
              <p className="text-lg mt-2">
                {issue.old_percentage}% → {issue.new_percentage}%
                <span className="text-red-600 ml-2">↑</span>
              </p>
              <RecommendationCard
                recommendation={{
                  issue: issue.feature,
                  action: issue.recommendation,
                  priority: 'HIGH',
                  department: 'Product',
                  supportingData: `Batch ${issue.batchId}`,
                }}
              />
            </div>
          ))}
        </div>

        <div className="card">
          <h2 className="font-semibold mb-4">Cross-product health (3+ products)</h2>
          {products.length >= 3 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="product" />
                  <Radar name="Health" dataKey="health" stroke="#6366f1" fill="#6366f1" fillOpacity={0.35} />
                  <Legend />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-slate-500 text-sm">Upload more distinct products to unlock radar comparison.</p>
          )}
        </div>
      </div>
    </div>
  );
}
