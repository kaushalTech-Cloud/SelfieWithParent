using System.ComponentModel.DataAnnotations;

namespace SelfiewithParent.Api.Models;

// ---------- Sharing a selfie (website, signed in) ----------

/// <summary>
/// The upload form (multipart/form-data): the details, plus files "photo" (PNG / JPEG / WebP, up to 10 MB),
/// "source" (AI-made only: the original photo, optional), "video" (MP4 / WebM / MOV, up to 50 MB) and "voice"
/// (optional voice note with a photo: WebM / Ogg / MP3 / M4A / WAV audio, up to 5 MB).
/// A photo or a video is needed; a family can share both.
/// </summary>
public sealed class ShareSelfieForm
{
    /// <summary>real, ai, memory or family.</summary>
    [Required, RegularExpression("^(real|ai|memory|family|thennow)$", ErrorMessage = "Choose what kind of photo it is.")]
    public string Kind { get; init; } = "";

    [Required(ErrorMessage = "Please tell us your name."), StringLength(60)]
    public string YourName { get; init; } = "";

    /// <summary>The parent / grandparent (for a family: the family's name).</summary>
    [Required(ErrorMessage = "Please add their name."), StringLength(60)]
    public string ParentName { get; init; } = "";

    /// <summary>Mother, Father, Both parents, Grandmother, Grandfather, Grandparents, Step-parent or Guardian (not for a family).</summary>
    [RegularExpression("^(Mother|Father|Both parents|Grandmother|Grandfather|Grandparents|Step-parent|Guardian)$", ErrorMessage = "Please choose who they are.")]
    public string? Relation { get; init; }

    /// <summary>Family only: 2 … 10, 11-15 or 16+.</summary>
    [RegularExpression("^([2-9]|10|11-15|16\\+)$", ErrorMessage = "Please choose how many people are in it.")]
    public string? FamilySize { get; init; }

    /// <summary>Family only, optional: 2, 3 or 4+.</summary>
    [RegularExpression("^(2|3|4\\+)$")]
    public string? Generations { get; init; }

    /// <summary>In loving memory only, optional: the year they passed.</summary>
    [Range(1900, 2100)]
    public short? MemoryYear { get; init; }

    [Required, RegularExpression("^[A-Z]{2}$", ErrorMessage = "Please choose your country.")]
    public string CountryCode { get; init; } = "";

    [StringLength(60)]
    public string? StateName { get; init; }

    [StringLength(60)]
    public string? City { get; init; }

    [Required(ErrorMessage = "Please tell us whether you are 18 or older.")]
    public bool? IsAdult { get; init; }

    /// <summary>Under 18 only.</summary>
    [StringLength(60)]
    public string? GuardianName { get; init; }

    /// <summary>Under 18 only: dial code, e.g. +91.</summary>
    [RegularExpression(@"^\+[1-9]\d{0,3}$")]
    public string? GuardianCountryCode { get; init; }

    /// <summary>Under 18 only: the number without the dial code.</summary>
    [StringLength(20)]
    public string? GuardianMobile { get; init; }

    [StringLength(300)]
    public string? Message { get; init; }

    /// <summary>Everyone in it (or their guardian) agrees to it being shown; I took it / may share it; I accept the terms.</summary>
    public bool ConsentShown { get; init; }
    public bool ConsentOwn { get; init; }
    public bool ConsentTerms { get; init; }
    /// <summary>Under 18 only: my parent / guardian is with me and agrees.</summary>
    public bool GuardianConsent { get; init; }

    public IFormFile? Photo { get; init; }
    public IFormFile? Source { get; init; }
    public IFormFile? Video { get; init; }
    /// <summary>Optional voice note (up to 5 MB), only with a photo or AI-made photo — not with a video or a family share.</summary>
    public IFormFile? Voice { get; init; }
    /// <summary>Then &amp; Now only (Kind thennow): the old photo; "photo" is the same picture today.</summary>
    public IFormFile? Then { get; init; }
    /// <summary>Then &amp; Now only, optional: the years of the old and the new photo.</summary>
    [Range(1900, 2100)]
    public short? ThenYear { get; init; }
    [Range(1900, 2100)]
    public short? NowYear { get; init; }
}

