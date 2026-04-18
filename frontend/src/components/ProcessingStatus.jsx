import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

const STEPS = [
  'Upload complete',
  'Preprocessing (cleaning, translating)',
  'Bot detection',
  'Sentiment analysis',
  'Trend detection',
  'Generating insights',
];

export default function ProcessingStatus({ active, finished }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!active) {
      setStep(0);
      return undefined;
    }
    setStep(0);
    const id = setInterval(() => {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }, 2300);
    return () => clearInterval(id);
  }, [active]);

  useEffect(() => {
    if (finished) setStep(STEPS.length);
  }, [finished]);

  if (!active && !finished) return null;

  return (
    <div className="card space-y-3">
      <h3 className="font-semibold text-slate-900">Processing pipeline</h3>
      <ul className="space-y-2">
        {STEPS.map((label, i) => {
          const done = finished || i < step;
          const current = !finished && i === step;
          return (
            <li key={label} className="flex items-center gap-2 text-sm">
              {done ? (
                <Check className="text-green-500" size={18} />
              ) : current ? (
                <Loader2 className="animate-spin text-indigo-500" size={18} />
              ) : (
                <span className="w-[18px] h-[18px] rounded-full border border-slate-200 inline-block" />
              )}
              <span className={done || current ? 'text-slate-900' : 'text-slate-400'}>{label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
