/** Show readable names for both current uploads and older UUID-prefixed files. */
export function documentFileName(url: string): string {
  let name: string;
  try {
    name = new URL(url, 'https://files.local').pathname.split('/').pop() || 'Document';
    name = decodeURIComponent(name);
  } catch {
    name = url.split('/').pop() || 'Document';
  }
  return name.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '');
}
