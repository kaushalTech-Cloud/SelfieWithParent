import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

// Endpoints that must never carry (or wait for) an access token
const PUBLIC_AUTH = ['/auth/otp/request', '/auth/otp/verify', '/auth/email/request', '/auth/email/verify', '/auth/email/password', '/auth/refresh'];

/** Adds the access token to API calls only (never to other sites), and retries once after a refresh on 401. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiBaseUrl + '/api/') || PUBLIC_AUTH.some(p => req.url.endsWith(p))) {
    return next(req);
  }
  const auth = inject(AuthService);
  const withToken = (r: HttpRequest<unknown>, token: string | null) =>
    token ? r.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : r;

  return from(auth.getAccessToken()).pipe(
    switchMap(token => next(withToken(req, token)).pipe(
      catchError((err: unknown) => {
        if (!(err instanceof HttpErrorResponse) || err.status !== 401 || !token) return throwError(() => err);
        return from(auth.refresh()).pipe(
          switchMap(ok => ok ? from(auth.getAccessToken()) : throwError(() => err)),
          switchMap(fresh => next(withToken(req, fresh)))
        );
      })
    ))
  );
};
