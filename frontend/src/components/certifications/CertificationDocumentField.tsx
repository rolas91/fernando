import React, { useMemo, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  dbDeleteCertificationDocument,
  dbUploadCertificationDocument,
} from '@/lib/db';
import { ExternalLink, FileText, Loader2, Trash2, Upload } from 'lucide-react';

type CertificationDocumentFieldProps = {
  value?: string;
  onChange: (url?: string) => void;
  certificationId?: string;
};

const getFileNameFromUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname.split('/').pop() || 'file');
  } catch {
    return url.split('/').pop() || url;
  }
};

const CertificationDocumentField: React.FC<CertificationDocumentFieldProps> = ({
  value,
  onChange,
  certificationId,
}) => {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fileUrl = useMemo(() => value?.trim() || '', [value]);

  const handleSelectFile = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const nextFile = event.target.files?.[0];
    event.target.value = '';
    if (!nextFile) return;

    setIsUploading(true);
    try {
      const uploaded = await dbUploadCertificationDocument(
        nextFile,
        certificationId,
      );
      const nextUrl = uploaded[0]?.url;
      if (!nextUrl) {
        throw new Error('The document could not be uploaded.');
      }

      if (fileUrl && fileUrl !== nextUrl) {
        await dbDeleteCertificationDocument(fileUrl).catch(() => undefined);
      }

      onChange(nextUrl);
      toast({
        title: 'Document uploaded',
        description: 'The certification document is ready.',
      });
    } catch (error) {
      toast({
        title: 'Upload failed',
        description:
          error instanceof Error
            ? error.message
            : 'The selected document could not be uploaded.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!fileUrl) return;
    setIsDeleting(true);
    try {
      await dbDeleteCertificationDocument(fileUrl);
      onChange(undefined);
      toast({ title: 'Document removed' });
    } catch (error) {
      toast({
        title: 'Could not remove document',
        description:
          error instanceof Error
            ? error.message
            : 'The document could not be removed.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <label className="block text-sm font-medium text-gray-700">
          Certificate Document
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
          {fileUrl ? 'Replace file' : 'Add file'}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        onChange={handleSelectFile}
        className="hidden"
      />
      <p className="text-[11px] text-gray-500 mb-2">
        Upload the certification document.
      </p>
      <div className="rounded-xl border border-gray-200 bg-gray-50/70">
        {!fileUrl ? (
          <div className="flex items-center gap-2 px-3 py-3 text-sm text-gray-500">
            <FileText size={14} className="text-gray-400" />
            No document uploaded yet.
          </div>
        ) : (
          <div className="flex items-center gap-3 px-3 py-2.5">
            <FileText size={14} className="text-gray-400 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-700">
                {getFileNameFromUrl(fileUrl)}
              </p>
              <p className="truncate text-[11px] text-gray-500">{fileUrl}</p>
            </div>
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-white"
            >
              <ExternalLink size={12} />
              View
            </a>
            <button
              type="button"
              onClick={handleRemove}
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
        )}
      </div>
    </div>
  );
};

export default CertificationDocumentField;
