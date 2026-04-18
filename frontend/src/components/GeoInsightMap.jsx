import { MapPin } from 'lucide-react';

export default function GeoInsightMap({ geoInsights }) {
  const byState = geoInsights?.by_state || {};
  const keys = Object.keys(byState);
  if (!keys.length) {
    return <p className="text-slate-500 text-center py-6">No geographic mentions detected in this batch.</p>;
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {keys.map((state) => {
        const s = byState[state];
        return (
          <div key={state} className="card border-indigo-100">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <MapPin className="text-indigo-500" size={20} />
              {state}
            </div>
            <p className="text-sm text-slate-600 mt-2">Reviews: {s.total_reviews}</p>
            <p className="text-sm text-slate-600">Avg sentiment score: {s.avg_sentiment_score}</p>
            <p className="text-xs text-red-600 mt-2">Top complaint: {(s.top_complaints || []).join(', ') || '—'}</p>
            <p className="text-xs text-green-700">Top praise: {(s.top_praises || []).join(', ') || '—'}</p>
          </div>
        );
      })}
    </div>
  );
}