/// <summary>Reference: shown to the visitor (e.g. SWP-000123).</summary>
public sealed record ShareSelfieResponse(Guid PublicId, string Reference);

/// <summary>The country, state / region and town of my latest upload.</summary>
public sealed record MyPlaceResponse(string CountryCode, string? StateName, string? City);

// ---------- Photo Frames ----------

/// <summary>
/// Sharing my approved photo selfie in a frame (multipart/form-data): "picture" is the framed picture made on the frame page
/// (JPEG / PNG / WebP, up to 10 MB). It is reviewed before it shows in the Photo Frames gallery.
/// </summary>
public sealed class ShareFrameForm
{
    /// <summary>design-colour (e.g. arch-marigold) for an everyday frame, or festival-{id} (e.g. festival-diwali).</summary>
    [Required, StringLength(40), RegularExpression("^[a-z]+-[a-z]+$", ErrorMessage = "Choose a frame.")]
    public string Style { get; init; } = "";

    /// <summary>The festival / event (e.g. diwali); empty for an everyday frame.</summary>
    [StringLength(20), RegularExpression("^[a-z]+$")]
    public string? Festival { get; init; }

    public IFormFile? Picture { get; init; }
}

/// <summary>A shared frame: Status Pending (waits for review) or Approved (auto-approve is on: it's in the gallery already).</summary>
public sealed record FrameSharedResponse(Guid PublicId, string Reference, string Status);

/// <summary>Whether visitors' photo frames go straight to the Photo Frames gallery (no review first).</summary>
public sealed record FrameSettingsResponse(bool AutoApprove);

public sealed record FrameSettingsRequest
{
    [Required]
    public bool? AutoApprove { get; init; }
}

/// <summary>CanShare: it's my own approved photo selfie. Status: my reel of it (Pending / Approved), or null.</summary>
public sealed record ReelShareStateResponse(bool CanShare, string? Status);

/// <summary>A frame I've already shared of this selfie (Pending or Approved).</summary>
public sealed record SharedFrameResponse(string Style, string Status);

/// <summary>CanShare: it's my own approved photo selfie. Shared: the frames of it I've already shared.</summary>
public sealed record FrameShareStateResponse(bool CanShare, IReadOnlyList<SharedFrameResponse> Shared);

/// <summary>An approved framed photo as anyone sees it (first name only, no contact details). StoryId: the selfie's story page, while it's shown.</summary>
public sealed record FrameItemResponse(Guid PublicId, string Name, string? Place, string CountryCode, string? Festival, string Style,
    DateTime ApprovedAtUtc, Guid PhotoId, Guid? StoryId, int Likes = 0);

public sealed record FilterCountResponse(string Key, int Count);

/// <summary>A page of the Photo Frames gallery, and the countries / festivals that have frames (with how many) for the filters.</summary>
public sealed record FramePageResponse(IReadOnlyList<FrameItemResponse> Items, int Total, int Page, int PageSize,
    IReadOnlyList<FilterCountResponse> Countries, IReadOnlyList<FilterCountResponse> Festivals);

/// <summary>My profile photo's id (a new one every time the photo changes).</summary>
public sealed record ProfilePhotoResponse(Guid PhotoId);

// ---------- Public gallery ----------

/// <summary>
/// An approved selfie as anyone sees it: the visitor's first name, the parent's name as they typed it (e.g. "Mom and Dad"),
/// the town / state (never contact details), the message, and
/// the photo / video (GET /api/v1/selfies/files/{id}).
/// </summary>
public sealed record GalleryItemResponse(Guid PublicId, string Kind, string Name, string FirstName, string ParentName, string? Relation, short? MemoryYear, string? Place,
    string? Message, DateTime ApprovedAtUtc, Guid? PhotoId, Guid? VideoId, Guid? VoiceId = null,
    Guid? ThenId = null, short? ThenYear = null, short? NowYear = null, bool IsFeatured = false, int Candles = 0, int Likes = 0,
    bool IsWinner = false);

/// <summary>One approved selfie (its story page) and the gallery tab it belongs to.</summary>
/// <summary>One approved selfie (its story page), the gallery tab it belongs to, and the contests it has won.</summary>
public sealed record StoryResponse(string Tab, GalleryItemResponse Item, IReadOnlyList<ContestResponse>? Wins = null);

