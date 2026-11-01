using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.JsonWebTokens;
using SelfiewithParent.Api.Data;
using SelfiewithParent.Api.Models;
using SelfiewithParent.Api.Security;

namespace SelfiewithParent.Api.Controllers;

/// <summary>
/// Parents' Voices: stories of parents whose children left them. Anyone can read the approved stories; signed-in
/// visitors can share one (theirs, or a parent's with their agreement) and send love. Every story is reviewed first.
/// </summary>
[ApiController]
[Route("api/v1/parent-stories")]
[Authorize]
[Produces("application/json")]
public sealed class ParentStoriesController(ParentStoryRepository stories, FeatureRepository features, ILogger<ParentStoriesController> log) : ControllerBase
{
    private const long MaxRequestBytes = FileTypes.MaxPhotoBytes + FileTypes.MaxVideoBytes + FileTypes.MaxVoiceBytes + 128 * 1024;

    /// <summary>Approved stories: featured first, then newest. No sign-in needed.</summary>
    [HttpGet]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.PublicContent)]
    [OutputCache(PolicyName = PublicCache.Gallery)]
    [ProducesResponseType(typeof(ParentStoryPageResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> List([FromQuery] int page = 1, [FromQuery] int pageSize = 12, CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 48);
        var (items, total) = await stories.ListAsync(page, pageSize, ct);
        return Ok(new ParentStoryPageResponse(items.Select(ToPublic).ToList(), total, page, pageSize));
    }

    /// <summary>One approved story. 404 when it doesn't exist or isn't approved (any more).</summary>
    [HttpGet("{publicId:guid}")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.PublicContent)]
    [OutputCache(PolicyName = PublicCache.Gallery)]
    [ProducesResponseType(typeof(ParentStoryResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(Guid publicId, CancellationToken ct)
    {
        var row = await stories.GetApprovedAsync(publicId, ct);
        return row is null ? Problem(statusCode: StatusCodes.Status404NotFound, title: "Story not found.") : Ok(ToPublic(row));
    }

    /// <summary>A photo, video or voice note of an approved story. It stops working once the story is taken down.</summary>
    [HttpGet("files/{filePublicId:guid}")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.PublicContent)]
    [OutputCache(PolicyName = PublicCache.GalleryFiles)]
    [Produces("image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm", "video/quicktime", "audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> PublicFile(Guid filePublicId, CancellationToken ct)
    {
        var file = await stories.GetPublicFileAsync(filePublicId, ct);
        if (file is null) return NotFound();
        Response.Headers.CacheControl = "public, max-age=3600";
        return File(file.Data, file.ContentType, enableRangeProcessing: true);
    }

    /// <summary>Share a parent's story (multipart/form-data). It is reviewed before anyone else sees it.</summary>
    [HttpPost]
    [EnableRateLimiting(RateLimits.Upload)]
    [RequestSizeLimit(MaxRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxRequestBytes)]
    [Consumes("multipart/form-data")]
    [ProducesResponseType(typeof(ShareParentStoryResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Share([FromForm] ShareParentStoryForm form, CancellationToken ct)
    {
        var actor = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        if (!await features.IsOnAsync("parents-voices", ct))
            return Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: "Parents' Voices isn't available right now.");
        var problems = new Dictionary<string, string[]>();
        void Refuse(string field, string message) => problems[field] = [message];
        string? Clean(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();

        var shownName = form.Anonymous ? null : Clean(form.ShownName);
        if (!form.Anonymous && shownName is null) Refuse(nameof(form.ShownName), "Add a name to show, or choose to stay anonymous.");
        foreach (var (field, value) in new[] { ("ShownName", shownName), ("StateName", form.StateName), ("City", form.City),
                     ("Title", form.Title), ("Story", form.Story), ("Wish", form.Wish) })
            if (value is not null && (value.Contains('<') || value.Contains('>'))) Refuse(field, "Text can't contain < or >.");
        if (!(form.ConsentParent && form.ConsentTerms)) Refuse("Consents", "Please tick both boxes to continue.");

        var photo = await ReadFile(form.Photo, FileTypes.MaxPhotoBytes, d => FileTypes.Image(d), "Photo", "Choose a JPG, PNG or WebP photo up to 10 MB.", problems, ct);
        var video = await ReadFile(form.Video, FileTypes.MaxVideoBytes, d => FileTypes.Video(d), "Video", "Choose an MP4, WebM or MOV video up to 50 MB.", problems, ct);
        var voice = await ReadFile(form.Voice, FileTypes.MaxVoiceBytes, d => FileTypes.Audio(d), "Voice", "Choose a voice note (audio) up to 5 MB.", problems, ct);

        if (problems.Count > 0)
        {
            log.LogWarning("Parent story refused for {Actor}: {Fields}", actor, string.Join(", ", problems.Keys));
            return ValidationProblem(new ValidationProblemDetails(problems));
        }

        var (created, refused) = await stories.CreateAsync(User.GetUserId(), new ParentStoryRepository.NewStory(
            form.WrittenBy, form.ParentRole, shownName, form.Age, form.CountryCode, Clean(form.StateName), Clean(form.City),
            form.Title.Trim(), form.Story.Trim(), Clean(form.Wish), photo, video, voice), ct);
        if (created is null)
        {
            log.LogWarning("Parent story refused by the database for {Actor}: {Problem}", actor, refused);
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: refused);
        }
        log.LogInformation("Parent story {Reference} ({WrittenBy}; {Files}) shared by {Actor}", created.Reference, form.WrittenBy,
            string.Join("+", new[] { photo is null ? null : "photo", video is null ? null : "video", voice is null ? null : "voice" }.Where(x => x is not null)), actor);
        return StatusCode(StatusCodes.Status201Created, new ShareParentStoryResponse(created.PublicId, created.Reference));
    }

    /// <summary>Send (or take back) my love on an approved story. Signed-in visitors; once each.</summary>
    [HttpPut("{publicId:guid}/love")]
    [EnableRateLimiting(RateLimits.Auth)]
    [ProducesResponseType(typeof(ParentStoryLoveResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Love(Guid publicId, SetParentStoryLoveRequest request, CancellationToken ct)
    {
        var (loves, problem) = await stories.SetLoveAsync(User.GetUserId(), publicId, request.Loved!.Value, ct);
        if (loves is null)
        {
            log.LogWarning("Love on story {PublicId} refused for {Actor}: {Problem}", publicId, User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value, problem);
            return Problem(statusCode: StatusCodes.Status404NotFound, title: problem);
        }
        log.LogInformation("Love on story {PublicId} {State} by {Actor}", publicId, request.Loved.Value ? "sent" : "taken back", User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value);
        return Ok(new ParentStoryLoveResponse(loves.Value, request.Loved.Value));
    }

    /// <summary>The stories I sent love to.</summary>
    [HttpGet("loves/mine")]
    [ProducesResponseType(typeof(IReadOnlyList<Guid>), StatusCodes.Status200OK)]
    public async Task<IActionResult> MyLoves(CancellationToken ct) => Ok(await stories.MyLovesAsync(User.GetUserId(), ct));

    /// <summary>What anyone may see: the shown name (none when anonymous), age, town and state — never contact details.</summary>
    private static ParentStoryResponse ToPublic(ParentStoryRepository.StoryRow s) => new(
        s.PublicId, s.WrittenBy, s.ParentRole, s.ShownName, s.Age,
        string.Join(", ", new[] { s.City, s.StateName }.Where(x => !string.IsNullOrWhiteSpace(x))) is { Length: > 0 } place ? place : null,
        s.CountryCode, s.Title, s.Story, s.Wish, s.ApprovedAtUtc, s.PhotoId, s.VideoId, s.VoiceId, s.IsFeatured, s.Loves);

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
