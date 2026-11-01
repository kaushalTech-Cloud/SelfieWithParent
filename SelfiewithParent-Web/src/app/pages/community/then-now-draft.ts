import { Injectable, signal } from '@angular/core';

/** The pair picked on the Then & Now page, handed to the upload form ("Submit to the gallery"). Stays in this tab only. */
export interface ThenNowPair { then: File | null; now: File | null; thenYear: string; nowYear: string; }

@Injectable({ providedIn: 'root' })
export class ThenNowDraft {
  readonly pair = signal<ThenNowPair | null>(null);

  /** Takes the pair (once): the upload form fills itself from it. */
  take(): ThenNowPair | null {
    const p = this.pair();
    this.pair.set(null);
    return p;
  }
}

/** The family tree picture, handed to the upload form ("Post to the gallery"). Stays in this tab only. */
export interface FamilyTreePost { picture: File; familyName: string; people: number; generations: number; }

@Injectable({ providedIn: 'root' })
export class FamilyTreeDraft {
  readonly post = signal<FamilyTreePost | null>(null);

  /** Takes the picture (once): the upload form fills itself from it. */
  take(): FamilyTreePost | null {
    const p = this.post();
    this.post.set(null);
    return p;
  }
}
