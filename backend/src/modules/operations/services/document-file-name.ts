import { randomUUID } from 'crypto';

/** Keep the recognizable name and extension; remove only unsafe path characters. */
export function safeDocumentFileName(name: string): string {
  const leaf = name.replace(/\\/g, '/').split('/').pop() || 'Document';
  const cleaned =
    leaf
      .normalize('NFC')
      .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '-')
      .replace(/^[\s.]+|[\s.]+$/g, '') || 'Document';
  const dot = cleaned.lastIndexOf('.');
  const extension = dot > 0 ? cleaned.slice(dot).slice(0, 20) : '';
  const stem = extension ? cleaned.slice(0, dot) : cleaned;
  return `${stem.slice(0, 170 - extension.length)}${extension}`;
}

export function uniqueDocumentFileName(name: string): string {
  const safe = safeDocumentFileName(name);
  const dot = safe.lastIndexOf('.');
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  return dot > 0
    ? `${safe.slice(0, dot)}-${suffix}${safe.slice(dot)}`
    : `${safe}-${suffix}`;
}
