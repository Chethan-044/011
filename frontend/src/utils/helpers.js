export function formatDate(dateString) {
  if (!dateString) return '—';
  const d = new Date(dateString);
  return d.toLocaleString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatNumber(n) {
  if (n == null || Number.isNaN(n)) return '0';
  return Number(n).toLocaleString('en-IN');
}

export function getSentimentColor(sentiment) {
  const s = (sentiment || '').toUpperCase();
  if (s === 'POSITIVE') return 'text-green-600';
  if (s === 'NEGATIVE') return 'text-red-600';
  if (s === 'SARCASTIC') return 'text-purple-600';
  return 'text-gray-600';
}

export function getSeverityColor(severity) {
  const s = (severity || '').toLowerCase();
  if (s === 'critical' || s === 'high') return 'text-red-600';
  if (s === 'moderate' || s === 'medium') return 'text-amber-600';
  return 'text-blue-600';
}

export function getPriorityColor(priority) {
  const p = (priority || '').toUpperCase();
  if (p === 'URGENT') return 'border-l-red-500';
  if (p === 'HIGH') return 'border-l-amber-500';
  if (p === 'MEDIUM') return 'border-l-blue-500';
  return 'border-l-green-500';
}

export function calculateHealthScore(analysis) {
  if (!analysis?.trendReport?.overallHealthScore && analysis?.trendReport?.overallHealthScore !== 0) {
    return null;
  }
  return Math.round(analysis.trendReport.overallHealthScore);
}

export function truncateText(text, maxLength = 120) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

export function exportToCSV(data, filename) {
  if (!data?.length) return;
  const keys = Object.keys(data[0]);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [keys.join(','), ...data.map((row) => keys.map((k) => esc(row[k])).join(','))];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function groupByFeature(reviews) {
  const map = {};
  (reviews || []).forEach((r) => {
    (r.featureSentiments || []).forEach((f) => {
      if (!map[f.feature]) map[f.feature] = [];
      map[f.feature].push({ ...f, reviewId: r.reviewId });
    });
  });
  return map;
}
