import { documentFileName } from '@/lib/documentFileName';
import React, { useMemo, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { dbDeleteWorkerFile, dbUploadWorkerFiles } from '@/lib/db';
import {
  isWorkerAllowedUploadFile,
  WORKER_UPLOAD_ACCEPT_ATTR,
} from '@/lib/workerFormValidation';
import { ExternalLink, Loader2, Paperclip, Trash2, Upload } from 'lucide-react';

type WorkerFileUploadsFieldProps = {
  value: string[];
  onChange: (urls: string[]) => void;
  workerId?: string;

  accept?: string;
};

const getFileNameFromUrl = documentFileName;

const WorkerFileUploadsField: React.FC<WorkerFileUploadsFieldProps> = ({
  value,
  onChange,
  workerId,
  accept = WORKER_UPLOAD_ACCEPT_ATTR,
}) => {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);

  const files = useMemo(
    () => (Array.isArray(value) ? value.filter(Boolean) : []),
    [value],
  );

  const handleSelectFiles = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const raw = Array.from(event.target.files || []);
    event.target.value = '';
    const nextFiles = raw.filter((f) => isWorkerAllowedUploadFile(f));
    if (nextFiles.length === 0) {
      if (raw.length > 0) {
        toast({
          title: 'File type not allowed',
          description: 'Only PDF, JPG, or PNG files are allowed.',
          variant: 'destructive',
        });
      }
      return;
    }
    if (nextFiles.length < raw.length) {
      toast({
        title: 'Some files were skipped',
        description: 'Only PDF, JPG, or PNG files are uploaded.',
        variant: 'destructive',
      });
    }

    setIsUploading(true);
    try {
      const uploaded = await dbUploadWorkerFiles(nextFiles, workerId);
      const nextUrls = [...files];
      uploaded.forEach((item) => {
        if (!nextUrls.includes(item.url)) nextUrls.push(item.url);
      });
      onChange(nextUrls);
      toast({
        title: 'Files uploaded',
        description: `${uploaded.length} file${uploaded.length === 1 ? '' : 's'} uploaded successfully.`,
      });
    } catch (error) {
      toast({
        title: 'Upload failed',
        description:
          error instanceof Error
            ? error.message
            : 'The selected files could not be uploaded.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveFile = async (url: string) => {
    setDeletingUrl(url);
    try {
      await dbDeleteWorkerFile(url);
      onChange(files.filter((item) => item !== url));
      toast({ title: 'File removed' });
    } catch (error) {
      toast({
        title: 'Could not remove file',
        description:
          error instanceof Error
            ? error.message
            : 'The file could not be removed.',
        variant: 'destructive',
      });
    } finally {
      setDeletingUrl(null);
    }
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label className="block text-sm font-medium text-gray-700">
          File Uploads
        </label>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          {isUploading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Upload size={12} />
          )}
          {isUploading ? 'Uploading...' : 'Add files'}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        onChange={handleSelectFiles}
        className="hidden"
      />
      <p className="mb-2 text-[11px] text-gray-500">
        Allowed formats: PDF, JPG, PNG. Uploaded files are saved to the system.
      </p>
      <div className="rounded-xl border border-gray-200 bg-gray-50/70">
        {files.length === 0 ? (
          <div className="flex items-center gap-2 px-3 py-3 text-sm text-gray-500">
            <Paperclip size={14} className="text-gray-400" />
            No files uploaded yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {files.map((url) => {
              const fileName = getFileNameFromUrl(url);
              const isDeleting = deletingUrl === url;
              return (
                <div key={url} className="flex items-center gap-3 px-3 py-2.5">
                  <Paperclip
                    size={14}
                    className="flex-shrink-0 text-gray-400"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-700">
                      {fileName}
                    </p>
                    <p className="truncate text-[11px] text-gray-500">{url}</p>
                  </div>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-white"
                  >
                    <ExternalLink size={12} />
                    View
                  </a>
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(url)}
                    disabled={isDeleting}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                  >
                    {isDeleting ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Trash2 size={12} />
                    )}
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkerFileUploadsField;
