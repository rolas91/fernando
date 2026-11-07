const API_BASE = import.meta.env.VITE_API_URL || '';

export function publicFileUrl(url?: string | null): string {
  const value = (url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${API_BASE}${value.startsWith('/') ? value : `/${value}`}`;
}
