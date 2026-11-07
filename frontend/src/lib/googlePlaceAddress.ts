export const DEFAULT_ASSIGNMENT_COUNTRY = 'USA';

export function parseGoogleAddressComponents(
  components?: google.maps.GeocoderAddressComponent[] | null,
): { city: string; state: string; zipCode: string; country: string } {
  if (!components?.length) {
    return {
      city: '',
      state: '',
      zipCode: '',
      country: DEFAULT_ASSIGNMENT_COUNTRY,
    };
  }

  let postalCode = '';
  let state = '';
  let countryLong = '';
  let countryShort = '';

  for (const c of components) {
    const types = c.types;
    if (types.includes('postal_code')) {
      postalCode = c.long_name || c.short_name || postalCode;
    }
    if (types.includes('administrative_area_level_1')) {
      const next = c.short_name || c.long_name || '';
      if (next) state = next;
    }
    if (types.includes('country')) {
      countryLong = c.long_name || '';
      countryShort = c.short_name || '';
    }
  }

  let city = '';
  const cityCandidates = [
    'locality',
    'postal_town',
    'sublocality_level_1',
    'sublocality',
    'administrative_area_level_2',
    'neighborhood',
  ];
  outer: for (const type of cityCandidates) {
    for (const c of components) {
      if (c.types.includes(type) && c.long_name) {
        city = c.long_name;
        break outer;
      }
    }
  }

  let country = countryLong.trim();
  if (!country && countryShort) {
    country =
      countryShort.toUpperCase() === 'US' ? 'United States' : countryShort;
  }
  if (!country) country = DEFAULT_ASSIGNMENT_COUNTRY;

  return {
    city: city.trim(),
    state: state.trim(),
    zipCode: postalCode.trim(),
    country: country.trim(),
  };
}
