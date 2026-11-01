import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LANGUAGES, PageListItem, slugProblem } from '../../core/content.models';
import { problemMessage } from '../../core/problem';

/** Super admins and admins: the website's content pages — add, open in the page builder, publish / unpublish, delete. */
@Component({
  selector: 'app-pages-list',
  imports: [FormsModule, DatePipe, RouterLink],
  template: `
    <div class="row g-4">
      <div class="col-xl-4">
        <section class="panel">
          <h2>Add a page</h2>
          <p class="small text-muted">New pages start unpublished and empty. Build them in English, then add translations.</p>
          <form #f="ngForm" (ngSubmit)="create(f)" novalidate aria-label="Add a page">
            <div class="mb-3">
              <label class="form-label small fw-semibold" for="pTitle">Page title</label>
              <input class="form-control" id="pTitle" name="title" [(ngModel)]="form.title" (ngModelChange)="suggestSlug()" maxlength="120" required autocomplete="off">
            </div>
            <div class="mb-3">
              <label class="form-label small fw-semibold" for="pSlug">Web address</label>
              <div class="input-group">
                <span class="input-group-text">/</span>
                <input class="form-control" id="pSlug" name="slug" [(ngModel)]="form.slug" (ngModelChange)="slugEdited = true" maxlength="60" required autocomplete="off">
              </div>
              <div class="form-text">Lower-case letters, numbers and hyphens, e.g. our-team.</div>
            </div>
            @for (e of errors(); track e) { <div class="alert alert-danger py-2 small mb-2" role="alert">{{ e }}</div> }
            <button class="btn btn-accent w-100" type="submit" [disabled]="saving()">
              @if (saving()) { <span class="spinner-border spinner-border-sm"></span> } @else { <i class="bi bi-file-earmark-plus"></i> }
              Add page and open the builder
            </button>
          </form>
        </section>
      </div>

      <div class="col-xl-8">
        <section class="panel">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h2 class="mb-0">Pages ({{ pages().length }})</h2>
            <button class="btn btn-light btn-sm" type="button" (click)="load()" [disabled]="loading()"><i class="bi bi-arrow-clockwise"></i> Refresh</button>
          </div>
          @if (notice()) { <div class="alert alert-success py-2 small" role="status">{{ notice() }}</div> }
          @if (listError()) { <div class="alert alert-danger py-2 small" role="alert">{{ listError() }}</div> }
          @if (loading()) {
            <p class="text-muted small py-3"><span class="spinner-border spinner-border-sm"></span> Loading…</p>
          } @else if (loadError()) {
            <div class="alert alert-danger small" role="alert">{{ loadError() }}</div>
          } @else {
            <div class="table-responsive">
              <table class="table align-middle mb-0">
                <thead><tr><th scope="col">Page</th><th scope="col">Languages</th><th scope="col">Status</th><th scope="col">Last change</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead>
                <tbody>
                  @for (p of pages(); track p.pageId) {
                    <tr [class.table-danger]="confirming() === p.pageId">
                      <td>
                        <a class="fw-semibold text-decoration-none" [routerLink]="['/pages', p.pageId]">{{ p.title }}</a>
                        <div class="small text-muted">/{{ p.slug }}</div>
                      </td>
                      <td>@for (l of languages; track l.code) { <span class="lang-pill" [class.on]="p.languages.includes(l.code)" [title]="l.name + (p.languages.includes(l.code) ? '' : ' — not translated (shows English)')">{{ l.code }}</span> }</td>
                      <td><span class="status-pill" [class.on]="p.isPublished">{{ p.isPublished ? 'Published' : 'Draft' }}</span></td>
                      <td class="small text-muted">{{ p.updatedAtUtc + 'Z' | date: 'd MMM y, HH:mm' }}@if (p.updatedBy) { <br>{{ p.updatedBy }} }</td>
                      <td class="text-end text-nowrap">
                        <a class="btn btn-sm btn-outline-secondary" [routerLink]="['/pages', p.pageId]" [attr.aria-label]="'Edit ' + p.title" title="Edit"><i class="bi bi-pencil"></i></a>
                        @if (p.isPublished) {
                          <a class="btn btn-sm btn-outline-secondary ms-1" [href]="site + '/' + p.slug" target="_blank" rel="noopener" [attr.aria-label]="'View ' + p.title + ' on the website'" title="View on the website"><i class="bi bi-box-arrow-up-right"></i></a>
                        }
                        <button class="btn btn-sm btn-outline-danger ms-1" type="button" (click)="confirming.set(p.pageId); notice.set('')" [disabled]="busy()" [attr.aria-label]="'Delete ' + p.title" title="Delete"><i class="bi bi-trash"></i></button>
                      </td>
                    </tr>
                    @if (confirming() === p.pageId) {
                      <tr class="table-danger">
                        <td colspan="5">
                          <div class="d-flex flex-wrap align-items-center gap-2 small" role="alert">
                            <span><strong>Delete "{{ p.title }}"?</strong> The page and all its translations are removed, and /{{ p.slug }} stops working. Menu links to it are not changed. This can't be undone.</span>
                            <span class="ms-auto d-flex gap-2">
                              <button class="btn btn-sm btn-danger" type="button" (click)="remove(p)" [disabled]="busy()">@if (busy()) { <span class="spinner-border spinner-border-sm"></span> } Delete page</button>
                              <button class="btn btn-sm btn-light" type="button" (click)="confirming.set(null)" [disabled]="busy()">Cancel</button>
                            </span>
                          </div>
                        </td>
                      </tr>
                    }
                  } @empty {
                    <tr><td colspan="5" class="text-muted small">No pages yet.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      </div>
    </div>
  `
})
export class PagesList implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly api = environment.apiBaseUrl + '/api/v1/admin/pages';
  protected readonly site = environment.publicSiteUrl;
  protected readonly languages = LANGUAGES;

  protected form = { title: '', slug: '' };
  protected slugEdited = false;
  protected readonly pages = signal<PageListItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly saving = signal(false);
  protected readonly errors = signal<string[]>([]);
  protected readonly busy = signal(false);
  protected readonly confirming = signal<number | null>(null);
  protected readonly notice = signal('');
  protected readonly listError = signal('');

  ngOnInit(): void { void this.load(); }

  /** Fills the web address from the title until the editor types their own. */
  protected suggestSlug(): void {
    if (this.slugEdited) return;
    this.form.slug = this.form.title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      this.pages.set(await firstValueFrom(this.http.get<PageListItem[]>(this.api)));
    } catch (e) {
      this.loadError.set(problemMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected async create(f: NgForm): Promise<void> {
    const title = this.form.title.trim();
    const slug = this.form.slug.trim();
    const problems = [title ? '' : 'Enter a page title.', /[<>]/.test(title) ? "The title can't contain < or >." : '', slugProblem(slug) ?? ''].filter(Boolean);
    this.errors.set(problems);
    if (problems.length) return;

    this.saving.set(true);
    try {
      const res = await firstValueFrom(this.http.post<{ pageId: number }>(this.api, { title, slug }));
      f.resetForm();
      await this.router.navigate(['/pages', res.pageId]);
    } catch (e) {
      this.errors.set([problemMessage(e)]);
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(p: PageListItem): Promise<void> {
    this.busy.set(true);
    this.listError.set('');
    try {
      await firstValueFrom(this.http.delete(`${this.api}/${p.pageId}`));
      this.confirming.set(null);
      this.notice.set(`"${p.title}" was deleted.`);
      await this.load();
    } catch (e) {
      this.listError.set(problemMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
