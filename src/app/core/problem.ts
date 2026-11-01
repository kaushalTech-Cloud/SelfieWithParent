import { HttpErrorResponse } from '@angular/common/http';
import { ProblemDetails } from './api.models';

/** The API's own friendly message for an error (it never reveals more than it should). */
export function problemMessage(e: unknown): string {
  if (e instanceof HttpErrorResponse) {
    if (e.status === 0) return "We couldn't reach the server. Please check your connection and try again.";
    const p = e.error as ProblemDetails | null;
    if (p?.errors) return Object.values(p.errors)[0]?.[0] ?? 'Please check the details and try again.';
    if (p?.title) return p.title;
  }
  return 'Something went wrong. Please try again.';
}
