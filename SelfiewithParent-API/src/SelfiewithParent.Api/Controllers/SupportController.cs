using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using Microsoft.AspNetCore.RateLimiting;
using SelfiewithParent.Api.Content;
using SelfiewithParent.Api.Data;
using SelfiewithParent.Api.Giving;
using SelfiewithParent.Api.Security;

namespace SelfiewithParent.Api.Controllers;

public sealed record CampaignResponse(Guid PublicId, string Slug, string Title, string? Summary, string? Story, string? Image, decimal GoalAmount,
    decimal Raised, int Donors, DateTime? EndsAtUtc, bool IsFeatured);
public sealed record WallResponse(string? Name, decimal Amount, string? InHonourOf, string? Campaign, DateTime PaidAtUtc);
public sealed record DonationsState(bool Open, bool TestMode);
public sealed record SupportResponse(SupportContent? En, SupportContent? Local, IReadOnlyList<CampaignResponse> Campaigns,
    decimal Raised, int Donors, int CampaignsRun, IReadOnlyList<WallResponse> Wall, DonationsState Donations);

public sealed record StartDonationRequest
{
    /// <summary>Empty: wherever it's needed most.</summary>
    public Guid? CampaignId { get; init; }
    [Required, Range(10, 1_000_000, ErrorMessage = "Choose an amount between ₹10 and ₹10,00,000.")]
    public decimal? Amount { get; init; }
    [Required(ErrorMessage = "Please tell us your name."), StringLength(100, MinimumLength = 2)]
    public string Name { get; init; } = "";
    [Required(ErrorMessage = "Enter your email for the receipt."), EmailAddress(ErrorMessage = "Enter a valid email address."), StringLength(254)]
    public string Email { get; init; } = "";
    [RegularExpression(@"^\+?[0-9 ()-]{7,20}$", ErrorMessage = "Enter a valid phone number.")]
    public string? Phone { get; init; }
    /// <summary>For an 80G tax receipt (India).</summary>
    [RegularExpression("^[A-Za-z]{5}[0-9]{4}[A-Za-z]$", ErrorMessage = "Enter a valid PAN (e.g. ABCDE1234F).")]
    public string? Pan { get; init; }
    [StringLength(100)] public string? InHonourOf { get; init; }
    [StringLength(300)] public string? Message { get; init; }
    public bool ShowOnWall { get; init; }
    [StringLength(60)] public string? WallName { get; init; }
}

/// <summary>What the website needs to open Razorpay's checkout for this donation.</summary>
public sealed record StartDonationResponse(Guid DonationId, string OrderId, string KeyId, long AmountPaise, string Currency, string Name, string Email, string? Phone);

public sealed record ConfirmDonationRequest
{
    [Required, StringLength(60)] public string OrderId { get; init; } = "";
    [Required, StringLength(60)] public string PaymentId { get; init; } = "";
    [Required, StringLength(200)] public string Signature { get; init; } = "";
}
public sealed record ConfirmDonationResponse(string ReceiptNo, decimal Amount, string? Campaign, bool ReceiptEmailed);
public sealed record CancelDonationRequest { [Required, StringLength(60)] public string OrderId { get; init; } = ""; [StringLength(200)] public string? Reason { get; init; } }

/// <summary>
/// Support Selfie with Parent: the Support page (content, campaigns, totals, donor wall) and online donations through
/// Razorpay. Donations stay closed until staff switch them on in the admin site AND the Razorpay keys are set up.
/// </summary>
[ApiController]
[Route("api/v1/support")]
[Produces("application/json")]
public sealed class SupportController(GivingRepository giving, RazorpayGateway gateway, DonationReceipts receipts, FeatureRepository features, ILogger<SupportController> log) : ControllerBase
{
    private static readonly string[] Languages = ["en", "hi", "bn", "ar", "es", "fr"];

    public static CampaignResponse ToResponse(GivingRepository.CampaignRow c) =>
        new(c.PublicId, c.Slug, c.Title, c.Summary, c.Story, c.Image, c.GoalAmount, c.Raised, c.Donors, c.EndsAtUtc, c.IsFeatured);

