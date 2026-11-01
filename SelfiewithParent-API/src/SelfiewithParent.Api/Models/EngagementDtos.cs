using System.ComponentModel.DataAnnotations;

namespace SelfiewithParent.Api.Models;

// ---------- Likes ----------

public sealed record SetLikeRequest
{
    [Required]
    public bool? Liked { get; init; }
}

/// <summary>The selfie's like count after the change, and whether I like it.</summary>
public sealed record LikeResponse(int Likes, bool Liked);

// ---------- Family dates and reminders ----------

/// <summary>A family date I want to be reminded of.</summary>
public sealed record FamilyDateResponse(Guid PublicId, string Name, string Relation, string Occasion, int Month, int Day, int? Year,
    int DaysUntil);

public sealed record SaveFamilyDateRequest
{
    /// <summary>Who it is, e.g. "Papa", "Nani", "Maa and Papa".</summary>
    [Required(ErrorMessage = "Add their name."), StringLength(60)]
    public string Name { get; init; } = "";

    [Required, RegularExpression("^(Mother|Father|Parents|Grandmother|Grandfather|Grandparents|Step-parent|Guardian|Other)$",
        ErrorMessage = "Choose who they are.")]
    public string Relation { get; init; } = "";

    [Required, RegularExpression("^(Birthday|Anniversary|Remembrance)$", ErrorMessage = "Choose the occasion.")]
    public string Occasion { get; init; } = "";

    [Required, Range(1, 12, ErrorMessage = "Choose the month.")]
    public int? Month { get; init; }

    [Required, Range(1, 31, ErrorMessage = "Choose the day.")]
    public int? Day { get; init; }

    /// <summary>Optional: the year (to say "turning 60" / "35 years").</summary>
    [Range(1900, 2100)]
    public int? Year { get; init; }
}

public sealed record ReminderSettingsResponse(bool EmailReminders, bool ThenNowNudges);

public sealed record ReminderSettingsRequest
{
    [Required] public bool? EmailReminders { get; init; }
    [Required] public bool? ThenNowNudges { get; init; }
}

/// <summary>A family date within the next two weeks (shown as a notice when I'm signed in).</summary>
public sealed record UpcomingDateResponse(Guid PublicId, string Name, string Relation, string Occasion, DateOnly Date, int DaysAway,
    int? Turning);

/// <summary>"A year ago you shared this": one of my approved selfies around its anniversary.</summary>
public sealed record SelfieAnniversaryResponse(Guid PublicId, string ParentName, int Years, Guid PhotoId);

public sealed record UpcomingResponse(IReadOnlyList<UpcomingDateResponse> Dates, IReadOnlyList<SelfieAnniversaryResponse> Anniversaries);

/// <summary>The "switch off reminders" link from an email: the account and the link's signature.</summary>
public sealed record RemindersOffRequest
{
    [Required] public Guid? User { get; init; }
    [Required, StringLength(100)] public string Token { get; init; } = "";
}
