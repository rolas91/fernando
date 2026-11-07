import React, { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_ASSIGNMENT_COUNTRY,
  parseGoogleAddressComponents,
} from '@/lib/googlePlaceAddress';
import {
  coordToInputString,
  latitudeInRange,
  longitudeInRange,
  maskCoordDecimalInput,
  parseCoordNumber,
} from '@/lib/coordinateInput';
import {
  mergeReverseGeocodeIntoStructured,
  needsReverseGeocodeFill,
  reverseGeocodeWgs84,
} from '@/lib/googleReverseGeocode';
import { loadGoogleMapsPlaces } from '@/lib/loadGoogleMapsPlaces';
import {
  emptyStructuredPostalFields,
  type StructuredAddressFields,
} from '@/lib/structuredAddress';

const CALIFORNIA_ADDRESS_BOUNDS: google.maps.LatLngBoundsLiteral = {
  north: 42.01,
  south: 32.52,
  east: -114.13,
  west: -124.49,
};

interface PlacesStructuredAddressFieldProps {
  id?: string;
  label?: string;
  value: StructuredAddressFields;
  onChange: (next: StructuredAddressFields) => void;
  disabled?: boolean;

  afterAddressField?: React.ReactNode;

  hideCoordinates?: boolean;
}

export const PlacesStructuredAddressField: React.FC<
  PlacesStructuredAddressFieldProps
