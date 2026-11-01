using System.ComponentModel.DataAnnotations;

namespace SelfiewithParent.Api.Models;

/// <summary>A contest: Kind "week" (Photo of the Week) or "festival" (e.g. "Diwali 2026"). EndsAtUtc is not included.</summary>
public sealed record ContestResponse(Guid PublicId, string Kind, string Title, DateTime StartsAtUtc, DateTime EndsAtUtc, bool Decided);

/// <summary>A photo in a contest's leaderboard and its votes (likes, not counting the owner's own).</summary>
public sealed record ContestEntryResponse(int Rank, int Votes, GalleryItemResponse Item);

/// <summary>A contest running now and its leaders.</summary>
public sealed record OpenContestResponse(ContestResponse Contest, IReadOnlyList<ContestEntryResponse> Leaders);

public sealed record CurrentContestsResponse(IReadOnlyList<OpenContestResponse> Contests);

/// <summary>A decided contest and its winning photo.</summary>
public sealed record ContestWinnerResponse(ContestResponse Contest, int Votes, GalleryItemResponse Winner);

public sealed record ContestWinnersPageResponse(IReadOnlyList<ContestWinnerResponse> Items, int Total, int Page, int PageSize);

// ---------- Admin ----------

public sealed record AdminContestResponse(Guid PublicId, string Kind, string Title, DateTime StartsAtUtc, DateTime EndsAtUtc,
    DateTime? ClosedAtUtc, int? WinnerLikes, Guid? WinnerPublicId, string? WinnerReference);

public sealed record SaveContestRequest
{
    [Required(ErrorMessage = "Give the contest a name."), StringLength(80, MinimumLength = 2)]
    public string Title { get; init; } = "";

    /// <summary>The first day (UTC midnight).</summary>
    [Required] public DateOnly? StartsOn { get; init; }

    /// <summary>The last day, included (the contest ends at the following UTC midnight).</summary>
    [Required] public DateOnly? EndsOn { get; init; }
}