public sealed record GalleryPageResponse(string Tab, IReadOnlyList<GalleryItemResponse> Items, int Total, int Page, int PageSize,
    IReadOnlyDictionary<string, int> Counts);

// ---------- Admin dashboard ----------

/// <summary>A number this week and last week (for the "vs last week" line).</summary>
public sealed record WeekNumber(int ThisWeek, int LastWeek);

public sealed record DashboardDay(DateOnly Day, int Count);

/// <summary>A waiting submission for the dashboard's queue preview (reviewers only): first name and reference, no contact details.</summary>
public sealed record DashboardQueueItem(Guid PublicId, string Reference, string Kind, string Name, DateTime CreatedAtUtc, bool HasPhoto, bool HasVideo, bool HasVoice);

public sealed record DashboardResponse(
    int Pending, DateTime? OldestPendingAtUtc, WeekNumber ApprovedWeek, WeekNumber SharedWeek, WeekNumber VideosWeek, WeekNumber NewVisitorsWeek,
    int Total, int Approved, int Rejected, int Uploaders, int Photos, int Videos, int VoiceNotes, int Visitors,
    IReadOnlyList<DashboardDay> Last7Days, IReadOnlyDictionary<string, int> ByKind, IReadOnlyList<DashboardQueueItem>? Queue);

/// <summary>A visitor who has shared something: what and how many. Contact details masked.</summary>
public sealed record UploaderResponse(Guid PublicId, string? FullName, string? EmailMasked, string? MobileMasked, string Status,
    int Submissions, int Pending, int Approved, int Rejected, int Photos, int Videos, int VoiceNotes, DateTime FirstAtUtc, DateTime LastAtUtc);

public sealed record UploaderPageResponse(IReadOnlyList<UploaderResponse> Items, int Total, int Page, int PageSize);

// ---------- Activity (admin) ----------

/// <summary>One thing that happened: Type "shared" (a visitor uploaded), "Approved" or "Rejected" (the latest review decision).</summary>
public sealed record ActivityItem(string Type, DateTime AtUtc, Guid PublicId, string Reference, string Kind, string Name, string? Reviewer,
    string? Note, bool HasPhoto, bool HasVideo, bool HasVoice);

public sealed record ActivityDayResponse(DateOnly Day, int Shared, int Approved, int Rejected);

public sealed record ActivityPageResponse(IReadOnlyList<ActivityItem> Items, int Total, int Page, int PageSize, int Days,
    IReadOnlyList<ActivityDayResponse> PerDay);

// ---------- Review (admin) ----------

public sealed record SubmissionFileResponse(Guid PublicId, string Role, string ContentType, int SizeBytes, string? FileName);

public sealed record SubmissionResponse(Guid PublicId, string Reference, string Kind, string YourName, string ParentName, string? Relation,
    string? FamilySize, string? Generations, short? MemoryYear, string CountryCode, string? StateName, string? City, bool IsAdult,
    string? GuardianName, string? GuardianMobileMasked, string? Message, string Status, string? ReviewNote, string? ReviewedBy,
    DateTime? ReviewedAtUtc, DateTime CreatedAtUtc, string? OwnerEmailMasked, IReadOnlyList<SubmissionFileResponse> Files,
    short? ThenYear = null, short? NowYear = null, bool IsFeatured = false, int Candles = 0,
    string? FrameStyle = null, string? Festival = null, string? SourceReference = null);

public sealed record SetFeaturedRequest
{
    [Required]
    public bool? IsFeatured { get; init; }
}

public sealed record SetCandleRequest
{
    [Required]
    public bool? Lit { get; init; }
}

/// <summary>The tribute's candle count after the change, and whether my candle is lit.</summary>
public sealed record CandleResponse(int Candles, bool Lit);

public sealed record SubmissionPageResponse(IReadOnlyList<SubmissionResponse> Items, int Total, int Page, int PageSize,
    int Pending, int Approved, int Rejected);

public sealed record ReviewSubmissionRequest
{
    /// <summary>Approved, Rejected, or Pending (undo a decision).</summary>
    [Required, RegularExpression("^(Approved|Rejected|Pending)$")]
    public string Status { get; init; } = "";

    /// <summary>Required to reject (at least 5 characters): why it can't be shown.</summary>
    [StringLength(300)]
    public string? Note { get; init; }
}
