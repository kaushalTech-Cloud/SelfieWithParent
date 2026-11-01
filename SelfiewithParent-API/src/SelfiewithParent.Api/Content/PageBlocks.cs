using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace SelfiewithParent.Api.Content;

/// <summary>
/// Rules for page-builder content (site.PageContent.BlocksJson).
/// English holds the whole page: an ordered list of blocks with layout, links, icons and images. Other languages hold
/// only translated text, matched to English blocks / items by "id". Everything is checked before it is saved:
/// known block types and fields only, plain text only (no HTML), safe links, our own images, sensible sizes.
/// The website shows text as text (never as HTML), so this is a second line of defence, not the only one.
/// </summary>
public static partial class PageBlocks
{
    public static readonly string[] Languages = ["en", "hi", "bn", "ar", "es", "fr"];

    public static readonly HashSet<string> BlockTypes =
        ["hero", "tabs", "text", "cards", "steps", "timeline", "stats", "faq", "quote", "profile", "letter", "gallery", "cta"];

    /// <summary>Text a translation may replace. Links, icons, images and layout always come from English.</summary>
    public static readonly HashSet<string> TextKeys =
    [
        "eyebrow", "title", "highlight", "lead", "kicker", "heading", "intro", "text", "note", "question", "answer",
        "cite", "label", "value", "role", "badge", "linkLabel", "caption", "alt", "imageAlt", "name", "signature"
    ];

    // Every field a block or item may have, and what kind of value it holds
    private static readonly Dictionary<string, Kind> Fields = new()
    {
        ["id"] = Kind.Id, ["type"] = Kind.Choice, ["hidden"] = Kind.Bool, ["upcoming"] = Kind.Bool,
        ["background"] = Kind.Choice, ["layout"] = Kind.Choice, ["style"] = Kind.Choice, ["anchor"] = Kind.Anchor,
        ["columns"] = Kind.Number, ["width"] = Kind.Number, ["value"] = Kind.TextOrNumber,
        ["url"] = Kind.Url, ["image"] = Kind.Image, ["icon"] = Kind.Icon,
        ["suffix"] = Kind.ShortText, ["year"] = Kind.ShortText,
        ["items"] = Kind.List, ["paragraphs"] = Kind.List, ["facts"] = Kind.List, ["buttons"] = Kind.List,
        ["bullets"] = Kind.List, ["socials"] = Kind.List,
    };

    private static readonly Dictionary<string, string[]> Choices = new()
    {
        ["background"] = ["plain", "soft"],
        ["layout"] = ["grid", "bento", "links", "programmes", "activities"],
        ["style"] = ["plain", "dark", "gold", "primary", "secondary", "numbered", "flow"],
    };

    private enum Kind { Id, Choice, Bool, Number, TextOrNumber, Url, Image, Icon, ShortText, Anchor, List, Text }

    private const int MaxBlocks = 60, MaxItems = 40, MaxText = 2000, MaxDepth = 3;

    [GeneratedRegex("^[A-Za-z0-9_-]{1,40}$")] private static partial Regex IdPattern();
    [GeneratedRegex("^bi-[a-z0-9-]{1,40}$")] private static partial Regex IconPattern();
    [GeneratedRegex("^[a-z][a-z0-9-]{0,39}$")] private static partial Regex AnchorPattern();
    [GeneratedRegex(@"^(img/[a-z0-9-]{1,60}\.(svg|png|jpe?g|webp)|media/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$")] private static partial Regex ImagePattern();

    /// <summary>Safe link: a site path, https, mailto or tel. Empty means "no link".</summary>
    public static bool IsSafeUrl(string url) =>
        url.Length <= 300 && !url.Any(char.IsControl) && !url.Contains('<') && !url.Contains('>') && !url.Contains('"')
        && !url.Contains("javascript:", StringComparison.OrdinalIgnoreCase)
        && ((url.StartsWith('/') && !url.StartsWith("//") && !url.StartsWith("/\\"))
            || (url.StartsWith("https://", StringComparison.Ordinal) && url.Length > 8)
            || url.StartsWith("mailto:", StringComparison.Ordinal) || url.StartsWith("tel:", StringComparison.Ordinal));

