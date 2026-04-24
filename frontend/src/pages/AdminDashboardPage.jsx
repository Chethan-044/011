import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Flame,
  Loader2,
  MessageSquare,
  Send,
  ShieldCheck,
  Timer,
  TrendingDown,
  User,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios.js';
import { useAuth } from '../context/AuthContext.jsx';
import useSocket from '../hooks/useSocket.js';

/* ─── helpers ─── */
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function priorityStyles(p) {
  switch (p) {
    case 'critical':  return 'bg-red-500/15 text-red-400 border-red-500/30';
    case 'high':      return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
    case 'medium':    return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    default:          return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
  }
}

function statusDot(s) {
  switch (s) {
    case 'critical':    return 'bg-red-500';
    case 'in_progress': return 'bg-amber-500';
    case 'resolved':    return 'bg-emerald-500';
    default:            return 'bg-slate-500';
  }
}

function feedEntryColor(status) {
  switch (status) {
    case 'resolved':    return 'border-l-emerald-500 bg-emerald-500/5';
    case 'in_progress': return 'border-l-amber-500 bg-amber-500/5';
    case 'critical':    return 'border-l-red-500 bg-red-500/5';
    default:            return 'border-l-slate-500 bg-slate-500/5';
  }
}

/* ─── main component ─── */
export default function AdminDashboardPage() {
  const { user } = useAuth();
  const { socket, connected } = useSocket();

  const [issues, setIssues] = useState([]);
  const [stats, setStats] = useState({ totalCritical: 0, resolvedToday: 0, avgResolutionTime: 0, myOpenIssues: 0 });
  const [activityFeed, setActivityFeed] = useState([]);
  const [resolvingIds, setResolvingIds] = useState(new Set());
  const [resolveNotes, setResolveNotes] = useState({});
  const [loading, setLoading] = useState(true);

  /* ─── initial data fetch ─── */
  const fetchData = useCallback(async () => {
    try {
      const [issuesRes, statsRes] = await Promise.all([
        api.get('/api/issues'),
        api.get('/api/issues/stats/admin'),
      ]);
      if (issuesRes.data.success) {
        const all = issuesRes.data.data.issues || [];
        setIssues(all.filter((i) => i.status !== 'resolved'));
      }
      if (statsRes.data.success) setStats(statsRes.data.data);
    } catch (err) {
      toast.error('Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Periodic refresh to catch newly assigned issues
  useEffect(() => {
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  /* ─── socket listeners ─── */
  useEffect(() => {
    if (!socket) return;

    const onNewCritical = (payload) => {
      setIssues((prev) => {
        if (prev.some((i) => i._id === payload.issueId)) return prev;
        return [{
          _id: payload.issueId,
          topic: payload.topic,
          sku: payload.sku,
          category: payload.category,
          occurrenceCount: payload.occurrenceCount,
          priority: payload.priority,
          status: payload.status,
          assignedTo: payload.assignedTo,
          assignedAt: payload.assignedAt,
          representativeReviews: payload.representativeReviews || [],
        }, ...prev];
      });
      setStats((s) => ({ ...s, totalCritical: s.totalCritical + 1, myOpenIssues: s.myOpenIssues + 1 }));
      setActivityFeed((f) => [{
        id: `new-${payload.issueId}-${Date.now()}`,
        type: 'escalation',
        topic: payload.topic,
        sku: payload.sku,
        assignee: payload.assignedTo?.name,
        priority: payload.priority,
        status: 'critical',
        timestamp: new Date().toISOString(),
      }, ...f].slice(0, 50));
    };

    const onResolved = (payload) => {
      setIssues((prev) => prev.filter((i) => String(i._id) !== String(payload.issueId)));
      setStats((s) => ({
        ...s,
        totalCritical: Math.max(0, s.totalCritical - 1),
        resolvedToday: s.resolvedToday + 1,
        myOpenIssues: Math.max(0, s.myOpenIssues - 1),
      }));
      setActivityFeed((f) => [{
        id: `res-${payload.issueId}-${Date.now()}`,
        type: 'resolution',
        topic: payload.topic,
        resolvedBy: payload.resolvedBy?.name,
        note: payload.resolutionNote,
        status: 'resolved',
        timestamp: payload.resolvedAt,
        pulse: true,
      }, ...f].slice(0, 50));
      setResolvingIds((s) => { const n = new Set(s); n.delete(String(payload.issueId)); return n; });
    };

    const onOccurrence = (payload) => {
      setIssues((prev) => prev.map((i) => {
        if (String(i._id) !== String(payload.issueId)) return i;
        return { ...i, occurrenceCount: payload.newCount, priority: payload.priority, status: payload.status };
      }));
      if (payload.crossedCriticalThreshold) {
        setStats((s) => ({ ...s, totalCritical: s.totalCritical + 1 }));
      }
      setActivityFeed((f) => [{
        id: `occ-${payload.issueId}-${Date.now()}`,
        type: 'occurrence',
        topic: payload.topic,
        newCount: payload.newCount,
        status: payload.priority === 'critical' ? 'critical' : 'in_progress',
        timestamp: new Date().toISOString(),
      }, ...f].slice(0, 50));
    };

    const onSync = (data) => {
      if (data.issues) {
        setIssues(data.issues.filter((i) => i.status !== 'resolved'));
      }
    };

    socket.on('new_critical_issue', onNewCritical);
    socket.on('issue_resolved', onResolved);
    socket.on('occurrence_updated', onOccurrence);
    socket.on('sync_state', onSync);

    return () => {
      socket.off('new_critical_issue', onNewCritical);
      socket.off('issue_resolved', onResolved);
      socket.off('occurrence_updated', onOccurrence);
      socket.off('sync_state', onSync);
    };
  }, [socket]);

  /* ─── resolve handler ─── */
  const handleResolve = async (issueId) => {
    const note = resolveNotes[issueId] || '';
    setResolvingIds((s) => new Set(s).add(String(issueId)));
    // Optimistic: remove from list
    const backup = [...issues];
    setIssues((prev) => prev.filter((i) => String(i._id) !== String(issueId)));

    try {
      await api.post(`/api/issues/${issueId}/resolve`, { resolutionNote: note });
      toast.success('Issue resolved!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to resolve');
      setIssues(backup); // revert
      setResolvingIds((s) => { const n = new Set(s); n.delete(String(issueId)); return n; });
    }
  };

  /* ─── derived: show all active issues, not just "mine" ─── */
  const activeIssues = useMemo(() =>
    issues.filter((i) => i.status !== 'resolved'),
    [issues],
  );

  /* ─── loading state ─── */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-slate-400">
          <Loader2 className="animate-spin" size={24} />
          <span>Loading admin dashboard…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck size={24} className="text-indigo-600" />
            Admin Command Center
          </h1>
          <p className="text-slate-500 text-sm mt-1">Issue escalation management — real-time</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 rounded-xl px-3 py-2 border ${connected ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            <span className={`text-xs font-medium ${connected ? 'text-emerald-600' : 'text-red-600'}`}>
              {connected ? 'Live Connected' : 'Reconnecting…'}
            </span>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Flame,         label: 'Total Critical',      value: stats.totalCritical,     iconBg: 'bg-red-50',     iconColor: 'text-red-600' },
          { icon: CheckCircle2,  label: 'Resolved Today',      value: stats.resolvedToday,     iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
          { icon: Timer,         label: 'Avg Resolution Time', value: `${stats.avgResolutionTime}m`, iconBg: 'bg-amber-50',   iconColor: 'text-amber-600' },
          { icon: User,          label: 'My Open Issues',      value: stats.myOpenIssues,      iconBg: 'bg-indigo-50',  iconColor: 'text-indigo-600' },
        ].map((s, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{s.label}</span>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${s.iconBg}`}>
                <s.icon size={18} className={s.iconColor} />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900 transition-all duration-300">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Main Grid: My Issues + Activity Feed */}
      <div className="grid lg:grid-cols-5 gap-6">
        {/* LEFT: My Assigned Issues (3 cols) */}
        <div className="lg:col-span-3 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-500" />
            Escalated Issues
            {activeIssues.length > 0 && (
              <span className="ml-auto bg-red-100 text-red-600 text-xs font-bold px-2.5 py-0.5 rounded-full">
                {activeIssues.length}
              </span>
            )}
          </h2>

          {activeIssues.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
              <CheckCircle2 size={48} className="mx-auto text-emerald-400 mb-3 opacity-50" />
              <p className="text-slate-500 text-sm">No open issues — all clear!</p>
              <p className="text-slate-400 text-xs mt-1">Issues will appear here once occurrence count crosses the threshold</p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
              {activeIssues.map((issue) => {
                const isResolving = resolvingIds.has(String(issue._id));
                return (
                  <div
                    key={issue._id}
                    className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300 animate-in"
                  >
                    {/* Issue Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-slate-900 truncate">{issue.topic}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${priorityStyles(issue.priority)}`}>
                            {issue.priority}
                          </span>
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Clock size={10} />
                            {timeAgo(issue.assignedAt)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 bg-slate-100 rounded-full px-2.5 py-1">
                        <div className={`w-2 h-2 rounded-full ${statusDot(issue.status)}`} />
                        <span className="text-[10px] font-medium text-slate-600 uppercase">{issue.status?.replace('_', ' ')}</span>
                      </div>
                    </div>

                    {/* Occurrence Badge */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs text-slate-500">Occurrences:</span>
                      <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full transition-all duration-300">
                        {issue.occurrenceCount}
                      </span>
                    </div>

                    {/* Representative Reviews */}
                    {issue.representativeReviews?.length > 0 && (
                      <div className="mb-4">
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium mb-1.5">Driving Reviews</p>
                        <div className="space-y-1.5 max-h-28 overflow-y-auto">
                          {issue.representativeReviews.slice(-4).map((rev, ri) => (
                            <div key={ri} className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                              <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-2">{rev.text}</p>
                              <span className={`text-[9px] font-semibold uppercase ${
                                rev.sentiment === 'Negative' ? 'text-red-500' : rev.sentiment === 'Positive' ? 'text-emerald-500' : 'text-slate-400'
                              }`}>{rev.sentiment}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Resolution Controls */}
                    <div className="border-t border-gray-100 pt-3">
                      <textarea
                        rows={2}
                        placeholder="Resolution note — what action was taken?"
                        value={resolveNotes[issue._id] || ''}
                        onChange={(e) => setResolveNotes((prev) => ({ ...prev, [issue._id]: e.target.value }))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition-all"
                      />
                      <button
                        type="button"
                        disabled={isResolving}
                        onClick={() => handleResolve(issue._id)}
                        className="mt-2 w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white font-medium py-2.5 rounded-xl text-sm transition-all duration-200"
                      >
                        {isResolving ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <>
                            <CheckCircle2 size={16} />
                            Mark as Resolved
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT: Activity Feed (2 cols) */}
        <div className="lg:col-span-2">
          <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <MessageSquare size={18} className="text-indigo-600" />
            Issue Activity Feed
          </h2>

          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            {activityFeed.length === 0 ? (
              <div className="p-8 text-center">
                <Send size={36} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-400 text-sm">Activity will appear here live as issues are escalated and resolved</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 max-h-[calc(100vh-320px)] overflow-y-auto">
                {activityFeed.map((entry) => (
                  <div
                    key={entry.id}
                    className={`px-4 py-3 border-l-4 transition-all duration-500 ${feedEntryColor(entry.status)} ${entry.pulse ? 'animate-pulse-once' : ''}`}
                  >
                    {entry.type === 'resolution' ? (
                      <>
                        <div className="flex items-center gap-2 mb-1">
                          <CheckCircle2 size={14} className="text-emerald-500" />
                          <span className="text-xs font-semibold text-emerald-600">Resolved</span>
                          <span className="text-[10px] text-slate-400">{timeAgo(entry.timestamp)}</span>
                        </div>
                        <p className="text-xs text-slate-700">
                          <span className="font-medium">{entry.resolvedBy}</span> resolved <span className="font-medium">{entry.topic}</span>
                        </p>
                        {entry.note && (
                          <p className="text-[11px] text-slate-500 mt-1 italic">"{entry.note}"</p>
                        )}
                      </>
                    ) : entry.type === 'escalation' ? (
                      <>
                        <div className="flex items-center gap-2 mb-1">
                          <Flame size={14} className="text-red-500" />
                          <span className="text-xs font-semibold text-red-500">New Critical</span>
                          <span className="text-[10px] text-slate-400">{timeAgo(entry.timestamp)}</span>
                        </div>
                        <p className="text-xs text-slate-700">
                          <span className="font-medium">{entry.topic}</span> escalated — assigned to <span className="font-medium">{entry.assignee || 'pending'}</span>
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 mb-1">
                          <TrendingDown size={14} className="text-amber-500" />
                          <span className="text-xs font-semibold text-amber-600">Count Update</span>
                          <span className="text-[10px] text-slate-400">{timeAgo(entry.timestamp)}</span>
                        </div>
                        <p className="text-xs text-slate-700">
                          <span className="font-medium">{entry.topic}</span> count → <span className="font-bold">{entry.newCount}</span>
                        </p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
