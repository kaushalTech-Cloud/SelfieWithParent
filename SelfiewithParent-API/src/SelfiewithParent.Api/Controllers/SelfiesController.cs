using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.JsonWebTokens;
using SelfiewithParent.Api.Data;
using SelfiewithParent.Api.Models;
using SelfiewithParent.Api.Security;

namespace SelfiewithParent.Api.Controllers;

/// <summary>Sharing a selfie, family photo or video. Signed-in visitors only; everything starts in the review queue.</summary>
[ApiController]
[Route("api/v1/selfies")]
[Authorize]
[Produces("application/json")]
public sealed class SelfiesController(SelfieRepository selfies, ILogger<SelfiesController> log) : ControllerBase
{
    // Photo + optional original photo + video, plus the form fields
    private const long MaxRequestBytes = 3L * FileTypes.MaxPhotoBytes + FileTypes.MaxVideoBytes + FileTypes.MaxVoiceBytes + 256 * 1024;

    /// <summary>Share a selfie / family photo / video (multipart/form-data). It is reviewed before anyone else sees it.</summary>
    /// <remarks>
    /// Files are checked by their real type (first bytes), not their name. A photo or a video is needed; only a family can
    /// share both. Under 18: a parent / guardian's name and mobile and their agreement are needed.
    /// </remarks>
    [HttpPost]
    [EnableRateLimiting(RateLimits.Upload)]
    [RequestSizeLimit(MaxRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxRequestBytes)]
    [Consumes("multipart/form-data")]
    [ProducesResponseType(typeof(ShareSelfieResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> Share([FromForm] ShareSelfieForm form, CancellationToken ct)
    {
        var actor = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        var problems = new Dictionary<string, string[]>();
        void Refuse(string field, string message) => problems[field] = [message];

        string? Clean(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();
        var yourName = Clean(form.YourName) ?? "";
        var parentName = Clean(form.ParentName) ?? "";
        var message = Clean(form.Message);
        var family = form.Kind == "family";
        foreach (var (field, value) in new[] { ("YourName", yourName), ("ParentName", parentName), ("StateName", form.StateName),
                     ("City", form.City), ("GuardianName", form.GuardianName), ("Message", message) })
            if (value is not null && (value.Contains('<') || value.Contains('>'))) Refuse(field, "Text can't contain < or >.");
        if (!family && form.Relation is null) Refuse(nameof(form.Relation), "Please choose who they are.");
        if (family && form.FamilySize is null) Refuse(nameof(form.FamilySize), "Please choose how many people are in it.");
        if (!(form.ConsentShown && form.ConsentOwn && form.ConsentTerms)) Refuse("Consents", "Please tick all three boxes to continue.");

        // Under 18: a parent / guardian has to agree
        string? guardianMobile = null;
        if (form.IsAdult == false)
        {
            if ((Clean(form.GuardianName)?.Length ?? 0) < 2) Refuse(nameof(form.GuardianName), "Please add your parent or guardian's name.");
            if (form.GuardianCountryCode is null || !PhoneNumber.TryNormalize(form.GuardianCountryCode, form.GuardianMobile ?? "", out var digits))
                Refuse(nameof(form.GuardianMobile), "Enter a valid mobile number.");
            else guardianMobile = form.GuardianCountryCode + digits;
            if (!form.GuardianConsent) Refuse(nameof(form.GuardianConsent), "Your parent or guardian needs to agree.");
        }

        // Files: real type from the first bytes, within the size limits
        var main = await ReadFile(form.Photo, FileTypes.MaxPhotoBytes, d => FileTypes.Image(d), "Photo",
            "Choose a JPG, PNG or WebP photo up to 10 MB.", problems, ct);
        var source = form.Kind == "ai"
            ? await ReadFile(form.Source, FileTypes.MaxPhotoBytes, d => FileTypes.Image(d), "Source", "The original photo must be a JPG, PNG or WebP up to 10 MB.", problems, ct)
            : null;
        var video = await ReadFile(form.Video, FileTypes.MaxVideoBytes, d => FileTypes.Video(d), "Video",
            "Choose an MP4, WebM or MOV video up to 50 MB.", problems, ct);
        if (!problems.ContainsKey("Photo") && !problems.ContainsKey("Video"))
        {
            if (main is null && video is null) Refuse("Photo", family ? "Add a family photo, a family video, or both." : "Add a photo or a video.");
            else if (!family && main is not null && video is not null) Refuse("Video", "Share a photo or a video (only a family can share both).");
        }
        if (source is not null && main is null) Refuse("Source", "The original photo goes with an AI-made photo.");
        // Then & Now: the old photo and the same picture today (no video)
        var thenNow = form.Kind == "thennow";
        var then = thenNow
            ? await ReadFile(form.Then, FileTypes.MaxPhotoBytes, d => FileTypes.Image(d), "Then", "Choose the old photo: a JPG, PNG or WebP up to 10 MB.", problems, ct)
            : null;
        if (thenNow && !problems.ContainsKey("Then") && then is null) Refuse("Then", "Add the old photo.");
        if (thenNow && video is not null) Refuse("Video", "Then & Now is two photos, not a video.");
        if (thenNow && form.ThenYear is { } ty && form.NowYear is { } ny && ty > ny) Refuse(nameof(form.ThenYear), "The old photo's year can't be after the new one's.");
        // Voice note: only with a photo or AI-made photo (not with a video, not for a family share)
        var voice = await ReadFile(form.Voice, FileTypes.MaxVoiceBytes, d => FileTypes.Audio(d), "Voice",
            "Choose a voice note (audio) up to 5 MB.", problems, ct);
        if (voice is not null && (main is null || video is not null || family))
            Refuse("Voice", "A voice note can only go with a photo or an AI-made photo.");

        if (problems.Count > 0)
        {
            log.LogWarning("Selfie refused for {Actor}: {Fields}", actor, string.Join(", ", problems.Keys));
            return ValidationProblem(new ValidationProblemDetails(problems));
        }

        var (created, refused) = await selfies.CreateAsync(User.GetUserId(), new SelfieRepository.NewSubmission(
            form.Kind, yourName, parentName, family ? null : form.Relation, family ? form.FamilySize : null, family ? Clean(form.Generations) : null,
            form.Kind == "memory" ? form.MemoryYear : null, form.CountryCode, Clean(form.StateName), Clean(form.City), form.IsAdult!.Value,
            form.IsAdult == false ? Clean(form.GuardianName) : null, guardianMobile, message, main, source, video, voice,
            then, thenNow ? form.ThenYear : null, thenNow ? form.NowYear : null), ct);
        if (created is null)
        {
            log.LogWarning("Selfie refused by the database for {Actor}: {Problem}", actor, refused);
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: refused);
        }

        log.LogInformation("Selfie {Reference} ({Kind}: {Files}) shared by {Actor}", created.Reference, form.Kind,
            string.Join("+", new[] { main is null ? null : "photo", source is null ? null : "source", video is null ? null : "video",
                voice is null ? null : "voice", then is null ? null : "then" }.Where(x => x is not null)), actor);
        return StatusCode(StatusCodes.Status201Created, new ShareSelfieResponse(created.PublicId, created.Reference));
    }

    /// <summary>The gallery: approved selfies, family photos and videos (newest first). No sign-in needed.</summary>
    /// <param name="tab">parent, grand, ai, family, video; thennow, memory (Memory Wall), featured; or latest (all of them).</param>
    /// <param name="page">From 1.</param>
    /// <param name="pageSize">1 to 48 (default 12).</param>
    /// <param name="ct">Cancellation token.</param>
    [HttpGet("gallery")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.PublicContent)]
    [OutputCache(PolicyName = PublicCache.Gallery)]
    [ProducesResponseType(typeof(GalleryPageResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Gallery([FromQuery] string? tab, [FromQuery] int page = 1, [FromQuery] int pageSize = 12, CancellationToken ct = default)
    {
        var t = tab is not null && (SelfieRepository.GalleryTabs.Contains(tab) || tab == "latest") ? tab : SelfieRepository.GalleryTabs[0];
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 48);
        var (items, total, counts) = await selfies.GalleryAsync(t, page, pageSize, ct);
        return Ok(new GalleryPageResponse(t, items.Select(ToPublic).ToList(), total, page, pageSize, counts));
    }

    /// <summary>Where I was on my latest upload, so the upload form doesn't ask again. 204 when I haven't shared anything yet.</summary>
    [HttpGet("mine/place")]
    [ProducesResponseType(typeof(MyPlaceResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> MyPlace(CancellationToken ct)
    {
        var p = await selfies.MyLastPlaceAsync(User.GetUserId(), ct);
        return p is null ? NoContent() : Ok(new MyPlaceResponse(p.CountryCode, p.StateName, p.City));
    }

    /// <summary>The festivals / events a frame can be for (the website's festival frames).</summary>
    private static readonly HashSet<string> FrameFestivals = ["diwali", "holi", "durga", "onam", "sankranti", "rakhi", "eid", "ramadan", "christmas",
        "newyear", "lunar", "vesak", "easter", "mothers", "fathers", "grandparents", "keiro", "thanksgiving"];

    /// <summary>Can I share this selfie in a frame (it's my own approved photo selfie), and which frames have I already shared?</summary>
    [HttpGet("{publicId:guid}/frames/mine")]
    [ProducesResponseType(typeof(FrameShareStateResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> FrameShareState(Guid publicId, CancellationToken ct)
    {
        var (owner, shared) = await selfies.FrameShareStateAsync(User.GetUserId(), publicId, ct);
        return Ok(new FrameShareStateResponse(owner, shared.Select(s => new SharedFrameResponse(s.FrameStyle, s.Status)).ToList()));
    }

    /// <summary>
    /// Share my approved photo selfie in a frame to the Photo Frames gallery (multipart/form-data). Only the selfie's owner.
    /// Staff review it first, unless they have switched auto-approve on (then Status is Approved and it shows straight away).
    /// </summary>
    [HttpPost("{publicId:guid}/frames")]
    [EnableRateLimiting(RateLimits.Upload)]
    [RequestSizeLimit(FileTypes.MaxPhotoBytes + 64 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = FileTypes.MaxPhotoBytes + 64 * 1024)]
    [Consumes("multipart/form-data")]
    [ProducesResponseType(typeof(FrameSharedResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> ShareFrame(Guid publicId, [FromForm] ShareFrameForm form, CancellationToken ct)
    {
        var actor = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        var problems = new Dictionary<string, string[]>();
        var festival = string.IsNullOrEmpty(form.Festival) ? null : form.Festival;
        if (festival is not null && (!FrameFestivals.Contains(festival) || form.Style != "festival-" + festival))
            problems[nameof(form.Festival)] = ["Choose a festival frame."];
        if (festival is null && form.Style.StartsWith("festival-", StringComparison.Ordinal))
            problems[nameof(form.Style)] = ["Choose a frame."];
        var picture = await ReadFile(form.Picture, FileTypes.MaxPhotoBytes, d => FileTypes.Image(d), "Picture",
            "The framed picture must be a JPG, PNG or WebP up to 10 MB.", problems, ct);
        if (picture is null && !problems.ContainsKey("Picture")) problems["Picture"] = ["Add the framed picture."];
        if (problems.Count > 0)
        {
            log.LogWarning("Frame of {Selfie} refused for {Actor}: {Fields}", publicId, actor, string.Join(", ", problems.Keys));
            return ValidationProblem(new ValidationProblemDetails(problems));
        }

        var (created, refused) = await selfies.ShareFrameAsync(User.GetUserId(), publicId, form.Style, festival, picture!, ct);
        if (created is null)
        {
            log.LogWarning("Frame of {Selfie} refused by the database for {Actor}: {Problem}", publicId, actor, refused);
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: refused);
        }
        log.LogInformation("Frame {Reference} ({Style}) of {Selfie} shared by {Actor}: {Status}", created.Reference, form.Style, publicId, actor, created.Status);
        return StatusCode(StatusCodes.Status201Created, new FrameSharedResponse(created.PublicId, created.Reference, created.Status));
    }

    /// <summary>Can I share this selfie's reel (it's my own approved photo selfie), and have I already?</summary>
    [HttpGet("{publicId:guid}/reel/mine")]
    [ProducesResponseType(typeof(ReelShareStateResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> ReelShareState(Guid publicId, CancellationToken ct)
    {
        var (owner, status) = await selfies.ReelShareStateAsync(User.GetUserId(), publicId, ct);
        return Ok(new ReelShareStateResponse(owner, status));
    }

    /// <summary>
    /// Share my approved photo selfie's reel (the video made on its reel page: MP4 or WebM, up to 50 MB) to the Videos
    /// gallery. Only the selfie's owner. It shows straight away (the photo in it was already reviewed); staff can take it down.
    /// </summary>
    [HttpPost("{publicId:guid}/reel")]
    [EnableRateLimiting(RateLimits.Upload)]
    [RequestSizeLimit(FileTypes.MaxVideoBytes + 64 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = FileTypes.MaxVideoBytes + 64 * 1024)]
    [Consumes("multipart/form-data")]
    [ProducesResponseType(typeof(ShareSelfieResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> ShareReel(Guid publicId, IFormFile? video, CancellationToken ct)
    {
        var actor = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        var problems = new Dictionary<string, string[]>();
        var file = await ReadFile(video, FileTypes.MaxVideoBytes, d => FileTypes.Video(d), "Video", "The reel must be an MP4 or WebM video up to 50 MB.", problems, ct);
        if (file is null && !problems.ContainsKey("Video")) problems["Video"] = ["Add the reel."];
        if (problems.Count > 0)
        {
            log.LogWarning("Reel of {Selfie} refused for {Actor}: {Fields}", publicId, actor, string.Join(", ", problems.Keys));
            return ValidationProblem(new ValidationProblemDetails(problems));
        }
        var (created, refused) = await selfies.ShareReelAsync(User.GetUserId(), publicId, file!, ct);
        if (created is null)
        {
            log.LogWarning("Reel of {Selfie} refused by the database for {Actor}: {Problem}", publicId, actor, refused);
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: refused);
        }
        log.LogInformation("Reel {Reference} of {Selfie} shared by {Actor} ({Kb} KB)", created.Reference, publicId, actor, file!.Data.Length / 1024);
        return StatusCode(StatusCodes.Status201Created, new ShareSelfieResponse(created.PublicId, created.Reference));
    }

    /// <summary>The Photo Frames gallery: approved framed photos, newest first. No sign-in needed.</summary>
    /// <param name="country">A country code (e.g. IN), or empty for all.</param>
    /// <param name="festival">A festival id (e.g. diwali), "everyday" for frames without a festival, or empty for all.</param>
    /// <param name="page">From 1.</param>
    /// <param name="pageSize">1 to 48 (default 12).</param>
    /// <param name="ct">Cancellation token.</param>
    [HttpGet("frames")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.PublicContent)]
    [OutputCache(PolicyName = PublicCache.Gallery)]
    [ProducesResponseType(typeof(FramePageResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Frames([FromQuery] string? country, [FromQuery] string? festival, [FromQuery] int page = 1,
        [FromQuery] int pageSize = 12, CancellationToken ct = default)
    {
        var c = country is { Length: 2 } && country.All(char.IsAsciiLetterUpper) ? country : null;
        var f = festival is not null && (festival == "everyday" || FrameFestivals.Contains(festival)) ? festival : null;
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 48);
        var (items, total, countries, festivals) = await selfies.FramesAsync(c, f, page, pageSize, ct);
        return Ok(new FramePageResponse(
            items.Select(i => new FrameItemResponse(i.PublicId,
                i.SourceKind == "family" ? i.ParentName.Trim() : $"{FirstName(i.YourName)} with {i.ParentName.Trim()}",
                string.Join(", ", new[] { i.City, i.StateName }.Where(x => !string.IsNullOrWhiteSpace(x))) is { Length: > 0 } place ? place : null,
                i.CountryCode, i.Festival, i.FrameStyle, i.ApprovedAtUtc, i.PhotoId, i.SourcePublicId, i.Likes)).ToList(),
            total, page, pageSize,
            countries.Select(x => new FilterCountResponse(x.Key, x.Count)).ToList(),
            festivals.Select(x => new FilterCountResponse(x.Key, x.Count)).ToList()));
    }

    /// <summary>Like (or unlike) an approved selfie or photo frame. Signed-in visitors; one like each.</summary>
    [HttpPut("{publicId:guid}/like")]
    [EnableRateLimiting(RateLimits.Auth)]
    [ProducesResponseType(typeof(LikeResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Like(Guid publicId, SetLikeRequest request, CancellationToken ct)
    {
        var (likes, problem) = await selfies.SetLikeAsync(User.GetUserId(), publicId, request.Liked!.Value, ct);
        if (likes is null)
        {
            log.LogWarning("Like on {PublicId} refused for {Actor}: {Problem}", publicId, User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value, problem);
            return Problem(statusCode: StatusCodes.Status404NotFound, title: problem);
        }
        log.LogInformation("Selfie {PublicId} {State} by {Actor}", publicId, request.Liked.Value ? "liked" : "unliked", User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value);
        return Ok(new LikeResponse(likes.Value, request.Liked.Value));
    }

    /// <summary>The selfies and photo frames I like.</summary>
    [HttpGet("likes/mine")]
    [ProducesResponseType(typeof(IReadOnlyList<Guid>), StatusCodes.Status200OK)]
    public async Task<IActionResult> MyLikes(CancellationToken ct) => Ok(await selfies.MyLikesAsync(User.GetUserId(), ct));

    /// <summary>Light (or put out) my candle on a Memory Wall tribute. Signed-in visitors; one candle each per tribute.</summary>
    [HttpPut("{publicId:guid}/candle")]
    [EnableRateLimiting(RateLimits.Auth)]
    [ProducesResponseType(typeof(CandleResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Candle(Guid publicId, SetCandleRequest request, CancellationToken ct)
    {
        var (candles, problem) = await selfies.SetCandleAsync(User.GetUserId(), publicId, request.Lit!.Value, ct);
        if (candles is null)
        {
            log.LogWarning("Candle on {PublicId} refused for {Actor}: {Problem}", publicId, User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value, problem);
            return Problem(statusCode: StatusCodes.Status404NotFound, title: problem);
        }
        log.LogInformation("Candle on {PublicId} {State} by {Actor}", publicId, request.Lit.Value ? "lit" : "put out", User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value);
        return Ok(new CandleResponse(candles.Value, request.Lit.Value));
    }

    /// <summary>The Memory Wall tributes I have lit a candle for.</summary>
    [HttpGet("candles/mine")]
    [ProducesResponseType(typeof(IReadOnlyList<Guid>), StatusCodes.Status200OK)]
    public async Task<IActionResult> MyCandles(CancellationToken ct) => Ok(await selfies.MyCandlesAsync(User.GetUserId(), ct));

    /// <summary>One approved selfie, for its story page. 404 when it doesn't exist or isn't approved (any more).</summary>
    [HttpGet("{publicId:guid}")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.PublicContent)]
    [OutputCache(PolicyName = PublicCache.Gallery)]
    [ProducesResponseType(typeof(StoryResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Story(Guid publicId, CancellationToken ct)
    {
        var row = await selfies.GetApprovedAsync(publicId, ct);
        return row is null
            ? Problem(statusCode: StatusCodes.Status404NotFound, title: "Selfie not found.")
            : Ok(new StoryResponse(SelfieRepository.TabOf(row), ToPublic(row),
                (await selfies.WinsOfAsync(publicId, ct)).Select(c => new ContestResponse(c.PublicId, c.Kind, c.Title, c.StartsAtUtc, c.EndsAtUtc, true)).ToList()));
    }

    /// <summary>What anyone may see of an approved selfie (no contact details, the visitor's first name only).</summary>
    public static GalleryItemResponse ToPublic(SelfieRepository.GalleryRow i) => new(
        i.PublicId, i.Kind,
        // "Asha with Mom and Dad": the visitor's first name, the parent's name as typed; a family shows its family name
        i.Kind == "family" ? i.ParentName.Trim() : $"{FirstName(i.YourName)} with {i.ParentName.Trim()}",
        FirstName(i.YourName), i.ParentName.Trim(),
        i.Relation, i.MemoryYear,
        string.Join(", ", new[] { i.City, i.StateName }.Where(x => !string.IsNullOrWhiteSpace(x))) is { Length: > 0 } place ? place : null,
        i.Message, i.ApprovedAtUtc, i.PhotoId, i.VideoId, i.VoiceId, i.ThenId, i.ThenYear, i.NowYear, i.IsFeatured, i.Candles, i.Likes, i.IsWinner);

    private static string FirstName(string name) => name.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? name;

    /// <summary>A photo, video or voice note of an approved selfie. It stops working once the selfie is taken down.</summary>
    [HttpGet("files/{filePublicId:guid}")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.PublicContent)]
    [OutputCache(PolicyName = PublicCache.GalleryFiles)]
    [Produces("image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm", "video/quicktime", "audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> PublicFile(Guid filePublicId, CancellationToken ct)
    {
        var file = await selfies.GetPublicFileAsync(filePublicId, ct);
        if (file is null) return NotFound();
        // Short public caching: a selfie that is taken down disappears from browsers within the hour
        Response.Headers.CacheControl = "public, max-age=3600";
        return File(file.Data, file.ContentType, enableRangeProcessing: true);
    }

    private static async Task<SelfieRepository.NewFile?> ReadFile(IFormFile? file, int maxBytes, Func<byte[], string?> sniff,
        string field, string message, Dictionary<string, string[]> problems, CancellationToken ct)
    {
        if (file is null || file.Length == 0) return null;
        if (file.Length > maxBytes) { problems[field] = [message]; return null; }
        var data = await FileTypes.ReadAsync(file, ct);
        var type = sniff(data);
        if (type is null) { problems[field] = [message]; return null; }
        return new SelfieRepository.NewFile(type, data, FileTypes.CleanName(file.FileName, field.ToLowerInvariant()));
    }
}
