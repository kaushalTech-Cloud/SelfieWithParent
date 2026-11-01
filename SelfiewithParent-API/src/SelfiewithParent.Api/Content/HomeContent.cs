using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace SelfiewithParent.Api.Content;

// The home page's content, as super admins / admins edit it (one document per language). Every field is optional: what
// isn't set shows the website's built-in default, so the home page is never blank.

public sealed class HomeSlide
{
    public string? Image { get; set; }
    public string? Eyebrow { get; set; }
    public string? Title { get; set; }
    public string? Highlight { get; set; }
    public string? Text { get; set; }
    public string? Button1Label { get; set; }
    public string? Button1Link { get; set; }
    public string? Button2Label { get; set; }
    public string? Button2Link { get; set; }
}

public sealed class HomeTile
{
    public string? Icon { get; set; }
    public string? Title { get; set; }
    public string? Text { get; set; }
    public string? Link { get; set; }
}

public sealed class HomeStory
{
    public string? Eyebrow { get; set; }
    public string? Title { get; set; }
    public string? Quote { get; set; }
    public string? Name { get; set; }
    public string? Role { get; set; }
    public string? Image { get; set; }
}

/// <summary>An impact number: typed (Value) or counted from the database (Source: selfies, towns, countries, families, visitors).</summary>
public sealed class HomeStat
{
    public string? Label { get; set; }
    public long? Value { get; set; }
    public string? Source { get; set; }
}

public sealed class HomeTheme
{
    /// <summary>0 = January … 11 = December.</summary>
    public int? Month { get; set; }
    public string? Icon { get; set; }
    public string? Title { get; set; }
    public string? Text { get; set; }
}

public sealed class HomePriority
{
    public string? Icon { get; set; }
    public string? Title { get; set; }
    public string? Text { get; set; }
}

public sealed class HomePledge
{
    public string? Title { get; set; }
    public string? Text { get; set; }
    public long? Count { get; set; }
}

public sealed class HomeApp
{
    public string? Title { get; set; }
    public string? Text { get; set; }
    public string? PlayUrl { get; set; }
    public string? AppStoreUrl { get; set; }
}

/// <summary>"What you can do with your selfie": the photo frame, reel, contest and family tree cards (their pictures are built in).</summary>
public sealed class HomeShowcase
{
    public bool? Hidden { get; set; }
    public string? Eyebrow { get; set; }
    public string? Title { get; set; }
    public string? Intro { get; set; }
    public List<HomeShowcaseCard>? Cards { get; set; }
}

public sealed class HomeShowcaseCard
{
    /// <summary>frame, reel, contest or tree.</summary>
    public string? Kind { get; set; }
    public bool? Hidden { get; set; }
    public string? Title { get; set; }
    public string? Text { get; set; }
    public string? Note { get; set; }
    public string? Button { get; set; }
}

public sealed class HomeContent
{
    public List<HomeSlide>? Slides { get; set; }
    public List<HomeTile>? Tiles { get; set; }
    public HomeStory? Story { get; set; }
    public List<HomeStat>? Stats { get; set; }
    public string? StatsNote { get; set; }
    public List<string>? Questions { get; set; }
    public List<HomeTheme>? Themes { get; set; }
    public List<HomePriority>? Priorities { get; set; }
    public HomePledge? Pledge { get; set; }
    public HomeApp? App { get; set; }
    public HomeShowcase? Showcase { get; set; }
    /// <summary>Sections staff switched off (English content only).</summary>
    public List<string>? HiddenSections { get; set; }
}

