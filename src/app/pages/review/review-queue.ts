import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';
import { problemMessage } from '../../core/problem';

type Status = 'Pending' | 'Approved' | 'Rejected';

interface SubmissionFile { publicId: string; role: 'main' | 'source' | 'video' | 'voice' | 'then'; contentType: string; sizeBytes: number; fileName: string | null; }
interface Submission {
  publicId: string; reference: string; kind: 'real' | 'ai' | 'memory' | 'family' | 'thennow' | 'frame' | 'reel'; yourName: string; parentName: string; relation: string | null;
  familySize: string | null; generations: string | null; memoryYear: number | null; countryCode: string; stateName: string | null; city: string | null;
  isAdult: boolean; guardianName: string | null; guardianMobileMasked: string | null; message: string | null; status: Status;
  reviewNote: string | null; reviewedBy: string | null; reviewedAtUtc: string | null; createdAtUtc: string; ownerEmailMasked: string | null;
  thenYear?: number | null; nowYear?: number | null; isFeatured?: boolean; candles?: number;
  /** Photo frames: the frame (e.g. festival-diwali), its festival, and the selfie it was made from. */
  frameStyle?: string | null; festival?: string | null; sourceReference?: string | null;
  files: SubmissionFile[];
}
interface SubmissionPage { items: Submission[]; total: number; page: number; pageSize: number; pending: number; approved: number; rejected: number; }

const KIND: Record<Submission['kind'], string> = { real: 'Selfie', ai: 'AI-made', memory: 'In loving memory', family: 'Family', thennow: 'Then & Now', frame: 'Photo frame', reel: 'Reel' };
const REASONS = ['Faces are not clearly visible', 'Photo looks heavily edited', 'Consent not confirmed for everyone in the photo',
  'Not related to the campaign', 'Duplicate submission'];

/**
 * Super admins, admins and moderators: visitors' selfies, family photos and videos (stored in the database) waiting for
 * review — approve, or reject with a reason. Approved / rejected ones can be put back in the queue.
 */
