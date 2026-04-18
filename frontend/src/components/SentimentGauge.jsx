export default function SentimentGauge({ score = 0, label = 'Health Score' }) {
  const clamped = Math.max(0, Math.min(100, score));
  const angle = (clamped / 100) * 180 - 90;
  const rad = (angle * Math.PI) / 180;
  const needleLen = 38;
  const cx = 50;
  const cy = 55;
  const x2 = cx + needleLen * Math.cos(rad);
  const y2 = cy + needleLen * Math.sin(rad);

  let zone = 'text-red-600';
  if (clamped >= 70) zone = 'text-green-600';
  else if (clamped >= 40) zone = 'text-amber-500';

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 70" className="w-48 h-32">
        <path          d="M 10 55 A 40 40 0 0 1 90 55"
          fill="none"
          stroke="#fecaca"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M 22 55 A 28 28 0 0 1 78 55"
          fill="none"
          stroke="#fcd34d"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M 34 55 A 16 16 0 0 1 66 55"
          fill="none"
          stroke="#bbf7d0"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <line x1={cx} y1={cy} x2={x2} y2={y2} stroke="#1e293b" strokeWidth="2" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="4" fill="#1e293b" />
      </svg>
      <p className={`text-3xl font-bold -mt-6 ${zone}`}>{Math.round(clamped)}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}
