using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace SelfiewithParent.Api.Giving;

/// <summary>
/// Razorpay keys (Dashboard › Account &amp; Settings › API keys / Webhooks). Never in appsettings or source control: set them
/// in the server's secret store or environment (Razorpay__KeyId, Razorpay__KeySecret, Razorpay__WebhookSecret).
/// Test keys start with rzp_test_ — use them until the account is approved.
/// </summary>
public sealed class RazorpayOptions
{
    public string KeyId { get; set; } = "";
    public string KeySecret { get; set; } = "";
    public string WebhookSecret { get; set; } = "";
    public bool IsConfigured => !string.IsNullOrWhiteSpace(KeyId) && !string.IsNullOrWhiteSpace(KeySecret);
    public bool IsTestMode => KeyId.StartsWith("rzp_test_", StringComparison.Ordinal);
}

/// <summary>
/// Online donations through Razorpay: the API creates an order for the exact amount, the visitor pays in Razorpay's own
/// checkout (the website never sees card or bank details), and the payment is trusted only when Razorpay's signature
/// checks out — from the checkout's callback or the webhook, whichever comes first.
/// </summary>
public sealed class RazorpayGateway(HttpClient http, IOptions<RazorpayOptions> options, ILogger<RazorpayGateway> log)
{
    private readonly RazorpayOptions _o = options.Value;

    public bool IsConfigured => _o.IsConfigured;
    public bool IsTestMode => _o.IsTestMode;
    public bool HasWebhookSecret => !string.IsNullOrWhiteSpace(_o.WebhookSecret);
    public string KeyId => _o.KeyId;

    /// <summary>Creates an order for <paramref name="amountRupees"/> (auto-captured on payment). Null when Razorpay refused / can't be reached.</summary>
    public async Task<string?> CreateOrderAsync(decimal amountRupees, string receipt, IDictionary<string, string> notes, CancellationToken ct)
    {
        var body = JsonSerializer.Serialize(new { amount = (long)Math.Round(amountRupees * 100), currency = "INR", receipt, payment_capture = 1, notes });
        using var req = new HttpRequestMessage(HttpMethod.Post, "https://api.razorpay.com/v1/orders") { Content = new StringContent(body, Encoding.UTF8, "application/json") };
        req.Headers.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes($"{_o.KeyId}:{_o.KeySecret}")));
        try
        {
            using var res = await http.SendAsync(req, ct);
            var text = await res.Content.ReadAsStringAsync(ct);
            if (!res.IsSuccessStatusCode)
            {
                log.LogError("Razorpay refused the order ({Status}): {Body}", (int)res.StatusCode, text.Length > 300 ? text[..300] : text);
                return null;
            }
            using var doc = JsonDocument.Parse(text);
            return doc.RootElement.GetProperty("id").GetString();
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            log.LogError(ex, "Razorpay order could not be created");
            return null;
        }
    }

    /// <summary>The checkout's success callback: HMAC-SHA256(order_id|payment_id, key secret) must equal the signature.</summary>
    public bool IsValidPaymentSignature(string orderId, string paymentId, string signature) =>
        Matches(Hmac(_o.KeySecret, $"{orderId}|{paymentId}"), signature);

    /// <summary>A webhook: HMAC-SHA256(raw body, webhook secret) must equal the X-Razorpay-Signature header.</summary>
    public bool IsValidWebhookSignature(string rawBody, string? signature) =>
        HasWebhookSecret && signature is not null && Matches(Hmac(_o.WebhookSecret, rawBody), signature);

    private static string Hmac(string secret, string data) =>
        Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(data))).ToLowerInvariant();

    private static bool Matches(string expected, string given) =>
        given.Length == expected.Length && CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(expected), Encoding.ASCII.GetBytes(given.ToLowerInvariant()));
}
