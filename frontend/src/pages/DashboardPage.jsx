import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Heart, MessageSquare, Package, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios.js';
import AlertBanner from '../components/AlertBanner.jsx';
import StatsCard from '../components/StatsCard.jsx';
import { formatDate, formatNumber } from '../utils/helpers.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function DashboardPage() {
  const { user } = useAuth();
  const [batches, setBatches] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const stats = useMemo(() => {
    const products = new Set(batches.map((b) => b.productName));
    const totalReviews = batches.reduce((s, b) => s + (b.totalReviews || 0), 0);
    const healthScores = batches.map((b) => b.overallHealthScore).filter((v) => v != null);
    const avgHealth =
      healthScores.length > 0 ? Math.round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length) : 0;
    return {
      products: products.size,
      totalReviews,
      alerts: alerts.length,
      avgHealth,
    };
  }, [batches, alerts]);

  const healthColor = (score) => {
    if (score == null) return 'text-slate-400';
    if (score >= 80) return 'text-green-600 font-semibold';
    if (score >= 60) return 'text-amber-600 font-semibold';
    return 'text-red-600 font-semibold';
  };

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

  const statusBadge = (status) => {
    const map = {
      pending: 'badge-neutral',
      processing: 'bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded-full',
      completed: 'badge-positive',
      failed: 'badge-negative',
    };
    return map[status] || 'badge-neutral';
  };

  if (loading) {
    return <div className="py-20 text-center text-slate-500">Loading dashboard…</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Welcome back {user?.name}!</h1>
        <p className="text-slate-500 text-sm mt-1">ReviewSense command center</p>
      </div>

      {alerts.length > 0 && <AlertBanner alerts={alerts} severity="CRITICAL" />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Products analyzed" value={formatNumber(stats.products)} icon={Package} color="bg-indigo-100 text-indigo-600" />
        <StatsCard title="Reviews processed" value={formatNumber(stats.totalReviews)} icon={MessageSquare} color="bg-sky-100 text-sky-600" />
        <StatsCard title="Active alerts" value={formatNumber(stats.alerts)} icon={AlertTriangle} color="bg-red-100 text-red-600" />
        <StatsCard title="Avg health score" value={`${stats.avgHealth || 0}%`} icon={Heart} color="bg-green-100 text-green-600" />
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold text-lg mb-4">Recent batches</h2>
        {batches.length === 0 ? (
          <p className="text-slate-500">No uploads yet. Start with the Upload page.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-500 border-b">
              <tr>
                <th className="pb-2 pr-4">Product</th>
                <th className="pb-2 pr-4">Category</th>
                <th className="pb-2 pr-4">Reviews</th>
                <th className="pb-2 pr-4">Health</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Date</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.batchId} className="border-b border-gray-50">
                  <td className="py-3 pr-4 font-medium">{b.productName}</td>
                  <td className="py-3 pr-4 capitalize">{b.productCategory}</td>
                  <td className="py-3 pr-4">{b.totalReviews}</td>
                  <td className={`py-3 pr-4 ${healthColor(b.overallHealthScore)}`}>
                    {b.overallHealthScore != null ? `${Math.round(b.overallHealthScore)}%` : '—'}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={statusBadge(b.status)}>{b.status}</span>
                  </td>
                  <td className="py-3 pr-4 text-slate-600">{formatDate(b.createdAt)}</td>
                  <td className="py-3 flex flex-wrap gap-2">
                    {b.status === 'completed' && (
                      <>
                        <Link to={`/analysis/${b.batchId}`} className="text-indigo-600 font-medium">
                          View
                        </Link>
                        <button type="button" className="text-slate-600" onClick={() => downloadReport(b.batchId, 'pdf')}>
                          PDF
                        </button>
                        <button type="button" className="text-slate-600" onClick={() => downloadReport(b.batchId, 'csv')}>
                          CSV
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

      <Link
        to="/upload"
        className="fixed bottom-6 right-6 btn-primary shadow-lg flex items-center gap-2 rounded-full px-5 py-3"
      >
        <Plus size={20} />
        Upload
      </Link>
    </div>
  );
}