@Component({
  selector: 'app-review-queue',
  imports: [FormsModule, DatePipe],
  templateUrl: './review-queue.html'
})
export class ReviewQueue implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl + '/api/v1/admin/selfies';
  private readonly auth = inject(AuthService);

  protected readonly kindName = KIND;
  protected readonly reasons = REASONS;
  protected readonly status = signal<Status>('Pending');
  protected readonly page = signal(1);
  protected readonly data = signal<SubmissionPage | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly filter = signal<'all' | 'video' | 'family' | 'ai' | 'thennow' | 'frame'>('all');
  protected readonly open = signal<string | null>(null);
  protected readonly rejecting = signal<string | null>(null);
  protected reject = { reason: REASONS[0], note: '' };
  protected readonly busy = signal<string | null>(null);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  /** Local copies of the photos / videos (they need the access token, so they're fetched, not linked). */
  protected readonly media = signal<Record<string, string>>({});
  private readonly loadingMedia = new Set<string>();

  protected readonly shown = computed(() => {
    const items = this.data()?.items ?? [];
    switch (this.filter()) {
      case 'video': return items.filter(i => i.files.some(f => f.role === 'video'));
      case 'family': return items.filter(i => i.kind === 'family');
      case 'thennow': return items.filter(i => i.kind === 'thennow');
      case 'frame': return items.filter(i => i.kind === 'frame');
      case 'ai': return items.filter(i => i.kind === 'ai');
      default: return items;
    }
  });
  protected readonly pages = computed(() => {
    const d = this.data();
    return d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  });

  ngOnInit(): void {
    void this.load();
    void this.loadFrameSettings();
  }

  // ---------- Auto-approve photo frames (super admins / admins switch it; moderators see it) ----------

  protected readonly autoApprove = signal<boolean | null>(null);
  protected readonly savingAuto = signal(false);
  protected readonly autoError = signal('');
  protected readonly canSwitchAuto = computed(() => this.auth.staffRoles().some(r => r === 'SuperAdmin' || r === 'Admin'));

  private async loadFrameSettings(): Promise<void> {
    try { this.autoApprove.set((await firstValueFrom(this.http.get<{ autoApprove: boolean }>(`${this.api}/frame-settings`))).autoApprove); }
    catch { /* the switch stays hidden */ }
  }

  protected async setAutoApprove(on: boolean): Promise<void> {
    this.savingAuto.set(true);
    this.autoError.set('');
    try {
      this.autoApprove.set((await firstValueFrom(this.http.put<{ autoApprove: boolean }>(`${this.api}/frame-settings`, { autoApprove: on }))).autoApprove);
    } catch {
      this.autoError.set("Couldn't change it. Please try again.");
    } finally {
      this.savingAuto.set(false);
    }
  }

  ngOnDestroy(): void { Object.values(this.media()).forEach(u => URL.revokeObjectURL(u)); }

  protected setStatus(s: Status): void {
    if (s === this.status()) return;
    this.status.set(s);
    this.page.set(1);
    this.notice.set('');
    void this.load();
  }

  protected goPage(n: number): void {
    this.page.set(n);
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    this.open.set(null);
    this.rejecting.set(null);
    try {
      const d = await firstValueFrom(this.http.get<SubmissionPage>(this.api, { params: { status: this.status(), page: this.page(), pageSize: 12 } }));
      this.data.set(d);
      // Thumbnails: each submission's photo (videos load when opened)
      for (const s of d.items) { const f = this.thumbFile(s); if (f) void this.loadMedia(f); }
    } catch (e) {
      this.loadError.set(problemMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected thumbFile(s: Submission): SubmissionFile | undefined { return s.files.find(f => f.role === 'main'); }
  protected hasVideo(s: Submission): boolean { return s.files.some(f => f.role === 'video'); }

  protected mediaLabel(s: Submission): string {
    const photo = s.files.some(f => f.role === 'main'), video = this.hasVideo(s);
    const voice = s.files.some(f => f.role === 'voice') ? ' + voice note' : '';
    if (s.kind === 'thennow') return 'Old + new photo' + voice;
    if (s.kind === 'frame') return 'Framed picture';
    return (photo && video ? 'Photo + video' : video ? 'Video' : 'Photo') + voice;
  }

  /** "Festival: Diwali" / "Everyday: arch · marigold" */
  protected frameName(s: Submission): string {
    const [design, colour] = (s.frameStyle ?? '').split('-');
    return s.festival ? `Festival: ${s.festival[0].toUpperCase()}${s.festival.slice(1)}` : `Everyday: ${design} · ${colour}`;
  }

  protected place(s: Submission): string { return [s.city, s.stateName, s.countryCode].filter(Boolean).join(', '); }

  private async loadMedia(f: SubmissionFile): Promise<void> {
    if (this.media()[f.publicId] || this.loadingMedia.has(f.publicId)) return;
    this.loadingMedia.add(f.publicId);
    try {
      const blob = await firstValueFrom(this.http.get(`${this.api}/files/${f.publicId}`, { responseType: 'blob' }));
      this.media.update(m => ({ ...m, [f.publicId]: URL.createObjectURL(blob) }));
    } catch {
      /* shown as "couldn't load" */
    } finally {
      this.loadingMedia.delete(f.publicId);
    }
  }

  protected toggle(s: Submission): void {
    const opening = this.open() !== s.publicId;
    this.open.set(opening ? s.publicId : null);
    this.rejecting.set(null);
    if (opening) s.files.forEach(f => void this.loadMedia(f));
  }

  protected roleName(role: SubmissionFile['role']): string {
    return role === 'main' ? 'Photo' : role === 'source' ? 'Original photo (for the AI image)' : role === 'voice' ? 'Voice note'
      : role === 'then' ? 'Old photo (then)' : 'Video';
  }
  protected size(bytes: number): string { return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.ceil(bytes / 1024) + ' KB'; }

  // ---------- Decisions ----------

  protected startReject(s: Submission): void {
    this.reject = { reason: REASONS[0], note: '' };
    this.rejecting.set(s.publicId);
    this.notice.set('');
  }

  protected approve(s: Submission): Promise<void> { return this.decide(s, 'Approved', null); }

  protected confirmReject(s: Submission): Promise<void> {
    const note = [this.reject.reason, this.reject.note.trim()].filter(Boolean).join('. ');
    return this.decide(s, 'Rejected', note);
  }

  protected backToQueue(s: Submission): Promise<void> { return this.decide(s, 'Pending', null); }

  /** Feature / unfeature an approved submission for Featured Stories on the website's home page. */
  protected async setFeatured(s: Submission, isFeatured: boolean): Promise<void> {
    this.busy.set(s.publicId);
    this.error.set('');
    try {
      await firstValueFrom(this.http.put(`${this.api}/${s.publicId}/featured`, { isFeatured }));
      this.data.update(d => d && { ...d, items: d.items.map(i => i.publicId === s.publicId ? { ...i, isFeatured } : i) });
      this.notice.set(isFeatured ? `${s.reference} is now featured on the home page.` : `${s.reference} is no longer featured.`);
    } catch (e) {
      this.error.set(problemMessage(e));
    } finally {
      this.busy.set(null);
    }
  }

  private async decide(s: Submission, status: Status, note: string | null): Promise<void> {
    if (note && /[<>]/.test(note)) { this.error.set("The reason can't contain < or >."); return; }
    this.busy.set(s.publicId);
    this.error.set('');
    try {
      await firstValueFrom(this.http.put(`${this.api}/${s.publicId}/review`, { status, note }));
      this.notice.set(status === 'Approved' ? `${s.reference} approved.` : status === 'Rejected' ? `${s.reference} rejected.` : `${s.reference} is back in the queue.`);
      // Keep the page in place: drop it from this list and update the counts
      this.data.update(d => d && {
        ...d, items: d.items.filter(i => i.publicId !== s.publicId), total: d.total - 1,
        pending: d.pending + (status === 'Pending' ? 1 : 0) - (s.status === 'Pending' ? 1 : 0),
        approved: d.approved + (status === 'Approved' ? 1 : 0) - (s.status === 'Approved' ? 1 : 0),
        rejected: d.rejected + (status === 'Rejected' ? 1 : 0) - (s.status === 'Rejected' ? 1 : 0)
      });
      this.open.set(null);
      this.rejecting.set(null);
      if (!this.data()?.items.length && this.page() > 1) this.goPage(this.page() - 1);
      else if (!this.data()?.items.length) void this.load();
    } catch (e) {
      this.error.set(problemMessage(e));
    } finally {
      this.busy.set(null);
    }
  }
}