/// <summary>Checks and tidies home page content: lengths, counts, safe links, our own pictures, Bootstrap icons only.</summary>
public static partial class HomeContentRules
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow
    };

    public static readonly string[] StatSources = ["selfies", "towns", "countries", "families", "visitors"];
    public static readonly string[] ShowcaseKinds = ["frame", "reel", "contest", "tree"];
    public static readonly string[] Sections = ["slider", "tiles", "showcase", "story", "stats", "question", "reminders", "theme", "contest", "featured",
        "priorities", "pledge", "app", "contact"];

    [GeneratedRegex("^bi-[a-z0-9-]{1,40}$")] private static partial Regex IconPattern();
    [GeneratedRegex(@"^(img/[a-z0-9-]{1,60}\.(svg|png|jpe?g|webp)|media/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$")] private static partial Regex ImagePattern();

    /// <summary>The tidied content (empty text → not set), or the first problem found.</summary>
    public static (HomeContent? Content, string? Error) Validate(HomeContent c)
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
            return list.Take(max).Select((x, i) => x is null ? null! : tidy(x, i + 1)).Where(x => x is not null).ToList();
        }

        TFail? Fail<TFail>(string message) where TFail : class { error ??= message; return null; }

        var r = new HomeContent
        {
            Slides = Many(c.Slides, 8, "Slides", (s, n) => new HomeSlide
            {
                Image = Img(s.Image, $"Slide {n} picture"), Eyebrow = T(s.Eyebrow, 60, $"Slide {n} small heading"),
                Title = T(s.Title, 120, $"Slide {n} title"), Highlight = T(s.Highlight, 120, $"Slide {n} highlight"),
                Text = T(s.Text, 400, $"Slide {n} text"),
                Button1Label = T(s.Button1Label, 40, $"Slide {n} first button"), Button1Link = L(s.Button1Link, $"Slide {n} first button link"),
                Button2Label = T(s.Button2Label, 40, $"Slide {n} second button"), Button2Link = L(s.Button2Link, $"Slide {n} second button link")
            }),
            Tiles = Many(c.Tiles, 8, "Action tiles", (t, n) => new HomeTile
            {
                Icon = Icon(t.Icon, $"Tile {n} icon"), Title = T(t.Title, 60, $"Tile {n} title"), Text = T(t.Text, 100, $"Tile {n} text"),
                Link = L(t.Link, $"Tile {n} link")
            }),
            Story = c.Story is null ? null : new HomeStory
            {
                Eyebrow = T(c.Story.Eyebrow, 60, "Story small heading"), Title = T(c.Story.Title, 160, "Story title"),
                Quote = T(c.Story.Quote, 1500, "Founder's message"), Name = T(c.Story.Name, 80, "Founder's name"),
                Role = T(c.Story.Role, 80, "Founder's role"), Image = Img(c.Story.Image, "Story picture")
            },
            Stats = Many(c.Stats, 6, "Impact numbers", (s, n) =>
            {
                var source = T(s.Source, 20, $"Number {n} source");
                if (source is not null && !StatSources.Contains(source)) error ??= $"Number {n}: choose what to count.";
                if (s.Value is < 0 or > 1_000_000_000_000) error ??= $"Number {n} isn't valid.";
                return new HomeStat { Label = T(s.Label, 60, $"Number {n} label"), Value = s.Value, Source = source };
            }),
            StatsNote = T(c.StatsNote, 200, "Note under the numbers"),
            Questions = c.Questions is null ? null
                : c.Questions.Count > 60 ? Fail<List<string>>("Questions: up to 60.")
                : c.Questions.Select((q, i) => T(q, 200, $"Question {i + 1}")).Where(q => q is not null).Select(q => q!).ToList(),
            Themes = Many(c.Themes, 12, "Monthly themes", (t, n) =>
            {
                if (t.Month is < 0 or > 11) error ??= $"Theme {n}: choose a month.";
                return new HomeTheme { Month = t.Month, Icon = Icon(t.Icon, $"Theme {n} icon"), Title = T(t.Title, 80, $"Theme {n} title"), Text = T(t.Text, 200, $"Theme {n} text") };
            }),
            Priorities = Many(c.Priorities, 8, "Programme priorities", (p, n) => new HomePriority
            {
                Icon = Icon(p.Icon, $"Priority {n} icon"), Title = T(p.Title, 60, $"Priority {n} title"), Text = T(p.Text, 300, $"Priority {n} text")
            }),
            Pledge = c.Pledge is null ? null : new HomePledge
            {
                Title = T(c.Pledge.Title, 100, "Pledge title"), Text = T(c.Pledge.Text, 300, "Pledge text"),
                Count = c.Pledge.Count is < 0 or > 1_000_000_000_000 ? null : c.Pledge.Count
            },
            Showcase = c.Showcase is null ? null : new HomeShowcase
            {
                Hidden = c.Showcase.Hidden == true ? true : null,
                Eyebrow = T(c.Showcase.Eyebrow, 60, "Photo features small heading"), Title = T(c.Showcase.Title, 120, "Photo features title"),
                Intro = T(c.Showcase.Intro, 300, "Photo features text"),
                Cards = Many(c.Showcase.Cards, 4, "Photo features cards", (k, n) =>
                {
                    var kind = k.Kind?.Trim().ToLowerInvariant();
                    if (kind is null || !ShowcaseKinds.Contains(kind)) error ??= $"Photo features card {n}: choose frame, reel, contest or tree.";
                    return new HomeShowcaseCard
                    {
                        Kind = kind, Hidden = k.Hidden == true ? true : null,
                        Title = T(k.Title, 60, $"Photo features card {n} title"), Text = T(k.Text, 200, $"Photo features card {n} text"),
                        Note = T(k.Note, 80, $"Photo features card {n} note"), Button = T(k.Button, 40, $"Photo features card {n} button")
                    };
                })
            },
            HiddenSections = Hidden(c.HiddenSections, Sections, ref error),
            App = c.App is null ? null : new HomeApp
            {
                Title = T(c.App.Title, 100, "App title"), Text = T(c.App.Text, 300, "App text"),
                PlayUrl = L(c.App.PlayUrl, "Google Play link"), AppStoreUrl = L(c.App.AppStoreUrl, "App Store link")
            }
        };
        if (r.Showcase?.Cards is { } cards && cards.Select(x => x.Kind).Distinct().Count() != cards.Count) error ??= "Photo features: each card can be used once.";
        return error is null ? (r, null) : (null, error);
    }

    /// <summary>Known section names only, each once; null when none.</summary>
    public static List<string>? Hidden(List<string>? list, string[] known, ref string? error)
    {
        if (list is null || list.Count == 0) return null;
        if (list.Any(x => !known.Contains(x))) error ??= "Unknown section.";
        return list.Where(known.Contains).Distinct().ToList();
    }
}
