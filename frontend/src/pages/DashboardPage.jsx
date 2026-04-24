import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CheckCircle,
  ChevronDown,
  Clock,
  Download,
  Heart,
  MessageSquare,
  Package,
  Plus,
  Shield,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import api from '../api/axios.js';
import { formatDate, formatNumber } from '../utils/helpers.js';
import { useAuth } from '../context/AuthContext.jsx';
import useRealtimeSkuStream from '../hooks/useRealtimeSkuStream.js';
import useExtensionStream from '../hooks/useExtensionStream.js';
import useSocket from '../hooks/useSocket.js';

const SENTIMENT_COLORS = { Positive: '#22c55e', Negative: '#ef4444', Neutral: '#6366f1' };

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

const severityBadge = (sev) => {
  const s = (sev || '').toLowerCase();
  if (s === 'critical') return 'bg-red-50 text-red-600 border border-red-200';
  if (s === 'high') return 'bg-orange-50 text-orange-600 border border-orange-200';
  if (s === 'early signal') return 'bg-amber-50 text-amber-600 border border-amber-200';
  return 'bg-gray-50 text-gray-600 border border-gray-200';
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [batches, setBatches] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [liveSku] = useState('SKU123');
  const realtime = useRealtimeSkuStream({ sku: liveSku, enabled: true });
  const extension = useExtensionStream();
  const { socket } = useSocket();

  // Socket-driven issue state
  const [issueAssignments, setIssueAssignments] = useState({});
  const [resolvedIssues, setResolvedIssues] = useState([]);
  const [resolvedSet, setResolvedSet] = useState(new Set());
  const [flashCounters, setFlashCounters] = useState({});
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        console.log('[Dashboard] fetch list + alerts');
        const [listRes, alertRes] = await Promise.all([
          api.get('/api/reviews/list'),
          api.get('/api/trends/alerts'),
        ]);
        if (listRes.data.success) setBatches(listRes.data.data.batches || []);
        if (alertRes.data.success) setAlerts(alertRes.data.data.alerts || []);
      } catch (err) {
        toast.error(err.response?.data?.message || 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  /* ── Socket listeners for real-time issue resolution + occurrence sync ── */
  useEffect(() => {
    if (!socket) return;

    const onNewCritical = (payload) => {
      setIssueAssignments((prev) => ({
        ...prev,
        [payload.topic]: {
          assignee: payload.assignedTo,
          status: payload.status || 'in_progress',
        },
      }));
    };

    const onResolved = (payload) => {
      setResolvedSet((prev) => new Set(prev).add(payload.topic));
      setIssueAssignments((prev) => ({
        ...prev,
        [payload.topic]: {
          ...prev[payload.topic],
          status: 'resolved',
          resolvedBy: payload.resolvedBy,
        },
      }));
      // After 10 seconds, move to Recently Resolved accordion
      setTimeout(() => {
        setResolvedIssues((prev) => [{ topic: payload.topic, resolvedBy: payload.resolvedBy, resolvedAt: payload.resolvedAt, note: payload.resolutionNote }, ...prev]);
      }, 10000);
    };

    const onOccurrence = (payload) => {
      // Flash the counter for this topic
      setFlashCounters((prev) => ({ ...prev, [payload.topic]: true }));
      setTimeout(() => setFlashCounters((prev) => ({ ...prev, [payload.topic]: false })), 600);

      if (payload.crossedCriticalThreshold) {
        setIssueAssignments((prev) => ({
          ...prev,
          [payload.topic]: { ...prev[payload.topic], status: 'critical' },
        }));
      }
    };

    socket.on('new_critical_issue', onNewCritical);
    socket.on('issue_resolved', onResolved);
    socket.on('occurrence_updated', onOccurrence);

    return () => {
      socket.off('new_critical_issue', onNewCritical);
      socket.off('issue_resolved', onResolved);
      socket.off('occurrence_updated', onOccurrence);
    };
  }, [socket]);

  const stats = useMemo(() => {
    const products = new Set(batches.map((b) => b.productName));
    const totalReviews = batches.reduce((s, b) => s + (b.totalReviews || 0), 0);
    const healthScores = batches.map((b) => b.overallHealthScore).filter((v) => v != null);
    const avgHealth = healthScores.length > 0 ? Math.round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length) : 0;
    return { products: products.size, totalReviews, alerts: alerts.length, avgHealth };
  }, [batches, alerts]);

  const skuState = realtime.state;
  const extState = extension.state;

  // Merge SKU stream + Extension stream data
  const sentimentDist = {
    Positive: (skuState?.sentimentDistribution?.Positive || 0) + (extState?.sentimentDistribution?.Positive || 0),
    Negative: (skuState?.sentimentDistribution?.Negative || 0) + (extState?.sentimentDistribution?.Negative || 0),
    Neutral: (skuState?.sentimentDistribution?.Neutral || 0) + (extState?.sentimentDistribution?.Neutral || 0),
  };
  const rollingReviews = [...(skuState?.rollingReviews || []), ...(extState?.rollingReviews || [])];
  const issueClusters = { ...(skuState?.issueClusters || {}), ...(extState?.issueClusters || {}) };
  // Merge issue cluster counts
  if (skuState?.issueClusters && extState?.issueClusters) {
    for (const [k, v] of Object.entries(extState.issueClusters)) {
      issueClusters[k] = (skuState.issueClusters[k] || 0) + v;
    }
  }
  const totalLive = (skuState?.processedCount || 0) + (extState?.processedCount || 0);
  const mergedFeatureStats = { ...(skuState?.featureStats || {}) };
  if (extState?.featureStats) {
    for (const [feat, counts] of Object.entries(extState.featureStats)) {
      if (!mergedFeatureStats[feat]) mergedFeatureStats[feat] = { positive: 0, negative: 0, neutral: 0 };
      mergedFeatureStats[feat].positive += counts.positive || 0;
      mergedFeatureStats[feat].negative += counts.negative || 0;
      mergedFeatureStats[feat].neutral += counts.neutral || 0;
    }
  }
  const state = {
    ...(skuState || {}),
    sentimentDistribution: sentimentDist,
    rollingReviews,
    issueClusters,
    processedCount: totalLive,
    featureStats: mergedFeatureStats,
    lastPolledAt: extState?.lastPolledAt || skuState?.lastPolledAt,
  };

  const pieData = useMemo(() => [
    { name: 'Positive', value: sentimentDist.Positive || 0 },
    { name: 'Negative', value: sentimentDist.Negative || 0 },
    { name: 'Neutral', value: sentimentDist.Neutral || 0 },
  ].filter(d => d.value > 0), [sentimentDist]);

  const sentimentAreaData = useMemo(() => {
    if (!rollingReviews.length) return [];
    const cum = { Positive: 0, Negative: 0, Neutral: 0 };
    return rollingReviews.map((r, idx) => {
      const s = r.sentiment || 'Neutral';
      if (s === 'Positive') cum.Positive += 1;
      else if (s === 'Negative') cum.Negative += 1;
      else cum.Neutral += 1;
      return {
        time: r.timestamp && r.timestamp !== 'live'
          ? new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : `#${idx + 1}`,
        Positive: cum.Positive,
        Negative: cum.Negative,
        Neutral: cum.Neutral,
      };
    });
  }, [rollingReviews]);

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
    alerts.forEach(a => {
      issues.push({
        cluster: a.productName || a.feature || 'Unknown',
        count: 1,
        severity: 'Critical',
        message: a.message || a.recommendation,
      });
    });
    return issues.sort((a, b) => b.count - a.count);
  }, [issueClusters, alerts]);

  const downloadReport = async (batchId, format = 'pdf') => {
    try {
      const res = await api.get(`/api/reviews/${batchId}/download`, {
        params: { format },
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: format === 'pdf' ? 'application/pdf' : 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reviewsense-${batchId}.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Download failed');
    }
  };

  const healthColor = (score) => {
    if (score == null) return 'text-slate-400';
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-slate-400">
          <Activity className="animate-pulse" size={24} />
          <span>Loading dashboard…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome back, {user?.name} 👋</h1>
          <p className="text-slate-500 text-sm mt-1">ReviewSense command center — real-time intelligence</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-emerald-600 text-xs font-medium">Live Streaming</span>
          </div>
          <Link
            to="/upload"
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-2.5 rounded-xl text-sm transition-colors"
          >
            <Plus size={16} />
            Upload
          </Link>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Package, label: 'Products Analyzed', value: formatNumber(stats.products), change: '+live', dir: 'up', iconBg: 'bg-indigo-50', iconColor: 'text-indigo-600' },
          { icon: MessageSquare, label: 'Reviews Processed', value: formatNumber(stats.totalReviews + totalLive), change: `+${totalLive} live`, dir: 'up', iconBg: 'bg-sky-50', iconColor: 'text-sky-600' },
          { icon: AlertTriangle, label: 'Active Alerts', value: formatNumber(emergingIssues.length), change: emergingIssues.length > 0 ? 'Action needed' : 'All clear', dir: emergingIssues.length > 0 ? 'down' : 'up', iconBg: 'bg-red-50', iconColor: 'text-red-600' },
          { icon: Heart, label: 'Avg Health Score', value: `${stats.avgHealth || 0}%`, change: stats.avgHealth >= 60 ? 'Healthy' : 'Below target', dir: stats.avgHealth >= 60 ? 'up' : 'down', iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
        ].map((s, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{s.label}</span>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${s.iconBg}`}>
                <s.icon size={18} className={s.iconColor} />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900">{s.value}</p>
            <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${s.dir === 'up' ? 'text-emerald-600' : 'text-red-500'}`}>
              {s.dir === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              <span>{s.change}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Row 2: Sentiment Area + Emerging Issues */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Live Sentiment Area Chart */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <BarChart3 size={18} className="text-indigo-600" />
              Real-time Sentiment Flow
            </h2>
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock size={12} />
              {state?.lastPolledAt ? new Date(state.lastPolledAt).toLocaleTimeString() : '—'}
            </span>
          </div>
          {sentimentAreaData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sentimentAreaData}>
                  <defs>
                    <linearGradient id="dgPos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="dgNeg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="dgNeu" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="Positive" stroke="#22c55e" strokeWidth={2} fill="url(#dgPos)" dot={false} />
                  <Area type="monotone" dataKey="Negative" stroke="#ef4444" strokeWidth={2} fill="url(#dgNeg)" dot={false} />
                  <Area type="monotone" dataKey="Neutral" stroke="#6366f1" strokeWidth={2} fill="url(#dgNeu)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">Waiting for live stream data…</div>
          )}
        </div>

        {/* Emerging Issues — with real-time assignment & resolution sync */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-500" />
            Emerging Issues
            {emergingIssues.length > 0 && (
              <span className="ml-auto bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
                {emergingIssues.length}
              </span>
            )}
          </h2>
          {emergingIssues.length > 0 ? (
            <div className="space-y-2.5 max-h-64 overflow-y-auto">
              {emergingIssues.slice(0, 8).map((issue, i) => {
                const isResolved = resolvedSet.has(issue.cluster);
                const assignment = issueAssignments[issue.cluster];
                const isFlashing = flashCounters[issue.cluster];
                const barWidth = isResolved ? 15 : Math.min(100, issue.count * 15);
                const barColor = isResolved
                  ? 'from-emerald-400 to-emerald-500'
                  : 'from-red-400 to-orange-400';
                const displaySeverity = isResolved ? 'Resolved' : (assignment?.status === 'critical' ? 'Critical' : issue.severity);
                const badgeClass = isResolved
                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                  : severityBadge(displaySeverity);

                // Skip if it's been moved to the resolved accordion
                if (resolvedIssues.some(r => r.topic === issue.cluster)) return null;

                return (
                  <div
                    key={i}
                    className={`bg-slate-50 border border-gray-100 rounded-xl p-3 hover:bg-gray-50 transition-all duration-800 ${
                      isResolved ? 'opacity-70' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium text-slate-900 truncate">{issue.cluster}</span>
                        {isResolved && <CheckCircle size={14} className="text-emerald-500 shrink-0" />}
                      </div>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ml-2 transition-all duration-600 ${badgeClass}`}
                      >
                        {displaySeverity}
                      </span>
                    </div>
                    {issue.message && <p className="text-xs text-slate-500 truncate">{issue.message}</p>}

                    {/* Assignee label */}
                    {assignment && (
                      <div className="flex items-center gap-1.5 mt-1">
                        {assignment.assignee?.avatar && (
                          <img src={assignment.assignee.avatar} alt="" className="w-4 h-4 rounded-full" />
                        )}
                        <span className="text-[10px] text-slate-500">
                          {isResolved
                            ? `Resolved by: ${assignment.resolvedBy?.name || assignment.assignee?.name || 'Admin'}`
                            : `Assigned to: ${assignment.assignee?.name || 'Admin'}`
                          }
                        </span>
                      </div>
                    )}

                    {/* Progress bar + counter */}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span
                        className={`text-xs transition-all duration-300 ${
                          isFlashing ? 'text-amber-500 font-bold scale-110' : 'text-slate-400'
                        }`}
                      >
                        {isResolved ? 0 : issue.count} occurrences
                      </span>
                      <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full bg-gradient-to-r ${barColor}`}
                          style={{
                            width: `${barWidth}%`,
                            transition: 'width 0.8s ease-out, background-color 0.8s ease-out',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-56 flex flex-col items-center justify-center text-slate-400">
              <Shield size={36} className="mb-3 opacity-30" />
              <p className="text-sm">No emerging issues</p>
              <p className="text-xs text-slate-400 mt-1">Live monitoring active</p>
            </div>
          )}

          {/* Recently Resolved Accordion */}
          {resolvedIssues.length > 0 && (
            <div className="mt-4 border-t border-gray-100 pt-3">
              <button
                type="button"
                onClick={() => setShowResolved(!showResolved)}
                className="flex items-center gap-2 text-xs font-medium text-emerald-600 hover:text-emerald-500 transition-colors w-full"
              >
                <CheckCircle size={14} />
                Recently Resolved ({resolvedIssues.length})
                <ChevronDown size={14} className={`ml-auto transition-transform duration-300 ${showResolved ? 'rotate-180' : ''}`} />
              </button>
              {showResolved && (
                <div className="mt-2 space-y-1.5 animate-slideDown">
                  {resolvedIssues.slice(0, 5).map((r, ri) => (
                    <div key={ri} className="bg-emerald-50/50 border border-emerald-100 rounded-lg px-3 py-2 flex items-center gap-2">
                      <CheckCircle size={12} className="text-emerald-500 shrink-0" />
                      <span className="text-[11px] text-slate-600 truncate">{r.topic}</span>
                      <span className="text-[10px] text-slate-400 ml-auto shrink-0">by {r.resolvedBy?.name || 'Admin'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Row 3: Donut + Live Reviews + Feature Insights */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Sentiment Donut */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Sentiment Distribution</h2>
          {pieData.length > 0 ? (
            <>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={68} paddingAngle={3} dataKey="value">
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={SENTIMENT_COLORS[entry.name]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {pieData.map((d) => (
                  <div key={d.name} className="text-center">
                    <p className="text-lg font-bold text-slate-900">{d.value}</p>
                    <p className="text-[10px] uppercase tracking-wider font-medium" style={{ color: SENTIMENT_COLORS[d.name] }}>{d.name}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-44 flex items-center justify-center text-slate-400 text-sm">No live data yet</div>
          )}
        </div>

        {/* Live Review Feed */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Zap size={18} className="text-amber-500" />
            Live Reviews
            <span className="ml-auto text-xs text-slate-400">{totalLive} total</span>
          </h2>
          {rollingReviews.length > 0 ? (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {rollingReviews.slice(-5).reverse().map((r, i) => (
                <div key={r.reviewId || i} className="bg-slate-50 border border-gray-100 rounded-xl p-3">
                  <p className="text-xs text-slate-700 leading-relaxed">{r.text}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-[10px] font-semibold uppercase ${
                      r.sentiment === 'Positive' ? 'text-emerald-600' : r.sentiment === 'Negative' ? 'text-red-500' : 'text-indigo-600'
                    }`}>{r.sentiment}</span>
                    <span className="text-[10px] text-slate-300">•</span>
                    <span className="text-[10px] text-slate-400">{r.feature}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-60 flex flex-col items-center justify-center text-slate-400">
              <MessageSquare size={36} className="mb-3 opacity-30" />
              <p className="text-sm">Waiting for reviews…</p>
            </div>
          )}
        </div>

        {/* Feature Insights */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Feature Insights</h2>
          {Object.keys(state?.featureStats || {}).length > 0 ? (
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {Object.entries(state.featureStats).map(([feature, counts]) => {
                const total = (counts.positive || 0) + (counts.negative || 0) + (counts.neutral || 0);
                const posPercent = total ? Math.round((counts.positive / total) * 100) : 0;
                const negPercent = total ? Math.round((counts.negative / total) * 100) : 0;
                return (
                  <div key={feature} className="bg-slate-50 border border-gray-100 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-900 capitalize">{feature.replace(/_/g, ' ')}</span>
                      <span className="text-xs text-slate-400">{total} reviews</span>
                    </div>
                    <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-gray-200">
                      {posPercent > 0 && (
                        <div className="bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${posPercent}%` }} />
                      )}
                      {negPercent > 0 && (
                        <div className="bg-red-500 rounded-full transition-all duration-500" style={{ width: `${negPercent}%` }} />
                      )}
                      <div className="bg-indigo-400 rounded-full flex-1 transition-all duration-500" />
                    </div>
                    <div className="flex gap-3 mt-1 text-[10px]">
                      <span className="text-emerald-600">{posPercent}% pos</span>
                      <span className="text-red-500">{negPercent}% neg</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-60 flex flex-col items-center justify-center text-slate-400">
              <BarChart3 size={36} className="mb-3 opacity-30" />
              <p className="text-sm">Feature data pending…</p>
            </div>
          )}
        </div>
      </div>

      {/* Row 4: Recent Batches Table */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm overflow-x-auto">
        <h2 className="font-semibold text-base text-slate-900 mb-4 flex items-center gap-2">
          <Package size={18} className="text-indigo-600" />
          Recent Batches
        </h2>
        {batches.length === 0 ? (
          <p className="text-slate-500 text-sm">No uploads yet. Upload reviews to get started.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-500 border-b border-gray-200">
              <tr>
                <th className="pb-3 pr-4 font-medium">Product</th>
                <th className="pb-3 pr-4 font-medium">Category</th>
                <th className="pb-3 pr-4 font-medium">Reviews</th>
                <th className="pb-3 pr-4 font-medium">Health</th>
                <th className="pb-3 pr-4 font-medium">Status</th>
                <th className="pb-3 pr-4 font-medium">Date</th>
                <th className="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.batchId} className="border-b border-gray-50 hover:bg-slate-50 transition-colors">
                  <td className="py-3 pr-4 font-medium text-slate-900">{b.productName}</td>
                  <td className="py-3 pr-4 capitalize text-slate-600">{b.productCategory}</td>
                  <td className="py-3 pr-4 text-slate-700">{b.totalReviews}</td>
                  <td className={`py-3 pr-4 font-semibold ${healthColor(b.overallHealthScore)}`}>
                    {b.overallHealthScore != null ? `${Math.round(b.overallHealthScore)}%` : '—'}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      b.status === 'completed' ? 'bg-green-100 text-green-700' :
                      b.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                      b.status === 'failed' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{b.status}</span>
                  </td>
                  <td className="py-3 pr-4 text-slate-500 text-xs">{formatDate(b.createdAt)}</td>
                  <td className="py-3 flex flex-wrap gap-2">
                    {b.status === 'completed' && (
                      <>
                        <Link to={`/analysis/${b.batchId}`} className="text-indigo-600 hover:text-indigo-500 font-medium text-xs flex items-center gap-1">
                          View <ArrowUpRight size={12} />
                        </Link>
                        <button type="button" className="text-slate-500 hover:text-slate-700 text-xs flex items-center gap-1" onClick={() => downloadReport(b.batchId, 'pdf')}>
                          <Download size={12} /> PDF
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
