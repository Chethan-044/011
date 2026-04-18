import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { getSentimentColor } from '../utils/helpers.js';

const PAGE = 20;

export default function ReviewTable({ reviews }) {
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState({});

  const filtered = useMemo(() => {
    let r = reviews || [];
    if (q.trim()) {
      const qq = q.toLowerCase();
      r = r.filter((x) => (x.originalText || '').toLowerCase().includes(qq));
    }
    if (filter === 'positive') r = r.filter((x) => x.overallSentiment === 'POSITIVE');
    if (filter === 'negative') r = r.filter((x) => x.overallSentiment === 'NEGATIVE');
    if (filter === 'sarcastic') r = r.filter((x) => x.overallSentiment === 'SARCASTIC' || x.isSarcastic);
    if (filter === 'review') r = r.filter((x) => x.needsHumanReview);
    if (filter === 'bot') r = r.filter((x) => x.isBot);
    return r;
  }, [reviews, filter, q]);

  const slice = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));

  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <input
          type="search"
          placeholder="Search review text…"
          className="border border-gray-200 rounded-lg px-3 py-2 w-full md:max-w-md"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
        />
        <div className="flex flex-wrap gap-2">
          {['all', 'positive', 'negative', 'sarcastic', 'review', 'bot'].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                setFilter(f);
                setPage(0);
              }}
              className={`text-xs px-3 py-1 rounded-full border ${
                filter === f ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-200'
              }`}
            >
              {f === 'review' ? 'Needs Review' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="p-3 w-8" />
              <th className="p-3">#</th>
              <th className="p-3">Review</th>
              <th className="p-3">Lang</th>
              <th className="p-3">Sentiment</th>
              <th className="p-3">Features</th>
              <th className="p-3">Bot</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((row, idx) => {
              const i = page * PAGE + idx + 1;
              const sarc = row.isSarcastic || row.overallSentiment === 'SARCASTIC';
              const bot = row.isBot;
              const rowBg = bot                ? 'bg-red-50/80 line-through decoration-red-400'
                : sarc
                  ? 'bg-purple-50/80 italic'
                  : '';
              const expanded = open[row.reviewId];
              return (
                <Fragment key={row.reviewId}>
                  <tr className={`border-t border-gray-100 ${rowBg}`}>
                    <td className="p-2">
                      <button type="button" onClick={() => toggle(row.reviewId)} className="p-1 text-slate-500">
                        {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </button>
                    </td>
                    <td className="p-2 text-slate-500">{i}</td>
                    <td className="p-2 max-w-md">
                      {(row.originalText || '').slice(0, 140)}
                      {(row.originalText || '').length > 140 ? '…' : ''}
                    </td>
                    <td className="p-2 text-slate-600">{row.detectedLanguage || '—'}</td>
                    <td className={`p-2 font-medium ${getSentimentColor(row.overallSentiment)}`}>
                      {row.overallSentiment}
                    </td>
                    <td className="p-2 text-xs text-slate-600">
                      {(row.featureSentiments || []).map((f) => f.feature).join(', ') || '—'}
                    </td>
                    <td className="p-2">{row.isBot ? <span className="badge-negative">Yes</span> : '—'}</td>
                  </tr>
                  {expanded && (
                    <tr className="bg-slate-50/90">
                      <td colSpan={7} className="p-4 text-slate-700 whitespace-pre-wrap">
                        <strong>Full text:</strong> {row.originalText}
                        {row.cleanedText && row.cleanedText !== row.originalText && (
                          <>
                            <br />
                            <strong>Cleaned:</strong> {row.cleanedText}
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center text-sm text-slate-600">
        <span>
          Showing {filtered.length ? page * PAGE + 1 : 0}–{Math.min((page + 1) * PAGE, filtered.length)} of{' '}
          {filtered.length}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-primary disabled:opacity-40"
            disabled={page <= 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Prev
          </button>
          <button
            type="button"
            className="btn-primary disabled:opacity-40"
            disabled={page >= pages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
