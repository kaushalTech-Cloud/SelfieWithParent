// The website's own pictures, stored in the database (site.Media) and served by the API at /api/v1/media/<id>.
// Generated with the database seed (Scripts/Seed.SiteImages.sql in SelfiewithParent-Database); the ids never change.
import { environment } from '../../environments/environment';

const IDS: Record<string, string> = {
  'family.svg': '75c06210-8797-51e2-a4c6-b429a2922e07',
  'founder-placeholder.svg': 'dfaf6afa-62e1-5fc4-aa48-b9c7ee508a9b',
  'hero-1.svg': '2d0882ed-6d26-55ea-8deb-0845bd51638e',
  'hero-2.svg': '18a443fb-feaa-5056-91b5-fad0d700d966',
  'hero-3.svg': 'edfe61fd-72dd-5b36-9893-63d6ca9acc05',
  'phone.svg': 'b101d916-4167-5f86-a7a0-574ea600a76b',
  'selfie-1.svg': 'df3679f1-a66a-53c2-8d0a-3685229c3f99',
  'selfie-2.svg': 'b4318d9d-dc53-58b2-9bc6-635e7ca8284c',
  'selfie-3.svg': '396005dc-46fa-5423-9137-c753c2478039',
  'selfie-4.svg': '11f3d091-7e5e-55eb-b94d-25aa38737bc3',
  'selfie-5.svg': 'bc8618af-e267-5906-8efc-6e1adbc1fe07',
  'selfie-6.svg': 'e9661050-19f4-5584-a3c8-e16b9b7e0fad',
  'then-1.svg': 'fba07b34-4d3b-549b-9de6-44d4d85083fa',
  'then-2.svg': '2f60c63c-eca8-55aa-a6b5-4126c50bc656',
  'then-3.svg': '4b88ebd8-bf2d-557e-9367-a5f60c1077b9',
  'then-4.svg': '6e4d743e-d1a2-528c-86ac-9c346188e1bf',
};

/** The picture's address, e.g. siteImage('selfie-1.svg'). */
export function siteImage(name: string): string {
  const id = IDS[name];
  return id ? `${environment.apiBaseUrl}/api/v1/media/${id}` : `img/${name}`;
}
