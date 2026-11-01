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
  roles: string[];
  hasPassword: boolean;
  /** The profile photo (stored in the database), or null. A new id every time it changes. */
  photoId?: string | null;
}

/** RFC 7807 problem response used by the API for every error. */
export interface ProblemDetails {
  title?: string;
  status?: number;
  errors?: Record<string, string[]>;
}

/** One menu entry as stored in the database (site.MenuItem) and served by GET /api/v1/menus/{code}. */
export interface MenuItem {
  key: string;
  type: 'Link' | 'Dropdown' | 'Button' | 'Divider' | 'Action';
  label: string;
  url: string | null;
  actionCode: string | null;
  icon: string | null;
  visibility: 'Always' | 'SignedIn' | 'SignedOut';
  opensNewTab: boolean;
  children: MenuItem[];
}

export interface MenuResponse { menuCode: string; language: string; items: MenuItem[]; }

/** Role codes allowed into the admin site (match auth.Role.RoleCode and AppRoles.Staff in the API). */
export const STAFF_ROLES = ['SuperAdmin', 'Admin', 'Moderator', 'Support', 'PrivacyOfficer'] as const;
