namespace SelfiewithParent.Api.Security;

/// <summary>
/// Adds browser security headers to every response.
/// API responses get the strictest policy; the Swagger UI (development only) gets the minimum it needs to run.
/// </summary>
public sealed class SecurityHeadersMiddleware(RequestDelegate next)
{
    private const string ApiCsp = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
    private const string SwaggerCsp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

    public Task InvokeAsync(HttpContext context)
    {
        context.Response.OnStarting(() =>
        {
            var h = context.Response.Headers;
            h["X-Content-Type-Options"] = "nosniff";
            h["X-Frame-Options"] = "DENY";
            h["Referrer-Policy"] = "no-referrer";
            h["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=(), usb=()";
            h["Cross-Origin-Opener-Policy"] = "same-origin";
            h["Cross-Origin-Resource-Policy"] = "same-site";
            h["Content-Security-Policy"] = context.Request.Path.StartsWithSegments("/swagger") ? SwaggerCsp : ApiCsp;

            // Never cache personal data or tokens (public images set their own caching)
            if (context.Request.Path.StartsWithSegments("/api") && !context.Request.Path.StartsWithSegments("/api/v1/media") && !context.Request.Path.StartsWithSegments("/api/v1/selfies/files"))
            {
                h["Cache-Control"] = "no-store";
                h["Pragma"] = "no-cache";
            }
            h.Remove("X-Powered-By");
            return Task.CompletedTask;
        });
        return next(context);
    }
}
