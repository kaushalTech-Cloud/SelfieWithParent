import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { problemMessage } from '../../core/problem';

interface Uploader {
  publicId: string; fullName: string | null; emailMasked: string | null; mobileMasked: string | null; status: string;
  submissions: number; pending: number; approved: number; rejected: number; photos: number; videos: number; voiceNotes: number;
  firstAtUtc: string; lastAtUtc: string;
}
interface UploaderPage { items: Uploader[]; total: number; page: number; pageSize: number; }
interface SubmissionFile { publicId: string; role: 'main' | 'source' | 'video' | 'voice' | 'then'; contentType: string; sizeBytes: number; fileName: string | null; }
interface Submission {
  publicId: string; reference: string; kind: string; yourName: string; parentName: string; relation: string | null; message: string | null;
  status: 'Pending' | 'Approved' | 'Rejected'; reviewNote: string | null; reviewedBy: string | null; createdAtUtc: string; files: SubmissionFile[];
}

const KIND: Record<string, string> = { real: 'Selfie', ai: 'AI-made', memory: 'In loving memory', family: 'Family', thennow: 'Then & Now', frame: 'Photo frame', reel: 'Reel' };
const PAGE = 20;

/**
 * Super admins, admins and moderators: which visitor shared what, and how many — photos, videos and voice notes, and
 * how many are waiting / approved / rejected. Open a visitor to see each upload and play it. Contact details are masked.
 */
@Component({
  selector: 'app-uploads',
  imports: [FormsModule, DatePipe],
  templateUrl: './uploads.html'
})
export class Uploads implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl + '/api/v1/admin/selfies';

  protected readonly kindName = KIND;
  protected search = '';
  protected readonly page = signal(1);
  protected readonly data = signal<UploaderPage | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly open = signal<string | null>(null);
  protected readonly detail = signal<Submission[] | null>(null);
  protected readonly detailError = signal('');
  /** Local copies of the photos / videos / voice notes (they need the access token, so they're fetched, not linked). */
  protected readonly media = signal<Record<string, string>>({});
  private readonly loadingMedia = new Set<string>();
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly pages = computed(() => Math.max(1, Math.ceil((this.data()?.total ?? 0) / PAGE)));
  protected readonly totals = computed(() => {
    const items = this.data()?.items ?? [];
    return items.reduce((t, u) => ({ submissions: t.submissions + u.submissions, photos: t.photos + u.photos, videos: t.videos + u.videos, voiceNotes: t.voiceNotes + u.voiceNotes }),
      { submissions: 0, photos: 0, videos: 0, voiceNotes: 0 });
  });

  ngOnInit(): void { void this.load(); }

  ngOnDestroy(): void {
    clearTimeout(this.searchTimer);
    Object.values(this.media()).forEach(u => URL.revokeObjectURL(u));
  }

  protected onSearch(): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.page.set(1); void this.load(); }, 350);
  }

  protected goPage(n: number): void { this.page.set(n); void this.load(); }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    this.open.set(null);
    try {
      const params: Record<string, string | number> = { page: this.page(), pageSize: PAGE };
      if (this.search.trim()) params['search'] = this.search.trim();
      this.data.set(await firstValueFrom(this.http.get<UploaderPage>(`${this.api}/by-visitor`, { params })));
    } catch (e) {
      this.error.set(problemMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  /** Opens a visitor: everything they shared, newest first. */
  protected async toggle(u: Uploader): Promise<void> {
    if (this.open() === u.publicId) { this.open.set(null); return; }
    this.open.set(u.publicId);
    this.detail.set(null);
    this.detailError.set('');
    try {
      const res = await firstValueFrom(this.http.get<{ items: Submission[] }>(`${this.api}/by-visitor/${u.publicId}`, { params: { pageSize: 50 } }));
      if (this.open() !== u.publicId) return;
      this.detail.set(res.items);
      for (const s of res.items) { const f = s.files.find(x => x.role === 'main'); if (f) void this.loadMedia(f); }
    } catch (e) {
      this.detailError.set(problemMessage(e));
    }
  }

  protected async loadMedia(f: SubmissionFile): Promise<void> {
    if (this.media()[f.publicId] || this.loadingMedia.has(f.publicId)) return;
    this.loadingMedia.add(f.publicId);
    try {
      const blob = await firstValueFrom(this.http.get(`${this.api}/files/${f.publicId}`, { responseType: 'blob' }));
      this.media.update(m => ({ ...m, [f.publicId]: URL.createObjectURL(blob) }));
    } catch { /* shown as not loaded */ } finally {
      this.loadingMedia.delete(f.publicId);
    }
  }

  protected file(s: Submission, role: SubmissionFile['role']): SubmissionFile | undefined { return s.files.find(f => f.role === role); }
  protected title(s: Submission): string { return s.kind === 'family' ? s.parentName : `${s.yourName.trim().split(' ')[0]} with ${s.parentName}`; }
}
