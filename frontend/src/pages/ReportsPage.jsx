import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios.js';
import { formatDate } from '../utils/helpers.js';

export default function ReportsPage() {
  const [batches, setBatches] = useState([]);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/api/reviews/list');
        if (res.data.success) setBatches((res.data.data.batches || []).filter((b) => b.status === 'completed'));
      } catch {
        toast.error('Could not load reports');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const download = async (batchId, format) => {
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

  const openPreview = async (batchId) => {
    try {
      const res = await api.get(`/api/reviews/${batchId}`);
      if (res.data.success) setPreview(res.data.data);
    } catch {
      toast.error('Preview failed');
    }
  };

  if (loading) return <div className="py-20 text-center">Loading…</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reports</h1>
      <div className="grid md:grid-cols-2 gap-4">
        {batches.map((b) => (
          <div key={b.batchId} className="card flex flex-col gap-3">
            <div>
              <h3 className="font-semibold text-lg">{b.productName}</h3>
              <p className="text-sm text-slate-500">{formatDate(b.createdAt)}</p>
              <p className="text-sm text-slate-600 mt-1">{b.totalReviews} reviews</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary text-sm" onClick={() => download(b.batchId, 'pdf')}>
                PDF
              </button>
              <button type="button" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" onClick={() => download(b.batchId, 'csv')}>
                CSV
              </button>
              <button type="button" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" onClick={() => openPreview(b.batchId)}>
                Preview
              </button>
            </div>
          </div>
        ))}
      </div>
      {batches.length === 0 && <p className="text-slate-500">Complete an analysis to see downloadable reports.</p>}

      {preview && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg">{preview.batch?.productName}</h3>
            <p className="text-sm text-slate-600 mt-2">{preview.analysis?.trendReport?.trendSummary}</p>
            <button type="button" className="btn-primary mt-4" onClick={() => setPreview(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
