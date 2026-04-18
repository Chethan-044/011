import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud } from 'lucide-react';

export default function FileDropzone({ onFileAccepted }) {
  const [error, setError] = useState('');

  const onDrop = useCallback(
    (files) => {
      setError('');
      if (files?.[0]) onFileAccepted(files[0]);
    },
    [onFileAccepted]
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'application/json': ['.json'], 'text/plain': ['.txt'] },
    maxFiles: 1,
    onDropRejected: () => setError('Please upload a .csv, .json, or .txt file'),
  });

  if (fileRejections?.length) {
    /* handled in onDropRejected */
  }

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
        error
          ? 'border-red-400 bg-red-50'
          : isDragActive
            ? 'border-indigo-500 bg-indigo-50'
            : 'border-gray-300 bg-white hover:border-indigo-400 hover:bg-slate-50'
      }`}
    >
      <input {...getInputProps()} />
      <UploadCloud className="mx-auto text-indigo-500 mb-3" size={40} />
      <p className="text-slate-700 font-medium">Drop a CSV, JSON, or TXT file here</p>
      <p className="text-sm text-slate-500 mt-1">or click to browse</p>
      {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
    </div>
  );
}
