import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export default function FeatureBarChart({ featureData }) {
  if (!featureData?.length) {
    return <p className="text-slate-500 text-center py-8">No feature data yet.</p>;
  }

  const data = featureData.map((f) => ({
    name: (f.feature || '').replace(/_/g, ' '),
    Positive: f.positiveCount || 0,
    Negative: f.negativeCount || 0,
    Neutral: f.neutralCount || 0,
  }));

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
          <YAxis allowDecimals={false} />
          <Tooltip
            formatter={(value, name) => [`${value}`, name]}
            labelFormatter={(l) => `${l}`}
            contentStyle={{ borderRadius: 12 }}
          />
          <Legend />
          <Bar dataKey="Positive" fill="#22c55e" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Negative" fill="#ef4444" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Neutral" fill="#94a3b8" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
