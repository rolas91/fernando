import { DEFAULT_ASSIGNMENT_COUNTRY } from '@/lib/googlePlaceAddress';

export type StructuredAddressFields = {
  addressLine: string;
  latitude: number | null;
  longitude: number | null;
  city: string;
  state: string;
  zipCode: string;
  country: string;
};

export function emptyStructuredPostalFields(): Omit<
  StructuredAddressFields,
  'addressLine'
> {
  return {
    latitude: null,
    longitude: null,
    city: '',
    state: '',
    zipCode: '',
    country: DEFAULT_ASSIGNMENT_COUNTRY,
  };
}
