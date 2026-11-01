import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { AlbumInvite } from '../../shared/album-invite';
import { AlbumPage } from './album-page';

const tick = () => new Promise(r => setTimeout(r));
const item = (id: string, firstName: string) => ({ publicId: id, kind: 'real', firstName, parentName: 'Meena', relation: 'Mother', photoId: 'f' + id, videoId: null });
const album = { publicId: 'a1', parentName: 'Meena', relation: 'Mother', members: 3, selfies: 3, createdAtUtc: '2026-10-01T00:00:00Z', items: [item('s1', 'Asha'), item('s2', 'Ravi')] };

function setup(params: Record<string, string>) {
  TestBed.configureTestingModule({
    imports: [AlbumPage, AlbumInvite],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(params) } } }]
  });
  TestBed.inject(I18nService).setLanguage('en', false);
  return TestBed.inject(HttpTestingController);
}

describe('Family albums', () => {
  it('invite page: who is in it and "Add my selfie with Meena" with the code', async () => {
    const http = setup({ code: 'ABCDE23456' });
    const fixture = TestBed.createComponent(AlbumPage);
    fixture.detectChanges();
    http.match(r => r.url.endsWith('/api/v1/site/features')).forEach(r => r.flush({ features: {} }));
    http.expectOne(r => r.url.endsWith('/api/v1/albums/invite/abcde23456')).flush(album);
    await tick();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain("You're invited!");
    expect(el.textContent).toContain('3 family members · Asha, Ravi');
    const add = el.querySelector<HTMLAnchorElement>('.fa-actions a')!;
    expect(add.textContent).toContain('Add my selfie with Meena');
    expect(add.getAttribute('href')).toBe('/upload?album=abcde23456');
    expect(el.querySelectorAll('.fa-tile').length).toBe(3);   // two selfies + "your selfie here"
  });

  it('album page: title, photos, and an empty state before approval', async () => {
    const http = setup({ id: 'a1' });
    const fixture = TestBed.createComponent(AlbumPage);
    fixture.detectChanges();
    http.match(r => r.url.endsWith('/api/v1/site/features')).forEach(r => r.flush({ features: {} }));
    http.expectOne(r => r.url.endsWith('/api/v1/albums/a1')).flush({ ...album, parentName: null, items: [] });
    await tick();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('A family album');
    expect(el.querySelector('.fa-empty')).not.toBeNull();
  });

  it('album page: a member opening it directly sees the invite link once the session is restored', async () => {
    const http = setup({ id: 'a1' });
    const auth = TestBed.inject(AuthService);
    let restore!: () => void;
    spyOn(auth, 'init').and.returnValue(new Promise<void>(r => restore = () => {
      auth.profile.set({ publicId: 'u', signUpMethod: 'Email', mobileMasked: null, email: 'a@b.co', fullName: 'Asha Nair', countryCode: 'IN', stateName: null, city: null } as never);
      r();
    }));
    const fixture = TestBed.createComponent(AlbumPage);
    fixture.detectChanges();
    http.match(r => r.url.endsWith('/api/v1/site/features')).forEach(r => r.flush({ features: {} }));
    http.expectOne(r => r.url.endsWith('/api/v1/albums/a1')).flush(album);
    await tick();
    restore();   // signed in only now (as on a fresh page load)
    await tick();
    http.expectOne(r => r.url.endsWith('/api/v1/me/albums')).flush([{ publicId: 'a1', inviteCode: 'abcde23456', parentName: 'Meena', mySelfies: ['s1'], approved: true }]);
    await tick();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('.fa-invite .ai-link input')?.value).toContain('/albums/join/abcde23456');
  });

  it('invite card: gets the link once asked, with WhatsApp', async () => {
    const http = setup({});
    const fixture = TestBed.createComponent(AlbumInvite);
    fixture.componentRef.setInput('selfieId', 's1');
    fixture.componentRef.setInput('parentName', 'Meena');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('add their selfie with Meena');
    el.querySelector<HTMLButtonElement>('.btn-accent')!.click();
    const post = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/api/v1/albums'));
    expect(post.request.body).toEqual({ selfieId: 's1' });
    post.flush({ publicId: 'a1', inviteCode: 'abcde23456' });
    await tick();
    fixture.detectChanges();
    expect(el.querySelector<HTMLInputElement>('.ai-link input')!.value).toContain('/albums/join/abcde23456');
    expect(decodeURIComponent(el.querySelector<HTMLAnchorElement>('.ai-wa')!.href)).toContain('Add your selfie with Meena to our family album');
  });
});
