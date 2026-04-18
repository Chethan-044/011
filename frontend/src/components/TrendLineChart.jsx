import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9'];

export default function TrendLineChart({ trendData, features = [] }) {
  if (!trendData?.length) {
    return <p className="text-slate-500 text-center py-8">Not enough batches for a trend line.</p>;
  }

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={trendData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="batchIndex" />
          <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
          <Tooltip />
          <Legend />
          <ReferenceLine y={40} stroke="#fecaca" strokeDasharray="4 4" />
          {features.map((f, i) => (
            <Line
              key={f}
              type="monotone"
              dataKey={f}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot
 />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
