import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import api from '../api/axios.js';
import FeatureBarChart from '../components/FeatureBarChart.jsx';
import GeoInsightMap from '../components/GeoInsightMap.jsx';
import RecommendationCard from '../components/RecommendationCard.jsx';
import ReviewTable from '../components/ReviewTable.jsx';
import SentimentGauge from '../components/SentimentGauge.jsx';
import { formatDate, getSeverityColor } from '../utils/helpers.js';

const COLORS = ['#22c55e', '#ef4444', '#94a3b8', '#a855f7'];

export default function AnalysisPage() {
  const { batchId } = useParams();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        console.log('[Analysis] load', batchId);
        const res = await api.get(`/api/reviews/${batchId}`);
        if (!res.data.success) throw new Error(res.data.message);
        setData(res.data.data);
      } catch (err) {
        toast.error(err.response?.data?.message || err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [batchId]);

  const batch = data?.batch;
  const analysis = data?.analysis;

  const donutData = useMemo(() => {
    const b = analysis?.overallSentimentBreakdown || {};
    const entries = [
      { name: 'Positive', value: b.positive || 0 },
      { name: 'Negative', value: b.negative || 0 },
      { name: 'Neutral', value: b.neutral || 0 },
      { name: 'Sarcastic', value: b.sarcastic || 0 },
    ];
    return entries.filter((e) => e.value > 0);
  }, [analysis]);

  const download = async (format) => {
    try {
      const res = await api.get(`/api/reviews/${batchId}/download`, { params: { format }, responseType: 'blob' });
      const blob = new Blob([res.data], { type: format === 'pdf' ? 'application/pdf' : 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reviewsense-${batchId}.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Download failed');
    }
  };

  if (loading) return <div className="py-20 text-center text-slate-500">Loading analysis…</div>;
  if (!batch || !analysis) return <div className="py-20 text-center text-red-600">Analysis not available.</div>;

  const reviews = batch.reviews || [];
  const emerging = analysis.trendReport?.emergingIssues || [];
  const bots = reviews.filter((r) => r.isBot);
  const clean = reviews.filter((r) => !r.isBot);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{batch.productName}</h1>
            <span className="badge-neutral capitalize">{batch.productCategory}</span>
          </div>
          <p className="text-sm text-slate-500 mt-1">{formatDate(analysis.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button type="button" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" onClick={() => download('pdf')}>
            PDF
          </button>
          <button type="button" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" onClick={() => download('csv')}>
            CSV
          </button>
          <SentimentGauge score={analysis.trendReport?.overallHealthScore ?? 0} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        {['overview', 'features', 'reviews', 'bots', 'geo'].map((t) => (
          <button
            key={t}
            type="button"
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              tab === t ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
            onClick={() => setTab(t)}
          >
            {t === 'features' ? 'Feature analysis' : t === 'bots' ? 'Bot report' : t === 'geo' ? 'Geo insights' : t}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card">
              <p className="text-sm text-slate-500">Total reviews</p>
              <p className="text-2xl font-bold">{analysis.totalReviews}</p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-500">Clean reviews</p>
              <p className="text-2xl font-bold">{analysis.cleanReviews}</p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-500">Bot flagged</p>
              <p className="text-2xl font-bold text-red-600">{analysis.botFlagged}</p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-500">Processing time</p>
              <p className="text-2xl font-bold">{analysis.processingTimeSeconds}s</p>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="card">
              <h3 className="font-semibold mb-4">Sentiment breakdown</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}>
                      {donutData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card space-y-3">
              <h3 className="font-semibold">Emerging / moderate issues</h3>
              {emerging.length === 0 ? (
                <p className="text-slate-500 text-sm">No major trend spikes detected.</p>
              ) : (
                emerging.map((issue, i) => (
                  <div key={i} className="rounded-lg border border-red-100 bg-red-50/50 p-3">
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="font-medium">{issue.feature}</span>
                      <span className={issue.severity === 'CRITICAL' ? 'badge-critical' : 'badge-moderate'}>
                        {issue.severity}
                      </span>
                    </div>
                    <p className={`text-sm mt-1 ${getSeverityColor(issue.severity)}`}>
                      {issue.old_percentage}% → {issue.new_percentage}% (Δ {issue.change}%)
                    </p>
                    <p className="text-xs text-slate-600 mt-1">Action required — review operational playbook.</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-3">Top recommendations</h3>
            <div className="grid md:grid-cols-3 gap-3">
              {(analysis.recommendations || []).slice(0, 3).map((r, i) => (
                <RecommendationCard key={i} recommendation={r} />
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'features' && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="font-semibold mb-4">Feature sentiment counts</h3>
            <FeatureBarChart featureData={analysis.featureAnalysis || []} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {(analysis.featureAnalysis || []).map((f) => {
              const t = (f.positiveCount || 0) + (f.negativeCount || 0) + (f.neutralCount || 0);
              const pp = t ? Math.round((100 * (f.positiveCount || 0)) / t) : 0;
              const np = t ? Math.round((100 * (f.negativeCount || 0)) / t) : 0;
              return (
                <div key={f.feature} className="card">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium capitalize">{f.feature?.replace(/_/g, ' ')}</span>
                    <span className="text-xs text-slate-500">{f.trend || '→'}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
                    <div className="h-full bg-green-500" style={{ width: `${pp}%` }} />
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-red-500" style={{ width: `${np}%` }} />
                  </div>
                  <p className="text-xs text-slate-500 mt-2">Avg confidence {f.avgConfidence}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'reviews' && (
        <div className="card">
          <ReviewTable reviews={reviews} />
        </div>
      )}

      {tab === 'bots' && (
        <div className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="card">
              <p className="text-sm text-slate-500">Flagged</p>
              <p className="text-2xl font-bold">{bots.length}</p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-500">Bot %</p>
              <p className="text-2xl font-bold">
                {reviews.length ? Math.round((100 * bots.length) / reviews.length) : 0}%
              </p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-500">Clean</p>
              <p className="text-2xl font-bold text-green-600">{clean.length}</p>
            </div>
          </div>
          <div className="card space-y-3">
            {bots.map((r) => (
              <div key={r.reviewId} className="border border-red-100 rounded-lg p-3 bg-red-50/30">
                <div className="flex flex-wrap gap-2">
                  {(r.botReasons || []).map((reason) => (
                    <span key={reason} className="badge-negative text-xs">
                      {reason}
                    </span>
                  ))}
                  <span className="badge-moderate">{r.botSeverity}</span>
                </div>
                <p className="text-sm mt-2 line-through text-slate-600">{r.originalText}</p>
                <label className="text-xs flex items-center gap-2 mt-2 text-slate-600">
                  <input type="checkbox" defaultChecked readOnly />
                  Exclude from analysis (visual only)
                </label>
              </div>
            ))}
            {bots.length === 0 && <p className="text-slate-500">No bot signals in this batch.</p>}
          </div>
        </div>
      )}

      {tab === 'geo' && (
        <div className="card space-y-4">
          <GeoInsightMap geoInsights={analysis.geoInsights} />
          <ul className="text-sm text-slate-700 space-y-2">
            {(analysis.geoInsights?.regional_alerts || []).map((a, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-amber-500">•</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
