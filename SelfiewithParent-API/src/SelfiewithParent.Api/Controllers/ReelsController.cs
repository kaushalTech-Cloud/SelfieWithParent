using System.ComponentModel;
using System.Diagnostics;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using SelfiewithParent.Api.Security;

namespace SelfiewithParent.Api.Controllers;

/// <summary>Turning reels into MP4 (FFmpeg, free and open source; installed on the server and named in Reels:FfmpegPath).</summary>
public sealed class ReelsOptions
{
    public const string Section = "Reels";
    /// <summary>The ffmpeg program ("ffmpeg" when it's on the PATH). Empty: converting is switched off.</summary>
    public string FfmpegPath { get; init; } = "ffmpeg";
}

/// <summary>
/// Reels are made in the visitor's browser. Browsers that can't record MP4 record WebM, which Instagram may refuse: this
/// turns such a WebM into MP4 (H.264 + AAC). Nothing is kept: the files are deleted as soon as the answer is sent.
/// </summary>
[ApiController]
[Route("api/v1/reels")]
public sealed class ReelsController(IOptions<ReelsOptions> options, ILogger<ReelsController> log) : ControllerBase
{
    private const long MaxBytes = 40L * 1024 * 1024;
    /// <summary>A couple at a time: converting is heavy work.</summary>
    private static readonly SemaphoreSlim Gate = new(2, 2);

    /// <summary>Convert a WebM reel (up to 40 MB, about 35 seconds) into MP4. 503 when converting isn't set up on this server.</summary>
    [HttpPost("convert")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.Upload)]
    [RequestSizeLimit(MaxBytes + 64 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxBytes + 64 * 1024)]
    [Consumes("multipart/form-data")]
    [Produces("video/mp4")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> Convert(IFormFile? video, CancellationToken ct)
    {
        if (video is null || video.Length == 0 || video.Length > MaxBytes)
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Choose a WebM video up to 40 MB.");
        var data = await FileTypes.ReadAsync(video, ct);
        if (FileTypes.Video(data) != "video/webm")
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Only WebM videos are converted.");
        if (string.IsNullOrWhiteSpace(options.Value.FfmpegPath))
            return Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: "Turning videos into MP4 isn't available right now.");

        if (!await Gate.WaitAsync(TimeSpan.FromSeconds(20), ct))
            return Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: "Busy right now. Please try again in a minute.");
        var input = Path.Combine(Path.GetTempPath(), $"reel-{Guid.NewGuid():N}.webm");
        var output = Path.ChangeExtension(input, ".mp4");
        try
        {
            await System.IO.File.WriteAllBytesAsync(input, data, ct);
            var psi = new ProcessStartInfo(options.Value.FfmpegPath)
            {
                RedirectStandardError = true, RedirectStandardOutput = true, UseShellExecute = false, CreateNoWindow = true
            };
            // Fixed arguments only (the file names are ours): H.264 + AAC, phone-friendly, quick start, at most 35 seconds
            foreach (var a in new[] { "-hide_banner", "-loglevel", "error", "-y", "-i", input, "-t", "35", "-c:v", "libx264", "-preset", "veryfast",
                         "-crf", "23", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", output })
                psi.ArgumentList.Add(a);
            using var p = Process.Start(psi)!;
            var errors = p.StandardError.ReadToEndAsync(ct);
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(90));
            try { await p.WaitForExitAsync(timeout.Token); }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested)
            {
                p.Kill(true);
                log.LogWarning("Reel conversion took too long and was stopped");
                return Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: "That took too long. Please try a shorter reel.");
            }
            if (p.ExitCode != 0 || !System.IO.File.Exists(output))
            {
                log.LogWarning("Reel conversion failed ({Code}): {Errors}", p.ExitCode, (await errors).Trim());
                return Problem(statusCode: StatusCodes.Status400BadRequest, title: "That video couldn't be converted.");
            }
            var mp4 = await System.IO.File.ReadAllBytesAsync(output, ct);
            log.LogInformation("Reel converted to MP4 ({InKb} KB → {OutKb} KB)", data.Length / 1024, mp4.Length / 1024);
            return File(mp4, "video/mp4", "selfie-with-parent-reel.mp4");
        }
        catch (Win32Exception)
        {
            log.LogWarning("Reel conversion asked for, but FFmpeg isn't installed (Reels:FfmpegPath = {Path})", options.Value.FfmpegPath);
            return Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: "Turning videos into MP4 isn't available right now.");
        }
        finally
        {
            Gate.Release();
            foreach (var f in new[] { input, output }) try { System.IO.File.Delete(f); } catch (IOException) { /* temp folder */ }
        }
    }
}
