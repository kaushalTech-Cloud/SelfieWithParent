namespace SelfiewithParent.Api.Security;

/// <summary>
/// A file's real type, read from its first bytes. The file name and the browser's claimed type are never trusted:
/// a renamed script or SVG (which can carry script) is refused.
/// </summary>
public static class FileTypes
{
    public const int MaxPhotoBytes = 10 * 1024 * 1024;   // visitor photos (profile, selfie)
    public const int MaxVideoBytes = 50 * 1024 * 1024;   // visitor videos
    public const int MaxPageImageBytes = 2 * 1024 * 1024; // images for content pages
    public const int MaxVoiceBytes = 5 * 1024 * 1024;     // voice notes (about a minute)

    /// <summary>image/png, image/jpeg, image/webp, or null.</summary>
    public static string? Image(ReadOnlySpan<byte> d) =>
        d.Length > 8 && d[..8].SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }) ? "image/png"
        : d.Length > 3 && d[0] == 0xFF && d[1] == 0xD8 && d[2] == 0xFF ? "image/jpeg"
        : d.Length > 12 && d[..4].SequenceEqual("RIFF"u8) && d[8..12].SequenceEqual("WEBP"u8) ? "image/webp"
        : null;

    /// <summary>video/mp4, video/quicktime (MOV), video/webm, or null.</summary>
    public static string? Video(ReadOnlySpan<byte> d)
    {
        if (d.Length > 12 && d[4..8].SequenceEqual("ftyp"u8))
            return d[8..12].SequenceEqual("qt  "u8) ? "video/quicktime" : "video/mp4";   // ISO media: MP4, M4V, 3GP, MOV
        if (d.Length > 4 && d[0] == 0x1A && d[1] == 0x45 && d[2] == 0xDF && d[3] == 0xA3)
            return "video/webm";                                                          // Matroska / WebM
        return null;
    }

    /// <summary>audio/webm (browser recordings), audio/ogg, audio/mpeg (MP3), audio/mp4 (M4A, Safari recordings), audio/wav, or null.</summary>
    public static string? Audio(ReadOnlySpan<byte> d)
    {
        if (d.Length > 4 && d[0] == 0x1A && d[1] == 0x45 && d[2] == 0xDF && d[3] == 0xA3) return "audio/webm";
        if (d.Length > 4 && d[..4].SequenceEqual("OggS"u8)) return "audio/ogg";
        if (d.Length > 3 && (d[..3].SequenceEqual("ID3"u8) || (d[0] == 0xFF && (d[1] & 0xE0) == 0xE0))) return "audio/mpeg";
        if (d.Length > 12 && d[4..8].SequenceEqual("ftyp"u8)) return "audio/mp4";
        if (d.Length > 12 && d[..4].SequenceEqual("RIFF"u8) && d[8..12].SequenceEqual("WAVE"u8)) return "audio/wav";
        return null;
    }

    /// <summary>Reads an uploaded file (already limited in size by the request limits).</summary>
    public static async Task<byte[]> ReadAsync(IFormFile file, CancellationToken ct)
    {
        await using var stream = file.OpenReadStream();
        using var buffer = new MemoryStream((int)Math.Min(file.Length, int.MaxValue));
        await stream.CopyToAsync(buffer, ct);
        return buffer.ToArray();
    }

    /// <summary>The original file name, cleaned for display (no paths, control characters or markup), up to 150 characters.</summary>
    public static string CleanName(string? fileName, string fallback)
    {
        var name = new string(Path.GetFileName(fileName ?? "").Trim().Where(c => !char.IsControl(c) && c is not ('<' or '>')).ToArray());
        if (name.Length == 0) return fallback;
        return name.Length > 150 ? name[^150..] : name;
    }
}
