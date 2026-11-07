import { parseGoogleAddressComponents } from '@/lib/googlePlaceAddress';
import type { StructuredAddressFields } from '@/lib/structuredAddress';

export type ReverseGeocodeResult = {
  formattedAddress: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
};

export function reverseGeocodeWgs84(
  lat: number,
  lng: number,
): Promise<ReverseGeocodeResult | null> {
  if (typeof window === 'undefined' || !window.google?.maps?.Geocoder) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status !== google.maps.GeocoderStatus.OK || !results?.length) {
        resolve(null);
        return;
      }
      const top = results[0];
      const formatted = (top.formatted_address ?? '').trim();
      const parts = parseGoogleAddressComponents(top.address_components);
      resolve({
        formattedAddress: formatted,
        city: parts.city,
        state: parts.state,
        zipCode: parts.zipCode,
        country: parts.country,
      });
    });
  });
}

export function needsReverseGeocodeFill(value: {
  addressLine?: string;
  city?: string;
  state?: string;
}): boolean {
  const noLine = !(value.addressLine ?? '').trim();
  const missingStructure =
    !(value.city ?? '').trim() || !(value.state ?? '').trim();
  return noLine || missingStructure;
}

export function mergeReverseGeocodeIntoStructured(
  current: StructuredAddressFields,
  r: ReverseGeocodeResult,
): Pick<
  StructuredAddressFields,
  'addressLine' | 'city' | 'state' | 'zipCode' | 'country'
> {
  return {
    addressLine:
      current.addressLine?.trim() || r.formattedAddress || current.addressLine,
    city: current.city?.trim() || r.city,
    state: current.state?.trim() || r.state,
    zipCode: current.zipCode?.trim() || r.zipCode,
    country: current.country?.trim() || r.country,
  };
}
