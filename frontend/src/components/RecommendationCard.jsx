import { Lightbulb } from 'lucide-react';
import { getPriorityColor } from '../utils/helpers.js';

const priBadge = (p) => {
  const u = (p || '').toUpperCase();
  if (u === 'URGENT') return 'badge-critical';
  if (u === 'HIGH') return 'badge-moderate';
  if (u === 'MEDIUM') return 'bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded-full';
  return 'badge-positive';
};

export default function RecommendationCard({ recommendation }) {
  if (!recommendation) return null;
  const border = getPriorityColor(recommendation.priority);
  return (
    <div className={`card border-l-4 ${border} flex gap-3`}>
      <Lightbulb className="text-amber-500 shrink-0" size={22} />
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <span className={priBadge(recommendation.priority)}>{recommendation.priority}</span>
          <span className="badge-neutral">{recommendation.department}</span>
        </div>
        <p className="font-medium text-slate-900">{recommendation.action}</p>
        {recommendation.supportingData && (
          <p className="text-sm text-slate-600">{recommendation.supportingData}</p>
        )}
      </div>
    </div>
  );
}