> = ({
  id = 'structured-address',
  label = 'Address',
  value,
  onChange,
  disabled,
  afterAddressField,
  hideCoordinates = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const acRef = useRef<google.maps.places.Autocomplete | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const latFocusedRef = useRef(false);
  const lngFocusedRef = useRef(false);
  const [latText, setLatText] = useState(() =>
    value.latitude != null ? coordToInputString(value.latitude) : '',
  );
  const [lngText, setLngText] = useState(() =>
    value.longitude != null ? coordToInputString(value.longitude) : '',
  );
  const [latInvalid, setLatInvalid] = useState(false);
  const [lngInvalid, setLngInvalid] = useState(false);

  useEffect(() => {
    if (latFocusedRef.current) return;
    setLatText(
      value.latitude != null ? coordToInputString(value.latitude) : '',
    );
    setLatInvalid(false);
  }, [value.latitude]);

  useEffect(() => {
    if (lngFocusedRef.current) return;
    setLngText(
      value.longitude != null ? coordToInputString(value.longitude) : '',
    );
    setLngInvalid(false);
  }, [value.longitude]);

  const valueRef = useRef(value);
  valueRef.current = value;

  const reverseRequestIdRef = useRef(0);
  const [reverseBusy, setReverseBusy] = useState(false);

  const apiKey =
    typeof import.meta.env.VITE_GOOGLE_MAPS_API_KEY === 'string'
      ? import.meta.env.VITE_GOOGLE_MAPS_API_KEY.trim()
      : '';

  useEffect(() => {
    if (!apiKey || !inputRef.current || disabled) return undefined;

    let cancelled = false;
    let listener: google.maps.MapsEventListener | null = null;

    loadGoogleMapsPlaces(apiKey)
      .then(() => {
        if (cancelled || !inputRef.current) return;
        const input = inputRef.current;
        const ac = new google.maps.places.Autocomplete(input, {
          bounds: CALIFORNIA_ADDRESS_BOUNDS,
          componentRestrictions: { country: 'us' },
          fields: [
            'formatted_address',
            'geometry',
            'name',
            'address_components',
          ],
          strictBounds: true,
          types: ['address'],
        });
        acRef.current = ac;
        listener = ac.addListener('place_changed', () => {
          const place = ac.getPlace();
          const loc = place.geometry?.location;
          const addr =
            place.formatted_address || place.name || input.value || '';
          const parts = parseGoogleAddressComponents(place.address_components);
          onChangeRef.current({
            addressLine: addr,
            latitude: loc?.lat() ?? null,
            longitude: loc?.lng() ?? null,
            city: parts.city,
            state: parts.state,
            zipCode: parts.zipCode,
            country: parts.country,
          });
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (listener) {
        google.maps.event.removeListener(listener);
      }
      if (acRef.current) {
        google.maps.event.clearInstanceListeners(acRef.current);
        acRef.current = null;
      }
    };
  }, [apiKey, disabled]);

  useEffect(() => {
    if (!apiKey || disabled) return;

    const lat = value.latitude;
    const lng = value.longitude;
    if (lat == null || lng == null) return;
    if (!latitudeInRange(lat) || !longitudeInRange(lng)) return;

    const v = valueRef.current;
    if (
      !needsReverseGeocodeFill({
        addressLine: v.addressLine,
        city: v.city,
        state: v.state,
      })
    )
      return;

    const reqId = ++reverseRequestIdRef.current;
    let cancelled = false;

    setReverseBusy(true);
    loadGoogleMapsPlaces(apiKey)
      .then(() => reverseGeocodeWgs84(lat, lng))
      .then((r) => {
        if (cancelled || reqId !== reverseRequestIdRef.current) return;
        if (!r) return;
        const cur = valueRef.current;
        if (
          !needsReverseGeocodeFill({
            addressLine: cur.addressLine,
            city: cur.city,
            state: cur.state,
          })
        )
          return;
        const geo = mergeReverseGeocodeIntoStructured(cur, r);
        onChangeRef.current({
          ...cur,
          ...geo,
        });
      })
      .finally(() => {
        if (reqId === reverseRequestIdRef.current) {
          setReverseBusy(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, disabled, value.latitude, value.longitude]);

  return (
    <div className="space-y-2">
      <div>
        <label
          htmlFor={id}
          className="block text-xs font-semibold text-gray-600 mb-1.5"
        >
          {label}
        </label>
        <input
          ref={inputRef}
          id={id}
          type="text"
          autoComplete="off"
          disabled={disabled}
          value={value.addressLine}
          onChange={(e) =>
            onChange({
              addressLine: e.target.value,
              ...emptyStructuredPostalFields(),
            })
          }
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder={
            apiKey ? 'Start typing an address…' : 'Enter an address manually'
          }
        />
        {!apiKey && (
          <p className="text-[11px] text-amber-700 mt-1">
            Address suggestions are unavailable. Enter the address manually or
            contact your administrator.
          </p>
        )}
      </div>

      {afterAddressField}

      <div className="responsive-grid grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] text-gray-500 mb-0.5">City</label>
          <input
            readOnly
            value={value.city}
            className="w-full border border-gray-100 rounded-lg px-2 py-2 text-xs bg-gray-50 text-gray-700"
            placeholder="—"
          />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-0.5">
            State
          </label>
          <input
            readOnly
            value={value.state}
            className="w-full border border-gray-100 rounded-lg px-2 py-2 text-xs bg-gray-50 text-gray-700"
            placeholder="—"
          />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-0.5">
            ZIP code
          </label>
          <input
            readOnly
            value={value.zipCode}
            className="w-full border border-gray-100 rounded-lg px-2 py-2 text-xs bg-gray-50 text-gray-700"
            placeholder="—"
          />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-0.5">
            Country
          </label>
          <input
            readOnly
            value={value.country || DEFAULT_ASSIGNMENT_COUNTRY}
            className="w-full border border-gray-100 rounded-lg px-2 py-2 text-xs bg-gray-50 text-gray-700"
            placeholder={DEFAULT_ASSIGNMENT_COUNTRY}
          />
        </div>
      </div>

      {!hideCoordinates ? (
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
            GPS coordinates
          </p>
          <div className="responsive-grid grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor={`${id}-latitude`}
                className="block text-[11px] text-gray-500 mb-0.5"
              >
                Latitude
              </label>
              <input
                id={`${id}-latitude`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                disabled={disabled}
                placeholder="e.g. 40.7128"
                title="Decimal degrees −90 to 90 (e.g. −34.6037)"
                value={latText}
                onFocus={() => {
                  latFocusedRef.current = true;
                }}
                onChange={(e) => {
                  setLatText(maskCoordDecimalInput(e.target.value));
                  setLatInvalid(false);
                }}
                onBlur={() => {
                  latFocusedRef.current = false;
                  const t = latText.trim();
                  if (t === '') {
                    setLatInvalid(false);
                    if (value.latitude !== null) {
                      onChange({ ...value, latitude: null });
                    }
                    return;
                  }
                  const n = parseCoordNumber(latText);
                  if (n === null || !latitudeInRange(n)) {
                    setLatInvalid(true);
                    setLatText(
                      value.latitude != null
                        ? coordToInputString(value.latitude)
                        : '',
                    );
                    return;
                  }
                  setLatInvalid(false);
                  if (value.latitude !== n) {
                    onChange({ ...value, latitude: n });
                  }
                }}
                className={`w-full border rounded-lg px-2 py-2 text-xs bg-white text-gray-800 ${
                  latInvalid
                    ? 'border-red-400 ring-1 ring-red-200'
                    : 'border-gray-200'
                } focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500`}
              />
            </div>
            <div>
              <label
                htmlFor={`${id}-longitude`}
                className="block text-[11px] text-gray-500 mb-0.5"
              >
                Longitude
              </label>
              <input
                id={`${id}-longitude`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                disabled={disabled}
                placeholder="e.g. -74.0060"
                title="Decimal degrees −180 to 180 (e.g. −58.3816)"
                value={lngText}
                onFocus={() => {
                  lngFocusedRef.current = true;
                }}
                onChange={(e) => {
                  setLngText(maskCoordDecimalInput(e.target.value));
                  setLngInvalid(false);
                }}
                onBlur={() => {
                  lngFocusedRef.current = false;
                  const t = lngText.trim();
                  if (t === '') {
                    setLngInvalid(false);
                    if (value.longitude !== null) {
                      onChange({ ...value, longitude: null });
                    }
                    return;
                  }
                  const n = parseCoordNumber(lngText);
                  if (n === null || !longitudeInRange(n)) {
                    setLngInvalid(true);
                    setLngText(
                      value.longitude != null
                        ? coordToInputString(value.longitude)
                        : '',
                    );
                    return;
                  }
                  setLngInvalid(false);
                  if (value.longitude !== n) {
                    onChange({ ...value, longitude: n });
                  }
                }}
                className={`w-full border rounded-lg px-2 py-2 text-xs bg-white text-gray-800 ${
                  lngInvalid
                    ? 'border-red-400 ring-1 ring-red-200'
                    : 'border-gray-200'
                } focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500`}
              />
            </div>
          </div>
          {reverseBusy && (
            <p className="text-[11px] text-primary mt-2 flex items-center gap-1">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Resolving address from coordinates…
            </p>
          )}
        </div>
      ) : reverseBusy ? (
        <span className="sr-only" aria-live="polite">
          Resolving address from coordinates…
        </span>
      ) : null}
    </div>
  );
};

export default PlacesStructuredAddressField;
