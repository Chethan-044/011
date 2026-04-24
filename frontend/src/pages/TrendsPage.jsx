import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock,
  MessageSquare,
  Shield,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import api from '../api/axios.js';
import useRealtimeSkuStream from '../hooks/useRealtimeSkuStream.js';
import useExtensionStream from '../hooks/useExtensionStream.js';

const SENTIMENT_COLORS = { Positive: '#22c55e', Negative: '#ef4444', Neutral: '#6366f1' };
const FEATURE_COLORS = ['#22c55e', '#ef4444', '#f59e0b', '#6366f1', '#ec4899', '#0ea5e9', '#8b5cf6', '#14b8a6'];

const severityStyle = (sev) => {
  const s = (sev || '').toLowerCase();
  if (s === 'critical') return 'bg-red-50 text-red-600 border border-red-200';
  if (s === 'high') return 'bg-orange-50 text-orange-600 border border-orange-200';
  if (s === 'early signal') return 'bg-amber-50 text-amber-600 border border-amber-200';
  return 'bg-gray-50 text-gray-600 border border-gray-200';
};

function MiniStatCard({ icon: Icon, label, value, change, changeDir, iconBg, iconColor }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</span>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg || 'bg-indigo-50'}`}>
          <Icon size={18} className={iconColor || 'text-indigo-600'} />
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      {change != null && (
        <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${changeDir === 'up' ? 'text-emerald-600' : 'text-red-500'}`}>
          {changeDir === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          <span>{change}</span>
        </div>
      )}
    </div>
  );
}

