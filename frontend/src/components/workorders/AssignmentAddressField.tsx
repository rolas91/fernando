import React from 'react';
import { DEFAULT_ASSIGNMENT_COUNTRY } from '@/lib/googlePlaceAddress';
import PlacesStructuredAddressField from '@/components/shared/PlacesStructuredAddressField';
import type { StructuredAddressFields } from '@/lib/structuredAddress';

export interface AssignmentAddressValue {
  assignmentAddress: string;
  latitude: number | null;
  longitude: number | null;
  assignmentCity: string;
  assignmentState: string;
  assignmentZipCode: string;
  assignmentCountry: string;
}

function toStructured(value: AssignmentAddressValue): StructuredAddressFields {
  return {
    addressLine: value.assignmentAddress,
    latitude: value.latitude,
    longitude: value.longitude,
    city: value.assignmentCity,
    state: value.assignmentState,
    zipCode: value.assignmentZipCode,
    country: value.assignmentCountry || DEFAULT_ASSIGNMENT_COUNTRY,
  };
}

function fromStructured(
  value: StructuredAddressFields,
): AssignmentAddressValue {
  return {
    assignmentAddress: value.addressLine,
    latitude: value.latitude,
    longitude: value.longitude,
    assignmentCity: value.city,
    assignmentState: value.state,
    assignmentZipCode: value.zipCode,
    assignmentCountry: value.country || DEFAULT_ASSIGNMENT_COUNTRY,
  };
}

interface AssignmentAddressFieldProps {
  id?: string;
  label?: string;
  value: AssignmentAddressValue;
  onChange: (next: AssignmentAddressValue) => void;
  disabled?: boolean;
  afterAddressField?: React.ReactNode;
}

export const AssignmentAddressField: React.FC<AssignmentAddressFieldProps> = ({
  id = 'assignment-address',
  label = 'Assignment Address',
  value,
  onChange,
  disabled,
  afterAddressField,
}) => (
  <PlacesStructuredAddressField
    id={id}
    label={label}
    value={toStructured(value)}
    onChange={(next) => onChange(fromStructured(next))}
    disabled={disabled}
    afterAddressField={afterAddressField}
  />
);
