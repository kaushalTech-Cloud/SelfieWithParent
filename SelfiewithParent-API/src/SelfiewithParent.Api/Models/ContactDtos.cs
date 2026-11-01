using System.ComponentModel.DataAnnotations;

namespace SelfiewithParent.Api.Models;

/// <summary>The website's contact details ("Get in touch" and the top bar). An empty value is not shown.</summary>
public sealed record ContactDetailsResponse(string Email, string Phone, string Address);

public sealed record ContactDetailsRequest
{
    [StringLength(200)] public string? Email { get; init; }
    [StringLength(40)] public string? Phone { get; init; }
    [StringLength(200)] public string? Address { get; init; }
}

/// <summary>The contact form.</summary>
public sealed record ContactMessageRequest
{
    [Required(ErrorMessage = "Please tell us your name."), StringLength(60)]
    public string Name { get; init; } = "";

    [Required(ErrorMessage = "Enter a valid email address."), EmailAddress(ErrorMessage = "Enter a valid email address."), StringLength(254)]
    public string Email { get; init; } = "";

    [StringLength(100)]
    public string? Subject { get; init; }

    [Required(ErrorMessage = "Please write your message."), StringLength(1000)]
    public string Message { get; init; } = "";
}

/// <summary>A contact-form message in the admin inbox (the sender's email in full, so staff can reply).</summary>
public sealed record ContactMessageResponse(Guid PublicId, string Name, string Email, string? Subject, string Message, string Status,
    DateTime CreatedAtUtc, DateTime? ReadAtUtc, string? ReadBy, bool FromAccount);

public sealed record ContactMessagePageResponse(IReadOnlyList<ContactMessageResponse> Items, int Total, int Page, int PageSize,
    int New, int Read, int Archived);

/// <summary>For the admin site's notification: how many messages are new, the latest one's time and sender's name.</summary>
public sealed record UnreadMessagesResponse(int Count, DateTime? LatestAtUtc, string? LatestFrom);

public sealed record ContactMessageStatusRequest
{
    [Required, RegularExpression("^(New|Read|Archived)$")]
    public string Status { get; init; } = "";
}
