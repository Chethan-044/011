export default function StatsCard({ title, value, icon: Icon, color, trend, subtitle }) {
  const tone = color || 'bg-indigo-100 text-indigo-600';
  return (
    <div className="card flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
        </div>
        {Icon && (
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${tone}`}>
            <Icon size={20} />
          </div>
        )}
      </div>
      {trend && (
        <span
          className={`text-xs font-semibold ${trend.startsWith('↑') ? 'text-green-600' : 'text-red-600'}`}
        >
          {trend}
        </span>
      )}
    </div>
  );
}
