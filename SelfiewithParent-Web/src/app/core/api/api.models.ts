// Shapes returned by the Selfie with Parent API (C:\Project\SelfiewithParent-API)

export interface TokenResponse {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  profileComplete: boolean;
  tokenType: string;
}

export interface Profile {
  publicId: string;
  signUpMethod: 'Mobile' | 'Email' | 'Google';
  mobileMasked: string | null;
  email: string | null;
  fullName: string | null;
  countryCode: string | null;
  stateName: string | null;
  city: string | null;
  preferredLanguage: string;
  isAdultConfirmed: boolean;
  whatsAppOptIn: boolean;
  profileComplete: boolean;
  roles: string[];
  createdAtUtc: string;
  /** Email accounts only: a password has been added (the emailed code works either way). */
  hasPassword: boolean;
  /** The profile photo (stored in the database), or null. A new id every time it changes. */
  photoId?: string | null;
}

export interface UpdateProfileRequest {
  fullName: string;
  email: string | null;
  countryCode: string;
  stateName: string | null;
  city: string | null;
  preferredLanguage: string;
  isAdultConfirmed: boolean;
  whatsAppOptIn: boolean;
}

/** RFC 7807 problem response used by the API for every error. */
export interface ProblemDetails {
  title?: string;
  status?: number;
  errors?: Record<string, string[]>;
}
