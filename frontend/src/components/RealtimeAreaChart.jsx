import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/**
 * Realtime Area Chart — shows cumulative sentiment counts over time
 * for each feature detected in the live stream.
 *
 * Props:
 *  - featureData: [{ feature, positiveCount, negativeCount, neutralCount }]
 *  - rollingReviews: [{ feature, sentiment, timestamp }]  (from state.rollingReviews)
 */
export default function RealtimeAreaChart({ featureData, rollingReviews = [] }) {
  // Build time-series from rolling reviews for the area chart
  const areaData = useMemo(() => {
    if (!rollingReviews?.length) {
      // Fallback: use featureData as single data point
      if (!featureData?.length) return [];
      return featureData.map((f) => ({
        name: (f.feature || '').replace(/_/g, ' '),
        Positive: f.positiveCount || 0,
        Negative: f.negativeCount || 0,
        Neutral: f.neutralCount || 0,
      }));
    }

    // Group rolling reviews into time buckets (every review as a cumulative data point)
    const cumulative = { Positive: 0, Negative: 0, Neutral: 0 };
    return rollingReviews.map((r, idx) => {
      const sentiment = r.sentiment || 'Neutral';
      if (sentiment === 'Positive') cumulative.Positive += 1;
      else if (sentiment === 'Negative') cumulative.Negative += 1;
      else cumulative.Neutral += 1;

      const time = r.timestamp
        ? new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : `#${idx + 1}`;

      return {
        name: time,
        Positive: cumulative.Positive,
        Negative: cumulative.Negative,
        Neutral: cumulative.Neutral,
      };
    });
  }, [featureData, rollingReviews]);

  if (!areaData.length) {
    return <p className="text-slate-500 text-center py-8">No realtime data yet…</p>;
  }

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={areaData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradPositive" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="gradNegative" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="gradNeutral" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10 }}
            interval="preserveStartEnd"
            angle={-25}
            textAnchor="end"
            height={50}
          />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            }}
          />
          <Legend />
          <Area
            type="monotone"
            dataKey="Positive"
            stroke="#22c55e"
            strokeWidth={2}
            fill="url(#gradPositive)"
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Area
            type="monotone"
            dataKey="Negative"
            stroke="#ef4444"
            strokeWidth={2}
            fill="url(#gradNegative)"
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Area
            type="monotone"
            dataKey="Neutral"
            stroke="#6366f1"
            strokeWidth={2}
            fill="url(#gradNeutral)"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
