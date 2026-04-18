import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Papa from 'papaparse';
import api from '../api/axios.js';
import FileDropzone from '../components/FileDropzone.jsx';
import ProcessingStatus from '../components/ProcessingStatus.jsx';

const CATEGORIES = [
  'Electronics',
  'Food & FMCG',
  'Clothing',
  'Beauty',
  'Home',
  'Books',
  'Sports',
  'Other',
];

export default function UploadPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [tab, setTab] = useState('file');
  const [file, setFile] = useState(null);
  const [manualText, setManualText] = useState('');
  const [parsedReviews, setParsedReviews] = useState([]);
  const [productName, setProductName] = useState('');
  const [productCategory, setProductCategory] = useState('Food & FMCG');
  const [batchId, setBatchId] = useState('');
  const [processing, setProcessing] = useState(false);
  const [processDone, setProcessDone] = useState(false);
  const [feedRunning, setFeedRunning] = useState(false);
  const [feedCount, setFeedCount] = useState(0);
  const [feedProduct, setFeedProduct] = useState('Live SKU');

  const ingestFile = (f) => {
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result;
      let rows = [];
      try {
        if (f.name.endsWith('.json')) {
          const j = JSON.parse(text);
          rows = Array.isArray(j) ? j : j.reviews || [];
        } else if (f.name.endsWith('.csv')) {
          const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });
          rows = data;
        } else {
          rows = text.split(/\r?\n/).filter(Boolean).map((line) => ({ text: line }));
        }
        const normalized = rows
          .map((r) => (typeof r === 'string' ? { text: r } : { text: r.text || r.review || Object.values(r)[0] }))
          .filter((r) => r.text);
        setParsedReviews(normalized);
        toast.success(`Loaded ${normalized.length} reviews`);
      } catch {
        toast.error('Could not parse file');
      }
    };
    reader.readAsText(f);
  };

  const prepareManual = () => {
    const lines = manualText.split(/\r?\n/).filter((l) => l.trim());
    setParsedReviews(lines.map((text) => ({ text })));
    toast.success(`${lines.length} lines ready`);
  };

  const startFeed = () => {
    setFeedRunning(true);
    setFeedCount(0);
    const samples = [
      'Delivery was fast but packaging was damaged.',
      'Taste is okay, quantity feels a bit low.',
      'Highly recommend, five stars.',
      'Battery drains too fast compared to my old phone.',
      'Fabric quality is great, size runs small.',
    ];
    let n = 0;
    const id = setInterval(() => {
      setParsedReviews((prev) => [...prev, { text: samples[n % samples.length] }]);
      n += 1;
      setFeedCount(n);
      if (n >= 25) {
        clearInterval(id);
        setFeedRunning(false);
        toast.success('Simulated feed complete');
      }
    }, 200);
  };

  async function runProcess(id) {
    setProcessing(true);
    setProcessDone(false);
    try {
      console.log('[Upload] process', id);
      const res = await api.post(`/api/reviews/process/${id}`);
      if (!res.data.success) throw new Error(res.data.message);
      setProcessDone(true);
      toast.success('Analysis complete');
    } catch (err) {
      toast.error(err.response?.data?.message || err.message);
    } finally {
      setProcessing(false);
    }
  }

  const uploadBatch = async () => {
    if (!productName.trim()) {
      toast.error('Product name is required');
      return;
    }
    if (tab === 'file' && !file) {
      toast.error('Select a file first');
      return;
    }
    if (tab !== 'file' && !parsedReviews.length) {
      toast.error('Add reviews first');
      return;
    }
    try {
      console.log('[Upload] posting reviews', parsedReviews.length);
      let res;
      if (tab === 'file' && file) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('productName', productName);
        fd.append('productCategory', productCategory);
        res = await api.post('/api/reviews/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        res = await api.post('/api/reviews/upload', {
          reviews: parsedReviews,
          productName,
          productCategory,
          source: tab === 'api' ? 'api' : 'manual',
        });
      }
      if (!res.data.success) throw new Error(res.data.message);
      setBatchId(res.data.data.batchId);
      setStep(3);
      toast.success('Upload saved — starting analysis');
      await runProcess(res.data.data.batchId);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Upload reviews</h1>

      <div className="flex gap-2 text-sm">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`flex-1 rounded-lg px-3 py-2 text-center ${
              step === s ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-slate-600'
            }`}
          >
            {s === 1 ? '1. Upload' : s === 2 ? '2. Configure' : '3. Analyze'}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {['file', 'manual', 'api'].map((t) => (
              <button
                key={t}
                type="button"
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  tab === t ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200'
                }`}
                onClick={() => setTab(t)}
              >
                {t === 'file' ? 'File upload' : t === 'manual' ? 'Manual paste' : 'API feed'}
              </button>
            ))}
          </div>

          {tab === 'file' && (
            <div className="space-y-3">
              <FileDropzone onFileAccepted={ingestFile} />
              {file && (
                <p className="text-sm text-green-700">
                  {file.name} ({Math.round(file.size / 1024)} KB)
                </p>
              )}
            </div>
          )}

          {tab === 'manual' && (
            <div>
              <textarea
                className="w-full border border-gray-200 rounded-xl p-3 min-h-[220px] text-sm"
                placeholder="Paste reviews here, one per line..."
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
              />
              <div className="flex justify-between mt-2 text-sm text-slate-500">
                <span>{manualText.length} characters</span>
                <button type="button" className="btn-primary text-sm" onClick={prepareManual}>
                  Use text
                </button>
              </div>
            </div>
          )}

          {tab === 'api' && (
            <div className="card space-y-3">
              <p className="text-slate-700">Simulated real-time ingestion (~5 reviews/sec burst).</p>
              <input
                className="border border-gray-200 rounded-lg px-3 py-2 w-full"
                value={feedProduct}
                onChange={(e) => setFeedProduct(e.target.value)}
                placeholder="Product name"
              />
              <button type="button" className="btn-primary" onClick={startFeed} disabled={feedRunning}>
                {feedRunning ? 'Running…' : 'Start live feed'}
              </button>
              <p className="text-sm text-slate-600">Reviews received: {feedCount}</p>
            </div>
          )}

          <button type="button" className="btn-primary" onClick={() => setStep(2)} disabled={!parsedReviews.length}>
            Continue
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="card space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Product name *</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2"
              value={productCategory}
              onChange={(e) => setProductCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm text-slate-600">
            Preview ({parsedReviews.length} reviews) — first 5 shown:
          </p>
          <ul className="text-sm space-y-2 max-h-40 overflow-y-auto bg-slate-50 rounded-lg p-3">
            {parsedReviews.slice(0, 5).map((r, i) => (
              <li key={i} className="truncate">
                {r.text}
              </li>
            ))}
          </ul>
          <span className="badge-neutral">{parsedReviews.length} total</span>
          <div className="flex gap-2">
            <button type="button" className="btn-primary" onClick={uploadBatch}>
              Upload &amp; analyze
            </button>
            <button type="button" className="border border-gray-200 rounded-lg px-4 py-2" onClick={() => setStep(1)}>
              Back
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="card">
            <p className="text-sm text-slate-500">Batch ID</p>
            <p className="font-mono text-sm">{batchId}</p>
            <p className="text-slate-700 mt-2">{productName}</p>
          </div>
          <ProcessingStatus active={processing} finished={processDone} />
          {processDone && (
            <button type="button" className="btn-primary" onClick={() => navigate(`/analysis/${batchId}`)}>
              View results
            </button>
          )}
        </div>
      )}
    </div>
  );
}
