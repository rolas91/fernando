const MAPS_SCRIPT_ATTR = 'data-dr-google-maps-places';

export function loadGoogleMapsPlaces(apiKey: string): Promise<void> {
  if (typeof window !== 'undefined' && window.google?.maps?.places) {
    return Promise.resolve();
  }
  const existing = document.querySelector<HTMLScriptElement>(
    `script[${MAPS_SCRIPT_ATTR}]`,
  );
  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.google?.maps?.places) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () =>
          reject(
            new Error('Unable to load the map service. Please try again.'),
          ),
        { once: true },
      );
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.setAttribute(MAPS_SCRIPT_ATTR, 'true');
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error('Unable to load the map service. Please try again.'));
    document.head.appendChild(script);
  });
}
