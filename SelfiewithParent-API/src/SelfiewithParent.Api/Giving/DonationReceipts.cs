using System.Globalization;
using System.Net;
using MimeKit;
using SelfiewithParent.Api.Data;
using SelfiewithParent.Api.Security;

namespace SelfiewithParent.Api.Giving;

/// <summary>
/// The thank-you email with the donation receipt (receipt number, amount, date, campaign, PAN when given, the 80G note
/// from the Support page). Sent once, when a donation is first marked paid. A formal 80G certificate (Form 10BE) is issued
/// by the organisation's accountant after the year ends — the email says so.
/// </summary>
public sealed class DonationReceipts(SmtpMailer mailer, GivingRepository giving, ILogger<DonationReceipts> log)
{
    private static readonly CultureInfo India = CultureInfo.GetCultureInfo("en-IN");

    public async Task SendAsync(GivingRepository.PaidDonation d, CancellationToken ct)
    {
        if (!mailer.IsConfigured) { log.LogWarning("Receipt {Receipt} not emailed: email isn't set up", d.ReceiptNo); return; }
        try
        {
            var (content, _) = await giving.GetContentAsync("en", ct);
            var org = content?.Trust?.LegalName ?? "Selfie with Parent";
            var tax = content?.Trust?.TaxNote;
            var amount = d.Amount.ToString("C0", India);
            var date = d.PaidAtUtc.ToString("d MMMM yyyy", India);
            string H(string? s) => WebUtility.HtmlEncode(s ?? "");

            var message = mailer.NewMessage(d.Email, $"Thank you for your gift of {amount} — receipt {d.ReceiptNo}");
            var rows = new List<(string, string)> { ("Receipt number", d.ReceiptNo), ("Amount", amount), ("Date", date), ("Donor", d.DonorName) };
            if (d.CampaignTitle is not null) rows.Add(("For", d.CampaignTitle));
            if (d.InHonourOf is not null) rows.Add(("In honour of", d.InHonourOf));
            if (d.Pan is not null) rows.Add(("PAN", d.Pan));
            var body = new BodyBuilder
            {
                TextBody = $"Dear {d.DonorName},\n\nThank you for your gift to {org}. Because of you, a parent somewhere will feel remembered.\n\n"
                    + string.Join("\n", rows.Select(r => $"{r.Item1}: {r.Item2}"))
                    + (tax is null ? "" : $"\n\n{tax}") + "\n\nPlease keep this email as your receipt.\n\nWith gratitude,\n" + org,
                HtmlBody = $@"<div style=""font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#2b2b2b"">
  <h2 style=""color:#0f5b5c;font-family:Georgia,serif"">Thank you, {H(d.DonorName)}</h2>
  <p>Your gift to <b>{H(org)}</b> has reached us. Because of you, a parent somewhere will feel remembered.</p>
  <table style=""width:100%;border-collapse:collapse;margin:16px 0"">{string.Concat(rows.Select(r =>
      $"<tr><td style=\"padding:6px 8px;color:#777;border-bottom:1px solid #eee\">{H(r.Item1)}</td><td style=\"padding:6px 8px;border-bottom:1px solid #eee\"><b>{H(r.Item2)}</b></td></tr>"))}</table>
  {(tax is null ? "" : $"<p style=\"font-size:13px;color:#555\">{H(tax)}</p>")}
  <p style=""font-size:13px;color:#777"">Please keep this email as your receipt.</p>
  <p>With gratitude,<br>{H(org)}</p></div>"
            };
            message.Body = body.ToMessageBody();
            await mailer.SendAsync(message, "donation receipt", ct);
            await giving.MarkReceiptSentAsync(d.PublicId, ct);
            log.LogInformation("Receipt {Receipt} emailed", d.ReceiptNo);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            log.LogError(ex, "Receipt {Receipt} could not be emailed", d.ReceiptNo);   // the donation stays paid; staff can resend from the record
        }
    }
}
