using System.Text.RegularExpressions;

namespace SelfiewithParent.Api.Content;

// The Support page's words (give.SupportContent), per language, edited in the admin site. Every field is optional: what
// staff leave empty shows the website's built-in text, so the page is never blank.

public sealed class SupportHero { public string? Eyebrow { get; set; } public string? Title { get; set; } public string? Highlight { get; set; } public string? Text { get; set; } public string? Image { get; set; } }
/// <summary>A quick amount and what it does: ₹500 = "one health check-up".</summary>
public sealed class SupportImpact { public decimal? Amount { get; set; } public string? Label { get; set; } public string? Icon { get; set; } }
/// <summary>Another way to help: volunteer, CSR partnership, wishlist, or any link. volunteer / csr open the enquiry form.</summary>
public sealed class SupportWay { public string? Kind { get; set; } public string? Icon { get; set; } public string? Title { get; set; } public string? Text { get; set; } public string? ButtonLabel { get; set; } public string? Link { get; set; } }
public sealed class SupportTrust { public string? LegalName { get; set; } public string? Registration { get; set; } public string? TaxNote { get; set; } public string? Note { get; set; } }
/// <summary>Where the money goes: "Programmes 80%".</summary>
public sealed class SupportFund { public string? Label { get; set; } public int? Percent { get; set; } }
public sealed class SupportReport { public string? Title { get; set; } public string? Link { get; set; } }
public sealed class SupportPartner { public string? Name { get; set; } public string? Logo { get; set; } public string? Link { get; set; } }
public sealed class SupportFaq { public string? Question { get; set; } public string? Answer { get; set; } }

public sealed class SupportContent
{
    public SupportHero? Hero { get; set; }
    public List<SupportImpact>? Impacts { get; set; }
    public List<SupportWay>? Ways { get; set; }
    public SupportTrust? Trust { get; set; }
    public List<SupportFund>? Funds { get; set; }
    public List<SupportReport>? Reports { get; set; }
    public List<SupportPartner>? Partners { get; set; }
    public List<SupportFaq>? Faqs { get; set; }
    /// <summary>Sections staff switched off (English content only).</summary>
    public List<string>? HiddenSections { get; set; }
}

/// <summary>Checks and tidies the Support page's content: lengths, counts, safe links, the website's own pictures, icons.</summary>
public static partial class SupportContentRules
{
    public static readonly string[] WayKinds = ["volunteer", "csr", "wishlist", "link"];
    public static readonly string[] Sections = ["stats", "campaigns", "donate", "ways", "trust", "wall", "partners", "faqs"];
    [GeneratedRegex("^bi-[a-z0-9-]{1,40}$")] private static partial Regex IconPattern();
    [GeneratedRegex(@"^(img/[a-z0-9-]{1,60}\.(svg|png|jpe?g|webp)|media/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$")] private static partial Regex ImagePattern();

    public static (SupportContent? Content, string? Error) Validate(SupportContent c)
    {
        string? error = null;
        string? T(string? v, int max, string what)
        {
            if (string.IsNullOrWhiteSpace(v)) return null;
            v = v.Trim();
            if (v.Length > max) error ??= $"{what} can be up to {max} characters.";
            if (v.Contains('<') || v.Contains('>')) error ??= $"{what} can't contain < or >.";
            return v;
        }
        string? L(string? v, string what)
        {
            v = T(v, 300, what);
            if (v is not null && !PageBlocks.IsSafeUrl(v)) error ??= $"{what} must be a site path (/…), https://, mailto: or tel:.";
            return v;
        }
        string? Img(string? v, string what)
        {
            v = T(v, 80, what);
            if (v is not null && !ImagePattern().IsMatch(v)) error ??= $"{what} must be one of the website's pictures.";
            return v;
        }
        string? Icon(string? v, string what)
        {
            v = T(v, 45, what);
            if (v is not null && !IconPattern().IsMatch(v)) error ??= $"{what} must be an icon name like bi-heart.";
            return v;
        }
        List<TItem>? Many<TItem>(List<TItem>? list, int max, string what, Func<TItem, int, TItem> tidy) where TItem : class
        {
            if (list is null) return null;
            if (list.Count > max) error ??= $"{what}: up to {max}.";
            return list.Take(max).Where(x => x is not null).Select((x, i) => tidy(x, i + 1)).ToList();
        }

        var r = new SupportContent
        {
            Hero = c.Hero is null ? null : new SupportHero
            {
                Eyebrow = T(c.Hero.Eyebrow, 60, "Small heading"), Title = T(c.Hero.Title, 120, "Title"), Highlight = T(c.Hero.Highlight, 120, "Highlighted line"),
                Text = T(c.Hero.Text, 400, "Text"), Image = Img(c.Hero.Image, "Header picture")
            },
            Impacts = Many(c.Impacts, 8, "Amounts", (x, n) =>
            {
                if (x.Amount is not null && (x.Amount < 1 || x.Amount > 10_000_000)) error ??= $"Amount {n} must be between ₹1 and ₹1,00,00,000.";
                return new SupportImpact { Amount = x.Amount is null ? null : Math.Round(x.Amount.Value, 0), Label = T(x.Label, 80, $"Amount {n} label"), Icon = Icon(x.Icon, $"Amount {n} icon") };
            }),
            Ways = Many(c.Ways, 8, "Ways to help", (x, n) =>
            {
                var kind = T(x.Kind, 10, $"Way {n} type");
                if (kind is not null && !WayKinds.Contains(kind)) error ??= $"Way {n}: choose volunteer, CSR, wishlist or link.";
                return new SupportWay { Kind = kind, Icon = Icon(x.Icon, $"Way {n} icon"), Title = T(x.Title, 60, $"Way {n} title"), Text = T(x.Text, 300, $"Way {n} text"),
                    ButtonLabel = T(x.ButtonLabel, 40, $"Way {n} button"), Link = L(x.Link, $"Way {n} link") };
            }),
            Trust = c.Trust is null ? null : new SupportTrust
            {
                LegalName = T(c.Trust.LegalName, 120, "Legal name"), Registration = T(c.Trust.Registration, 200, "Registration"),
                TaxNote = T(c.Trust.TaxNote, 300, "Tax note"), Note = T(c.Trust.Note, 600, "Trust note")
            },
            Funds = Many(c.Funds, 6, "Where the money goes", (x, n) =>
            {
                if (x.Percent is < 0 or > 100) error ??= $"Share {n} must be 0 to 100%.";
                return new SupportFund { Label = T(x.Label, 60, $"Share {n} label"), Percent = x.Percent };
            }),
            Reports = Many(c.Reports, 12, "Reports", (x, n) => new SupportReport { Title = T(x.Title, 100, $"Report {n} title"), Link = L(x.Link, $"Report {n} link") }),
            Partners = Many(c.Partners, 24, "Partners", (x, n) => new SupportPartner { Name = T(x.Name, 80, $"Partner {n} name"), Logo = Img(x.Logo, $"Partner {n} logo"), Link = L(x.Link, $"Partner {n} link") }),
            HiddenSections = HomeContentRules.Hidden(c.HiddenSections, Sections, ref error),
            Faqs = Many(c.Faqs, 20, "Questions", (x, n) => new SupportFaq { Question = T(x.Question, 200, $"Question {n}"), Answer = T(x.Answer, 1000, $"Answer {n}") })
        };
        if (r.Funds is { Count: > 0 } f && f.Sum(x => x.Percent ?? 0) > 100) error ??= "Where the money goes adds up to more than 100%.";
        return error is null ? (r, null) : (null, error);
    }
}
