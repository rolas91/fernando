import { requireApiBaseUrl } from './api-config';
import { apiResponseError, fetchWithFriendlyNetworkError } from './auth-errors';

export type MobileWorkerProfile = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  type: string;
  role: string;
  status: string;
  primaryAddress: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  workerRoles: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
  certifications: Array<{
    id: string;
    name: string;
    description?: string;
    expirationDate?: string;
  }>;
  skills: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
};

export async function fetchMyWorkerProfile(
  token: string,
): Promise<MobileWorkerProfile> {
  const path = '/workers/me/profile';
  const response = await fetchWithFriendlyNetworkError(
    `${requireApiBaseUrl()}${path}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    },
  );
  if (!response.ok) throw await apiResponseError(response, path);
  return (await response.json()) as MobileWorkerProfile;
}
