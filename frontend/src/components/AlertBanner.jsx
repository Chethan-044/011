import { AlertCircle, AlertTriangle, X } from 'lucide-react';
import { useState } from 'react';

export default function AlertBanner({ alerts, severity = 'CRITICAL' }) {
  const [dismissed, setDismissed] = useState({});
  if (!alerts?.length) return null;

  const isCrit = severity === 'CRITICAL';
  const bg = isCrit ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200';
  const Icon = isCrit ? AlertTriangle : AlertCircle;

  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <div className="flex items-center gap-2 font-semibold text-slate-900">
        <Icon className={isCrit ? 'text-red-600' : 'text-amber-600'} size={22} />
        <span>
          {alerts.length} {severity === 'CRITICAL' ? 'Critical' : 'Moderate'} issue
          {alerts.length > 1 ? 's' : ''} need attention
        </span>
      </div>
      <ul className="mt-3 space-y-2">
        {alerts.map((a, i) =>
          dismissed[i] ? null : (
            <li key={i} className="flex items-start justify-between gap-2 text-sm text-slate-700">
              <span>
                <strong>{a.productName || a.feature}</strong> — {a.message || a.recommendation}
              </span>
              <button
                type="button"
                className="p-1 text-slate-400 hover:text-slate-600 shrink-0"
                onClick={() => setDismissed((d) => ({ ...d, [i]: true }))}
                aria-label="Dismiss"
              >
                <X size={16} />
              </button>
            </li>
          )
        )}
      </ul>
    </div>
  );
}