    /// <summary>Checks a full (English) page. Returns the cleaned JSON, or the first problem found.</summary>
    public static (string? Json, string? Error) ValidateEnglish(JsonElement blocks)
    {
        if (blocks.ValueKind != JsonValueKind.Array) return (null, "The page content must be a list of blocks.");
        if (blocks.GetArrayLength() > MaxBlocks) return (null, $"A page can have at most {MaxBlocks} blocks.");
        var ids = new HashSet<string>();
        var list = new JsonArray();
        var n = 0;
        foreach (var b in blocks.EnumerateArray())
        {
            n++;
            if (b.ValueKind != JsonValueKind.Object) return (null, $"Block {n} isn't valid.");
            var type = b.TryGetProperty("type", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString()! : "";
            if (!BlockTypes.Contains(type)) return (null, $"Block {n} has an unknown type.");
            var (node, error) = CheckObject(b, ids, depth: 0, translation: false, where: $"Block {n} ({type})");
            if (error is not null) return (null, error);
            list.Add(node);
        }
        return (list.ToJsonString(), null);
    }

    /// <summary>
    /// Checks a translation and keeps only what a translation may contain: ids and text. Text for blocks / items that
    /// don't exist in English is dropped. Returns the cleaned JSON.
    /// </summary>
    public static (string? Json, string? Error) CleanTranslation(JsonElement blocks, string englishJson)
    {
        if (blocks.ValueKind != JsonValueKind.Array) return (null, "The translation must be a list of blocks.");
        var englishIds = new HashSet<string>();
        CollectIds(JsonNode.Parse(englishJson), englishIds);
        var list = new JsonArray();
        foreach (var b in blocks.EnumerateArray())
        {
            if (b.ValueKind != JsonValueKind.Object) continue;
            var node = KeepText(b, englishIds, depth: 0, out var error);
            if (error is not null) return (null, error);
            if (node is not null) list.Add(node);
        }
        return (list.ToJsonString(), null);
    }

    private static (JsonObject Node, string? Error) CheckObject(JsonElement obj, HashSet<string> ids, int depth, bool translation, string where)
    {
        var node = new JsonObject();
        if (!obj.TryGetProperty("id", out var idEl) || idEl.ValueKind != JsonValueKind.String || !IdPattern().IsMatch(idEl.GetString()!))
            return (node, $"{where}: missing or invalid id.");
        if (!ids.Add(idEl.GetString()!)) return (node, $"{where}: the id '{idEl.GetString()}' is used twice.");

        foreach (var p in obj.EnumerateObject())
        {
            var kind = Fields.TryGetValue(p.Name, out var k) ? k : TextKeys.Contains(p.Name) ? Kind.Text : (Kind?)null;
            if (kind is null) return (node, $"{where}: unknown field '{p.Name}'.");
            var v = p.Value;
            if (kind == Kind.TextOrNumber)
            {
                if (v.ValueKind == JsonValueKind.Number && v.TryGetDouble(out var d) && d is >= 0 and <= 1e12) { node[p.Name] = d; continue; }
                kind = Kind.Text;
            }
            switch (kind)
            {
                case Kind.Id:
                    node["id"] = v.GetString(); break;
                case Kind.Choice:
                    if (v.ValueKind != JsonValueKind.String) return (node, $"{where}: '{p.Name}' isn't valid.");
                    var choice = v.GetString()!;
                    if (p.Name != "type" && !Choices[p.Name].Contains(choice)) return (node, $"{where}: '{p.Name}' can't be '{choice}'.");
                    node[p.Name] = choice; break;
                case Kind.Bool:
                    if (v.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) return (node, $"{where}: '{p.Name}' must be true or false.");
                    node[p.Name] = v.GetBoolean(); break;
                case Kind.Number:
                    if (v.ValueKind != JsonValueKind.Number || !v.TryGetInt32(out var num) || num < 1 || num > 12) return (node, $"{where}: '{p.Name}' must be 1 to 12.");
                    node[p.Name] = num; break;
                case Kind.Url:
                    if (v.ValueKind != JsonValueKind.String) return (node, $"{where}: link isn't valid.");
                    var url = v.GetString()!.Trim();
                    if (url.Length > 0 && !IsSafeUrl(url)) return (node, $"{where}: links must start with /, https://, mailto: or tel:.");
                    node[p.Name] = url; break;
                case Kind.Image:
                    if (v.ValueKind != JsonValueKind.String) return (node, $"{where}: image isn't valid.");
                    var img = v.GetString()!.Trim();
                    if (img.Length > 0 && !ImagePattern().IsMatch(img)) return (node, $"{where}: choose an image from the image library.");
                    node[p.Name] = img; break;
                case Kind.Icon:
                    if (v.ValueKind != JsonValueKind.String) return (node, $"{where}: icon isn't valid.");
                    var icon = v.GetString()!.Trim();
                    if (icon.Length > 0 && !IconPattern().IsMatch(icon)) return (node, $"{where}: icons look like 'bi-heart'.");
                    node[p.Name] = icon; break;
                case Kind.Anchor:
                    if (v.ValueKind != JsonValueKind.String) return (node, $"{where}: anchor isn't valid.");
                    var anchor = v.GetString()!.Trim();
                    if (anchor.Length > 0 && !AnchorPattern().IsMatch(anchor)) return (node, $"{where}: anchors use lower-case letters, numbers and hyphens.");
                    node[p.Name] = anchor; break;
                case Kind.ShortText:
                case Kind.Text:
                    if (v.ValueKind != JsonValueKind.String) return (node, $"{where}: '{p.Name}' must be text.");
                    var text = v.GetString()!;
                    var max = kind == Kind.ShortText ? 40 : MaxText;
                    if (text.Length > max) return (node, $"{where}: '{p.Name}' is too long (max {max} characters).");
                    if (text.Contains('<') || text.Contains('>')) return (node, $"{where}: text can't contain < or >.");
                    node[p.Name] = text; break;
                case Kind.List:
                    if (depth >= MaxDepth) return (node, $"{where}: lists are nested too deeply.");
                    if (v.ValueKind != JsonValueKind.Array) return (node, $"{where}: '{p.Name}' must be a list.");
                    if (v.GetArrayLength() > MaxItems) return (node, $"{where}: '{p.Name}' can have at most {MaxItems} entries.");
                    var arr = new JsonArray();
                    var i = 0;
                    foreach (var item in v.EnumerateArray())
                    {
                        i++;
                        if (item.ValueKind != JsonValueKind.Object) return (node, $"{where}: entry {i} in '{p.Name}' isn't valid.");
                        var (child, err) = CheckObject(item, ids, depth + 1, translation, $"{where}, {p.Name} {i}");
                        if (err is not null) return (node, err);
                        arr.Add(child);
                    }
                    node[p.Name] = arr; break;
            }
        }
        return (node, null);
    }

    private static JsonObject? KeepText(JsonElement obj, HashSet<string> englishIds, int depth, out string? error)
    {
        error = null;
        if (!obj.TryGetProperty("id", out var idEl) || idEl.ValueKind != JsonValueKind.String) return null;
        var id = idEl.GetString()!;
        if (!englishIds.Contains(id)) return null;                 // nothing in English to translate
        var node = new JsonObject { ["id"] = id };
        foreach (var p in obj.EnumerateObject())
        {
            if (TextKeys.Contains(p.Name) && p.Value.ValueKind == JsonValueKind.String)
            {
                var text = p.Value.GetString()!.Trim();
                if (text.Length == 0) continue;                    // empty = show English
                if (text.Length > MaxText) { error = $"A translated '{p.Name}' is too long (max {MaxText} characters)."; return null; }
                if (text.Contains('<') || text.Contains('>')) { error = "Text can't contain < or >."; return null; }
                node[p.Name] = text;
            }
            else if (Fields.TryGetValue(p.Name, out var k) && k == Kind.List && p.Value.ValueKind == JsonValueKind.Array && depth < MaxDepth)
            {
                var arr = new JsonArray();
                foreach (var item in p.Value.EnumerateArray())
                {
                    if (item.ValueKind != JsonValueKind.Object) continue;
                    var child = KeepText(item, englishIds, depth + 1, out error);
                    if (error is not null) return null;
                    if (child is not null) arr.Add(child);
                }
                if (arr.Count > 0) node[p.Name] = arr;
            }
        }
        return node.Count > 1 ? node : null;
    }

    private static void CollectIds(JsonNode? node, HashSet<string> ids)
    {
        switch (node)
        {
            case JsonArray a: foreach (var x in a) CollectIds(x, ids); break;
            case JsonObject o:
                if (o["id"] is JsonValue v && v.TryGetValue<string>(out var id)) ids.Add(id);
                foreach (var (_, x) in o) CollectIds(x, ids);
                break;
        }
    }

    /// <summary>
    /// The page as a visitor sees it in <paramref name="translationJson"/>'s language: English blocks with translated text
    /// laid over them (by id). Untranslated text stays English. Hidden blocks are left out.
    /// </summary>
    public static JsonArray Merge(string englishJson, string? translationJson)
    {
        var english = JsonNode.Parse(englishJson) as JsonArray ?? [];
        var byId = new Dictionary<string, JsonObject>();
        if (translationJson is not null) Index(JsonNode.Parse(translationJson), byId);

        var result = new JsonArray();
        foreach (var block in english)
        {
            if (block is not JsonObject b || b["hidden"] is JsonValue h && h.TryGetValue<bool>(out var hidden) && hidden) continue;
            var copy = b.DeepClone().AsObject();
            Apply(copy, byId);
            result.Add(copy);
        }
        return result;
    }

    private static void Index(JsonNode? node, Dictionary<string, JsonObject> byId)
    {
        switch (node)
        {
            case JsonArray a: foreach (var x in a) Index(x, byId); break;
            case JsonObject o:
                if (o["id"] is JsonValue v && v.TryGetValue<string>(out var id)) byId[id] = o;
                foreach (var (_, x) in o) Index(x, byId);
                break;
        }
    }

    private static void Apply(JsonObject target, Dictionary<string, JsonObject> byId)
    {
        if (target["id"] is JsonValue v && v.TryGetValue<string>(out var id) && byId.TryGetValue(id, out var tr))
            foreach (var key in TextKeys)
                if (tr[key] is JsonValue tv && tv.TryGetValue<string>(out var text) && text.Length > 0 && target.ContainsKey(key))
                    target[key] = text;
        foreach (var (_, child) in target.ToList())
            if (child is JsonArray arr)
                foreach (var item in arr)
                    if (item is JsonObject o) Apply(o, byId);
    }

    /// <summary>Web addresses the website already uses (pages can't take them).</summary>
    public static readonly HashSet<string> ReservedSlugs =
    [
        "login", "account", "privacy", "terms", "selfies", "upload", "winners", "impact", "then-now", "memories",
        "family-tree", "api", "admin", "assets", "img", "media", "health", "swagger", "index", "home"
    ];

    [GeneratedRegex("^[a-z0-9]+(-[a-z0-9]+)*$")] private static partial Regex SlugPattern();

    public static string? CheckSlug(string slug) =>
        slug.Length is < 2 or > 60 || !SlugPattern().IsMatch(slug)
            ? "The web address can use lower-case letters, numbers and single hyphens (2 to 60 characters)."
            : ReservedSlugs.Contains(slug) ? $"'/{slug}' is already used by the website. Choose another web address." : null;
}
