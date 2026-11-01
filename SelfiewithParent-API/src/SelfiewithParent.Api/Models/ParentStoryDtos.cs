using System.ComponentModel.DataAnnotations;

namespace SelfiewithParent.Api.Models;

// ---------- Parents' Voices: sharing a parent's story (website, signed in) ----------

/// <summary>
/// The story form (multipart/form-data): the story, plus optional files "photo" (PNG / JPEG / WebP, up to 10 MB),
/// "video" (MP4 / WebM / MOV, up to 50 MB) and "voice" (WebM / Ogg / MP3 / M4A / WAV, up to 5 MB).
/// </summary>
public sealed class ShareParentStoryForm
{
    /// <summary>parent (I am the parent), family, or friend (a friend, neighbour or volunteer, with the parent's agreement).</summary>
    [Required, RegularExpression("^(parent|family|friend)$", ErrorMessage = "Please tell us who is writing.")]
    public string WrittenBy { get; init; } = "";

    /// <summary>mother, father or both.</summary>
    [Required, RegularExpression("^(mother|father|both)$", ErrorMessage = "Please choose mother, father or both.")]
    public string ParentRole { get; init; } = "";

    /// <summary>The name to show. Empty with Anonymous: shown as "A mother from Kochi".</summary>
    [StringLength(60)]
    public string? ShownName { get; init; }

    public bool Anonymous { get; init; }

    [Range(40, 120, ErrorMessage = "Age must be between 40 and 120.")]
    public byte? Age { get; init; }

    [Required, RegularExpression("^[A-Z]{2}$", ErrorMessage = "Please choose the country.")]
    public string CountryCode { get; init; } = "";

    [StringLength(60)]
    public string? StateName { get; init; }

    [StringLength(60)]
    public string? City { get; init; }

    [Required(ErrorMessage = "Give the story a short title."), StringLength(120, MinimumLength = 3, ErrorMessage = "The title can be 3 to 120 characters.")]
    public string Title { get; init; } = "";

    [Required(ErrorMessage = "Please write the story."), StringLength(3000, MinimumLength = 40, ErrorMessage = "The story can be 40 to 3,000 characters.")]
    public string Story { get; init; } = "";

    /// <summary>Optional: "If my children read this…".</summary>
    [StringLength(300)]
    public string? Wish { get; init; }

    /// <summary>The parent agrees to the story being shown (when someone else writes it: the parent told them so); terms accepted.</summary>
    public bool ConsentParent { get; init; }
    public bool ConsentTerms { get; init; }

    public IFormFile? Photo { get; init; }
    public IFormFile? Video { get; init; }
    public IFormFile? Voice { get; init; }
}

public sealed record ShareParentStoryResponse(Guid PublicId, string Reference);

/// <summary>What anyone may see of an approved story: the shown name (or "anonymous"), age, town — never contact details.</summary>
public sealed record ParentStoryResponse(Guid PublicId, string WrittenBy, string ParentRole, string? ShownName, byte? Age, string? Place,
    string CountryCode, string Title, string Story, string? Wish, DateTime ApprovedAtUtc, Guid? PhotoId, Guid? VideoId, Guid? VoiceId,
    bool IsFeatured, int Loves);

public sealed record ParentStoryPageResponse(IReadOnlyList<ParentStoryResponse> Items, int Total, int Page, int PageSize);

public sealed record SetParentStoryLoveRequest
{
    [Required]
    public bool? Loved { get; init; }
}

public sealed record ParentStoryLoveResponse(int Loves, bool Loved);

// ---------- Review (admin site) ----------

public sealed record ParentStoryFileResponse(Guid PublicId, string Role, string ContentType, int SizeBytes);

public sealed record ParentStoryReviewItem(Guid PublicId, string Reference, string WrittenBy, string ParentRole, string? ShownName, byte? Age,
    string CountryCode, string? StateName, string? City, string Title, string Story, string? Wish, string Status, string? ReviewNote,
    string? ReviewedBy, DateTime? ReviewedAtUtc, DateTime CreatedAtUtc, bool IsFeatured, int Loves, string? OwnerEmail,
    IReadOnlyList<ParentStoryFileResponse> Files);

public sealed record ParentStoryReviewPage(IReadOnlyList<ParentStoryReviewItem> Items, int Total, int Page, int PageSize, int Pending, int Approved, int Rejected);

public sealed record ReviewParentStoryRequest
{
    /// <summary>Approved, Rejected, or Pending (undo a decision).</summary>
    [Required, RegularExpression("^(Approved|Rejected|Pending)$")]
    public string Status { get; init; } = "";

    /// <summary>Required to reject (at least 5 characters).</summary>
    [StringLength(300)]
    public string? Note { get; init; }

    /// <summary>Show it at the top of Parents' Voices (approved stories only). Empty: leave as it is.</summary>
    public bool? Featured { get; init; }
}
