import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { MenuItem } from '../core/api.models';
import { MenuService } from '../core/menu.service';
import { AdminLayout } from './admin-layout';

@Component({ template: '' }) class Blank {}

const link = (key: string, url: string): MenuItem => ({ key, type: 'Link', label: key, url, actionCode: null, icon: null, visibility: 'Always', opensNewTab: false, children: [] });
const group = (key: string, children: MenuItem[]): MenuItem => ({ ...link(key, ''), type: 'Dropdown', url: null, children });

describe('Admin sidebar groups', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminLayout],
      providers: [provideHttpClient(), provideHttpClientTesting(),
        provideRouter([{ path: '', component: Blank }, { path: '**', component: Blank }])]
    }).compileComponents();
  });

  it('shows groups as an accordion: one open at a time, the current page\'s group open', async () => {
    const menu = TestBed.inject(MenuService);
    spyOn(menu, 'load').and.resolveTo();
    menu.items.set([
      link('dashboard', '/'),
      group('review', [link('queue', '/queue'), link('winners', '/winners')]),
      group('website', [link('pages', '/pages'), link('menus', '/menus')]),
      group('empty', [link('outside', 'https://example.org/')]),
      link('public-site', 'https://www.selfiewithparent.org/')
    ]);
    await TestBed.inject(Router).navigateByUrl('/pages/edit/3');
    const fixture = TestBed.createComponent(AdminLayout);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const heads = () => [...el.querySelectorAll<HTMLButtonElement>('.side-main .side-group-head')];

    expect(heads().map(h => h.textContent!.trim())).toEqual(['review', 'website']);   // a group with no admin pages is left out
    expect(heads().map(h => h.getAttribute('aria-expanded'))).toEqual(['false', 'true']);
    expect(heads()[1].classList).toContain('has-active');

    heads()[0].click();
    fixture.detectChanges();
    expect(heads().map(h => h.getAttribute('aria-expanded'))).toEqual(['true', 'false']);
    expect(el.querySelector('#side-grp-website')!.hasAttribute('inert')).toBeTrue();

    heads()[0].click();
    fixture.detectChanges();
    expect(heads().map(h => h.getAttribute('aria-expanded'))).toEqual(['false', 'false']);
    expect(el.querySelector('.side-bottom')!.textContent).toContain('public-site');

    // phones: the menu button opens the drawer, Escape closes it
    el.querySelector<HTMLButtonElement>('.side-toggle')!.click();
    fixture.detectChanges();
    expect(el.querySelector('.admin-side')!.classList).toContain('open');
    expect(el.querySelector('.side-backdrop')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(el.querySelector('.admin-side')!.classList).not.toContain('open');
  });
});