function LiveReviewTicker({ reviews }) {
  if (!reviews?.length) return null;
  const latest = reviews.slice(-8).reverse();
  return (
    <div className="space-y-2 max-h-80 overflow-y-auto">
      {latest.map((r, i) => (
        <div key={r.reviewId || i} className="bg-slate-50 border border-gray-100 rounded-xl p-3 flex items-start gap-3 hover:bg-gray-50 transition-colors">
          <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${r.sentiment === 'Positive' ? 'bg-emerald-500' : r.sentiment === 'Negative' ? 'bg-red-500' : 'bg-indigo-500'
            }`} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-700 leading-relaxed">{r.text}</p>
            <div className="flex items-center gap-3 mt-1.5">
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${r.sentiment === 'Positive' ? 'text-emerald-600' : r.sentiment === 'Negative' ? 'text-red-500' : 'text-indigo-600'
                }`}>{r.sentiment}</span>
              <span className="text-[10px] text-slate-400">{r.feature}</span>
              <span className="text-[10px] text-slate-300">
                {r.timestamp && r.timestamp !== 'live' ? new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'just now'}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-lg">
      <p className="text-xs text-slate-500 mb-1.5">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-600">{p.name}:</span>
          <span className="text-slate-900 font-semibold">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function TrendsPage() {
  const [batches, setBatches] = useState([]);
  const [product, setProduct] = useState('');
  const [liveSku, setLiveSku] = useState('SKU123');
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const realtime = useRealtimeSkuStream({ sku: liveSku, enabled: Boolean(liveSku) });
  const extension = useExtensionStream();

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

  // ---- Derived data ----
  const products = [...new Set(batches.map((b) => b.productName))];
  const skuState = realtime.state;
  const extState = extension.state;

  // Merge SKU + Extension stream data
  const rollingReviews = [...(skuState?.rollingReviews || []), ...(extState?.rollingReviews || [])];
  const featureStats = { ...(skuState?.featureStats || {}) };
  if (extState?.featureStats) {
    for (const [feat, counts] of Object.entries(extState.featureStats)) {
      if (!featureStats[feat]) featureStats[feat] = { positive: 0, negative: 0, neutral: 0 };
      featureStats[feat].positive += counts.positive || 0;
      featureStats[feat].negative += counts.negative || 0;
      featureStats[feat].neutral += counts.neutral || 0;
    }
  }
  const sentimentDist = {
    Positive: (skuState?.sentimentDistribution?.Positive || 0) + (extState?.sentimentDistribution?.Positive || 0),
    Negative: (skuState?.sentimentDistribution?.Negative || 0) + (extState?.sentimentDistribution?.Negative || 0),
    Neutral: (skuState?.sentimentDistribution?.Neutral || 0) + (extState?.sentimentDistribution?.Neutral || 0),
  };
  const issueClusters = { ...(skuState?.issueClusters || {}) };
  if (extState?.issueClusters) {
    for (const [k, v] of Object.entries(extState.issueClusters)) {
      issueClusters[k] = (issueClusters[k] || 0) + v;
    }
  }
  const state = {
    ...(skuState || {}),
    rollingReviews,
    featureStats,
    sentimentDistribution: sentimentDist,
    issueClusters,
    processedCount: (skuState?.processedCount || 0) + (extState?.processedCount || 0),
    lastPolledAt: extState?.lastPolledAt || skuState?.lastPolledAt,
  };

  const pieData = useMemo(() => [
    { name: 'Positive', value: sentimentDist.Positive || 0 },
    { name: 'Negative', value: sentimentDist.Negative || 0 },
    { name: 'Neutral', value: sentimentDist.Neutral || 0 },
  ].filter(d => d.value > 0), [sentimentDist]);

  const featureBarData = useMemo(() => {
    return Object.entries(featureStats).map(([feature, counts]) => ({
      name: feature.replace(/_/g, ' '),
      Positive: counts.positive || 0,
      Negative: counts.negative || 0,
      Neutral: counts.neutral || 0,
    }));
  }, [featureStats]);

  // Bucket reviews into groups of 3 for the bar+line combo chart
  const sentimentBarData = useMemo(() => {
    if (!rollingReviews.length) return [];
    const bucketSize = 3;
    const buckets = [];
    for (let i = 0; i < rollingReviews.length; i += bucketSize) {
      const slice = rollingReviews.slice(i, i + bucketSize);
      let pos = 0, neg = 0, neu = 0;
      slice.forEach(r => {
        if (r.sentiment === 'Positive') pos += 1;
        else if (r.sentiment === 'Negative') neg += 1;
        else neu += 1;
      });
      const label = slice[0]?.timestamp && slice[0].timestamp !== 'live'
        ? new Date(slice[0].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : `#${Math.floor(i / bucketSize) + 1}`;
      buckets.push({
        time: label,
        Positive: pos,
        Negative: -neg, // negative goes downward
        Net: pos - neg,
        posLabel: pos > 0 ? pos : '',
        negLabel: neg > 0 ? neg : '',
      });
    }
    return buckets;
  }, [rollingReviews]);

  const featureTimelineData = useMemo(() => {
    if (!rollingReviews.length) return [];
    const featureMap = {};
    const data = [];
    rollingReviews.forEach((r, idx) => {
      const feat = (r.feature || 'general').replace(/_/g, ' ');
      if (!featureMap[feat]) featureMap[feat] = 0;
      if (r.sentiment === 'Negative') featureMap[feat] += 1;
      const point = { review: `#${idx + 1}` };
      Object.entries(featureMap).forEach(([f, c]) => {
        point[f] = c;
      });
      data.push(point);
    });
    return data;
  }, [rollingReviews]);

  const featureKeys = useMemo(() => {
    const keys = new Set();
    featureTimelineData.forEach(d => Object.keys(d).filter(k => k !== 'review').forEach(k => keys.add(k)));
    return [...keys];
  }, [featureTimelineData]);

  const emergingIssues = useMemo(() => {
    const issues = [];
    Object.entries(issueClusters).forEach(([cluster, count]) => {
      if (count >= 2) {
        issues.push({
          cluster,
          count,
          severity: count >= 5 ? 'Critical' : count >= 3 ? 'High' : 'Early Signal',
        });
      }
    });
    return issues.sort((a, b) => b.count - a.count);
  }, [issueClusters]);

  const batchLineData = useMemo(() => {
    if (!timeline.length) return [];
    const featureSet = new Set();
    timeline.forEach((t) => (t.featureAnalysis || []).forEach((f) => featureSet.add(f.feature)));
    const feats = [...featureSet].slice(0, 6);
    return timeline.map((t) => {
      const row = { batch: `Batch ${t.batchIndex}` };
      feats.forEach((f) => {
        const fa = (t.featureAnalysis || []).find((x) => x.feature === f);
        const tot = fa ? (fa.positiveCount || 0) + (fa.negativeCount || 0) + (fa.neutralCount || 0) : 0;
        row[f] = tot && fa ? Math.round((100 * (fa.positiveCount || 0)) / tot) : 0;
      });
      return row;
    });
  }, [timeline]);

  const batchFeatures = useMemo(() => {
    if (!batchLineData.length) return [];
    return Object.keys(batchLineData[0]).filter((k) => k !== 'batch');
  }, [batchLineData]);

  const totalProcessed = state?.processedCount || 0;
  const totalSentiment = (sentimentDist.Positive || 0) + (sentimentDist.Negative || 0) + (sentimentDist.Neutral || 0);
  const posRate = totalSentiment ? Math.round(((sentimentDist.Positive || 0) / totalSentiment) * 100) : 0;

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="flex items-center gap-3 text-slate-400">
        <Activity className="animate-pulse" size={24} />
        <span>Loading trends…</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Activity className="text-indigo-600" size={24} />
            Trend Intelligence
          </h1>
          <p className="text-slate-500 text-sm mt-1">Real-time review analytics & emerging issue detection</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="bg-white border border-gray-200 text-slate-900 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors shadow-sm"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
          >
            <option value="">Select Product</option>
            {products.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
            <Zap className="text-amber-500" size={16} />
            <input
              className="bg-transparent text-slate-900 text-sm w-24 focus:outline-none placeholder-slate-400"
              value={liveSku}
              onChange={(e) => setLiveSku(e.target.value)}
              placeholder="SKU"
            />
          </div>
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-emerald-600 text-xs font-medium">Live</span>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniStatCard
          icon={MessageSquare}
          label="Reviews Processed"
          value={totalProcessed}
          change={totalProcessed > 0 ? `+${totalProcessed} live` : null}
          changeDir="up"
          iconBg="bg-indigo-50"
          iconColor="text-indigo-600"
        />
        <MiniStatCard
          icon={TrendingUp}
          label="Positive Rate"
          value={`${posRate}%`}
          change={posRate >= 60 ? '↑ Healthy' : '↓ Below avg'}
          changeDir={posRate >= 60 ? 'up' : 'down'}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <MiniStatCard
          icon={AlertTriangle}
          label="Emerging Issues"
          value={emergingIssues.length}
          change={emergingIssues.length > 0 ? `${emergingIssues.length} active` : 'None detected'}
          changeDir={emergingIssues.length > 0 ? 'down' : 'up'}
          iconBg="bg-red-50"
          iconColor="text-red-600"
        />
        <MiniStatCard
          icon={Shield}
          label="Features Tracked"
          value={Object.keys(featureStats).length}
          change={`${Object.keys(issueClusters).length} clusters`}
          changeDir="up"
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
        />
      </div>

      {/* Row 2: Sentiment Bar+Line Combo + Donut */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <BarChart3 size={18} className="text-indigo-600" />
              Sentiment Trend Analysis
            </h2>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-400 inline-block" /> Positive</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-300 inline-block" /> Negative</span>
              <span className="flex items-center gap-1"><span className="w-6 h-0.5 bg-slate-800 inline-block" /> Net Trend</span>
            </div>
          </div>
          {sentimentBarData.length > 0 ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={sentimentBarData} margin={{ top: 20, right: 10, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    label={{ value: 'Review Batches', position: 'insideBottom', offset: -5, fontSize: 11, fill: '#94a3b8' }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickFormatter={(v) => Math.abs(v)}
                    label={{ value: 'Count', angle: -90, position: 'insideLeft', offset: 15, fontSize: 11, fill: '#94a3b8' }}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const pos = payload.find(p => p.dataKey === 'Positive')?.value || 0;
                      const neg = Math.abs(payload.find(p => p.dataKey === 'Negative')?.value || 0);
                      const net = payload.find(p => p.dataKey === 'Net')?.value || 0;
                      return (
                        <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-lg">
                          <p className="text-xs text-slate-500 font-medium mb-1.5">{label}</p>
                          <div className="flex items-center gap-2 text-xs"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Positive: <span className="font-bold text-emerald-600">{pos}</span></div>
                          <div className="flex items-center gap-2 text-xs"><span className="w-2 h-2 rounded-full bg-red-500" /> Negative: <span className="font-bold text-red-500">{neg}</span></div>
                          <div className="flex items-center gap-2 text-xs mt-1 pt-1 border-t border-gray-100"><span className="w-2 h-2 rounded-full bg-slate-800" /> Net: <span className="font-bold">{net > 0 ? `+${net}` : net}</span></div>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1.5} />
                  {/* Positive bars going upward */}
                  <Bar dataKey="Positive" fill="#86efac" radius={[4, 4, 0, 0]} barSize={32}>
                    <LabelList dataKey="posLabel" position="top" fill="#16a34a" fontSize={11} fontWeight={600} />
                  </Bar>
                  {/* Negative bars going downward (negative values) */}
                  <Bar dataKey="Negative" fill="#fca5a5" radius={[0, 0, 4, 4]} barSize={32}>
                    <LabelList dataKey="negLabel" position="bottom" fill="#dc2626" fontSize={11} fontWeight={600} />
                  </Bar>
                  {/* Net sentiment trend line */}
                  <Line
                    type="monotone"
                    dataKey="Net"
                    stroke="#1e293b"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#1e293b', stroke: '#fff', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: '#1e293b' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-80 flex items-center justify-center text-slate-400 text-sm">Waiting for live data…</div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Overall Sentiment</h2>
          {pieData.length > 0 ? (
            <>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={SENTIMENT_COLORS[entry.name]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                {pieData.map((d) => (
                  <div key={d.name} className="text-center">
                    <p className="text-lg font-bold text-slate-900">{d.value}</p>
                    <p className="text-[10px] uppercase tracking-wider font-medium" style={{ color: SENTIMENT_COLORS[d.name] }}>{d.name}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm">No data yet</div>
          )}
        </div>
      </div>

      {/* Row 3: Feature Bar + Emerging Issues */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <BarChart3 size={18} className="text-amber-500" />
              Feature Sentiment Breakdown
            </h2>
          </div>
          {featureBarData.length > 0 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={featureBarData} margin={{ top: 8, right: 8, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Positive" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Negative" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Neutral" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 flex items-center justify-center text-slate-400 text-sm">Waiting for feature data…</div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-500" />
            Emerging Issues
            {emergingIssues.length > 0 && (
              <span className="ml-auto bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">
                {emergingIssues.length}
              </span>
            )}
          </h2>
          {emergingIssues.length > 0 ? (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {emergingIssues.map((issue, i) => (
                <div key={i} className="bg-slate-50 border border-gray-100 rounded-xl p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-slate-900">{issue.cluster}</span>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${severityStyle(issue.severity)}`}>
                      {issue.severity}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span>{issue.count} occurrences</span>
                    <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full bg-gradient-to-r from-red-400 to-orange-400"
                        style={{ width: `${Math.min(100, issue.count * 15)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400">
              <Shield size={40} className="mb-3 opacity-30" />
              <p className="text-sm">No emerging issues detected</p>
              <p className="text-xs text-slate-400 mt-1">System is monitoring incoming reviews</p>
            </div>
          )}
        </div>
      </div>

      {/* Row 4: Live Feed */}
      <div className="grid gap-6">

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <MessageSquare size={18} className="text-sky-500" />
            Live Review Feed
            <span className="ml-auto text-xs text-slate-400">
              <Clock size={12} className="inline mr-1" />
              {state?.lastPolledAt ? new Date(state.lastPolledAt).toLocaleTimeString() : '—'}
            </span>
          </h2>
          <LiveReviewTicker reviews={rollingReviews} />
          {!rollingReviews.length && (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400">
              <MessageSquare size={40} className="mb-3 opacity-30" />
              <p className="text-sm">No live reviews yet</p>
              <p className="text-xs text-slate-400 mt-1">Reviews will appear here in real-time</p>
            </div>
          )}
        </div>
      </div>

      {/* Row 5: Historical batch trend */}

    </div>
  );
}
