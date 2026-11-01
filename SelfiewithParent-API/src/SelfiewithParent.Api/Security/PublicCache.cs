using Microsoft.AspNetCore.OutputCaching;

namespace SelfiewithParent.Api.Security;

/// <summary>
/// Server-side caching of public, anonymous reads, so festival peaks (Diwali, Mother's Day…) don't send every visitor's
/// request to the database. Only anonymous GETs are cached (a request with a sign-in token is never served from or
/// stored in the cache); each website origin gets its own copy (the CORS headers differ).
/// The cache is cleared at once whenever staff change something (a review, a take-down, a menu, a page, an image), a
/// visitor deletes their account, or a photo frame is shared — so a taken-down photo never lingers. Likes don't clear it
/// (their counts may be up to 30 seconds behind for visitors who aren't signed in).
/// </summary>
public static class PublicCache
{
    private const string GalleryTag = "gallery", ContentTag = "content";

    /// <summary>Gallery, Photo Frames, story pages: 30 seconds.</summary>
    public const string Gallery = "public-gallery";
    /// <summary>Photos, videos and voice notes of selfies: 10 minutes.</summary>
    public const string GalleryFiles = "public-gallery-files";
    /// <summary>Menus and content pages: 30 seconds.</summary>
    public const string Content = "public-content";
    /// <summary>Images of content pages: 10 minutes.</summary>
    public const string ContentFiles = "public-content-files";

    public static void AddPolicies(OutputCacheOptions o)
    {
        o.AddPolicy(Gallery, b => b.Expire(TimeSpan.FromSeconds(30)).SetVaryByQuery("*").SetVaryByHeader("Origin", "Accept-Language").Tag(GalleryTag));
        o.AddPolicy(GalleryFiles, b => b.Expire(TimeSpan.FromMinutes(10)).SetVaryByQuery("*").SetVaryByHeader("Origin", "Range").Tag(GalleryTag));
        o.AddPolicy(Content, b => b.Expire(TimeSpan.FromSeconds(30)).SetVaryByQuery("*").SetVaryByHeader("Origin", "Accept-Language").Tag(ContentTag));
        o.AddPolicy(ContentFiles, b => b.Expire(TimeSpan.FromMinutes(10)).SetVaryByQuery("*").SetVaryByHeader("Origin", "Range").Tag(ContentTag));
    }

    /// <summary>After a change that public pages show: staff changes, an account deleted, a photo frame or reel shared, a donation confirmed, a profile saved, a selfie taken out of a family album.</summary>
    public static bool ChangesPublicContent(HttpRequest r, int status) =>
        status < 400 && !HttpMethods.IsGet(r.Method) && !HttpMethods.IsHead(r.Method) && !HttpMethods.IsOptions(r.Method)
        && (r.Path.StartsWithSegments("/api/v1/admin")
            || (HttpMethods.IsDelete(r.Method) && r.Path.Equals("/api/v1/me", StringComparison.OrdinalIgnoreCase))
            || (r.Path.StartsWithSegments("/api/v1/selfies") && (r.Path.Value!.EndsWith("/frames", StringComparison.OrdinalIgnoreCase)
                || r.Path.Value!.EndsWith("/reel", StringComparison.OrdinalIgnoreCase)))
            // a donation confirmed (checkout or webhook): the Support page's totals, progress bars and donor wall update at once
            || r.Path.Equals("/api/v1/support/donations/confirm", StringComparison.OrdinalIgnoreCase)
            || r.Path.Equals("/api/v1/support/razorpay/webhook", StringComparison.OrdinalIgnoreCase)
            // a visitor changed their profile page (made it private, a new name or address)
            || r.Path.Equals("/api/v1/me/public-profile", StringComparison.OrdinalIgnoreCase)
            // a selfie taken out of its family album
            || (HttpMethods.IsDelete(r.Method) && r.Path.StartsWithSegments("/api/v1/albums/mine")));

    /// <summary>Clears the public cache after a request that changed what the public pages show.</summary>
    public static IApplicationBuilder UsePublicCacheClearing(this IApplicationBuilder app) => app.Use(async (ctx, next) =>
    {
        await next();
        if (ChangesPublicContent(ctx.Request, ctx.Response.StatusCode))
        {
            var store = ctx.RequestServices.GetRequiredService<IOutputCacheStore>();
            await store.EvictByTagAsync(GalleryTag, CancellationToken.None);
            await store.EvictByTagAsync(ContentTag, CancellationToken.None);
        }
    });
}