    /// <summary>The Support page: its words (English + this language), live campaigns, totals, the donor wall, whether giving is open.</summary>
    [HttpGet]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.PublicContent)]
    [OutputCache(PolicyName = PublicCache.Content)]
    [ProducesResponseType(typeof(SupportResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Get([FromQuery] string? lang, CancellationToken ct)
    {
        var l = lang is not null && Languages.Contains(lang) ? lang : "en";
        var en = (await giving.GetContentAsync("en", ct)).Content;
        var local = l == "en" ? null : (await giving.GetContentAsync(l, ct)).Content;
        var totals = await giving.TotalsAsync(ct);
        var open = gateway.IsConfigured && await giving.EnabledAsync(ct) && await features.IsOnAsync("support", ct);
        return Ok(new SupportResponse(en, local, (await giving.ActiveCampaignsAsync(ct)).Select(ToResponse).ToList(),
            totals.Raised, totals.Donors, totals.Campaigns,
            (await giving.WallAsync(24, ct)).Select(w => new WallResponse(w.WallName, w.Amount, w.InHonourOf, w.CampaignTitle, w.PaidAtUtc)).ToList(),
            new DonationsState(open, open && gateway.IsTestMode)));
    }

    /// <summary>Start a donation: creates the Razorpay order and the donation record ('Created'). Anyone may give.</summary>
    [HttpPost("donations")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.Auth)]
    [ProducesResponseType(typeof(StartDonationResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> Start(StartDonationRequest r, CancellationToken ct)
    {
        if (!gateway.IsConfigured || !await giving.EnabledAsync(ct) || !await features.IsOnAsync("support", ct))
        {
            log.LogWarning("Donation refused: online giving isn't open (gateway set up: {Configured})", gateway.IsConfigured);
            return Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: "Online donations open soon. Thank you for wanting to help!");
        }
        foreach (var v in new[] { r.Name, r.InHonourOf, r.Message, r.WallName })
            if (v is not null && (v.Contains('<') || v.Contains('>'))) return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Text can't contain < or >.");
        var amount = Math.Round(r.Amount!.Value, 0);
        var orderId = await gateway.CreateOrderAsync(amount, $"swp-{Guid.NewGuid():N}",
            new Dictionary<string, string> { ["campaign"] = r.CampaignId?.ToString() ?? "general", ["purpose"] = "donation" }, ct);
        if (orderId is null) return Problem(statusCode: StatusCodes.Status502BadGateway, title: "We couldn't start the payment. Please try again in a moment.");

        long? userId = User.Identity?.IsAuthenticated == true ? User.GetUserId() : null;
        var (id, problem) = await giving.CreateDonationAsync(userId, new GivingRepository.NewDonation(r.CampaignId, amount, r.Name.Trim(), r.Email.Trim(),
            r.Phone?.Trim(), r.Pan?.Trim().ToUpperInvariant(), r.InHonourOf?.Trim(), r.Message?.Trim(), r.ShowOnWall, r.ShowOnWall ? r.WallName?.Trim() : null, orderId), ct);
        if (id is null)
        {
            log.LogWarning("Donation refused by the database: {Problem}", problem);
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: problem);
        }
        log.LogInformation("Donation {Donation} started: {Amount} INR, order {Order}", id, amount, orderId);
        return Ok(new StartDonationResponse(id.Value, orderId, gateway.KeyId, (long)(amount * 100), "INR", r.Name.Trim(), r.Email.Trim(), r.Phone?.Trim()));
    }

    /// <summary>The checkout says it's paid: trusted only if Razorpay's signature checks out. Returns the receipt.</summary>
    [HttpPost("donations/confirm")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.Auth)]
    [ProducesResponseType(typeof(ConfirmDonationResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Confirm(ConfirmDonationRequest r, CancellationToken ct)
    {
        if (!gateway.IsConfigured || !gateway.IsValidPaymentSignature(r.OrderId, r.PaymentId, r.Signature))
        {
            log.LogWarning("Donation confirmation for order {Order} refused: bad signature", r.OrderId);
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "We couldn't confirm the payment. If money was taken, it will be confirmed automatically — or write to us.");
        }
        var amount = await giving.AmountOfOrderAsync(r.OrderId, ct);
        if (amount is null) return Problem(statusCode: StatusCodes.Status404NotFound, title: "That donation wasn't found.");
        var (paid, problem) = await giving.SetPaidAsync(r.OrderId, r.PaymentId, amount.Value, ct);
        if (paid is null)
        {
            log.LogError("Donation for order {Order} couldn't be marked paid: {Problem}", r.OrderId, problem);
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: problem);
        }
        if (paid.JustPaid) { log.LogInformation("Donation {Receipt} paid ({Amount} INR)", paid.ReceiptNo, paid.Amount); await receipts.SendAsync(paid, ct); }
        return Ok(new ConfirmDonationResponse(paid.ReceiptNo, paid.Amount, paid.CampaignTitle, true));
    }

    /// <summary>The visitor closed the checkout or the payment failed (never changes a paid donation).</summary>
    [HttpPost("donations/cancel")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.Auth)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Cancel(CancelDonationRequest r, CancellationToken ct)
    {
        await giving.SetFailedAsync(r.OrderId, string.IsNullOrWhiteSpace(r.Reason) ? "Checkout closed" : r.Reason.Trim(), ct);
        log.LogInformation("Donation for order {Order} not completed: {Reason}", r.OrderId, r.Reason ?? "checkout closed");
        return NoContent();
    }

    /// <summary>
    /// Razorpay's webhook (Dashboard › Webhooks: this address, events payment.captured, order.paid, payment.failed, and the
    /// webhook secret). Confirms donations even when the visitor's browser closed before returning.
    /// </summary>
    [HttpPost("razorpay/webhook")]
    [AllowAnonymous]
    [ApiExplorerSettings(IgnoreApi = true)]
    public async Task<IActionResult> Webhook(CancellationToken ct)
    {
        using var reader = new StreamReader(Request.Body);
        var raw = await reader.ReadToEndAsync(ct);
        if (!gateway.IsValidWebhookSignature(raw, Request.Headers["X-Razorpay-Signature"].FirstOrDefault()))
        {
            log.LogWarning("Razorpay webhook refused: bad or missing signature");
            return Unauthorized();
        }
        try
        {
            using var doc = JsonDocument.Parse(raw);
            var ev = doc.RootElement.GetProperty("event").GetString();
            if (!doc.RootElement.GetProperty("payload").TryGetProperty("payment", out var p)) return Ok();
            var pay = p.GetProperty("entity");
            var orderId = pay.TryGetProperty("order_id", out var o) ? o.GetString() : null;
            if (orderId is null) return Ok();
            if (ev is "payment.captured" or "order.paid")
            {
                var (paid, problem) = await giving.SetPaidAsync(orderId, pay.GetProperty("id").GetString() ?? "", pay.GetProperty("amount").GetInt64() / 100m, ct);
                if (paid is null) log.LogError("Webhook: order {Order} couldn't be marked paid: {Problem}", orderId, problem);
                else if (paid.JustPaid) { log.LogInformation("Webhook: donation {Receipt} paid", paid.ReceiptNo); await receipts.SendAsync(paid, ct); }
            }
            else if (ev == "payment.failed")
            {
                var reason = pay.TryGetProperty("error_description", out var e) ? e.GetString() : null;
                await giving.SetFailedAsync(orderId, reason ?? "Payment failed", ct);
                log.LogInformation("Webhook: payment for order {Order} failed", orderId);
            }
        }
        catch (Exception ex) when (ex is JsonException or KeyNotFoundException or InvalidOperationException)
        {
            log.LogError(ex, "Razorpay webhook couldn't be read");
        }
        return Ok();   // always 200 for a valid signature, so Razorpay doesn't retry what we can't use
    }
}
