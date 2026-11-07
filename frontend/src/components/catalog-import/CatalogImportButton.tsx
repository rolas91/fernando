import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Upload,
  FileSpreadsheet,
  X,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Download,
  ListChecks,
  RotateCcw,
  FileCheck,
  FileX,
  Layers,
} from 'lucide-react';
import {
  dbDownloadCatalogTemplate,
  dbGetCatalogImportJob,
  dbImportCatalogApply,
  dbImportCatalogApplyAsync,
  dbImportCatalogPreview,
  type CatalogImportApply,
  type CatalogImportJob,
  type CatalogImportParsedRow,
  type CatalogImportPreview,
  type CatalogScope,
} from '@/lib/db';

type Phase = 'idle' | 'previewing' | 'preview' | 'applying' | 'done' | 'error';

const SCOPES_WITH_ASYNC: CatalogScope[] = ['workers'];

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type Props = {
  scope: CatalogScope;
  label?: string;
  onDone?: () => void;
};

const CatalogImportButton: React.FC<Props> = ({
  scope,
  label = 'Import Excel',
  onDone,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dropRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CatalogImportPreview | null>(null);
  const [applyResult, setApplyResult] = useState<CatalogImportApply | null>(
    null,
  );
  const [mode, setMode] = useState<'create' | 'upsert'>('upsert');
  const [useAsync, setUseAsync] = useState<boolean>(false);
  const [job, setJob] = useState<CatalogImportJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const reset = useCallback(() => {
    setPhase('idle');
    setFile(null);
    setPreview(null);
    setApplyResult(null);
    setJob(null);
    setError(null);
    setIsDragging(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const closeModal = useCallback(() => {
    setOpen(false);
    setTimeout(reset, 150);
  }, [reset]);

  const runPreview = useCallback(
    async (f: File) => {
      setError(null);
      setApplyResult(null);
      setJob(null);
      setFile(f);
      setPhase('previewing');
      try {
        const result = await dbImportCatalogPreview(scope, f);
        setPreview(result);
        setPhase('preview');
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'The file could not be analyzed',
        );
        setPhase('error');
      }
    },
    [scope],
  );

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const f = event.target.files?.[0];
      if (!f) return;
      await runPreview(f);
    },
    [runPreview],
  );

  const handleDownloadTemplate = useCallback(async () => {
    try {
      const blob = await dbDownloadCatalogTemplate(scope);
      triggerDownload(blob, `${scope}-template.xlsx`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'The template could not be downloaded',
      );
    }
  }, [scope]);

  const handleApply = useCallback(async () => {
    if (!file) return;
    setPhase('applying');
    setError(null);
    try {
      if (
        useAsync ||
        (SCOPES_WITH_ASYNC.includes(scope) && (preview?.total ?? 0) > 500)
      ) {
        const newJob = await dbImportCatalogApplyAsync(scope, file, { mode });
        setJob(newJob);
        const final = await pollJob(newJob.id);
        if (final.result) setApplyResult(final.result);
        setPhase('done');
        onDone?.();
        return;
      }
      const result = await dbImportCatalogApply(scope, file, { mode });
      setApplyResult(result);
      setPhase('done');
      onDone?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'The import could not be applied',
      );
      setPhase('error');
    }
  }, [file, mode, preview?.total, scope, useAsync, onDone]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const supportsAsync = SCOPES_WITH_ASYNC.includes(scope);
  const invalidCount =
    preview?.rows.filter((r) => r.errors.length > 0).length ?? 0;

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) runPreview(f);
    },
    [runPreview],
  );

  const openFilePicker = () => fileInputRef.current?.click();

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors flex items-center gap-1.5 shadow-sm"
      >
        <Upload size={14} /> {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90dvh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <FileSpreadsheet size={20} className="text-primary" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900">
                    Import Data
                  </h3>
                  <p className="text-xs text-gray-500">
                    Upload an Excel file for{' '}
                    <span className="font-medium text-gray-700">{scope}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={phase === 'applying' || phase === 'previewing'}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {error && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <span className="leading-relaxed">{error}</span>
                </div>
              )}

              {phase === 'idle' && (
                <>
                  <div
                    ref={dropRef}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={openFilePicker}
                    className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                      isDragging
                        ? 'border-primary bg-primary/5 scale-[1.01]'
                        : 'border-gray-300 bg-gray-50 hover:border-primary/50 hover:bg-primary/5'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                        <Upload size={24} className="text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          Drag your file here or{' '}
                          <span className="text-primary">click to browse</span>
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Supported formats: .xlsx, .xls
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 bg-blue-50/60 border border-blue-100 rounded-xl">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                      <Download size={14} className="text-blue-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">
                        Don't have your file ready?
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        Download our template with the correct headers and a
                        sample row.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleDownloadTemplate}
                      className="px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-medium text-blue-700 hover:bg-blue-50 transition-colors flex items-center gap-1.5 shrink-0"
                    >
                      <Download size={12} /> Template
                    </button>
                  </div>
                </>
              )}

              {phase === 'previewing' && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 size={32} className="animate-spin text-primary" />
                  <p className="text-sm text-gray-600">Analyzing file...</p>
                </div>
              )}

              {phase === 'applying' && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 size={32} className="animate-spin text-primary" />
                  <p className="text-sm font-medium text-gray-700">
                    Applying import...
                  </p>
                  {job && (
                    <div className="w-full max-w-xs space-y-2">
                      <div className="flex justify-between text-xs text-gray-600">
                        <span>Progress</span>
                        <span>
                          {job.progress.processed} / {job.progress.total}
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{
                            width: `${
                              job.progress.total > 0
                                ? (job.progress.processed /
                                    job.progress.total) *
                                  100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {phase === 'preview' && preview && (
                <>
                  <div className="flex items-center gap-3 p-3.5 bg-gray-50 border border-gray-200 rounded-xl">
                    <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                      <FileSpreadsheet size={18} className="text-green-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {file?.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {file && formatBytes(file.size)} · {preview.total} rows
                        detected
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={openFilePicker}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      Change
                    </button>
                  </div>

                  <div className="responsive-grid grid grid-cols-3 gap-3">
                    <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl">
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                        <Layers size={12} /> Total
                      </div>
                      <div className="text-2xl font-semibold text-gray-900">
                        {preview.total}
                      </div>
                    </div>
                    <div className="p-3.5 bg-green-50 border border-green-200 rounded-xl">
                      <div className="flex items-center gap-1.5 text-xs text-green-700 mb-1">
                        <FileCheck size={12} /> Valid
                      </div>
                      <div className="text-2xl font-semibold text-green-700">
                        {preview.valid}
                      </div>
                    </div>
                    <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl">
                      <div className="flex items-center gap-1.5 text-xs text-red-700 mb-1">
                        <FileX size={12} /> With errors
                      </div>
                      <div className="text-2xl font-semibold text-red-700">
                        {invalidCount}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-700 uppercase tracking-wide">
                      Import Mode
                    </p>
                    <div className="responsive-grid grid grid-cols-2 gap-2.5">
                      <label
                        className={`flex items-start gap-2.5 p-3 border rounded-xl cursor-pointer transition-all ${
                          mode === 'upsert'
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="mode"
                          className="mt-0.5 accent-primary"
                          checked={mode === 'upsert'}
                          onChange={() => setMode('upsert')}
                        />
                        <div>
                          <div className="text-sm font-medium text-gray-800">
                            Upsert
                          </div>
                          <div className="text-xs text-gray-500">
                            Create or update
                          </div>
                        </div>
                      </label>
                      <label
                        className={`flex items-start gap-2.5 p-3 border rounded-xl cursor-pointer transition-all ${
                          mode === 'create'
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="mode"
                          className="mt-0.5 accent-primary"
                          checked={mode === 'create'}
                          onChange={() => setMode('create')}
                        />
                        <div>
                          <div className="text-sm font-medium text-gray-800">
                            Create only
                          </div>
                          <div className="text-xs text-gray-500">
                            Skip existing records
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {supportsAsync && (
                    <label className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 accent-primary"
                        checked={useAsync}
                        onChange={(e) => setUseAsync(e.target.checked)}
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-800">
                          Process in background
                        </div>
                        <div className="text-xs text-gray-600">
                          Recommended for files with more than 500 rows
                        </div>
                      </div>
                    </label>
                  )}

                  {invalidCount > 0 && (
                    <details className="group border border-red-200 rounded-xl overflow-hidden">
                      <summary className="cursor-pointer px-4 py-3 bg-red-50 text-sm font-medium text-red-700 flex items-center justify-between hover:bg-red-100 transition-colors">
                        <span className="flex items-center gap-2">
                          <AlertTriangle size={14} />
                          View {invalidCount} row(s) with errors
                        </span>
                        <span className="text-xs group-open:rotate-180 transition-transform">
                          ▾
                        </span>
                      </summary>
                      <ul className="max-h-56 overflow-y-auto divide-y divide-gray-100 bg-white">
                        {preview.rows
                          .filter((r) => r.errors.length > 0)
                          .map((r) => (
                            <li
                              key={r.row}
                              className="px-4 py-3 border-l-2 border-red-300"
                            >
                              <div className="text-xs font-semibold text-gray-800 mb-1">
                                Row {r.row}
                              </div>
                              <ul className="space-y-0.5 text-xs text-red-600">
                                {r.errors.map((e, idx) => (
                                  <li key={idx}>
                                    {e.field && (
                                      <span className="font-medium">
                                        {e.field}:{' '}
                                      </span>
                                    )}
                                    {e.message}
                                  </li>
                                ))}
                              </ul>
                            </li>
                          ))}
                      </ul>
                    </details>
                  )}
                </>
              )}

              {phase === 'done' && applyResult && (
                <div className="space-y-4">
                  <div className="flex flex-col items-center text-center py-4">
                    <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mb-3">
                      <CheckCircle2 size={28} className="text-green-600" />
                    </div>
                    <h4 className="text-base font-semibold text-gray-900">
                      Import completed
                    </h4>
                    <p className="text-xs text-gray-500 mt-1">
                      Processed in {applyResult.durationMs}ms
                    </p>
                  </div>

                  <div className="responsive-grid grid grid-cols-2 gap-3">
                    <div className="p-3.5 bg-green-50 border border-green-200 rounded-xl">
                      <div className="text-xs text-green-700 mb-1">Created</div>
                      <div className="text-2xl font-semibold text-green-700">
                        {applyResult.created}
                      </div>
                    </div>
                    <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl">
                      <div className="text-xs text-blue-700 mb-1">Updated</div>
                      <div className="text-2xl font-semibold text-blue-700">
                        {applyResult.updated}
                      </div>
                    </div>
                    <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl">
                      <div className="text-xs text-gray-600 mb-1">Skipped</div>
                      <div className="text-2xl font-semibold text-gray-700">
                        {applyResult.skipped}
                      </div>
                    </div>
                    <div
                      className={`p-3.5 border rounded-xl ${
                        applyResult.errors.length > 0
                          ? 'bg-red-50 border-red-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div
                        className={`text-xs mb-1 ${
                          applyResult.errors.length > 0
                            ? 'text-red-700'
                            : 'text-gray-600'
                        }`}
                      >
                        Errors
                      </div>
                      <div
                        className={`text-2xl font-semibold ${
                          applyResult.errors.length > 0
                            ? 'text-red-700'
                            : 'text-gray-700'
                        }`}
                      >
                        {applyResult.errors.length}
                      </div>
                    </div>
                  </div>

                  {applyResult.errors.length > 0 && (
                    <details className="group border border-red-200 rounded-xl overflow-hidden">
                      <summary className="cursor-pointer px-4 py-3 bg-red-50 text-sm font-medium text-red-700 flex items-center justify-between hover:bg-red-100 transition-colors">
                        <span className="flex items-center gap-2">
                          <AlertTriangle size={14} />
                          View {applyResult.errors.length} error(s)
                        </span>
                        <span className="text-xs group-open:rotate-180 transition-transform">
                          ▾
                        </span>
                      </summary>
                      <ul className="max-h-56 overflow-y-auto divide-y divide-gray-100 bg-white">
                        {applyResult.errors.map((e, idx) => (
                          <li
                            key={idx}
                            className="px-4 py-2.5 text-xs border-l-2 border-red-300"
                          >
                            <span className="font-medium text-gray-800">
                              Row {e.row}
                              {e.field && (
                                <span className="text-gray-500">
                                  {' '}
                                  ({e.field})
                                </span>
                              )}
                            </span>
                            <span className="text-red-600">: {e.message}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50/50 flex items-center justify-end gap-2">
              {phase === 'idle' && (
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              )}
              {phase === 'preview' && (
                <>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <RotateCcw size={14} /> Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleApply}
                    disabled={preview.valid === 0}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    <ListChecks size={14} /> Apply {preview.valid} rows
                  </button>
                </>
              )}
              {phase === 'done' && (
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
                >
                  Close
                </button>
              )}
              {phase === 'error' && (
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

async function pollJob(jobId: string): Promise<CatalogImportJob> {
  for (let attempt = 0; attempt < 240; attempt++) {
    const j = await dbGetCatalogImportJob(jobId);
    if (j.status === 'done' || j.status === 'error') return j;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('The import job timed out');
}

export default CatalogImportButton;
export type { CatalogImportParsedRow };
